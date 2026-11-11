//! What the app remembers about *this machine* — `save.json`, plain readable JSON with
//! nothing secret in it. The board's values are in the OS credential store (`setup.rs`),
//! never here.
//!
//! All of it is about how hard an upload works: how many cores the lossless pass may take,
//! and how much effort it spends on PNGs.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::compress::Effort;
use crate::paths::config_dir;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    /// Cores the compressor may use. Half the machine by default, so an upload does not make
    /// everything else on the desk stutter.
    pub encode_threads: usize,
    /// oxipng's preset, 0–6.
    pub png_level: u8,
    pub zopfli: bool,
}

pub fn cpu_count() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1)
}

impl Default for Preferences {
    fn default() -> Self {
        Preferences { encode_threads: (cpu_count() / 2).max(1), png_level: 4, zopfli: false }
    }
}

impl Preferences {
    /// A hand-edited file asking for 400 threads still answers with values that work.
    fn clamped(self) -> Self {
        Preferences {
            encode_threads: self.encode_threads.clamp(1, cpu_count()),
            png_level: self.png_level.min(6),
            zopfli: self.zopfli,
        }
    }

    pub fn effort(&self) -> Effort {
        Effort { png_level: self.png_level, zopfli: self.zopfli }
    }
}

pub fn save_path() -> PathBuf {
    config_dir().join("save.json")
}

fn read_file() -> Value {
    std::fs::read_to_string(save_path())
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}))
}

static PREFS: Mutex<Option<Preferences>> = Mutex::new(None);
static POOL: Mutex<Option<(usize, Arc<rayon::ThreadPool>)>> = Mutex::new(None);

pub fn load() -> Preferences {
    let mut held = PREFS.lock().unwrap_or_else(|e| e.into_inner());
    *held.get_or_insert_with(|| {
        read_file()
            .get("preferences")
            .and_then(|value| serde_json::from_value::<Preferences>(value.clone()).ok())
            .unwrap_or_default()
            .clamped()
    })
}

/// Writes and applies in one step: the next upload uses the new values, no restart.
/// Other sections of the file are kept as they are.
pub fn save(input: Preferences) -> Preferences {
    let next = input.clamped();
    let mut file = read_file();
    file["preferences"] = serde_json::to_value(next).unwrap_or_default();
    let _ = std::fs::create_dir_all(config_dir());
    if let Ok(text) = serde_json::to_string_pretty(&file) {
        if let Err(error) = std::fs::write(save_path(), text) {
            eprintln!("Could not write save.json: {error}");
        }
    }
    *PREFS.lock().unwrap_or_else(|e| e.into_inner()) = Some(next);
    next
}

/// The pool every encode runs inside, rebuilt when the thread count changes.
pub fn pool() -> Arc<rayon::ThreadPool> {
    let threads = load().encode_threads;
    let mut held = POOL.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((size, pool)) = held.as_ref() {
        if *size == threads {
            return pool.clone();
        }
    }
    let pool = Arc::new(
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|i| format!("encode-{i}"))
            .build()
            .expect("a thread pool"),
    );
    *held = Some((threads, pool.clone()));
    pool
}
