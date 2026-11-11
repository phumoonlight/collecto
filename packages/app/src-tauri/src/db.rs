//! The app's one connection to the board: `collecto_app`, from the connection string compiled
//! into this build.

use std::str::FromStr;
use std::sync::OnceLock;
use std::time::Duration;

use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};

use crate::config::config;

/// Neon's connection strings carry `channel_binding=require`, which sqlx does not know; the
/// rest (`sslmode=require` above all) it reads.
fn connect_options(url: &str) -> Result<PgConnectOptions, String> {
    let mut parsed = url::Url::parse(url).map_err(|e| format!("DATABASE_URL_APP is not a URL: {e}"))?;
    let kept: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(key, _)| key != "channel_binding")
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    parsed.query_pairs_mut().clear().extend_pairs(kept);
    let cleaned = parsed.as_str().trim_end_matches('?').to_string();

    PgConnectOptions::from_str(&cleaned)
        .map(|options| {
            // Unnamed statements only, so the pooled (PgBouncer) endpoint works as well as
            // the direct one: a cached statement belongs to a backend the pooler may not hand
            // out again.
            options.statement_cache_capacity(0)
        })
        .map_err(|e| format!("DATABASE_URL_APP could not be read: {e}"))
}

/// The pool, or `None` for a build without a board. Built lazily on first use, inside the
/// async runtime the commands run on.
pub fn pool() -> Option<&'static PgPool> {
    static POOL: OnceLock<Option<PgPool>> = OnceLock::new();
    POOL.get_or_init(|| {
        let cfg = config()?;
        match connect_options(cfg.database_url) {
            Ok(options) => Some(
                PgPoolOptions::new()
                    // One person doing one thing at a time; an upload is one transaction.
                    .max_connections(4)
                    // A window that cannot reach its board should say so, not hang.
                    .acquire_timeout(Duration::from_secs(15))
                    // Neon suspends idle computes; a connection held across that is dead.
                    .idle_timeout(Duration::from_secs(240))
                    .connect_lazy_with(options),
            ),
            Err(error) => {
                eprintln!("{error}");
                None
            }
        }
    })
    .as_ref()
}

pub const NOT_SET_UP: &str = "Not set up — this build has no board.";

pub fn require() -> Result<&'static PgPool, String> {
    pool().ok_or_else(|| NOT_SET_UP.to_string())
}

/// Postgres' `unique_violation`.
pub fn is_unique_violation(error: &sqlx::Error) -> bool {
    error.as_database_error().and_then(|e| e.code()).as_deref() == Some("23505")
}

pub fn message(error: sqlx::Error) -> String {
    match error {
        sqlx::Error::PoolTimedOut => "Could not reach the database (timed out).".into(),
        other => other.to_string(),
    }
}
