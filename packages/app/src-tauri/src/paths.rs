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

/// The identifier earlier builds had (`tauri.conf.json`), and so the name of their folders.
const OLD_IDENTIFIER: &str = "dev.collecto.manager";

/// Called once at startup. **Everything lives in one folder** — the app's local data folder,
/// named after the bundle identifier (`%LOCALAPPDATA%\app.phumoonlight.collecto` on Windows):
/// `save.json` at its top, `app-cache/` beside it. Nothing goes to Roaming; a roaming profile is
/// not something this app is used with. A debug build keeps its own `dev` subfolder, so working
/// on the app never disturbs the preferences, cache and log of the copy you use.
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let flavour = |base: PathBuf| if cfg!(debug_assertions) { base.join("dev") } else { base };
    let config = flavour(app.path().app_local_data_dir()?);
    let cache = config.join("app-cache");

    // Before anything is created here, so an older build's cache can be moved in whole.
    for root in [app.path().local_data_dir()?, app.path().config_dir()?] {
        let old = root.join(OLD_IDENTIFIER);
        move_legacy(&flavour(old.clone()), &config);
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

/// Moves what an earlier build left in `old` — under the old identifier, Local or Roaming —
/// into `new`: `save.json` and `app-cache/`, each only if `new` does not have one yet. Nothing
/// is deleted here: an item that could not move, or that `new` already had, stays where it is,
/// and the old folder is removed by the caller only once it is empty.
fn move_legacy(old: &Path, new: &Path) {
    if old == new || !old.is_dir() {
        return;
    }
    let _ = std::fs::create_dir_all(new);
    for name in ["save.json", "app-cache"] {
        let (from, to) = (old.join(name), new.join(name));
        if from.exists() && !to.exists() {
            if let Err(error) = std::fs::rename(&from, &to) {
                eprintln!("Could not move {} to {}: {error}", from.display(), to.display());
            }
        }
    }
    // Empty now unless something stayed behind.
    let _ = std::fs::remove_dir(old);
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
