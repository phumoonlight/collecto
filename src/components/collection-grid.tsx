import Image from 'next/image'
import Link from 'next/link'
import type { CollectionPost } from '@common/collections'
import { ROW, itemStyle } from '@/components/image-rows'
import { collectionThumbUrl } from '@/lib/images'
import { collectionPostHref } from '@common/collections'
import { BLUR_DATA_URL } from '@/lib/misc'

/**
 * Collection images in justified rows (`image-rows.tsx`) — one shelf's, or the newest across
 * every shelf on `/posts`. Each card is addressed inside its own collection, read off the
 * row, so the grid does not care which of the two it is drawing.
 */
export function CollectionGrid({ posts }: { posts: CollectionPost[] }) {
  return (
    <ul className={ROW}>
      {posts.map((post) => (
        <li key={post.id} className="min-w-0" style={itemStyle(post.width, post.height)}>
          <Link
            href={collectionPostHref(post.collection_id, post.id)}
            // A new tab: this is a feed, and following an image in place throws away every
            // chunk loaded below the fold.
            target="_blank"
            rel="noopener"
            className="group block h-full overflow-hidden bg-surface"
          >
            {/* `unoptimized`: the stored thumbnail already is the compressed one. */}
            <Image
              src={collectionThumbUrl(post.file_name, post.file_ext)}
              alt=""
              width={post.width}
              height={post.height}
              unoptimized
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              className="h-full w-full object-contain transition-opacity group-hover:opacity-90"
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}
