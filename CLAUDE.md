# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hand-kept image collections: a **display-only website** and a **desktop manager app** sharing
one Neon Postgres database and one Cloudflare R2 bucket. Modelled on the sibling `../booru`
project, minus ratings, the AI/R-18 filter, tags, artists and the maintenance switch — and the
app is Tauri (Rust) instead of Electron.

| path | what |
|---|---|
| `src/` | Next.js 16 App Router website, deployed to Vercel. Reads only (plus a view counter) |
| `packages/app/` | Tauri 2 app: Rust backend in `src-tauri/src/`, React window in `src/` (Vite) |
| `packages/common/src/` | TS shared by both front ends via the `@common/*` tsconfig path — row types, website hrefs, bucket paths. No build step; must not import `next/*`, React or Node |
| `db/` | `migrations/` (numbered SQL, source of truth) and `grants.sql` (re-applied on every push) |

## Commands

All from the repo root unless noted. npm workspaces (`packages/*`).

```
npm run dev              # website, http://localhost:3000
npm run build            # website production build
npm run lint             # eslint (whole repo)
npm run typecheck        # website + packages/common
npx next typegen         # regenerate PageProps/RouteContext types before tsc on a fresh checkout

npm run app:dev          # Tauri window with hot reload (Vite on :1420)
npm run app:build        # release build + NSIS installer (fails without .env values)
npm run typecheck -w app # the app window's TS (separate tsconfig; excluded from root tsc)
npm run app:test         # all Rust tests

cargo test --manifest-path packages/app/src-tauri/Cargo.toml <name>   # one Rust test, e.g. jpeg_is_rewritten
cargo clippy --manifest-path packages/app/src-tauri/Cargo.toml

npm run db:push          # apply pending migrations (asks; --yes to skip) + re-apply grants
npm run db:list
```

There are no JS tests; the Rust tests cover compression, SigV4 signing, names/sources and time.

## Architecture

**Who may write.** Three Postgres roles, enforced by grants, not code: `neondb_owner`
(migration runner only), `collecto_app` (compiled into the app binary; read/write rows, no DDL),
`collecto_web` (Vercel; `select` plus `update (view_count)` only). Any mutation added to `src/`
other than the view counter belongs in the app instead — the database will refuse it.

**Config is compiled into the app.** `src-tauri/build.rs` reads `DATABASE_URL_APP`,
`NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_SITE_URL` and `R2_*` from env or the root `.env` (`.env.local` overrides) and
emits them as `COLLECTO_*` rustc env vars read by `config.rs`. Debug builds without them run
"not configured" (Settings screen forced open); release builds panic.

**Schema invariants** (`db/migrations/0001_baseline.sql`): `collection_posts.file_name` is the
md5 of the *uploaded* bytes and unique across the table (one image, one shelf);
`collection_id` has no `on delete cascade` (a non-empty collection can't be deleted);
`collections.updated_at` is touched by the app inside the same transaction as each change (no
triggers); the shelf cover is derived (newest post), never stored. Schema changes are always a
new numbered migration file.

**Bucket paths are derived, never stored:** `collections/posts/<md5>.<ext>` and
`collections/thumbs/<md5>.<ext>` — spelled in both `packages/common/src/storage.ts` (website)
and `src-tauri/src/paths.rs` (app). Keep them in step.

**Image pipeline (app only, `collections.rs::upload` → `compress.rs`, `jpeg.rs`).** Images keep
their original format (jpg/png/gif/webp; AVIF is not accepted). The stored image is a
*lossless* rewrite — mozjpeg coefficient transcode (libjpeg errors become Rust panics caught by
`catch_unwind`), oxipng, or max-effort lossless WebP — decoded and compared pixel-for-pixel with
the upload, kept only if identical and smaller; otherwise the upload is stored byte-for-byte.
GIF and lossy/animated WebP are stored as uploaded. Thumbnails (384px tall, ≤768 wide) are the
only lossy step, in the same format. Upload order: dedupe by md5 → encode (inside the rayon pool
from `prefs.rs`) → put image + thumb to R2 → insert row; on failure, objects are removed only if
no row now owns that md5 (`ours_to_remove`).

**App backend layout.** `commands.rs` is the entire IPC surface (args camelCase from JS →
snake_case). Writes go through `activity::logged`, which returns `{ok:true,…}|{ok:false,error}`
to the window and appends to `app-cache/logs.json`, emitting `activity:entry` (Logs screen +
error notices). Reads return `Result<_, String>` (the JS promise rejects). Every write calls
`cache::drop_collections()`. SQL lives only in `data.rs` (sqlx, runtime queries, no macros;
`statement_cache_capacity(0)` for pooler compatibility). R2 is hand-signed SigV4 over reqwest in
`store.rs`.

**Avoid aws-lc.** The AWS SDK and reqwest's default `rustls` feature pull in `aws-lc-sys`
(needs CMake/NASM on Windows). reqwest uses `rustls-no-provider` and `main.rs` installs the
`ring` provider; sqlx uses `tls-rustls` (ring). Check `cargo tree -i aws-lc-sys` is empty after
dependency changes.

**Caching (app).** Collection list: `app-cache/collections.json`, trusted for a day, 🔄 forces.
Post pages: in memory per session. Images: `app-cache/images/<md5>.<ext>` fetched from the public
CDN and never stale; grid tiles: `app-cache/grid/<md5>.<w>x<h>[-top].webp`, cut to the tile's
device-pixel box. The window loads images only through the `board-image` custom protocol
(`protocol.rs`; on Windows the URL is `http://board-image.localhost/collection/<md5>.<ext>?grid=…`,
see `packages/app/src/image-url.ts`). Debug builds use separate `dev/` data folders.

**Window UI** (`packages/app/src/`) is ported from booru's Electron renderer: `api.ts` wraps every
`invoke`; file drops come from Tauri's `onDragDropEvent` (real paths), and web images are added by
pasting links (`fetch_images`). Shared styling constants are in `components/buttons.ts` and
`panel.tsx`.

**Website data access.** Pages and route handlers call `src/lib/data/collections.ts` only —
never query from a component. postgres.js v4 sends parameters untyped, so cast where the query
doesn't fix a type (`${x}::int`). `src/config.ts` is the only reader of `process.env`. Images are
`unoptimized` (served straight from the CDN). `/posts` is `force-dynamic` so it isn't prerendered
with build-time data. Source URLs render as links only when `http(s)`.

## Conventions

- Prettier: no semicolons, single quotes, 100 cols, trailing commas es5.
- TypeScript is pinned below 6.1 because `typescript-eslint` doesn't support newer; Tauri stays
  on 2.x (3 is alpha). `minimatch` is overridden to 11 in root `package.json` for the audit.
- Comments explain *why* (the style inherited from booru); keep that when editing.
