//! `app-cache/` — everything held only because reading it again is slow, and nothing else.
//! The whole folder can be deleted at any moment; the only cost is the next read.
//!
//! What is cached is the *wait*, not the bytes: the board is a Postgres instance on the other
//! side of a home connection. **Two lifetimes**, because the two go stale differently:
//!
//! - the shelf list is small and complete, so it is written to disk and trusted for a day —
//!   🔄 Refresh is the way past it;
//! - a shelf's screenfuls are pages cut at a cursor, right only until something lands on that
//!   shelf, so they are held in memory for the session.
//!
//! **Every write drops all of it.** A shelf's `updated_at` moves when an image is added,
//! removed or moved, which reorders the list and changes a cover, so no write's effect is
//! confined to one cached answer.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::data::{Collection, PostPage};
use crate::paths::cache_dir;
use crate::time::now_ms;

/// A day: long enough to cover a session, short enough that a change made elsewhere shows.
pub const TTL_MS: u64 = 24 * 60 * 60 * 1000;

fn path(file: &str) -> PathBuf {
    cache_dir().join(file)
}

/// A file that is missing or will not parse is a cache that is not there.
pub fn read_json<T: DeserializeOwned>(file: &str) -> Option<T> {
    let text = std::fs::read_to_string(path(file)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_json<T: Serialize>(file: &str, value: &T) {
    let _ = std::fs::create_dir_all(cache_dir());
    if let Ok(text) = serde_json::to_string(value) {
        if let Err(error) = std::fs::write(path(file), text) {
            eprintln!("Could not write {file}: {error}");
        }
    }
}

pub fn drop_file(file: &str) {
    let _ = std::fs::remove_file(path(file));
}

const COLLECTIONS_FILE: &str = "collections.json";

#[derive(Clone, Serialize, Deserialize)]
struct CollectionsFile {
    at: u64,
    collections: Vec<Collection>,
}

/// `None`: the file has not been looked at yet.
static LIST: Mutex<Option<Option<CollectionsFile>>> = Mutex::new(None);
/// One read of the board at a time, however many callers arrive while it runs.
static FILLING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static PAGES: Mutex<Option<HashMap<String, PostPage>>> = Mutex::new(None);

fn held_list() -> Option<CollectionsFile> {
    let mut guard = LIST.lock().unwrap_or_else(|e| e.into_inner());
    guard.get_or_insert_with(|| read_json::<CollectionsFile>(COLLECTIONS_FILE)).clone()
}

/// The shelf list: the copy we hold if it is under a day old, otherwise the board's. A failed
/// read serves what we have rather than nothing — this morning's shelves beat an empty screen.
pub async fn collections<F, Fut>(force: bool, read: F) -> Result<Vec<Collection>, String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<Vec<Collection>, String>>,
{
    let fresh = |file: &Option<CollectionsFile>| file.as_ref().filter(|f| now_ms().saturating_sub(f.at) < TTL_MS).cloned();
    if !force {
        if let Some(file) = fresh(&held_list()) {
            return Ok(file.collections);
        }
    }

    let _filling = FILLING.lock().await;
    // Someone else may have filled it while this call waited.
    if !force {
        if let Some(file) = fresh(&held_list()) {
            return Ok(file.collections);
        }
    }
    match read().await {
        Ok(collections) => {
            let file = CollectionsFile { at: now_ms(), collections: collections.clone() };
            write_json(COLLECTIONS_FILE, &file);
            *LIST.lock().unwrap_or_else(|e| e.into_inner()) = Some(Some(file));
            Ok(collections)
        }
        Err(error) => match held_list() {
            Some(file) => Ok(file.collections),
            None => Err(error),
        },
    }
}

/// One screenful of one shelf, keyed by everything that decides which rows come back.
pub async fn posts<F, Fut>(collection_id: &str, after: Option<i32>, per_page: i64, read: F) -> Result<PostPage, String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<PostPage, String>>,
{
    let key = format!("{collection_id}:{}:{per_page}", after.unwrap_or(0));
    if let Some(page) = PAGES.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).get(&key) {
        return Ok(page.clone());
    }
    let page = read().await?;
    // An empty answer is not remembered: it may be a shelf that is about to be filled.
    if !page.posts.is_empty() {
        PAGES.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).insert(key, page.clone());
    }
    Ok(page)
}

/// Drops the list, its file and every page. Every write calls it.
pub fn drop_collections() {
    *LIST.lock().unwrap_or_else(|e| e.into_inner()) = Some(None);
    PAGES.lock().unwrap_or_else(|e| e.into_inner()).take();
    drop_file(COLLECTIONS_FILE);
}

/// When the shelf list was last read from the board, for the settings readout.
pub fn collections_read_at() -> Option<u64> {
    held_list().map(|file| file.at)
}
