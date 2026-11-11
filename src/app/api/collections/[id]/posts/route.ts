import type { NextRequest } from 'next/server'
import { COLLECTION_PAGE_SIZE, listCollectionPosts } from '@/lib/data/collections'
import { CUID2_PATTERN } from '@common/collections'

const NONE = { posts: [], hasMore: false }

/** A shelf's next chunk by its cuid2 id, older than `?after=` — what `collection-feed.tsx`
 *  asks for. The id, not the address: a `ref_id` can change while a feed is open. */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/collections/[id]/posts'>) {
  const collectionId = (await ctx.params).id
  const after = Number(request.nextUrl.searchParams.get('after'))

  // Both name rows and arrive from the browser; nonsense is an empty chunk, not a guess.
  if (!CUID2_PATTERN.test(collectionId)) return Response.json(NONE)
  if (!Number.isInteger(after) || after <= 0) return Response.json(NONE)

  return Response.json(await listCollectionPosts(collectionId, { after, perPage: COLLECTION_PAGE_SIZE }))
}
