import type { Metadata } from 'next'
import { CollectionDetail, collectionPostMetadata } from '@/components/collection-detail'

export async function generateMetadata({
  params,
}: PageProps<'/collections/[id]/[postId]'>): Promise<Metadata> {
  return collectionPostMetadata((await params).postId)
}

/**
 * One image from a collection. `[id]` is its shelf, in the URL because that is the context it
 * is read in — but `collection_id` on the row is the authority, so a mismatched pair in a
 * hand-typed URL resolves to the image's real shelf.
 */
export default async function Page({ params }: PageProps<'/collections/[id]/[postId]'>) {
  return <CollectionDetail id={(await params).postId} />
}
