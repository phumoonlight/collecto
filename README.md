# collecto

Hand-kept collections of images: a website that displays them, and a desktop app that
manages them.

| | | |
|---|---|---|
| `src/` | **the website** | Next.js 16 on Vercel. The newest images, the collection list, one collection, one image. Display only — it reads, and counts views |
| `packages/app` | **the app** | Tauri 2: a Rust backend with a React window. Names and edits collections, uploads (with lossless compression), moves and deletes images; caches what it reads; logs what it writes |
| `packages/common` | what both compile | The row types, the website's addresses, the bucket's paths — reached as `@common/*` |
| `db/` | the schema | Two tables on Neon, applied by `scripts/migrate.mjs` |

It is [booru](../booru) with everything but the shelves taken out — no ratings, no AI/R-18
filter, no tags, no artists, no maintenance switch — and an app rewritten in Rust.

## How it fits together

- **One Neon database**, its own project. The website connects as `collecto_web`, which may
  read and update one column (`view_count`); the app as `collecto_app`, which may write every
  row but owns nothing. See [db/README.md](db/README.md).
- **One R2 bucket**, public-read through a custom domain: `collections/posts/<md5>.<ext>`
  and `collections/thumbs/<md5>.<ext>`. Only the app holds a key.
- **Collections are addressed by `ref_id`** — an optional, editable slug set in the app —
  falling back to their cuid2 id: `/collections/<ref_id or id>`.
- **The website is read-only.** Every change to the board is made in the app, with the
  database login and bucket key compiled into its build.

## Images: lossless, in their own format

Nothing is converted to AVIF or anything else — an image is stored with the extension it was
uploaded with, compressed **losslessly**:

| format | what the app does |
|---|---|
| JPEG | rewrites the entropy coding — optimized Huffman tables, progressive scans (mozjpeg, like `jpegtran -optimize -progressive`). The DCT coefficients are untouched |
| PNG | [oxipng](https://github.com/shssoichiro/oxipng): filter search, re-deflate (optionally Zopfli), lossless bit-depth and palette reductions |
| WebP | a lossless WebP is re-encoded at libwebp's maximum effort; a lossy or animated one is stored as uploaded |
| GIF | stored as uploaded |

Every rewrite is decoded and **compared with the original pixel for pixel**; it is kept only
if the pixels match and the file is smaller, so the worst case is the file you uploaded. JPEG
EXIF is kept only when it carries an orientation; ICC profiles are always kept.

The thumbnail is the one lossy step: 360px tall (width capped at 720), in the image's own
format. Limits are 50MB and 100MP per file.

## Setup

```
npm install
cp .env.example .env           # fill in the Neon and R2 values (.env.local overrides, if present)
npm run db:push                # create the tables and apply the grants
```

## Website

```
npm run dev        # http://localhost:3000
npm run build
```

Deploy to Vercel with `DATABASE_URL` (the pooled `collecto_web` URL), `NEXT_PUBLIC_CDN_URL`,
`NEXT_PUBLIC_SITE_URL` and optionally `NEXT_PUBLIC_SITE_NAME`. Nothing else — the website
holds no bucket key and no writing login.

## App

Needs the Rust toolchain (stable, MSVC on Windows) and WebView2, which Windows 11 has.

```
npm run app:dev      # the window, with hot reload
npm run app:build    # an NSIS installer under packages/app/src-tauri/target/release/bundle/
npm run app:test     # the Rust tests: compression, signing, names
```

Both compile in seven values from `.env` — `DATABASE_URL_APP`, `NEXT_PUBLIC_CDN_URL`,
`NEXT_PUBLIC_SITE_URL` and the four `R2_*` (see `src-tauri/build.rs`). A debug build without
them opens and says it is not set up; a release build refuses to compile. **Anyone with the
installer can write to the board** — treat it like the key it contains.

| | |
|---|---|
| `src-tauri/src/compress.rs`, `jpeg.rs` | the lossless pass and the thumbnails |
| `src-tauri/src/collections.rs` | every write: create, edit, delete, upload, move, remove |
| `src-tauri/src/data.rs` | every SQL statement the app sends |
| `src-tauri/src/store.rs` | R2, over SigV4-signed HTTP |
| `src-tauri/src/cache.rs`, `image_cache.rs` | the collection list (a day, on disk), each screenful (the session), and every image drawn (by md5, never stale) |
| `src-tauri/src/activity.rs` | the log — `app-cache/logs.json`, live on the Logs screen; errors raise a notice |
| `src-tauri/src/protocol.rs` | `board-image://`, how the window draws images from the cache |
| `src/` | the React window: collections, logs, settings, about |

Preferences (encoder threads, PNG effort, Zopfli) are in `save.json` in the app's config
folder; the cache and log in `app-cache/` in its local data folder. A debug build keeps its own
copy of both.
