//! What this copy of the app did to the board — every upload, edit and delete, with how long
//! it took and what the board or the bucket said when it refused — in `app/cache/logs.json`.
//!
//! In the cache folder because losing it loses nothing the board does not hold. Every entry
//! is pushed to the window as it is written (`activity:entry`): that is how the Logs screen
//! stays live, and how a failure becomes a notice in the corner without each screen having to
//! remember to raise one.

use std::future::Future;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter};

use crate::cache;
use crate::time;

const FILE: &str = "logs.json";
/// Newest kept, oldest dropped; the file is rewritten per entry and stays small.
const MAX_ENTRIES: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: u64,
    pub at: String,
    /// `info` or `error`.
    pub level: String,
    /// `area:verb` — `collection:upload`.
    pub action: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<Value>,
}

#[derive(Serialize, Deserialize)]
struct LogFile {
    at: u64,
    entries: Vec<LogEntry>,
}

static ENTRIES: Mutex<Option<Vec<LogEntry>>> = Mutex::new(None);
static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn init(app: AppHandle) {
    let _ = APP.set(app);
}

fn with_entries<T>(f: impl FnOnce(&mut Vec<LogEntry>) -> T) -> T {
    let mut guard = ENTRIES.lock().unwrap_or_else(|e| e.into_inner());
    let entries = guard.get_or_insert_with(|| {
        cache::read_json::<LogFile>(FILE).map(|file| file.entries).unwrap_or_default()
    });
    f(entries)
}

pub fn read() -> Vec<LogEntry> {
    with_entries(|entries| entries.clone())
}

pub fn clear() {
    with_entries(|entries| entries.clear());
    cache::drop_file(FILE);
}

pub fn log(level: &str, action: &str, message: impl Into<String>, detail: Option<Value>) {
    let entry = with_entries(|entries| {
        let id = entries.iter().map(|e| e.id).max().unwrap_or(0) + 1;
        let entry = LogEntry {
            id,
            at: time::now().iso(),
            level: level.into(),
            action: action.into(),
            message: message.into(),
            detail,
        };
        entries.insert(0, entry.clone());
        entries.truncate(MAX_ENTRIES);
        cache::write_json(FILE, &LogFile { at: time::now_ms(), entries: entries.clone() });
        entry
    });
    if let Some(app) = APP.get() {
        let _ = app.emit("activity:entry", &entry);
    }
}

fn merge(base: &Value, extra: &Value) -> Value {
    let mut map = base.as_object().cloned().unwrap_or_else(Map::new);
    if let Some(extra) = extra.as_object() {
        map.extend(extra.clone());
    }
    Value::Object(map)
}

/// Runs one write and logs its answer — `ok` as info, a refusal as an error, with the time
/// it took — and hands the window `{ ok: true, …extra }` or `{ ok: false, error }`. Logging
/// is beside the write, never a change to what it says.
///
/// `extra` is what only the answer knows — the new post's id, how many moved — and is both
/// merged into the log entry's detail and returned to the window.
pub async fn logged<F>(action: &str, detail: Value, write: F) -> Value
where
    F: Future<Output = Result<Value, String>>,
{
    let started = Instant::now();
    let result = write.await;
    let ms = json!({ "ms": started.elapsed().as_millis() as u64 });
    match result {
        Ok(extra) => {
            log("info", action, "ok", Some(merge(&merge(&detail, &extra), &ms)));
            merge(&json!({ "ok": true }), &extra)
        }
        Err(error) => {
            log("error", action, error.clone(), Some(merge(&detail, &ms)));
            json!({ "ok": false, "error": error })
        }
    }
}
