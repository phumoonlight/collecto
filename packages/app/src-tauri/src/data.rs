//! Every statement the app sends, reads and writes together — it is a short list because a
//! collection is short: a name, a mark, and images that each carry a source.
//!
//! **`updated_at` is maintained here**, not by a trigger: every write that changes what a
//! shelf holds touches it inside the same transaction, because the list's order is a fact
//! about the row. A move touches every shelf involved.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

use crate::db::{is_unique_violation, message};

/// ISO-8601 from the query itself, so a row is already the string the window uses.
macro_rules! iso {
    ($column:literal) => {
        concat!("to_char(", $column, " at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')")
    };
}

macro_rules! post_columns {
    () => {
        concat!(
            "p.id, p.collection_id, p.file_name, p.file_ext, p.file_size, p.original_size, ",
            "p.width, p.height, p.source_url, p.view_count, ",
            iso!("p.created_at"),
            " as created_at"
        )
    };
}

macro_rules! shelf_select {
    () => {
        concat!(
            "select c.id, c.name, c.mark, count(p.id)::int as post_count, ",
            "(array_agg(p.file_name order by p.id desc))[1] as cover_file_name, ",
            "(array_agg(p.file_ext order by p.id desc))[1] as cover_file_ext, ",
            iso!("c.updated_at"),
            " as updated_at ",
            "from collections c left join collection_posts p on p.collection_id = c.id "
        )
    };
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Collection {
    pub id: i32,
    pub name: String,
    pub mark: Option<String>,
    pub post_count: i32,
    /// The newest image on the shelf — the cover is derived, never stored.
    pub cover_file_name: Option<String>,
    pub cover_file_ext: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CollectionPost {
    pub id: i32,
    pub collection_id: i32,
    pub file_name: String,
    pub file_ext: String,
    /// Of the stored file, after lossless compression.
    pub file_size: i32,
    /// Of the file as it was uploaded.
    pub original_size: i32,
    pub width: i32,
    pub height: i32,
    pub source_url: Option<String>,
    pub view_count: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostPage {
    pub posts: Vec<CollectionPost>,
    pub has_more: bool,
}

/// Every shelf, most recently touched first — empty ones included, unlike the website: a
/// shelf you have just named is the row you are looking for here.
pub async fn list_collections(db: &PgPool) -> Result<Vec<Collection>, String> {
    sqlx::query_as::<_, Collection>(concat!(
        shelf_select!(),
        "group by c.id order by c.updated_at desc, c.id desc"
    ))
    .fetch_all(db)
    .await
    .map_err(message)
}

/// A shelf's images, newest first. `after` is a cursor (strictly older than that id), never
/// an offset, so an image added mid-scroll does not slide the rows below it.
pub async fn list_collection_posts(
    db: &PgPool,
    collection_id: i32,
    after: Option<i32>,
    per_page: i64,
) -> Result<PostPage, String> {
    let rows = sqlx::query_as::<_, CollectionPost>(concat!(
        "select ",
        post_columns!(),
        " from collection_posts p where p.collection_id = $1",
        " and ($2::int is null or p.id < $2) order by p.id desc limit $3"
    ))
    .bind(collection_id)
    .bind(after)
    .bind(per_page + 1)
    .fetch_all(db)
    .await
    .map_err(message)?;

    let has_more = rows.len() as i64 > per_page;
    let posts = rows.into_iter().take(per_page as usize).collect();
    Ok(PostPage { posts, has_more })
}

pub async fn get_post(db: &PgPool, id: i32) -> Result<Option<CollectionPost>, String> {
    sqlx::query_as::<_, CollectionPost>(concat!(
        "select ",
        post_columns!(),
        " from collection_posts p where p.id = $1"
    ))
    .bind(id)
    .fetch_optional(db)
    .await
    .map_err(message)
}

/// Which of these md5s are already on a shelf, and which shelf — the dedup question, asked
/// once for a whole batch. `file_name` is unique across the whole table.
pub async fn find_posts_by_file_names(
    db: &PgPool,
    names: &[String],
) -> Result<HashMap<String, (i32, String)>, String> {
    if names.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(i32, String, String)> = sqlx::query_as(
        "select p.id, p.file_name, c.name from collection_posts p
           join collections c on c.id = p.collection_id
          where p.file_name = any($1)",
    )
    .bind(names)
    .fetch_all(db)
    .await
    .map_err(message)?;
    Ok(rows.into_iter().map(|(id, file, shelf)| (file, (id, shelf))).collect())
}

fn taken(name: &str) -> String {
    format!("There is already a collection called {name}.")
}

pub async fn create_collection(db: &PgPool, name: &str, mark: Option<&str>) -> Result<i32, String> {
    sqlx::query_scalar::<_, i32>("insert into collections (name, mark) values ($1, $2) returning id")
        .bind(name)
        .bind(mark)
        .fetch_one(db)
        .await
        .map_err(|e| if is_unique_violation(&e) { taken(name) } else { message(e) })
}

/// A rename is a change to the shelf itself, so it moves to the top of the list.
pub async fn update_collection(db: &PgPool, id: i32, name: &str, mark: Option<&str>) -> Result<(), String> {
    let updated = sqlx::query(
        "update collections set name = $2, mark = $3, updated_at = now() where id = $1",
    )
    .bind(id)
    .bind(name)
    .bind(mark)
    .execute(db)
    .await
    .map_err(|e| if is_unique_violation(&e) { taken(name) } else { message(e) })?;
    if updated.rows_affected() == 0 {
        return Err("No such collection.".into());
    }
    Ok(())
}

/// Refuses a shelf that still holds anything. The missing `on delete cascade` is the real
/// enforcement; the count is here so the refusal can say how many are in the way.
pub async fn delete_collection(db: &PgPool, id: i32) -> Result<(), String> {
    let held: i64 = sqlx::query_scalar("select count(*) from collection_posts where collection_id = $1")
        .bind(id)
        .fetch_one(db)
        .await
        .map_err(message)?;
    if held > 0 {
        let s = if held == 1 { "" } else { "s" };
        return Err(format!("That collection still holds {held} image{s}. Delete them first."));
    }
    let gone = sqlx::query("delete from collections where id = $1")
        .bind(id)
        .execute(db)
        .await
        .map_err(message)?;
    if gone.rows_affected() == 0 {
        return Err("No such collection.".into());
    }
    Ok(())
}

pub struct NewPost<'a> {
    pub collection_id: i32,
    pub file_name: &'a str,
    pub file_ext: &'a str,
    pub file_size: i32,
    pub original_size: i32,
    pub width: i32,
    pub height: i32,
    /// Empty is no source, stored as null.
    pub source_url: &'a str,
}

async fn touch(tx: &mut sqlx::PgConnection, id: i32) -> Result<(), sqlx::Error> {
    sqlx::query("update collections set updated_at = now() where id = $1")
        .bind(id)
        .execute(tx)
        .await
        .map(|_| ())
}

/// The row and the shelf's `updated_at` are one change, so one transaction.
pub async fn create_post(db: &PgPool, post: &NewPost<'_>) -> Result<i32, String> {
    let mut tx = db.begin().await.map_err(message)?;
    let source = Some(post.source_url.trim()).filter(|s| !s.is_empty());
    let id: i32 = sqlx::query_scalar(
        "insert into collection_posts
           (collection_id, file_name, file_ext, file_size, original_size, width, height, source_url)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
    )
    .bind(post.collection_id)
    .bind(post.file_name)
    .bind(post.file_ext)
    .bind(post.file_size)
    .bind(post.original_size)
    .bind(post.width)
    .bind(post.height)
    .bind(source)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        if is_unique_violation(&e) {
            "This image is already on a shelf.".to_string()
        } else {
            message(e)
        }
    })?;
    touch(&mut tx, post.collection_id).await.map_err(message)?;
    tx.commit().await.map_err(message)?;
    Ok(id)
}

/// A source is a fact about one image, so the shelf is **not** touched.
pub async fn update_post_source(db: &PgPool, id: i32, source_url: &str) -> Result<(), String> {
    let source = Some(source_url.trim()).filter(|s| !s.is_empty());
    let updated = sqlx::query("update collection_posts set source_url = $2 where id = $1")
        .bind(id)
        .bind(source)
        .execute(db)
        .await
        .map_err(message)?;
    if updated.rows_affected() == 0 {
        return Err(format!("Image {id} not found."));
    }
    Ok(())
}

/// Deletes the row, touching its shelf, and answers with the shelf it was on.
pub async fn delete_post_row(db: &PgPool, id: i32) -> Result<Option<i32>, String> {
    let mut tx = db.begin().await.map_err(message)?;
    let shelf: Option<i32> =
        sqlx::query_scalar("delete from collection_posts where id = $1 returning collection_id")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(message)?;
    if let Some(shelf) = shelf {
        touch(&mut tx, shelf).await.map_err(message)?;
    }
    tx.commit().await.map_err(message)?;
    Ok(shelf)
}

/// Moves a selection onto one shelf, answering with how many moved. No object moves — the
/// prefix is flat. An image already there is skipped rather than rewritten.
pub async fn move_posts(db: &PgPool, ids: &[i32], collection_id: i32) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }
    let mut tx = db.begin().await.map_err(message)?;
    let rows: Vec<(i32, i32)> = sqlx::query_as(
        "update collection_posts p set collection_id = $1
           from collection_posts old
          where old.id = p.id and p.id = any($2) and p.collection_id <> $1
         returning p.id, old.collection_id",
    )
    .bind(collection_id)
    .bind(ids)
    .fetch_all(&mut *tx)
    .await
    .map_err(message)?;

    if !rows.is_empty() {
        let mut shelves: Vec<i32> = rows.iter().map(|(_, was)| *was).collect();
        shelves.push(collection_id);
        shelves.sort_unstable();
        shelves.dedup();
        for shelf in shelves {
            touch(&mut tx, shelf).await.map_err(message)?;
        }
    }
    tx.commit().await.map_err(message)?;
    Ok(rows.len())
}
