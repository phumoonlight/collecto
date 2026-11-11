import type { NextRequest } from 'next/server'
import { COLLECTION_PAGE_SIZE, listLatestCollectionPosts } from '@/lib/data/collections'
import { LATEST_POSTS_LIMIT } from '@/lib/misc'

/**
 * The next chunk of `/posts`, older than `?after=`. `?loaded=` is how many the feed already
 * holds; the chunk is cut to what is left under `LATEST_POSTS_LIMIT`, so this stops answering
 * where the feed stops asking.
 */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams
  const after = Number(search.get('after'))
  const loaded = Number(search.get('loaded'))
  if (!Number.isInteger(after) || after <= 0) return Response.json({ posts: [], hasMore: false })
  if (!Number.isInteger(loaded) || loaded < 0) return Response.json({ posts: [], hasMore: false })

  const room = Math.min(COLLECTION_PAGE_SIZE, LATEST_POSTS_LIMIT - loaded)
  if (room <= 0) return Response.json({ posts: [], hasMore: true })
  return Response.json(await listLatestCollectionPosts({ after, perPage: room }))
}
