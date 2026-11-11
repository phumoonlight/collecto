import type { CSSProperties } from 'react'

/**
 * Justified rows, the way Google Photos lays a gallery out: every row spans the full
 * width, and the row's height is whatever makes that true, so ratios survive untouched.
 *
 * It is pure flexbox — no measuring pass, no client component, so the grid stays a plain
 * server render. The trick is that an item's `flex-grow` and its `flex-basis` are both
 * proportional to its aspect ratio. Free space is then handed out in the same proportion
 * as the bases, so every item in a row ends at `ratio × H` for one shared H: the row
 * fills the line exactly and nothing is squashed or cropped. (Flexbox subtracts the gaps
 * before distributing, so the gutters don't spoil the fit.)
 *
 * Sizing is a band rather than a number. Wrapping happens at the basis, so the basis is
 * the *shortest* a row may be and the cap is the tallest — items are laid out small and
 * then grown into the line. The cap is what saves the ragged last row of a chunk: without
 * it a single leftover thumb would stretch across the whole width. Every item caps at the
 * same row height, so a capped row stays uniform, it just stops short of the right edge.
 */
export const ROW = 'flex flex-wrap gap-1 [--row-h:15rem] sm:[--row-h:17.5rem] lg:[--row-h:20rem]'
const MIN_ROW = 0.75
// 1.2 × 20rem is 384px on desktop — exactly THUMB_MAX_HEIGHT, so a row never upscales
// past the pixels the thumbnail actually has. The two are one decision: raising either
// without the other either blurs the grid or stores bytes nobody sees.
const MAX_ROW = 1.2

/** Thumbnails are bounded to 768×384 (`@common/imgcmp/for-thumbnail`), so a panorama's
    thumb is at most 2:1 however wide the post is. Laying it out at the post's ratio
    would reserve width the image can't fill. */
const MAX_RATIO = 2

/** One tile's share of its row. The band, the cap and `MAX_RATIO` are one decision tied to
 *  `THUMB_MAX_HEIGHT`, which is why `CollectionGrid` imports this rather than a copy. */
export function itemStyle(width: number, height: number): CSSProperties {
  const ratio = Math.min(width / Math.max(height, 1), MAX_RATIO)
  return {
    flexGrow: ratio * 100,
    flexBasis: `calc(${ratio} * var(--row-h) * ${MIN_ROW})`,
    maxWidth: `calc(${ratio} * var(--row-h) * ${MAX_ROW})`,
    aspectRatio: ratio,
  }
}

// Cycled so the placeholder row has the ragged ratios of real thumbs — and, because the
// ratios drive the layout now, so that it wraps into rows the same way one will.
const SKELETON_RATIOS = [0.7, 1.5, 0.8, 1, 1.3]

export function ImageRowsSkeleton({ count = 12 }: { count?: number }) {
  return (
    <ul className={ROW}>
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className="min-w-0 animate-pulse bg-surface"
          style={itemStyle(SKELETON_RATIOS[i % SKELETON_RATIOS.length], 1)}
        />
      ))}
    </ul>
  )
}
