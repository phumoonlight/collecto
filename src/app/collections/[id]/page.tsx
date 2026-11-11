import type { Metadata } from 'next'
import { CollectionPage, collectionMetadata } from '@/components/collection-listing'

export async function generateMetadata({ params }: PageProps<'/collections/[id]'>): Promise<Metadata> {
  return collectionMetadata((await params).id)
}

/** One collection's images, newest first. */
export default async function Page({ params }: PageProps<'/collections/[id]'>) {
  return <CollectionPage id={(await params).id} />
}
