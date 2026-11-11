'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import { NavProgress, NavProgressBar } from '@/components/nav-progress'
import { collectionPostHref } from '@common/collections'

/** True while the visitor is typing — nothing on this page has a box yet, but the walk
 *  must not start eating arrow keys the moment one is added. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/** True while the picture is open over the page. A modal makes the document inert, but a
 *  `keydown` on `window` is not part of that document — so → would close nothing and
 *  quietly load the next image behind it. */
function isModalOpen() {
  return document.querySelector('dialog[open]') !== null
}

const BUTTON = 'flex items-center justify-center text-lg hover:opacity-80'

/**
 * Prev/next through a collection, plus ←/→.
 *
 * `PostNav` with the query taken out, which is the whole difference: a post is walked
 * *inside a search* and has to carry it, and a collection image is walked inside its
 * shelf, which its own URL already names. Everything else — yielding the keys to a box or
 * a modal, prefetching both neighbours because a walk is the one navigation whose next two
 * destinations are known in advance, the progress bar for a keypress that has no link to
 * sit in — is the same and is here for the same reasons.
 */
export function CollectionNav({
  collectionId,
  prevId,
  nextId,
}: {
  collectionId: number
  prevId: number | null
  nextId: number | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (isTyping(event.target) || isModalOpen()) return

      const id = event.key === 'ArrowLeft' ? prevId : event.key === 'ArrowRight' ? nextId : null
      if (id === null) return

      event.preventDefault()
      startTransition(() => router.push(collectionPostHref(collectionId, id)))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [collectionId, prevId, nextId, router])

  if (!prevId && !nextId) return null

  return (
    <nav className="flex items-center gap-2">
      {pending && <NavProgressBar />}
      {prevId && (
        <Link
          href={collectionPostHref(collectionId, prevId)}
          title="Newer image (←)"
          aria-label="Newer image"
          prefetch
          className={BUTTON}
        >
          <span aria-hidden>⬅️</span>
          <NavProgress />
        </Link>
      )}
      {nextId && (
        <Link
          href={collectionPostHref(collectionId, nextId)}
          title="Older image (→)"
          aria-label="Older image"
          prefetch
          className={BUTTON}
        >
          <span aria-hidden>➡️</span>
          <NavProgress />
        </Link>
      )}
    </nav>
  )
}
