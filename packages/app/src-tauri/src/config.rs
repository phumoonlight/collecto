//! Which board this copy talks to — set at runtime from a setup code (`setup.rs`), never
//! compiled in. The build needs no environment; the installer carries no credential.
//!
//! The values arrive once per machine, as a passphrase-encrypted code pasted on first start,
//! and are kept in the OS credential store. The database login is `collecto_app`, which may
//! read and write every row and owns nothing, so the values can vandalise the data and cannot
//! drop a table (see `db/README.md`).

use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

/// Field names are the setup code's (`scripts/setup-code.mts`).
#[derive(Clone, Serialize, Deserialize)]
pub struct R2Config {
    #[serde(rename = "account")]
    pub account_id: String,
    #[serde(rename = "key")]
    pub access_key_id: String,
    #[serde(rename = "secret")]
    pub secret_access_key: String,
    pub bucket: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(rename = "db")]
    pub database_url: String,
    /// The bucket's public origin, no trailing slash.
    #[serde(rename = "cdn")]
    pub cdn_url: String,
    /// The website, no trailing slash.
    #[serde(rename = "site")]
    pub site_url: String,
    pub r2: R2Config,
}

static CONFIG: RwLock<Option<Arc<AppConfig>>> = RwLock::new(None);

/// The board, or `None` until a setup code has been entered on this machine.
pub fn config() -> Option<Arc<AppConfig>> {
    CONFIG.read().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Replaces the board for the rest of the session. The database pool notices on its next use
/// (`db::pool`), since it is keyed by the config it was built from.
pub fn set(next: Option<AppConfig>) {
    *CONFIG.write().unwrap_or_else(|e| e.into_inner()) = next.map(Arc::new);
}

/// The database's host, for the settings readout — never the URL, which carries a password.
pub fn database_host() -> String {
    config()
        .and_then(|c| url::Url::parse(&c.database_url).ok())
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_default()
}

/// The public URL of a stored object.
pub fn public_url(path: &str) -> Option<String> {
    config().map(|c| format!("{}/{}", c.cdn_url, path))
}
