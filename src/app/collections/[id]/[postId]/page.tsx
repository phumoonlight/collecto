import type { Metadata } from 'next'
import { CollectionDetail, collectionPostMetadata } from '@/components/collection-detail'

export async function generateMetadata({
  params,
}: PageProps<'/collections/[id]/[postId]'>): Promise<Metadata> {
  return collectionPostMetadata((await params).postId)
}

/**
 * One image from a collection. `[id]` is its collection's address segment (`ref_id`, or the
 * cuid2 id) — the row is the authority, and a segment that is not the current address
 * redirects to the canonical URL.
 */
export default async function Page({ params }: PageProps<'/collections/[id]/[postId]'>) {
  const { id, postId } = await params
  return <CollectionDetail id={postId} slug={id} />
}
