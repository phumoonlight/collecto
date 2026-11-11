import { incrementCollectionPostView } from '@/lib/data/collections'
import { isSameOrigin } from '@/lib/misc'

/**
 * Adds one view to an image — the website's only write: one column, one grant, one
 * statement. A POST, so nothing that prefetches or crawls a GET can count one.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/posts/[id]/view'>) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 })
  const postId = Number((await ctx.params).id)
  if (!Number.isInteger(postId) || postId < 1) return new Response(null, { status: 400 })
  await incrementCollectionPostView(postId)
  return new Response(null, { status: 204 })
}
