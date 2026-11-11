//! Where things live: the bucket's object paths, and this machine's folders.
//!
//! **Object paths are derived, never stored.** `file_name` is the md5 of the uploaded bytes
//! and `file_ext` is the original format's, so a post is `collections/posts/<md5>.<ext>` and
//! its thumbnail `collections/thumbs/<md5>.<ext>` — the same extension, since nothing is
//! converted to another format. Flat rather than per shelf, so moving an image between
//! shelves is one column and no object moves.

use std::path::{Path, PathBuf};
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
    /// `save.json` — preferences, plain JSON meant to be opened.
    config: PathBuf,
    /// `app-cache/` — copies of what the board holds; deletable at any moment.
    cache: PathBuf,
}

static DIRS: OnceLock<Dirs> = OnceLock::new();

/// Called once at startup. **Everything lives in one folder** — the app's local data folder
/// (`%LOCALAPPDATA%\dev.collecto.manager` on Windows): `save.json` at its top, `app-cache/`
/// beside it. Nothing goes to Roaming; a roaming profile is not something this app is used
/// with. A debug build keeps its own `dev` subfolder, so working on the app never disturbs the
/// preferences, cache and log of the copy you use.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let flavour = |base: PathBuf| if cfg!(debug_assertions) { base.join("dev") } else { base };
    let config = flavour(app.path().app_local_data_dir()?);
    let cache = config.join("app-cache");
    let _ = std::fs::create_dir_all(&cache);
    move_from_roaming(&flavour(app.path().app_config_dir()?), &config);
    let _ = DIRS.set(Dirs { config, cache });
    Ok(())
}

/// Earlier builds kept `save.json` in the Roaming folder. It is moved into the local one once,
/// unless a local one already exists, and the Roaming folders are removed when that leaves
/// them empty — `remove_dir` refuses a folder with anything else in it, such as another
/// build's preferences.
fn move_from_roaming(old: &Path, new: &Path) {
    if old == new {
        return;
    }
    let (from, to) = (old.join("save.json"), new.join("save.json"));
    if from.exists() && !to.exists() {
        let moved = std::fs::rename(&from, &to)
            .or_else(|_| std::fs::copy(&from, &to).and_then(|_| std::fs::remove_file(&from)));
        if let Err(error) = moved {
            eprintln!("Could not move save.json out of Roaming: {error}");
            return;
        }
    }
    let _ = std::fs::remove_dir(old);
    if let Some(parent) = old.parent().filter(|_| cfg!(debug_assertions)) {
        let _ = std::fs::remove_dir(parent);
    }
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
