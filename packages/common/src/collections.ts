/**
 * What a collection is, spelled once for both front ends — the rows as they arrive, the
 * addresses they take on the website, and the shelf list's search as a URL carries it.
 *
 * The website reads these rows from Postgres (`src/lib/data/collections.ts`); the app's
 * window receives the same shapes from its Rust side (`src-tauri/src/data.rs`). Nothing here
 * imports `next/*`, React or Node, so the app's Vite build compiles it as it is.
 */

/** One image on a shelf. */
export type CollectionPost = {
  id: number
  /** Its collection's cuid2 id. */
  collection_id: string
  /** The md5 of the uploaded bytes — names both stored objects. */
  file_name: string
  /** The uploaded format, kept: images are compressed losslessly, never converted. */
  file_ext: string
  /** Of the stored file, after lossless compression. */
  file_size: number
  /** Of the file as uploaded. */
  original_size: number
  width: number
  height: number
  /** It moves (GIF, APNG, animated WebP): stored with no thumbnail, drawn as the stored file. */
  animated: boolean
  source_url: string | null
  view_count: number
  /** ISO-8601, formatted by the query. */
  created_at: string
}

/** A shelf, as the list draws it: its name, how many images it holds, and its cover. */
export type Collection = {
  /** A cuid2, made by the app when the collection is named. Never changes. */
  id: string
  /** The collection's web address segment, when it has one — see `collectionSlug`. */
  ref_id: string | null
  name: string
  /** Drawn in front of the name, as typed — an emoji, `[WIP]`. */
  mark: string | null
  post_count: number
  /** The newest image's `file_name` — the cover is derived, never stored. Null when empty. */
  cover_file_name: string | null
  cover_file_ext: string | null
  cover_animated: boolean | null
  updated_at: string
}

export type CollectionPostPage = {
  posts: CollectionPost[]
  /** One row read past the screenful. Nothing counts. */
  hasMore: boolean
}

/** Where the shelf list lives on the website. The only place this path is spelled. */
export const COLLECTIONS_PATH = '/collections'

/** As long a name as a shelf card can draw without wrapping to three lines. */
export const COLLECTION_NAME_MAX = 64

/** The shelf list's search, as its URL carries it: `?q=` a piece of the name. */
export const COLLECTION_FILTER_PARAMS = { name: 'q' } as const

export type CollectionListFilter = { name?: string }

export function collectionsHref(filter: CollectionListFilter = {}): string {
  const name = filter.name?.trim()
  if (!name) return COLLECTIONS_PATH
  const params = new URLSearchParams({ [COLLECTION_FILTER_PARAMS.name]: name })
  return `${COLLECTIONS_PATH}?${params}`
}

/** The filter a page's `searchParams` carry. Loose: anything unreadable is dropped. */
export function readCollectionFilter(
  params: Record<string, string | string[] | undefined>
): CollectionListFilter {
  const raw = params[COLLECTION_FILTER_PARAMS.name]
  const name = (typeof raw === 'string' ? raw.trim() : '').slice(0, COLLECTION_NAME_MAX)
  return name ? { name } : {}
}

/**
 * What stands for a collection in its web address: its `ref_id` when it has one, its cuid2
 * id otherwise. The id always works as an address too; the website redirects it to the
 * `ref_id` form. The two can never collide — a `ref_id` may not have a cuid2's shape.
 */
export function collectionSlug(collection: { id: string; ref_id: string | null }): string {
  return collection.ref_id ?? collection.id
}

/** A cuid2 as the database checks it — what a URL segment is when it is an id. */
export const CUID2_PATTERN = /^[a-z][a-z0-9]{23}$/

/** `slug` is `collectionSlug(collection)`. */
export function collectionHref(slug: string): string {
  return `${COLLECTIONS_PATH}/${slug}`
}

/** One image, nested under its shelf: it has no existence outside it. */
export function collectionPostHref(slug: string, postId: number): string {
  return `${COLLECTIONS_PATH}/${slug}/${postId}`
}

/** A shelf's name with its mark in front, as every heading and card draws it. */
export function shelfTitle(collection: { name: string; mark: string | null }): string {
  return collection.mark ? `${collection.mark} ${collection.name}` : collection.name
}
