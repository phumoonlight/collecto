import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionFeed } from '@/components/collection-feed'
import { CollectionSearch } from '@/components/collection-search'
import { CollectionShelf } from '@/components/collection-shelf'
import { NavProgress } from '@/components/nav-progress'
import { SetupNotice } from '@/components/setup-notice'
import { SiteHeader } from '@/components/site-header'
import { isDatabaseConfigured } from '@/lib/db'
import {
  COLLECTION_PAGE_SIZE,
  getCollection,
  listCollectionPosts,
  listCollections,
} from '@/lib/data/collections'
import { collectionHref, collectionsHref, type CollectionListFilter } from '@common/collections'
import { collectionThumbUrl } from '@/lib/images'
import { SITE_NAME } from '@/config'

/** The two pages a collection has, and the shape they share: the header, a heading, a grid. */

function Unconfigured() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4">
      <SiteHeader current="collections" />
      <div className="pt-4">
        <SetupNotice />
      </div>
    </div>
  )
}

/** The shelf list — `/collections`, narrowed by its search. */
export async function CollectionListing({ filter }: { filter: CollectionListFilter }) {
  if (!isDatabaseConfigured()) return <Unconfigured />

  const collections = await listCollections(filter)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SiteHeader current="collections" />
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold tracking-tight">🗂️ Collections</h1>
        <span className="text-xs text-muted">
          {collections.length} collection{collections.length === 1 ? '' : 's'}
        </span>
      </div>
      <CollectionSearch filter={filter} />
      <CollectionShelf collections={collections} filtered={Boolean(filter.name)} />
    </div>
  )
}

/** One collection — `/collections/[id]`. */
export async function CollectionPage({ id }: { id: string }) {
  if (!isDatabaseConfigured()) return <Unconfigured />

  const collectionId = Number(id)
  if (!Number.isInteger(collectionId) || collectionId < 1) notFound()

  const collection = await getCollection(collectionId)
  if (!collection) notFound()

  const { posts, hasMore } = await listCollectionPosts(collectionId, {
    perPage: COLLECTION_PAGE_SIZE,
  })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SiteHeader current="collections" />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* The way back is the heading's sibling: there is one place up from here. */}
        <Link
          href={collectionsHref()}
          className="text-sm text-muted hover:text-foreground hover:underline"
        >
          🗂️ Collections
          <NavProgress />
        </Link>
        <h1 className="text-lg font-bold tracking-tight">
          {collection.mark && <span className="mr-1.5">{collection.mark}</span>}
          {collection.name}
        </h1>
        <span className="text-xs text-muted">
          {collection.post_count} image{collection.post_count === 1 ? '' : 's'}
        </span>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Nothing in this collection.
        </p>
      ) : (
        <CollectionFeed collectionId={collectionId} initialPosts={posts} hasMore={hasMore} />
      )}
    </div>
  )
}

/** A collection's metadata: a fixed listing with a name, worth indexing. */
export async function collectionMetadata(id: string): Promise<Metadata> {
  const collectionId = Number(id)
  if (!Number.isInteger(collectionId) || collectionId < 1) return { title: 'Collection not found' }
  if (!isDatabaseConfigured()) return { title: 'Collection' }

  const collection = await getCollection(collectionId)
  if (!collection) {
    return { title: 'Collection not found', robots: { index: false, follow: false } }
  }

  const description = `${collection.post_count} image${
    collection.post_count === 1 ? '' : 's'
  } in ${collection.name}.`
  const cover =
    collection.cover_file_name && collection.cover_file_ext
      ? [{ url: collectionThumbUrl(collection.cover_file_name, collection.cover_file_ext) }]
      : undefined

  return {
    title: collection.name,
    description,
    alternates: { canonical: collectionHref(collection.id) },
    // An empty shelf is not on the list, so it is not a page to be found either.
    robots: collection.post_count === 0 ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: collectionHref(collection.id),
      title: collection.name,
      description,
      images: cover,
    },
  }
}
