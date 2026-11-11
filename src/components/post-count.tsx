'use client'

import { useEffect, useState } from 'react'
import { loadCollectionPostCount } from '@/lib/api/collections'
import { emojiNumber } from '@/lib/misc'

/**
 * "Serving N images", asked for once the page is in a browser. The landing page is static, so
 * the count is the only thing on it that reaches the board — and it draws nothing while
 * unconfigured (`null`) or if the ask fails, rather than a zero that would read as an empty
 * board.
 */
export function PostCount() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCollectionPostCount()
      .then((n) => {
        if (!cancelled) setCount(n)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    // The line keeps its height while the number is on its way, so nothing below it jumps
    <p className="flex min-h-7 flex-wrap items-center justify-center gap-2 text-sm text-muted">
      {count !== null && (
        <>
          <span>Serving</span>
          {/* The keycaps are decoration; the plain number is what gets announced */}
          <span
            aria-label={`${count.toLocaleString('en-US')} images`}
            className="text-base tracking-tight"
          >
            <span aria-hidden>{emojiNumber(count)}</span>
          </span>
          <span>images</span>
        </>
      )}
    </p>
  )
}
