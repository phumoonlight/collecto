//! Where things live: the bucket's object paths, and this machine's folders.
//!
//! **Object paths are derived, never stored.** `file_name` is the md5 of the uploaded bytes
//! and `file_ext` is the original format's, so a post is `collections/posts/<md5>.<ext>` and
//! its thumbnail `collections/thumbs/<md5>.<ext>` — the same extension, since nothing is
//! converted to another format. Flat rather than per shelf, so moving an image between
//! shelves is one column and no object moves.

use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

pub const POST_PREFIX: &str = "collections/posts";
pub const THUMB_PREFIX: &str = "collections/thumbs";

pub fn image_path(file_name: &str, file_ext: &str) -> String {
    format!("{POST_PREFIX}/{file_name}.{file_ext}")
}

pub fn thumb_path(file_name: &str, file_ext: &str) -> String {
    format!("{THUMB_PREFIX}/{file_name}.{file_ext}")
}

/// Names come from a database column and become file paths, so they are checked first: an
/// md5 is hex and an extension is a short word. Anything else misses the cache.
pub fn safe_name(name: &str) -> bool {
    (1..=64).contains(&name.len()) && name.bytes().all(|b| b.is_ascii_alphanumeric())
}

pub fn safe_ext(ext: &str) -> bool {
    (1..=8).contains(&ext.len()) && ext.bytes().all(|b| b.is_ascii_alphanumeric())
}

struct Dirs {
    /// `save.json` — preferences, meant to be opened and carried to another machine.
    config: PathBuf,
    /// `app-cache/` — copies of what the board holds; deletable at any moment.
    cache: PathBuf,
}

static DIRS: OnceLock<Dirs> = OnceLock::new();

/// Called once at startup. A debug build keeps its own folders, so working on the app never
/// disturbs the preferences, cache and log of the copy you use.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let flavour = |base: PathBuf| if cfg!(debug_assertions) { base.join("dev") } else { base };
    let config = flavour(app.path().app_config_dir()?);
    let cache = flavour(app.path().app_local_data_dir()?).join("app-cache");
    let _ = std::fs::create_dir_all(&config);
    let _ = std::fs::create_dir_all(&cache);
    let _ = DIRS.set(Dirs { config, cache });
    Ok(())
}

pub fn config_dir() -> PathBuf {
    DIRS.get().map(|d| d.config.clone()).unwrap_or_else(std::env::temp_dir)
}

pub fn cache_dir() -> PathBuf {
    DIRS.get().map(|d| d.cache.clone()).unwrap_or_else(|| std::env::temp_dir().join("collecto-cache"))
}

/// Images fetched from a pasted link wait here until they are uploaded. Emptied at startup.
pub fn downloads_dir() -> PathBuf {
    std::env::temp_dir().join(if cfg!(debug_assertions) { "collecto-downloads-dev" } else { "collecto-downloads" })
}
