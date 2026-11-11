import { isDatabaseConfigured } from '@/lib/db'
import { countCollectionPosts } from '@/lib/data/collections'

// Reads nothing from the request, so without this the build would prerender one count.
export const dynamic = 'force-dynamic'

/** The landing page's image count, asked from the browser so the page itself stays static. */
export async function GET() {
  if (!isDatabaseConfigured()) return Response.json(null)
  try {
    return Response.json(await countCollectionPosts())
  } catch {
    return Response.json(null)
  }
}
