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
    /// `app/` — holds `save.json`, the preferences: plain JSON meant to be opened.
    config: PathBuf,
    /// `app/cache/` — copies of what the board holds, and the log; deletable at any moment.
    cache: PathBuf,
}

static DIRS: OnceLock<Dirs> = OnceLock::new();

/// The identifier earlier builds had (`tauri.conf.json`), and so the name of their folders.
const OLD_IDENTIFIER: &str = "dev.collecto.manager";

/// Called once at startup. **Everything lives in one folder** — the app's local data folder,
/// named after the bundle identifier (`%LOCALAPPDATA%pp.phumoonlight.collecto` on Windows):
///
/// ```text
/// <root>/app/save.json
/// <root>/app/cache/        images/, grid/, collections.json, logs.json
/// ```
///
/// `<root>` is that folder for a release build and its `dev` subfolder for a debug build, so
/// working on the app never disturbs the preferences, cache and log of the copy you use. The
/// webview keeps its own `EBWebView` beside them. Nothing goes to Roaming.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let flavour = |base: PathBuf| if cfg!(debug_assertions) { base.join("dev") } else { base };
    let root = flavour(app.path().app_local_data_dir()?);
    let config = root.join("app");
    let cache = config.join("cache");
    let _ = std::fs::create_dir_all(&config);

    // Earlier layouts, before anything is created in `cache`, so an old cache moves in whole:
    // `save.json` and `app-cache/` at the root of this folder, then the same under the old
    // identifier, in Local or Roaming.
    move_legacy(&root, &config, &cache);
    for base in [app.path().local_data_dir()?, app.path().config_dir()?] {
        let old = base.join(OLD_IDENTIFIER);
        let old_root = flavour(old.clone());
        move_legacy(&old_root, &config, &cache);
        let _ = std::fs::remove_dir(&old_root);
        // The old identifier's WebView data sits at its root whichever build made it — a
        // browser cache nothing reads any more. The root itself goes only once it is empty,
        // so a debug build never takes a release build's files, or the reverse.
        let _ = std::fs::remove_dir_all(old.join("EBWebView"));
        let _ = std::fs::remove_dir(&old);
    }

    let _ = std::fs::create_dir_all(&cache);
    let _ = DIRS.set(Dirs { config, cache });
    Ok(())
}

/// Moves an earlier layout's `save.json` and `app-cache/` out of `old` into `config/save.json`
/// and `cache/`, each only if the new place does not have one yet. Nothing is deleted here: an
/// item that could not move, or that already existed, stays where it is.
fn move_legacy(old: &Path, config: &Path, cache: &Path) {
    if !old.is_dir() {
        return;
    }
    for (from, to) in [(old.join("save.json"), config.join("save.json")), (old.join("app-cache"), cache.to_path_buf())] {
        if from.exists() && !to.exists() {
            if let Err(error) = std::fs::rename(&from, &to) {
                eprintln!("Could not move {} to {}: {error}", from.display(), to.display());
            }
        }
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
