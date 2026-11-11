import type { CSSProperties } from 'react'
import { THUMB_MAX_RATIO } from '@common/storage'

/**
 * Rows of a fixed height, each image as wide as its own shape makes it — and a ragged right
 * edge, on purpose. Justified rows (the website's) let a wide panorama shrink everything on
 * its line; here `--row-h` is the height of every image on the screen, so two images are
 * always compared at one scale.
 */

export function ratioOf(width: number, height: number): number {
  return Math.min(width / Math.max(height, 1), THUMB_MAX_RATIO)
}

/** The tile's width, rounded to a whole pixel so the cut copy is drawn 1:1. */
export function itemStyle(width: number, height: number): CSSProperties {
  return { width: `round(calc(${ratioOf(width, height)} * var(--row-h)), 1px)` }
}
