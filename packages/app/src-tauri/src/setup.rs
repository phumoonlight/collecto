//! The setup code: how the board's values reach this machine, and where they are kept.
//!
//! `npm run app:code` (`scripts/setup-code.mts`) encrypts the seven values with a passphrase:
//!
//!   collecto2.<salt>.<nonce>.<ciphertext+tag>      (each part base64url, no padding)
//!
//! The key is scrypt(passphrase, salt; N = 2^17, r = 8, p = 1) → 32 bytes, and the values are
//! JSON sealed with AES-256-GCM, the prefix authenticated alongside — so a wrong passphrase and
//! a damaged code are both refused, never half-read. The two sides must agree on every
//! constant here; `tests::decodes_the_node_test_vector` holds them to it.
//!
//! Once opened, the values are kept in the OS credential store (Windows Credential Manager),
//! not in a file, so later starts ask for nothing.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::Aes256Gcm;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use unicode_normalization::UnicodeNormalization;

use crate::config::AppConfig;

const PREFIX: &str = "collecto2";
const SCRYPT_LOG_N: u8 = 17;
const SCRYPT_R: u32 = 8;
const SCRYPT_P: u32 = 1;

pub const NOT_A_CODE: &str = "That is not a Collecto setup code — it starts with collecto2.";
pub const WRONG_PASSPHRASE: &str = "Wrong passphrase, or the code was not copied whole.";

/// Trimmed and NFC-normalized, so the same characters typed differently give the same key.
fn normalize(passphrase: &str) -> String {
    passphrase.trim().nfc().collect()
}

fn part(value: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD.decode(value).map_err(|_| NOT_A_CODE.to_string())
}

/// Opens a setup code. Slow on purpose — scrypt is most of a second — so call it off the async
/// runtime.
pub fn decode(code: &str, passphrase: &str) -> Result<AppConfig, String> {
    let parts: Vec<&str> = code.trim().split('.').collect();
    let [prefix, salt, nonce, sealed] = parts.as_slice() else {
        return Err(NOT_A_CODE.into());
    };
    if *prefix != PREFIX {
        return Err(NOT_A_CODE.into());
    }
    let (salt, nonce, sealed) = (part(salt)?, part(nonce)?, part(sealed)?);
    if salt.len() != 16 || nonce.len() != 12 || sealed.len() <= 16 {
        return Err(NOT_A_CODE.into());
    }

    let params = scrypt::Params::new(SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P).map_err(|e| e.to_string())?;
    let mut key = [0u8; 32];
    scrypt::scrypt(normalize(passphrase).as_bytes(), &salt, &params, &mut key).map_err(|e| e.to_string())?;

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = nonce.as_slice().try_into().map_err(|_| NOT_A_CODE.to_string())?;
    let plain = cipher
        .decrypt(nonce, Payload { msg: &sealed, aad: PREFIX.as_bytes() })
        .map_err(|_| WRONG_PASSPHRASE.to_string())?;

    let config: AppConfig =
        serde_json::from_slice(&plain).map_err(|_| "The code opened, but its contents are not a connection.".to_string())?;
    check(&config)?;
    Ok(config)
}

/// The values make sense before anything is saved — a URL that is a URL, nothing blank.
fn check(config: &AppConfig) -> Result<(), String> {
    let web = |value: &str| {
        url::Url::parse(value).is_ok_and(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some())
    };
    let database = url::Url::parse(&config.database_url)
        .is_ok_and(|u| matches!(u.scheme(), "postgres" | "postgresql") && u.host_str().is_some());
    let r2 = &config.r2;
    if !database {
        return Err("The code's database address is not a postgres:// URL.".into());
    }
    if !web(&config.cdn_url) || !web(&config.site_url) {
        return Err("The code's image or site address is not an http(s) URL.".into());
    }
    if [&r2.account_id, &r2.access_key_id, &r2.secret_access_key, &r2.bucket].iter().any(|v| v.trim().is_empty()) {
        return Err("The code is missing a bucket value.".into());
    }
    Ok(())
}

/// One credential per build flavour, so a debug build never reads or replaces the board the
/// installed copy uses.
fn entry() -> Result<keyring::Entry, String> {
    let service = if cfg!(debug_assertions) { "app.phumoonlight.collecto.dev" } else { "app.phumoonlight.collecto" };
    keyring::Entry::new(service, "connection").map_err(|e| e.to_string())
}

/// The connection saved on this machine, if any. A credential that will not parse counts as
/// none — the window asks for a code again rather than failing.
pub fn load() -> Option<AppConfig> {
    let json = entry().ok()?.get_password().ok()?;
    serde_json::from_str(&json).ok()
}

pub fn save(config: &AppConfig) -> Result<(), String> {
    let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    entry()?.set_password(&json).map_err(|e| format!("Could not save to the credential store: {e}"))
}

pub fn forget() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Made by `scripts/setup-code.mts` with fake values, a fixed salt (16 × 0x07) and nonce
    /// (12 × 0x09), and the passphrase "  blue tiger sings at noon " — so this test fails if
    /// the two sides ever stop agreeing on the format.
    const VECTOR: &str = "collecto2.BwcHBwcHBwcHBwcHBwcHBw.CQkJCQkJCQkJCQkJ.LmdOp-4NA0qZocbgkMfysOS0TBhE-jAP7WA_GRas8WfnrLfllQHJxUIIvWs_KA5gkbx3jxUfoq-aVoDbT3BB7MtkkrDmoRJh1qbXgKFCNPG_492_4A22nKC83b0YMB87J4_oFxeLUVoaDwipIcxlXAw1EqIkoxQgYk5htYA0JfKGcSv-j3oLMFzAWDSA7Dx70LgDbASBWvnMUvt926ReQfuehusUXvKWKxH7tjqD37N63J1HnkT5n3tbCsU8Yv6IHbem1WTk8OCvb_JZykCFkRL9cFI3QAYoNf0pxoHAtHAyZADxmZA9xRDHrA";

    #[test]
    fn decodes_the_node_test_vector() {
        let config = decode(VECTOR, "blue tiger sings at noon").unwrap();
        assert_eq!(config.database_url, "postgresql://collecto_app:pw@ep-test.neon.tech/app?sslmode=require");
        assert_eq!(config.cdn_url, "https://img.example.com");
        assert_eq!(config.site_url, "https://collecto.example.com");
        assert_eq!(config.r2.bucket, "collecto");
        assert_eq!(config.r2.secret_access_key, "secret");
    }

    #[test]
    fn refuses_a_wrong_passphrase_or_a_broken_code() {
        assert_eq!(decode(VECTOR, "blue tiger sings at night").err().as_deref(), Some(WRONG_PASSPHRASE));
        assert_eq!(decode(&VECTOR[..VECTOR.len() - 10], "blue tiger sings at noon").err().as_deref(), Some(WRONG_PASSPHRASE));
        assert_eq!(decode("collecto1.abc", "x").err().as_deref(), Some(NOT_A_CODE));
        assert_eq!(decode("hello", "x").err().as_deref(), Some(NOT_A_CODE));
    }
}
