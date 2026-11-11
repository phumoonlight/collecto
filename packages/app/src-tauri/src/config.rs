//! Which board this build talks to — compiled in by `build.rs`, read nowhere else.
//!
//! There is no setup screen and no login: possession of a build is the write authorization,
//! as it was for booru's desktop app. The database login is `collecto_app`, which may read
//! and write every row and owns nothing, so a string extracted from a binary can vandalise
//! the data and cannot drop a table (see `db/README.md`).

use std::sync::OnceLock;

pub struct R2Config {
    pub account_id: &'static str,
    pub access_key_id: &'static str,
    pub secret_access_key: &'static str,
    pub bucket: &'static str,
}

pub struct AppConfig {
    pub database_url: &'static str,
    /// The bucket's public origin, no trailing slash.
    pub cdn_url: String,
    /// The website, no trailing slash.
    pub site_url: String,
    pub r2: R2Config,
}

fn build() -> Option<AppConfig> {
    Some(AppConfig {
        database_url: option_env!("COLLECTO_DATABASE_URL_APP")?,
        cdn_url: option_env!("COLLECTO_NEXT_PUBLIC_CDN_URL")?.trim_end_matches('/').to_string(),
        site_url: option_env!("COLLECTO_NEXT_PUBLIC_SITE_URL")?.trim_end_matches('/').to_string(),
        r2: R2Config {
            account_id: option_env!("COLLECTO_R2_ACCOUNT_ID")?,
            access_key_id: option_env!("COLLECTO_R2_ACCESS_KEY_ID")?,
            secret_access_key: option_env!("COLLECTO_R2_SECRET_ACCESS_KEY")?,
            bucket: option_env!("COLLECTO_R2_BUCKET")?,
        },
    })
}

/// The board, or `None` for a build made without its values.
pub fn config() -> Option<&'static AppConfig> {
    static CONFIG: OnceLock<Option<AppConfig>> = OnceLock::new();
    CONFIG.get_or_init(build).as_ref()
}

/// The database's host, for the settings readout — never the URL, which carries a password.
pub fn database_host() -> String {
    config()
        .and_then(|c| url::Url::parse(c.database_url).ok())
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_default()
}

/// The public URL of a stored object.
pub fn public_url(path: &str) -> Option<String> {
    config().map(|c| format!("{}/{}", c.cdn_url, path))
}
