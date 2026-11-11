//! The app's one connection to the board: `collecto_app`, from the connection this machine was
//! set up with (`setup.rs`).

use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};

use crate::config::{config, AppConfig};

/// Neon's connection strings carry `channel_binding=require`, which sqlx does not know; the
/// rest (`sslmode=require` above all) it reads.
fn connect_options(url: &str) -> Result<PgConnectOptions, String> {
    let mut parsed = url::Url::parse(url).map_err(|e| format!("The database address is not a URL: {e}"))?;
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
        .map_err(|e| format!("The database address could not be read: {e}"))
}

fn build(url: &str) -> Result<PgPool, String> {
    Ok(PgPoolOptions::new()
        // One person doing one thing at a time; an upload is one transaction.
        .max_connections(4)
        // A window that cannot reach its board should say so, not hang.
        .acquire_timeout(Duration::from_secs(15))
        // Neon suspends idle computes; a connection held across that is dead.
        .idle_timeout(Duration::from_secs(240))
        .connect_lazy_with(connect_options(url)?))
}

/// The pool and the connection it was built from. A new connection (Settings → Change
/// connection) is a different `Arc`, so the next call builds a fresh pool for it.
static POOL: Mutex<Option<(Arc<AppConfig>, PgPool)>> = Mutex::new(None);

/// The pool, or `None` until this machine is set up. Built lazily, inside the async runtime
/// the commands run on; a `PgPool` is a handle, so the clone is cheap.
pub fn pool() -> Option<PgPool> {
    let cfg = config()?;
    let mut held = POOL.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((built_for, pool)) = held.as_ref() {
        if Arc::ptr_eq(built_for, &cfg) {
            return Some(pool.clone());
        }
    }
    match build(&cfg.database_url) {
        Ok(pool) => {
            *held = Some((cfg, pool.clone()));
            Some(pool)
        }
        Err(error) => {
            eprintln!("{error}");
            None
        }
    }
}

/// Opens one connection and asks the board something, before a new connection is saved —
/// a code that opens but points nowhere is refused while the person is still at the form.
pub async fn check(config: &AppConfig) -> Result<(), String> {
    let pool = build(&config.database_url)?;
    let result = sqlx::query("select 1 from collections limit 1").execute(&pool).await;
    pool.close().await;
    result.map(|_| ()).map_err(|e| match e {
        sqlx::Error::PoolTimedOut => "Could not reach the database (timed out).".to_string(),
        other => format!("Could not use the database: {other}"),
    })
}

pub const NOT_SET_UP: &str = "Not set up — enter a setup code in Settings.";

pub fn require() -> Result<PgPool, String> {
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
