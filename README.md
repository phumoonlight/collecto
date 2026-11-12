# collecto

Hand-kept collections of images: a website that displays them, and a desktop app that
manages them.

| | | |
|---|---|---|
| `src/` | **the website** | Next.js 16 on Vercel. The newest images, the collection list, one collection, one image. Display only — it reads, and counts views |
| `packages/app` | **the app** | Tauri 2: a Rust backend with a React window. Names and edits collections, uploads (with lossless compression), moves and deletes images; caches what it reads; logs what it writes |
| `packages/common` | what both compile | The row types, the website's addresses, the bucket's paths — reached as `@common/*` |
| `db/` | the schema | Two tables on Neon, applied by `scripts/migrate.mts` |

It is [booru](../booru) with everything but the shelves taken out — no ratings, no AI/R-18
filter, no tags, no artists, no maintenance switch — and an app rewritten in Rust.

## How it fits together

- **One Neon database**, its own project. The website connects as `collecto_web`, which may
  read and update one column (`view_count`); the app as `collecto_app`, which may write every
  row but owns nothing. See [db/README.md](db/README.md).
- **One R2 bucket**, public-read through a custom domain: `collections/posts/<md5>.<ext>`
  and `collections/thumbs/<md5>.<ext>`. Only the app holds a key.
- **Collections are addressed by `ref_id`** — made from the name when created
  (`My Sketches` → `my_sketches`, `_xxxxx` added if taken), editable later in the app — falling
  back to their cuid2 id: `/collections/<ref_id or id>`.
- **The website is read-only.** Every change to the board is made in the app, with the
  database login and bucket key from its setup code.

## Images: lossless, in their own format

Nothing is converted to AVIF or anything else — an image is stored with the extension it was
uploaded with, compressed **losslessly**:

| format | what the app does |
|---|---|
| JPEG | rewrites the entropy coding — optimized Huffman tables, progressive scans (mozjpeg, like `jpegtran -optimize -progressive`). The DCT coefficients are untouched |
| PNG | [oxipng](https://github.com/shssoichiro/oxipng): filter search, re-deflate (optionally Zopfli), lossless bit-depth and palette reductions; an interlaced PNG is stored de-interlaced |
| WebP | a lossless WebP is re-encoded at libwebp's maximum effort; a lossy or animated one is stored as uploaded |
| GIF | stored as uploaded |

Every rewrite is decoded and **compared with the original pixel for pixel**; it is kept only
if the pixels match and the file is smaller, so the worst case is the file you uploaded. JPEG
EXIF is kept only when it carries an orientation; ICC profiles are always kept.

The thumbnail is the one lossy step: 360px tall (width capped at 720), in the image's own
format; a JPEG thumbnail is encoded by mozjpeg (quality 85, trellis, progressive). An animated
image (a GIF with two or more frames, an APNG, an animated WebP) gets no thumbnail: the row's
`animated` flag makes the website and the app draw the stored file, moving, in every grid. Limits are 50MB and 100MP per file.

## Setup

```
npm install
cp .env.example .env           # fill in the Neon and R2 values
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
npm run app:build    # an NSIS installer, moved to release/ at the repo root
npm run app:test     # the Rust tests: compression, signing, names, setup code
npm run app:code     # the setup code for the app, from .env
```

**The app is built without any environment**, and the installer holds no credential. On first
start it asks for a **setup code** and its **passphrase**:

1. `npm run app:code` reads the seven app values from `.env` — `DATABASE_URL_APP`,
   `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_SITE_URL` and the four `R2_*` — asks for a passphrase
   (≥12 characters, or Enter to generate six words) and prints one line, `collecto2.…`: the
   values encrypted with AES-256-GCM under a scrypt key from the passphrase.
2. Paste the code and type the passphrase into the app. It checks the database answers, then
   keeps the values in Windows Credential Manager; that machine never asks again.

The same code and passphrase set up any PC, again after a Windows reinstall. Keep them apart —
the code alone is unreadable. A new code is only needed when a value inside changes; enter it
under Settings → Change connection. There is no passphrase reset: a forgotten one means
running `app:code` again.

| | |
|---|---|
| `src-tauri/src/compress.rs`, `jpeg.rs` | the lossless pass and the thumbnails |
| `src-tauri/src/collections.rs` | every write: create, edit, delete, upload, move, remove |
| `src-tauri/src/data.rs` | every SQL statement the app sends |
| `src-tauri/src/store.rs` | R2, over SigV4-signed HTTP |
| `src-tauri/src/cache.rs`, `image_cache.rs` | the collection list (a day, on disk), each screenful (the session), and every image drawn (by md5, never stale) |
| `src-tauri/src/activity.rs` | the log — `app/cache/logs.json`, live on the Logs screen; errors raise a notice |
| `src-tauri/src/protocol.rs` | `board-image://`, how the window draws images from the cache |
| `src/` | the React window: collections, logs, settings, about |

Everything the app keeps is in one folder, `%LOCALAPPDATA%\app.phumoonlight.collecto\`:
`app\save.json` (encoder threads, PNG effort, Zopfli) and `app\cache\` (images, grid copies, the
collection list, the log). Nothing goes to Roaming. A debug build uses a `dev\` subfolder of it.
