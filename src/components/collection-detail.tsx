import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { CollectionNav } from '@/components/collection-nav'
import { CollectionViewCounter } from '@/components/collection-view-counter'
import { PostImage } from '@/components/post-image'
import { SetupNotice } from '@/components/setup-notice'
import { isDatabaseConfigured } from '@/lib/db'
import { collectionNeighbours, getCollection, getCollectionPost } from '@/lib/data/collections'
import { collectionHref, collectionPostHref } from '@common/collections'
import { collectionImageUrl, collectionThumbUrl } from '@/lib/images'
import { formatBytes } from '@/lib/misc'
import { SITE_NAME } from '@/config'

/** One image from a collection: the picture, the walk through its shelf, and its facts. */

export async function collectionPostMetadata(id: string): Promise<Metadata> {
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId < 1) return { title: 'Not found' }
  if (!isDatabaseConfigured()) return { title: 'Collection image' }

  const post = await getCollectionPost(postId)
  if (!post) return { title: 'Not found', robots: { index: false, follow: false } }

  const canonical = collectionPostHref(post.collection_slug, post.id)
  const collection = await getCollection(post.collection_id)
  const title = collection ? `${collection.name} — #${post.id}` : `Collection image #${post.id}`
  const description = `${post.width}×${post.height}`

  return {
    title,
    description,
    alternates: { canonical },
    // The shelves are indexable; the images inside them are not — an unbounded run of pages
    // with no words on them is what a sitemap should not be made of.
    robots: { index: false, follow: true },
    openGraph: {
      type: 'article',
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      images: [{ url: collectionThumbUrl(post.file_name, post.file_ext), alt: title }],
    },
  }
}

/**
 * `slug` is the URL's collection segment. The row is the authority on which collection the
 * image is in; a segment that is not that collection's current address — its id while it has
 * a `ref_id`, an old address, another collection's — redirects to the canonical URL.
 */
export async function CollectionDetail({ id, slug }: { id: string; slug: string }) {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-4">
        <SetupNotice />
      </div>
    )
  }

  const postId = Number(id)
  if (!Number.isInteger(postId) || postId < 1) notFound()

  const post = await getCollectionPost(postId)
  if (!post) notFound()
  if (slug !== post.collection_slug) redirect(collectionPostHref(post.collection_slug, post.id))

  const [collection, { prevId, nextId }] = await Promise.all([
    getCollection(post.collection_id),
    collectionNeighbours({ id: post.id, collectionId: post.collection_id }),
  ])
  if (!collection) notFound()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <CollectionViewCounter postId={post.id} />

      {/* Sticky: the picture is most of a screen and the walk to the next image is what you
          came back up for. The way back is the collection. */}
      <header className="sticky top-0 z-10 -mx-3 flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur">
        <Link
          href={collectionHref(post.collection_slug)}
          className="min-w-0 truncate pr-1 text-lg font-bold tracking-tight hover:underline"
        >
          {collection.mark && <span className="mr-1.5">{collection.mark}</span>}
          {collection.name}
        </Link>
        <CollectionNav slug={post.collection_slug} prevId={prevId} nextId={nextId} />
      </header>

      <PostImage
        src={collectionImageUrl(post.file_name, post.file_ext)}
        alt=""
        width={post.width}
        height={post.height}
      />

      <section className="w-full max-w-sm">
        <h2 className="mb-2 text-sm font-semibold">Details</h2>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">ID</dt>
            <dd>#{post.id}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Size</dt>
            <dd>
              {post.width}×{post.height} · {formatBytes(post.file_size)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Type</dt>
            <dd className="uppercase">{post.file_ext}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Views</dt>
            <dd>{post.view_count.toLocaleString('en-US')}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Added</dt>
            <dd>
              <time dateTime={post.created_at}>
                {new Date(post.created_at).toISOString().slice(0, 10)}
              </time>
            </dd>
          </div>
          {post.source_url && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted">Source</dt>
              <dd className="min-w-0">
                {/* A link only to the web: the app refuses anything else, but a row edited by
                    hand could hold a `javascript:` URL, and this page is public. */}
                {/^https?:\/\//i.test(post.source_url) ? (
                  <a
                    href={post.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-accent hover:underline"
                  >
                    {post.source_url}
                  </a>
                ) : (
                  <span className="break-all">{post.source_url}</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  )
}
