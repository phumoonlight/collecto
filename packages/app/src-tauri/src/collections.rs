//! Collections, from the side that writes them: name one, edit it, delete an empty one, add
//! images, correct an image's source, move images to another shelf, remove one.
//!
//! **Every write drops the cache** (`cache::drop_collections`) — on a refusal too, since a
//! write that failed may still have moved a row on its way.

use serde_json::{json, Value};

use crate::activity::{log, logged};
use crate::cache;
use crate::compress;
use crate::data::{self, Collection, NewPost, PostPage};
use crate::db::require;
use crate::image_cache;
use crate::names::{read_mark, read_name, read_ref_id, read_source, ref_id_from_name};
use crate::paths::{image_path, thumb_path};
use crate::prefs;
use crate::staging::md5_hex;
use crate::store;

pub const PAGE_SIZE: i64 = 40;

async fn dropping<T>(write: impl std::future::Future<Output = Result<T, String>>) -> Result<T, String> {
    let result = write.await;
    cache::drop_collections();
    result
}

pub async fn read_collections(force: bool) -> Result<Vec<Collection>, String> {
    let db = require()?;
    cache::collections(force, || data::list_collections(&db)).await
}

pub async fn read_posts(collection_id: String, after: Option<i32>, per_page: Option<i64>) -> Result<PostPage, String> {
    let db = require()?;
    let per_page = per_page.unwrap_or(PAGE_SIZE).clamp(1, 200);
    cache::posts(&collection_id, after, per_page, || data::list_collection_posts(&db, &collection_id, after, per_page)).await
}

/// A new collection's address is made from its name — it is not typed here; the edit form
/// changes it afterwards.
pub async fn create(name: String, mark: String) -> Value {
    let detail = json!({ "name": name, "mark": mark });
    logged("collection:create", detail, async {
        let db = require()?;
        let name = read_name(&name)?;
        let mark = read_mark(&mark)?;
        let base = ref_id_from_name(&name);
        let (id, ref_id) = dropping(data::create_collection(&db, &name, mark.as_deref(), base.as_deref())).await?;
        Ok(json!({ "id": id, "name": name, "mark": mark, "ref_id": ref_id }))
    })
    .await
}

pub async fn edit(id: String, name: String, mark: String, ref_id: String) -> Value {
    let detail = json!({ "id": id, "name": name, "mark": mark, "refId": ref_id });
    logged("collection:edit", detail, async {
        let db = require()?;
        let name = read_name(&name)?;
        let mark = read_mark(&mark)?;
        let ref_id = read_ref_id(&ref_id)?;
        dropping(data::update_collection(&db, &id, &name, mark.as_deref(), ref_id.as_deref())).await?;
        Ok(json!({ "name": name, "mark": mark, "ref_id": ref_id }))
    })
    .await
}

pub async fn delete(id: String) -> Value {
    logged("collection:delete", json!({ "id": id }), async {
        let db = require()?;
        dropping(data::delete_collection(&db, &id)).await?;
        Ok(json!({}))
    })
    .await
}

/// Removes stored objects after their row is gone. A failure here does not undo the delete
/// that was asked for; it is logged as an error naming every path left behind, which the
/// window raises as a notice — those objects are orphans nothing on the board can name.
async fn remove_objects(keys: Vec<String>, action: &str, detail: Value) {
    let mut failed = Vec::new();
    for key in &keys {
        if let Err(error) = store::remove(key).await {
            failed.push(json!({ "path": key, "error": error }));
        }
    }
    let storage = format!("{action}:storage");
    if failed.is_empty() {
        log("info", &storage, "ok", Some(json!({ "paths": keys })));
    } else {
        let message = format!(
            "The row was deleted, but {} of {} stored objects could not be removed",
            failed.len(),
            keys.len()
        );
        let mut detail = detail;
        detail["failed"] = Value::Array(failed);
        log("error", &storage, message, Some(detail));
    }
}

/// Whether the objects under this md5 may be taken back after a failed upload. The names are
/// derived from the bytes, so if a row for the same image landed meanwhile — the same file
/// uploaded at the same moment from another machine — those objects are *its* files, and
/// removing them would break a live image. When the board cannot be asked, they are kept: an
/// orphan in the bucket is litter, a missing object is a broken image.
async fn ours_to_remove(db: &sqlx::PgPool, md5: &str) -> bool {
    match data::find_posts_by_file_names(db, &[md5.to_string()]).await {
        Ok(found) => !found.contains_key(md5),
        Err(_) => false,
    }
}

/// One file onto one shelf: inspect, refuse a duplicate, compress losslessly, make the
/// thumbnail (none for an animated image), store them, insert the row — and take back
/// whatever landed if a later step fails. The bytes are read here, never sent across the bridge.
pub async fn upload(collection_id: String, path: String, source_url: String) -> Value {
    let detail = json!({ "collectionId": collection_id, "path": path, "sourceUrl": source_url });
    logged("collection:upload", detail, async move {
        let db = require()?;
        let source_url = read_source(&source_url)?;
        let bytes = tokio::fs::read(&path).await.map_err(|_| "Could not read the file — has it moved?".to_string())?;
        let original_size = bytes.len();

        let (header, md5, bytes) = tauri::async_runtime::spawn_blocking(move || {
            let header = compress::read_header(&bytes);
            let md5 = md5_hex(&bytes);
            (header, md5, bytes)
        })
        .await
        .map_err(|e| e.to_string())?;
        let header = header?;
        compress::check_limits(original_size as u64, &header)?;

        if let Some((id, shelf)) = data::find_posts_by_file_names(&db, std::slice::from_ref(&md5)).await?.remove(&md5) {
            return Err(format!("This image is already in {shelf} (#{id})"));
        }

        let effort = prefs::load().effort();
        let pool = prefs::pool();
        let started = std::time::Instant::now();
        // An animated image has no thumbnail: a still cut from it would stop it moving, so the
        // website and the app draw the stored file itself.
        let (optimized, thumb) = tauri::async_runtime::spawn_blocking(move || {
            pool.install(|| {
                rayon::join(
                    || compress::optimize(&bytes, &header, effort),
                    || (!header.animated).then(|| compress::thumbnail(&bytes, header.kind)).transpose(),
                )
            })
        })
        .await
        .map_err(|e| e.to_string())?;
        let thumb = thumb?;
        let encode_ms = started.elapsed().as_millis() as u64;

        let ext = header.kind.ext();
        let content_type = header.kind.content_type();
        let image_key = image_path(&md5, ext);
        let thumb_key = thumb_path(&md5, ext);

        // Files before the row: an object nothing points at is invisible litter, where a row
        // pointing at a missing object is a broken image on the site.
        store::put(&image_key, optimized.bytes.clone(), content_type).await?;
        if let Some(thumb) = &thumb {
            if let Err(error) = store::put(&thumb_key, thumb.clone(), content_type).await {
                if ours_to_remove(&db, &md5).await {
                    let _ = store::remove(&image_key).await;
                }
                return Err(error);
            }
        }

        let row = NewPost {
            collection_id: &collection_id,
            file_name: &md5,
            file_ext: ext,
            file_size: optimized.bytes.len() as i32,
            original_size: original_size as i32,
            width: header.width as i32,
            height: header.height as i32,
            animated: header.animated,
            source_url: &source_url,
        };
        let id = match dropping(data::create_post(&db, &row)).await {
            Ok(id) => id,
            Err(error) => {
                if ours_to_remove(&db, &md5).await {
                    let _ = store::remove(&image_key).await;
                    if thumb.is_some() {
                        let _ = store::remove(&thumb_key).await;
                    }
                }
                return Err(format!("Database insert failed: {error}"));
            }
        };

        image_cache::remember(&md5, ext, &optimized.bytes);
        Ok(json!({
            "postId": id,
            "fileName": md5,
            "originalSize": original_size,
            "storedSize": optimized.bytes.len(),
            "rewritten": optimized.rewritten,
            "animated": header.animated,
            "thumbSize": thumb.as_ref().map(Vec::len),
            "compression": optimized.note,
            "encodeMs": encode_ms,
        }))
    })
    .await
}

pub async fn save_source(id: i32, source_url: String) -> Value {
    let detail = json!({ "id": id, "sourceUrl": source_url });
    logged("collection:edit-image", detail, async {
        let db = require()?;
        let source_url = read_source(&source_url)?;
        dropping(data::update_post_source(&db, id, &source_url)).await?;
        Ok(json!({}))
    })
    .await
}

pub async fn move_posts(ids: Vec<i32>, collection_id: String) -> Value {
    let detail = json!({ "ids": ids, "collectionId": collection_id });
    logged("collection:move-images", detail, async {
        let db = require()?;
        if ids.is_empty() {
            return Err("Nothing selected".into());
        }
        let moved = dropping(data::move_posts(&db, &ids, &collection_id)).await?;
        Ok(json!({ "moved": moved }))
    })
    .await
}

/// Row first, files second: a failed delete leaves the image whole, and the paths derive
/// from `file_name`, which nothing else stores.
pub async fn delete_post(id: i32) -> Value {
    let post = match require() {
        Ok(db) => data::get_post(&db, id).await.ok().flatten(),
        Err(_) => None,
    };
    let detail = json!({
        "id": id,
        "collectionId": post.as_ref().map(|p| p.collection_id.clone()),
        "fileName": post.as_ref().map(|p| p.file_name.clone()),
        "fileExt": post.as_ref().map(|p| p.file_ext.clone()),
    });
    let result = logged("collection:delete-image", detail.clone(), async {
        let db = require()?;
        if post.is_none() {
            return Err(format!("Image {id} not found."));
        }
        dropping(data::delete_post_row(&db, id)).await?.ok_or_else(|| format!("Image {id} not found."))?;
        Ok(json!({}))
    })
    .await;

    if let (Some(post), Some(true)) = (post, result.get("ok").and_then(Value::as_bool)) {
        // The thumbnail is asked for even for an animated image, which was stored without one:
        // a delete of a missing key succeeds, and a GIF from before 0002 does have one.
        let keys = vec![image_path(&post.file_name, &post.file_ext), thumb_path(&post.file_name, &post.file_ext)];
        remove_objects(keys, "collection:delete-image", detail).await;
        image_cache::forget(&post.file_name, &post.file_ext);
    }
    result
}
