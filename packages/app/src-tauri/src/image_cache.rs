//! Every stored image this window has drawn, kept as the file it is —
//! `app-cache/images/<md5>.<ext>` — and the grid's copies cut from it, `app-cache/grid/`.
//!
//! **Nothing here expires, and nothing can go stale.** `file_name` is the md5 of the uploaded
//! bytes, so a file found under that name *is* that image. The folders are bounded by the board
//! itself; a deleted image takes its files with it (`forget`).
//!
//! The grids draw from the full size rather than the bucket's thumbnails: each tile asks for a
//! copy cut to its exact on-screen box in device pixels, made once with a proper kernel, so the
//! window draws it 1:1 and does no scaling of its own.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::compress;
use crate::config::public_url;
use crate::paths::{cache_dir, image_path, safe_ext, safe_name};

const IMAGES: &str = "images";
const GRID: &str = "grid";

fn image_file(file_name: &str, file_ext: &str) -> Option<PathBuf> {
    (safe_name(file_name) && safe_ext(file_ext))
        .then(|| cache_dir().join(IMAGES).join(format!("{file_name}.{file_ext}")))
}

fn http() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("an HTTP client")
    })
}

fn write(path: &PathBuf, bytes: &[u8]) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Err(error) = std::fs::write(path, bytes) {
        eprintln!("Could not cache an image: {error}");
    }
}

/// A file just uploaded is the file the bucket now holds — kept, so looking at it costs no
/// download.
pub fn remember(file_name: &str, file_ext: &str, bytes: &[u8]) {
    if let Some(path) = image_file(file_name, file_ext) {
        write(&path, bytes);
    }
}

/// The stored image at full size: disk, then the public bucket, filling the disk.
pub async fn stored(file_name: &str, file_ext: &str) -> Option<Vec<u8>> {
    let path = image_file(file_name, file_ext)?;
    if let Ok(bytes) = tokio::fs::read(&path).await {
        return Some(bytes);
    }
    let url = public_url(&image_path(file_name, file_ext))?;
    let response = http().get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let bytes = response.bytes().await.ok()?.to_vec();
    write(&path, &bytes);
    Some(bytes)
}

/// A tile's box: `<w>x<h>` in device pixels, `-top` to keep the top of a portrait cut square.
#[derive(Clone, Copy)]
pub struct GridBox {
    pub width: u32,
    pub height: u32,
    pub top: bool,
}

impl GridBox {
    pub fn parse(asked: &str) -> Option<GridBox> {
        let (size, top) = match asked.strip_suffix("-top") {
            Some(size) => (size, true),
            None => (asked, false),
        };
        let (w, h) = size.split_once('x')?;
        let clamp = |side: &str| side.parse::<u32>().ok().map(|n| n.clamp(16, 4096));
        Some(GridBox { width: clamp(w)?, height: clamp(h)?, top })
    }

    fn name(&self) -> String {
        format!("{}x{}{}", self.width, self.height, if self.top { "-top" } else { "" })
    }
}

/// One resize per image and size however many tiles ask at once.
static IN_FLIGHT: Mutex<Option<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> = Mutex::new(None);

fn flight(key: &str) -> Arc<tokio::sync::Mutex<()>> {
    IN_FLIGHT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get_or_insert_with(HashMap::new)
        .entry(key.to_string())
        .or_default()
        .clone()
}

/// Takes a key out of `IN_FLIGHT` when the resize it guards is over, however it ended.
struct FlightEntry(String);

impl Drop for FlightEntry {
    fn drop(&mut self) {
        if let Some(map) = IN_FLIGHT.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            map.remove(&self.0);
        }
    }
}

/// The copy a tile draws: WebP at quality 90, a local file whose only job is to look like the
/// original at a smaller size. Falls back to the original if it cannot be decoded here — a
/// file this side cannot read is still one the webview might.
pub async fn grid(file_name: &str, file_ext: &str, size: GridBox) -> Option<(Vec<u8>, &'static str)> {
    if !safe_name(file_name) || !safe_ext(file_ext) {
        return None;
    }
    let path = cache_dir().join(GRID).join(format!("{file_name}.{}.webp", size.name()));
    if let Ok(bytes) = tokio::fs::read(&path).await {
        return Some((bytes, "image/webp"));
    }
    let key = format!("{file_name}:{}", size.name());
    // Declared before the lock, so it is dropped after it — on every way out, once the copy is
    // on disk for whoever was waiting.
    let _entry = FlightEntry(key.clone());
    let lock = flight(&key);
    let _held = lock.lock().await;

    if let Ok(bytes) = tokio::fs::read(&path).await {
        return Some((bytes, "image/webp"));
    }
    let original = stored(file_name, file_ext).await?;
    let made = tauri::async_runtime::spawn_blocking({
        let original = original.clone();
        move || {
            let image = compress::decode(&original).ok()?;
            let crop = (0.5, if size.top { 0.0 } else { 0.5 });
            let cut = compress::resize(&image, size.width, size.height, Some(crop)).ok()?;
            compress::encode_webp(&cut, 90.0).ok()
        }
    })
    .await
    .ok()
    .flatten();

    match made {
        Some(bytes) => {
            write(&path, &bytes);
            Some((bytes, "image/webp"))
        }
        None => Some((original, compress::content_type(file_ext))),
    }
}

/// Every copy of an image that has just stopped existing anywhere.
pub fn forget(file_name: &str, file_ext: &str) {
    if let Some(path) = image_file(file_name, file_ext) {
        let _ = std::fs::remove_file(path);
    }
    if !safe_name(file_name) {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(cache_dir().join(GRID)) {
        let prefix = format!("{file_name}.");
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with(&prefix) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

fn folder_size(dir: PathBuf) -> (u64, u64) {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries.flatten().fold((0, 0), |(count, bytes), entry| {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                (count + 1, bytes + size)
            })
        })
        .unwrap_or((0, 0))
}

/// How many full-size images are held, and how much the two folders weigh.
pub fn usage() -> (u64, u64) {
    let (images, image_bytes) = folder_size(cache_dir().join(IMAGES));
    let (_, grid_bytes) = folder_size(cache_dir().join(GRID));
    (images, image_bytes + grid_bytes)
}

pub fn clear() {
    let _ = std::fs::remove_dir_all(cache_dir().join(IMAGES));
    let _ = std::fs::remove_dir_all(cache_dir().join(GRID));
}
