//! Turning a picked or dropped file, or a pasted link, into a staged file.
//!
//! Everything that would otherwise fail halfway through an upload is settled first: is it an
//! image at all, is it within the limits, is it already on a shelf, and what does it look
//! like. The preview is a small WebP `data:` URL, never the file itself in the window.

use std::path::{Path, PathBuf};

use md5::{Digest, Md5};
use serde::Serialize;

use crate::compress::{self, Kind, MAX_FILE_SIZE};
use crate::data;
use crate::db;
use crate::paths::downloads_dir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Staged {
    ok: bool,
    path: String,
    name: String,
    size: u64,
    width: u32,
    height: u32,
    preview: String,
    /// The md5 of the bytes — what the image would be named, and so the answer to "is this
    /// already up?".
    pub md5: String,
    duplicate_of: Option<i32>,
    duplicate_in: Option<String>,
}

#[derive(Serialize)]
pub struct Refused {
    ok: bool,
    path: String,
    name: String,
    error: String,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum StageOutcome {
    Staged(Staged),
    Refused(Refused),
}

pub fn md5_hex(bytes: &[u8]) -> String {
    hex::encode(Md5::digest(bytes))
}

fn refused(path: &str, name: &str, error: impl Into<String>) -> StageOutcome {
    StageOutcome::Refused(Refused { ok: false, path: path.into(), name: name.into(), error: error.into() })
}

fn stage_one(path: &str, name: &str) -> StageOutcome {
    let size = match std::fs::metadata(path) {
        Ok(meta) if meta.is_file() => meta.len(),
        Ok(_) => return refused(path, name, "Not a file"),
        Err(_) => return refused(path, name, "Could not read this file"),
    };
    if size == 0 {
        return refused(path, name, "Empty file");
    }
    if size > MAX_FILE_SIZE {
        return refused(path, name, format!("Too large (max {}MB)", MAX_FILE_SIZE / 1024 / 1024));
    }
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(_) => return refused(path, name, "Could not read this file"),
    };
    let header = match compress::read_header(&bytes) {
        Ok(header) => header,
        Err(error) => return refused(path, name, error),
    };
    if let Err(error) = compress::check_limits(size, &header) {
        return refused(path, name, error);
    }
    StageOutcome::Staged(Staged {
        ok: true,
        path: path.into(),
        name: name.into(),
        size,
        width: header.width,
        height: header.height,
        // A file with no picture here is still uploadable; the thumbnail is made later.
        preview: compress::preview(&bytes).unwrap_or_default(),
        md5: md5_hex(&bytes),
        duplicate_of: None,
        duplicate_in: None,
    })
}

fn file_name(path: &str) -> String {
    Path::new(path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.into())
}

/// Which of these are already on a shelf, asked once for the whole batch. A failed query
/// leaves every file a normal one: being unable to reach the board is not evidence that an
/// image is new, and the upload's own check still stands.
async fn mark_duplicates(mut outcomes: Vec<StageOutcome>) -> Vec<StageOutcome> {
    let names: Vec<String> = outcomes
        .iter()
        .filter_map(|o| match o {
            StageOutcome::Staged(s) => Some(s.md5.clone()),
            StageOutcome::Refused(_) => None,
        })
        .collect();
    let Some(db) = db::pool() else { return outcomes };
    match data::find_posts_by_file_names(db, &names).await {
        Ok(found) => {
            for outcome in outcomes.iter_mut() {
                if let StageOutcome::Staged(staged) = outcome {
                    if let Some((id, shelf)) = found.get(&staged.md5) {
                        staged.duplicate_of = Some(*id);
                        staged.duplicate_in = Some(shelf.clone());
                    }
                }
            }
        }
        Err(error) => eprintln!("Could not check for duplicates: {error}"),
    }
    outcomes
}

/// Sequential on purpose: each decodes an image, and the first row should appear first.
pub async fn stage_files(paths: Vec<String>) -> Vec<StageOutcome> {
    let mut outcomes = Vec::with_capacity(paths.len());
    for path in paths {
        let name = file_name(&path);
        let outcome = tauri::async_runtime::spawn_blocking(move || stage_one(&path, &name))
            .await
            .unwrap_or_else(|_| refused("", "", "Staging failed"));
        outcomes.push(outcome);
    }
    mark_duplicates(outcomes).await
}

fn http() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            // Some image hosts refuse a request that does not look like a browser's.
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Collecto")
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("an HTTP client")
    })
}

/// Downloads one linked image into the downloads folder, named by its md5.
async fn download(url: &str) -> Result<(PathBuf, String), String> {
    let parsed = url::Url::parse(url).map_err(|_| "Not a link".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only http(s) links can be fetched".into());
    }
    let name = parsed
        .path_segments()
        .and_then(|mut segments| segments.next_back().map(str::to_string))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "image".into());

    let mut response = http().get(parsed).send().await.map_err(|e| format!("Download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Download failed: {}", response.status()));
    }
    if response.content_length().unwrap_or(0) > MAX_FILE_SIZE {
        return Err(format!("Too large (max {}MB)", MAX_FILE_SIZE / 1024 / 1024));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Download failed: {e}"))? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > MAX_FILE_SIZE {
            return Err(format!("Too large (max {}MB)", MAX_FILE_SIZE / 1024 / 1024));
        }
    }
    let kind = Kind::detect(&bytes).ok_or(compress::UNSUPPORTED)?;
    let dir = downloads_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.{}", md5_hex(&bytes), kind.ext()));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok((path, name))
}

/// Pasted links, fetched and then staged exactly like picked files.
pub async fn fetch_images(urls: Vec<String>) -> Vec<StageOutcome> {
    let mut outcomes = Vec::with_capacity(urls.len());
    for url in urls {
        let outcome = match download(&url).await {
            Ok((path, name)) => {
                let path = path.to_string_lossy().into_owned();
                tauri::async_runtime::spawn_blocking(move || stage_one(&path, &name))
                    .await
                    .unwrap_or_else(|_| refused(&url, &url, "Staging failed"))
            }
            Err(error) => refused(&url, &url, error),
        };
        outcomes.push(outcome);
    }
    mark_duplicates(outcomes).await
}

/// Images fetched from links live only as long as the app does.
pub fn clean_downloads() {
    let _ = std::fs::remove_dir_all(downloads_dir());
}
