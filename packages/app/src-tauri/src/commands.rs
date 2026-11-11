//! Every command the window can call. The window holds no keys, no file access and no
//! network: anything it can do is one of these, and a command that does not exist is a
//! capability it does not have. Arguments arrive from a page and are bounded here.
//!
//! Writes answer `{ ok: true, … } | { ok: false, error }` and are logged (`activity.rs`);
//! reads answer their rows, or reject with a sentence the window shows.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::activity::{self, LogEntry};
use crate::cache;
use crate::collections;
use crate::compress::{MAX_FILE_SIZE, MAX_PIXELS};
use crate::config::{config, database_host};
use crate::data::{Collection, PostPage};
use crate::image_cache;
use crate::paths::cache_dir;
use crate::prefs::{self, cpu_count, Preferences};
use crate::staging::{self, StageOutcome};

const MAX_BATCH: usize = 200;
const MAX_SELECTION: usize = 1000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    configured: bool,
    site_url: String,
    database_host: String,
    cdn_url: String,
    versions: Value,
    development: bool,
    limits: Value,
    cpu: Value,
    preferences: Preferences,
    cache: Value,
}

#[tauri::command]
pub fn app_status(app: AppHandle) -> AppStatus {
    let cfg = config();
    let (images, bytes) = image_cache::usage();
    AppStatus {
        configured: cfg.is_some(),
        site_url: cfg.map(|c| c.site_url.clone()).unwrap_or_default(),
        database_host: database_host(),
        cdn_url: cfg.map(|c| c.cdn_url.clone()).unwrap_or_default(),
        versions: json!({
            "app": app.package_info().version.to_string(),
            "tauri": tauri::VERSION,
            "webview": tauri::webview_version().unwrap_or_default(),
        }),
        development: cfg!(debug_assertions),
        limits: json!({
            "maxFileSize": MAX_FILE_SIZE,
            "maxFileSizeLabel": format!("{}MB", MAX_FILE_SIZE / 1024 / 1024),
            "maxPixels": MAX_PIXELS,
        }),
        cpu: json!({ "count": cpu_count() }),
        preferences: prefs::load(),
        cache: json!({
            "dir": cache_dir().to_string_lossy(),
            "images": images,
            "bytes": bytes,
            "collectionsReadAt": cache::collections_read_at(),
        }),
    }
}

#[tauri::command]
pub fn save_preferences(preferences: Preferences) -> Preferences {
    prefs::save(preferences)
}

/// The OS picker, opened on this side — the window has no filesystem to name a path with.
#[tauri::command]
pub async fn choose_files(app: AppHandle) -> Vec<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Images", &["jpg", "jpeg", "png", "gif", "webp"])
        .pick_files(move |files| {
            let _ = tx.send(files);
        });
    rx.await
        .ok()
        .flatten()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|file| file.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
pub async fn stage_files(paths: Vec<String>) -> Vec<StageOutcome> {
    staging::stage_files(paths.into_iter().take(MAX_BATCH).collect()).await
}

#[tauri::command]
pub async fn fetch_images(urls: Vec<String>) -> Vec<StageOutcome> {
    staging::fetch_images(urls.into_iter().take(50).collect()).await
}

#[tauri::command]
pub async fn list_collections(force: Option<bool>) -> Result<Vec<Collection>, String> {
    collections::read_collections(force.unwrap_or(false)).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInput {
    name: String,
    mark: String,
    /// The web address segment, for an edit; empty for none. Ignored on create.
    #[serde(default)]
    ref_id: String,
}

fn bounded(input: CollectionInput) -> CollectionInput {
    CollectionInput {
        name: input.name.chars().take(200).collect(),
        mark: input.mark.chars().take(200).collect(),
        ref_id: input.ref_id.chars().take(200).collect(),
    }
}

/// A collection id from the window: a cuid2, or a refusal before it reaches a query.
fn collection_id(id: String) -> Result<String, Value> {
    if crate::names::looks_like_id(&id) {
        Ok(id)
    } else {
        Err(json!({ "ok": false, "error": "No such collection." }))
    }
}

#[tauri::command]
pub async fn create_collection(input: CollectionInput) -> Value {
    let input = bounded(input);
    // The address is made from the name; one sent along is ignored.
    collections::create(input.name, input.mark).await
}

#[tauri::command]
pub async fn edit_collection(id: String, input: CollectionInput) -> Value {
    let input = bounded(input);
    match collection_id(id) {
        Ok(id) => collections::edit(id, input.name, input.mark, input.ref_id).await,
        Err(refused) => refused,
    }
}

#[tauri::command]
pub async fn delete_collection(id: String) -> Value {
    match collection_id(id) {
        Ok(id) => collections::delete(id).await,
        Err(refused) => refused,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostsQuery {
    collection_id: String,
    after: Option<i32>,
    per_page: Option<i64>,
}

#[tauri::command]
pub async fn list_collection_posts(query: PostsQuery) -> Result<PostPage, String> {
    let id = collection_id(query.collection_id).map_err(|_| "No such collection.".to_string())?;
    collections::read_posts(id, query.after, query.per_page).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRequest {
    collection_id: String,
    path: String,
    source_url: String,
}

#[tauri::command]
pub async fn upload_to_collection(request: UploadRequest) -> Value {
    let source: String = request.source_url.trim().chars().take(2000).collect();
    match collection_id(request.collection_id) {
        Ok(id) => collections::upload(id, request.path, source).await,
        Err(refused) => refused,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceEdit {
    id: i32,
    source_url: String,
}

#[tauri::command]
pub async fn save_collection_post(request: SourceEdit) -> Value {
    let source: String = request.source_url.trim().chars().take(2000).collect();
    collections::save_source(request.id, source).await
}

#[tauri::command]
pub async fn move_collection_posts(ids: Vec<i32>, collection_id: String) -> Value {
    let collection_id = match self::collection_id(collection_id) {
        Ok(id) => id,
        Err(refused) => return refused,
    };
    let mut ids: Vec<i32> = ids.into_iter().filter(|id| *id > 0).take(MAX_SELECTION).collect();
    ids.sort_unstable();
    ids.dedup();
    collections::move_posts(ids, collection_id).await
}

#[tauri::command]
pub async fn delete_collection_post(id: i32) -> Value {
    collections::delete_post(id).await
}

#[tauri::command]
pub fn list_logs() -> Vec<LogEntry> {
    activity::read()
}

#[tauri::command]
pub fn clear_logs() {
    activity::clear()
}

/// Every cached image and grid copy, and the shelf list. Nothing is lost — the next look
/// reads the board again.
#[tauri::command]
pub fn clear_cache() {
    image_cache::clear();
    cache::drop_collections();
}

/// Only http(s) is ever handed to the OS, which would happily open a `file:` URL.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Not a link".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only web links can be opened".into());
    }
    app.opener().open_url(parsed.as_str(), None::<&str>).map_err(|e| e.to_string())
}

/// Shows `save.json` in the file manager — the answer to "where did that go".
#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let file = prefs::save_path();
    if file.exists() {
        app.opener().reveal_item_in_dir(file).map_err(|e| e.to_string())
    } else {
        app.opener()
            .open_path(crate::paths::config_dir().to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    }
}
