/**
 * Every value the website reads out of the environment, and the only file in `src/` that
 * touches `process.env`. No `server-only`: the name and the image host are drawn by client
 * components, and a `NEXT_PUBLIC_*` variable is inlined at build. The private value below is
 * only ever called from `lib/db.ts`, which *is* `server-only`.
 */

/** What the site is called — the wordmark, the tab title, every OpenGraph card. */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'Collecto'

export const SITE_DESCRIPTION =
  'Hand-kept collections of images — the newest ones, and every collection by name.'

/** Absolute origin for `metadataBase`, canonicals, the sitemap and robots. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}

/** Where images are served from — the bucket's public origin, without a trailing slash. */
export function cdnBase(): string {
  return (process.env.NEXT_PUBLIC_CDN_URL ?? '').replace(/\/+$/, '')
}

/** The board, as `collecto_web`. Read only by `lib/db.ts`. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL
}
