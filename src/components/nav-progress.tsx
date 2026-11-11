'use client'

import { createPortal } from 'react-dom'
import { useLinkStatus } from 'next/link'

/**
 * An indeterminate bar pinned to the top of the viewport. Fixed rather than inline so it
 * reads the same whether the click landed on a sidebar row, a tag inside the mobile
 * sheet or the feed's own controls — and so no layout shifts wherever it is rendered.
 *
 * It goes through a portal because `position: fixed` is not as absolute as it sounds: a
 * `filter` or `transform` anywhere above makes that ancestor the containing block, and
 * the facet list's ➕/➖ carry a `filter` — rendered in place, the bar came out 24px wide
 * on the button that was clicked. On the body it can only ever mean the whole page.
 */
export function NavProgressBar() {
  // Only ever rendered mid-navigation, so the browser is always there by then
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="status"
      aria-label="Loading"
      className="pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5 overflow-hidden"
    >
      <div className="animate-nav-progress h-full w-2/5 rounded-full bg-accent" />
    </div>,
    document.body
  )
}

/**
 * Drop inside a `<Link>` to raise the bar while that link's navigation is in flight.
 *
 * `/posts` has a `loading.tsx`, but Next only shows a route's fallback when the segment
 * itself changes. A search of the shelf list rewrites `?q=` and stays on the same segment, so
 * the fallback never appears: until the server answers, the click looks like it did nothing.
 * This is what the docs point at for exactly that case.
 */
export function NavProgress() {
  const { pending } = useLinkStatus()
  return pending ? <NavProgressBar /> : null
}
