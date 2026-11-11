import type { NextRequest } from 'next/server'
import { COLLECTION_PAGE_SIZE, listCollectionPosts } from '@/lib/data/collections'

const NONE = { posts: [], hasMore: false }

/** A shelf's next chunk, older than `?after=` — what `collection-feed.tsx` asks for. */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/collections/[id]/posts'>) {
  const collectionId = Number((await ctx.params).id)
  const after = Number(request.nextUrl.searchParams.get('after'))

  // Both name rows and arrive from the browser; nonsense is an empty chunk, not a guess.
  if (!Number.isInteger(collectionId) || collectionId <= 0) return Response.json(NONE)
  if (!Number.isInteger(after) || after <= 0) return Response.json(NONE)

  return Response.json(await listCollectionPosts(collectionId, { after, perPage: COLLECTION_PAGE_SIZE }))
}
