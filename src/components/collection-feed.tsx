'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { WebPost } from '@/lib/data/collections'
import { CollectionGrid } from '@/components/collection-grid'
import { loadMoreCollectionPosts } from '@/lib/api/collections'

/** Less than a row, so a landing chunk does not chain-fire the next request. */
const PREFETCH_MARGIN = '100px'

/**
 * A collection as one continuous feed: the server renders the newest screenful and this
 * appends older ones on the way down. A shelf scrolls where `/posts` does not — it is a set
 * somebody chose to open and is read to its end. Each chunk keeps its own `<ul>`, so a
 * landing chunk cannot reflow rows already scrolled past.
 */
export function CollectionFeed({
  collectionId,
  initialPosts,
  hasMore: initialHasMore,
}: {
  /** The collection's cuid2 id — what the chunk route takes, whatever its address. */
  collectionId: string
  initialPosts: WebPost[]
  hasMore: boolean
}) {
  const [chunks, setChunks] = useState<WebPost[][]>([initialPosts])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // A ref, not `pending`: the observer can fire twice before a state update paints.
  const busy = useRef(false)

  const oldest = chunks[chunks.length - 1]?.at(-1)
  const canLoad = hasMore && oldest !== undefined

  const load = useCallback(async () => {
    if (busy.current || !canLoad || !oldest) return

    busy.current = true
    setPending(true)
    setFailed(false)
    try {
      const next = await loadMoreCollectionPosts({ collectionId, after: oldest.id })
      setHasMore(next.hasMore)
      if (next.posts.length === 0) return
      setChunks((current) => [...current, next.posts])
    } catch {
      // Auto-loading stops and the button says so: a dropped connection costs a tap.
      setFailed(true)
    } finally {
      busy.current = false
      setPending(false)
    }
  }, [canLoad, collectionId, oldest])

  useEffect(() => {
    const node = sentinel.current
    if (!node || !canLoad || failed) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) load()
      },
      { rootMargin: PREFETCH_MARGIN }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [load, canLoad, failed])

  return (
    <>
      {chunks.map((posts, index) => (
        <Fragment key={posts[0]?.id ?? index}>
          <CollectionGrid posts={posts} />
        </Fragment>
      ))}

      {canLoad && (
        <div className="flex flex-col items-center gap-2">
          <div ref={sentinel} aria-hidden />
          {/* Always visible: an observer that never fires must not be the only way forward. */}
          <button
            type="button"
            onClick={load}
            aria-busy={pending}
            className="flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-6 text-sm transition-colors hover:border-hover"
          >
            {pending ? 'Loading…' : failed ? 'Failed to load — try again' : 'Load more'}
          </button>
        </div>
      )}

      {!canLoad && chunks.length > 1 && (
        <p className="py-2 text-center text-sm text-muted">🔚 End of collection.</p>
      )}
    </>
  )
}
