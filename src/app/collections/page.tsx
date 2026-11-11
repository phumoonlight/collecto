import type { Metadata } from 'next'
import { CollectionListing } from '@/components/collection-listing'
import { collectionsHref, readCollectionFilter } from '@common/collections'
import { SITE_NAME } from '@/config'

const DESCRIPTION = 'Every collection — find one by name.'

export async function generateMetadata({
  searchParams,
}: PageProps<'/collections'>): Promise<Metadata> {
  const filter = readCollectionFilter(await searchParams)
  // A search of the shelf list is one visitor's slice of a page that is indexed whole.
  const filtered = Boolean(filter.name)

  return {
    title: filter.name ? `Collections: ${filter.name}` : 'Collections',
    description: DESCRIPTION,
    alternates: { canonical: collectionsHref() },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: collectionsHref(),
      title: 'Collections',
      description: DESCRIPTION,
    },
  }
}

export default async function CollectionsPage({ searchParams }: PageProps<'/collections'>) {
  return <CollectionListing filter={readCollectionFilter(await searchParams)} />
}
