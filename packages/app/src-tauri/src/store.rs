//! The bucket: one Cloudflare R2 bucket, written to over its S3 API with two calls — put an
//! object, remove one — signed with AWS Signature V4 by hand.
//!
//! The website never writes here and holds no key; it reads images by URL off the public
//! origin. Only this app does, with the key compiled into it.

use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};

use crate::config::{config, R2Config};
use crate::time;

type HmacSha256 = Hmac<Sha256>;

const REGION: &str = "auto";
const SERVICE: &str = "s3";

fn hmac(key: &[u8], data: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC takes any key length");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// RFC 3986, keeping `/` — an object key is a path. Keys here are md5s and fixed prefixes,
/// so this only matters for a key nobody should be writing.
fn encode_key(key: &str) -> String {
    key.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => (b as char).to_string(),
            other => format!("%{other:02X}"),
        })
        .collect()
}

fn client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("an HTTP client")
    })
}

struct Signed {
    url: String,
    headers: Vec<(&'static str, String)>,
}

fn sign(r2: &R2Config, method: &str, key: &str, payload: &[u8]) -> Signed {
    let host = format!("{}.r2.cloudflarestorage.com", r2.account_id);
    let path = format!("/{}/{}", r2.bucket, encode_key(key));
    let now = time::now();
    let amz_date = now.amz();
    let date = now.date_stamp();
    let payload_hash = sha256_hex(payload);

    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical = format!(
        "{method}\n{path}\n\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n\n{signed_headers}\n{payload_hash}"
    );
    let scope = format!("{date}/{REGION}/{SERVICE}/aws4_request");
    let to_sign = format!("AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}", sha256_hex(canonical.as_bytes()));

    let k_date = hmac(format!("AWS4{}", r2.secret_access_key).as_bytes(), &date);
    let k_region = hmac(&k_date, REGION);
    let k_service = hmac(&k_region, SERVICE);
    let k_signing = hmac(&k_service, "aws4_request");
    let signature = hex::encode(hmac(&k_signing, &to_sign));

    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
        r2.access_key_id
    );
    Signed {
        url: format!("https://{host}{path}"),
        headers: vec![
            ("x-amz-content-sha256", payload_hash),
            ("x-amz-date", amz_date),
            ("authorization", authorization),
        ],
    }
}

async fn send(request: reqwest::RequestBuilder, what: &str) -> Result<(), String> {
    let response = request.send().await.map_err(|e| format!("{what}: {e}"))?;
    let status = response.status();
    if status.is_success() {
        return Ok(());
    }
    let body = response.text().await.unwrap_or_default();
    // R2 answers in S3's XML; the <Code> is the useful part.
    let code = body
        .split("<Code>")
        .nth(1)
        .and_then(|rest| rest.split("</Code>").next())
        .unwrap_or("");
    Err(format!("{what}: {status} {code}").trim().to_string())
}

/// Stores an object. A year, immutable: the name is the md5 of the bytes, so a URL that
/// resolves at all resolves to one image for ever, and Cloudflare's cache never asks twice.
pub async fn put(key: &str, bytes: Vec<u8>, content_type: &str) -> Result<(), String> {
    let r2 = &config().ok_or(crate::db::NOT_SET_UP)?.r2;
    let signed = sign(r2, "PUT", key, &bytes);
    let mut request = client()
        .put(&signed.url)
        .header("content-type", content_type)
        .header("cache-control", "public, max-age=31536000, immutable");
    for (name, value) in signed.headers {
        request = request.header(name, value);
    }
    send(request.body(bytes), "Upload to the bucket failed").await
}

pub async fn remove(key: &str) -> Result<(), String> {
    let r2 = &config().ok_or(crate::db::NOT_SET_UP)?.r2;
    let signed = sign(r2, "DELETE", key, b"");
    let mut request = client().delete(&signed.url);
    for (name, value) in signed.headers {
        request = request.header(name, value);
    }
    send(request, "Removing from the bucket failed").await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The signing-key derivation from AWS's SigV4 documentation.
    #[test]
    fn signing_key_matches_the_documented_example() {
        let k_date = hmac(b"AWS4wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215");
        let k_region = hmac(&k_date, "us-east-1");
        let k_service = hmac(&k_region, "iam");
        let k_signing = hmac(&k_service, "aws4_request");
        assert_eq!(
            hex::encode(k_signing),
            "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d"
        );
    }

    #[test]
    fn keys_keep_their_slashes() {
        assert_eq!(encode_key("collections/posts/ab12.jpg"), "collections/posts/ab12.jpg");
        assert_eq!(encode_key("a b"), "a%20b");
    }
}
