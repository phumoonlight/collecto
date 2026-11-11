import { cache } from 'react'
import type { Sql } from 'postgres'
import { db } from '@/lib/db'
import type {
  Collection,
  CollectionListFilter,
  CollectionPost,
} from '@common/collections'

/**
 * Every read the website makes, and its one write — the view counter. Never query the
 * database from a page or component: pages call these, and the route handlers under
 * `app/api/` call these, so this file is the whole query surface.
 *
 * The writes that build the board are the app's (`packages/app/src-tauri/src/data.rs`).
 *
 * **A collection is addressed by its slug** — `ref_id` when set, its cuid2 id otherwise
 * (`collectionSlug`). Post rows read here carry their collection's slug, so a grid can link
 * an image at its collection's current address without a second read.
 */

export type { Collection, CollectionPost } from '@common/collections'

/** An image as the website reads it: the row, plus its collection's address segment. */
export type WebPost = CollectionPost & { collection_slug: string }

export type WebPostPage = { posts: WebPost[]; hasMore: boolean }

/** The opening screenful of a shelf, and what each later chunk adds. */
export const COLLECTION_PAGE_SIZE = 24

/** Expects `collection_posts p` joined to `collections c`. */
const postColumns = (sql: Sql) => sql`
  p.id, p.collection_id, p.file_name, p.file_ext, p.file_size, p.original_size,
  p.width, p.height, p.source_url, p.view_count,
  to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
  coalesce(c.ref_id, c.id) as collection_slug`

const shelfColumns = (sql: Sql) => sql`
  c.id, c.ref_id, c.name, c.mark,
  count(p.id)::int as post_count,
  (array_agg(p.file_name order by p.id desc))[1] as cover_file_name,
  (array_agg(p.file_ext  order by p.id desc))[1] as cover_file_ext,
  to_char(c.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at`

/** `%` and `_` are wildcards to `ilike`, and a shelf called `100%` should find itself. */
function containing(needle: string): string {
  return `%${needle.replace(/[\\%_]/g, '\\$&')}%`
}

/**
 * Every shelf with something on it, most recently touched first, narrowed by a piece of the
 * name. An empty shelf would be a card with no picture and a count of zero — an invitation
 * to click on nothing — so it is left out here, where the app lists it.
 */
async function readCollections(filter: CollectionListFilter): Promise<Collection[]> {
  const sql = db()
  const name = filter.name?.trim() ? containing(filter.name.trim()) : null
  return await sql<Collection[]>`
    select ${shelfColumns(sql)}
      from collections c
      join collection_posts p on p.collection_id = c.id
     where (${name}::text is null or c.name ilike ${name}::text)
     group by c.id
     order by c.updated_at desc, c.id desc`
}

export const listCollections = cache(
  async (filter: CollectionListFilter = {}): Promise<Collection[]> => readCollections(filter)
)

/**
 * One shelf by its address segment — a `ref_id` or a cuid2 id, which can never be the same
 * string — with the count and cover the list draws. Cached: the page and its metadata both
 * want it.
 */
export const getCollection = cache(async (slug: string): Promise<Collection | null> => {
  const sql = db()
  const [row] = await sql<Collection[]>`
    select ${shelfColumns(sql)}
      from collections c
      left join collection_posts p on p.collection_id = c.id
     where c.ref_id = ${slug}::text or c.id = ${slug}::text
     group by c.id
     limit 1`
  return row ?? null
})

/**
 * A shelf's images, newest first, by the collection's cuid2 id. `after` is the feed's cursor —
 * strictly older than that id, never an offset, so an image added mid-scroll does not slide
 * the rows below it.
 */
export async function listCollectionPosts(
  collectionId: string,
  { after, perPage = COLLECTION_PAGE_SIZE }: { after?: number; perPage?: number } = {}
): Promise<WebPostPage> {
  const sql = db()
  try {
    const rows = await sql<WebPost[]>`
      select ${postColumns(sql)}
        from collection_posts p
        join collections c on c.id = p.collection_id
       where p.collection_id = ${collectionId}::text
         and (${after ?? null}::int is null or p.id < ${after ?? null}::int)
       order by p.id desc
       limit ${perPage + 1}`
    return { posts: rows.slice(0, perPage), hasMore: rows.length > perPage }
  } catch (error) {
    // The grid draws empty rather than throwing, so the reason has to end up somewhere.
    console.error('listCollectionPosts failed:', error)
    return { posts: [], hasMore: false }
  }
}

/** The newest images across every shelf — `/posts`. Walks the primary key backwards. */
export async function listLatestCollectionPosts({
  after,
  perPage = COLLECTION_PAGE_SIZE,
}: { after?: number; perPage?: number } = {}): Promise<WebPostPage> {
  const sql = db()
  try {
    const rows = await sql<WebPost[]>`
      select ${postColumns(sql)}
        from collection_posts p
        join collections c on c.id = p.collection_id
       where (${after ?? null}::int is null or p.id < ${after ?? null}::int)
       order by p.id desc
       limit ${perPage + 1}`
    return { posts: rows.slice(0, perPage), hasMore: rows.length > perPage }
  } catch (error) {
    console.error('listLatestCollectionPosts failed:', error)
    return { posts: [], hasMore: false }
  }
}

/** How many images the board holds, for the landing page. */
export async function countCollectionPosts(): Promise<number> {
  const sql = db()
  const [row] = await sql<{ count: number }[]>`select count(*)::int as count from collection_posts`
  return row?.count ?? 0
}

export const getCollectionPost = cache(async (id: number): Promise<WebPost | null> => {
  const sql = db()
  const [row] = await sql<WebPost[]>`
    select ${postColumns(sql)}
      from collection_posts p
      join collections c on c.id = p.collection_id
     where p.id = ${id}::int`
  return row ?? null
})

/** The images either side of one, within its own shelf — what prev/next walks. */
export async function collectionNeighbours({
  id,
  collectionId,
}: {
  id: number
  collectionId: string
}): Promise<{ prevId: number | null; nextId: number | null }> {
  const sql = db()
  try {
    const [row] = await sql<{ prev_id: number | null; next_id: number | null }[]>`
      select
        (select p.id from collection_posts p
          where p.collection_id = ${collectionId}::text and p.id > ${id}::int
          order by p.id asc limit 1) as prev_id,
        (select p.id from collection_posts p
          where p.collection_id = ${collectionId}::text and p.id < ${id}::int
          order by p.id desc limit 1) as next_id`
    return { prevId: row?.prev_id ?? null, nextId: row?.next_id ?? null }
  } catch (error) {
    console.error('collectionNeighbours failed:', error)
    return { prevId: null, nextId: null }
  }
}

/**
 * The shelves for `sitemap.xml`. The one read that swallows its failure: the sitemap is one
 * document, and a section that cannot be read must cost that section, not the whole file —
 * nor a deployment, since the build may prerender it.
 */
export async function getSitemapCollections(): Promise<Collection[]> {
  try {
    return await readCollections({})
  } catch (error) {
    console.error(
      'Could not list collections for the sitemap:',
      error instanceof Error ? error.message : error
    )
    return []
  }
}

/**
 * Adds one view to an image — the website's only write. `collecto_web` holds
 * `update (view_count)` and no other write grant anywhere, so a stray update to any other
 * column is refused by the database.
 */
export async function incrementCollectionPostView(postId: number): Promise<void> {
  const sql = db()
  await sql`update collection_posts set view_count = view_count + 1 where id = ${postId}::int`
}
