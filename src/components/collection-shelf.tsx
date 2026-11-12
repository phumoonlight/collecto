import Image from 'next/image'
import Link from 'next/link'
import type { Collection } from '@common/collections'
import { NavProgress } from '@/components/nav-progress'
import { collectionThumbUrl } from '@/lib/images'
import { collectionHref, collectionSlug } from '@common/collections'
import { BLUR_DATA_URL } from '@/lib/misc'

/**
 * The shelf of shelves — every collection as a card with its name and its cover, the way a
 * photo app draws an album. Square, and the one place on this site a thumbnail is cropped:
 * here the picture is a label on a box, and even squares make the names read as one column.
 * Ordered by when the collection was last touched, which the query decides.
 */
export function CollectionShelf({
  collections,
  filtered = false,
}: {
  collections: Collection[]
  /** Whether a search narrowed the list, which is what an empty one then means. */
  filtered?: boolean
}) {
  if (collections.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
        {filtered ? 'No collections match.' : 'No collections yet.'}
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {collections.map((collection) => (
        <li key={collection.id}>
          <CollectionCard collection={collection} />
        </li>
      ))}
    </ul>
  )
}

function CollectionCard({ collection }: { collection: Collection }) {
  const cover = collection.cover_file_name
  const coverExt = collection.cover_file_ext

  return (
    <Link
      href={collectionHref(collectionSlug(collection))}
      className="group block overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-hover"
    >
      {/* The newest image on the shelf, derived rather than stored. Held to the top: most
          covers are portraits, and a square from the middle of one cuts off the face. */}
      <div className="grid aspect-square place-items-center overflow-hidden bg-background">
        {cover && coverExt ? (
          <Image
            src={collectionThumbUrl(cover, coverExt, collection.cover_animated ?? false)}
            alt=""
            width={360}
            height={360}
            unoptimized
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            className="h-full w-full object-cover object-top transition-opacity group-hover:opacity-90"
          />
        ) : (
          <span aria-hidden className="text-2xl opacity-40">
            🗂️
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-2 py-2">
        {/* Two lines at most, so the cards in a row stay one height. */}
        <span className="line-clamp-2 text-sm font-semibold">
          {collection.mark && <span className="mr-1">{collection.mark}</span>}
          {collection.name}
        </span>
        <span className="text-xs text-muted">
          {collection.post_count} image{collection.post_count === 1 ? '' : 's'}
        </span>
      </div>
      <NavProgress />
    </Link>
  )
}
