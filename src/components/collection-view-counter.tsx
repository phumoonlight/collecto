'use client'

import { useEffect } from 'react'
import { recordCollectionPostView } from '@/lib/api/collections'

/** How long one browser's view of an image keeps counting as the same view. */
const COOLDOWN_MS = 60 * 60 * 1000
const STORAGE_KEY = 'viewed_posts'

// Survives client-side navigation away and back; the storage map survives reloads.
// Both are advisory — the counter is a popularity signal, not an audited metric.
// Keyed `collection:<id>`, the spelling it had beside the boards' `<board>:<id>` keys, so a
// browser's existing map keeps meaning what it meant.
const seenThisSession = new Set<string>()

function readSeen(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    // Private mode / disabled storage / corrupt value — fall back to session-only
    return {}
  }
}

/** True when this browser already counted the image recently. Marks it if not. */
function claimView(key: string): boolean {
  if (seenThisSession.has(key)) return false
  seenThisSession.add(key)

  const now = Date.now()
  const seen = readSeen()
  const last = seen[key]
  if (typeof last === 'number' && now - last < COOLDOWN_MS) return false

  // Prune while we're here, so the map can't grow without bound — which also clears the
  // boards' keys out of a browser that still holds them
  const next: Record<string, number> = { [key]: now }
  for (const [id, at] of Object.entries(seen)) {
    if (typeof at === 'number' && now - at < COOLDOWN_MS) next[id] ??= at
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Nothing to do — the session Set still stops repeats until the tab closes
  }
  return true
}

/**
 * Fires the view action once the image is actually on screen in a browser, and at most
 * once per COOLDOWN_MS per browser. Renders nothing — it exists so a server render, a
 * prefetch or a crawler reaching `generateMetadata` never counts as a view.
 */
export function CollectionViewCounter({ postId }: { postId: number }) {
  useEffect(() => {
    let cancelled = false
    const key = `collection:${postId}`
    // React 19 dev remounts effects; the flag keeps that from double-counting.
    const timer = setTimeout(() => {
      if (!cancelled && claimView(key)) void recordCollectionPostView(postId)
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [postId])

  return null
}
