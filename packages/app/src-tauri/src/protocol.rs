//! `board-image://localhost/collection/<md5>.<ext>` — a shelf's image at full size, served
//! from the disk cache and fetched into it on a miss; with `?grid=<w>x<h>[-top]`, a copy cut
//! to a tile's box. (On Windows the webview spells it `http://board-image.localhost/…`.)
//!
//! Every image the window draws comes through here rather than as a `data:` URL across the
//! bridge, so the webview loads, decodes and drops them like any other image.

use tauri::http::{header, Request, Response, StatusCode};
use tauri::UriSchemeResponder;

use crate::compress::content_type;
use crate::image_cache::{self, GridBox};

pub const SCHEME: &str = "board-image";

fn not_found() -> Response<Vec<u8>> {
    Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap()
}

async fn respond(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = request.uri();
    let Some(file) = uri.path().trim_start_matches('/').strip_prefix("collection/") else {
        return not_found();
    };
    let Some((name, ext)) = file.rsplit_once('.') else { return not_found() };
    let grid = uri
        .query()
        .and_then(|query| query.split('&').find_map(|pair| pair.strip_prefix("grid=")))
        .and_then(GridBox::parse);

    let image = match grid {
        Some(size) => image_cache::grid(name, ext, size).await,
        None => image_cache::stored(name, ext).await.map(|bytes| (bytes, content_type(ext))),
    };
    match image {
        Some((bytes, kind)) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, kind)
            // The name is the md5 of the bytes, so the answer never changes.
            .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
            .body(bytes)
            .unwrap_or_else(|_| not_found()),
        None => not_found(),
    }
}

pub fn handle(request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    tauri::async_runtime::spawn(async move {
        responder.respond(respond(request).await);
    });
}
