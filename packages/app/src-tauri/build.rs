//! Compiles the board's values into the binary, the way booru's desktop build did: which
//! database and bucket a copy writes to is decided when it is built, never typed into a
//! settings screen and never written to disk by the app.
//!
//! Each value is read from the process environment first, then from the repo root's
//! `.env.local`. A debug build without them still compiles — the window says it is not set
//! up — but a release build refuses, so no installer can ship pointing at nothing.

use std::collections::HashMap;
use std::path::Path;

const KEYS: [&str; 7] = [
    "DATABASE_URL_APP",
    "NEXT_PUBLIC_CDN_URL",
    "NEXT_PUBLIC_SITE_URL",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
];

fn parse_env_file(text: &str) -> HashMap<String, String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .filter_map(|line| line.split_once('='))
        .map(|(key, value)| {
            let value = value.trim();
            let unquoted = value
                .strip_prefix('"')
                .and_then(|v| v.strip_suffix('"'))
                .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
                .unwrap_or(value);
            (key.trim().to_string(), unquoted.to_string())
        })
        .collect()
}

fn main() {
    let env_file = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../.env.local");
    println!("cargo:rerun-if-changed={}", env_file.display());
    for key in KEYS {
        println!("cargo:rerun-if-env-changed={key}");
    }

    let file = std::fs::read_to_string(&env_file)
        .map(|text| parse_env_file(&text))
        .unwrap_or_default();

    let mut missing = Vec::new();
    for key in KEYS {
        let value = std::env::var(key)
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| file.get(key).cloned())
            .unwrap_or_default();
        if value.is_empty() || value.contains("YOUR_") {
            missing.push(key);
            continue;
        }
        println!("cargo:rustc-env=COLLECTO_{key}={value}");
    }

    if !missing.is_empty() {
        let list = missing.join(", ");
        if std::env::var("PROFILE").as_deref() == Ok("release") {
            panic!("Refusing to build a release without {list} — set them in .env.local (see .env.example).");
        }
        println!("cargo:warning=Not set: {list}. The app will open, but cannot reach a board.");
    }

    tauri_build::build()
}
