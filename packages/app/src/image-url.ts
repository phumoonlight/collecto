/**
 * A shelf image, served by the Rust side from its disk cache (`src-tauri/src/protocol.rs`).
 * The webview holds the decoded picture, so there is no map of them here.
 *
 * Windows' webview reaches a custom scheme as `http://<scheme>.localhost/…`; elsewhere it is
 * `<scheme>://localhost/…`.
 *
 * `grid` is the device-pixel box a tile draws it in, `<w>x<h>` (`useDrawnBox`): the Rust side
 * cuts the full size to exactly that once, so the window draws it 1:1. Without it, the stored
 * full size, for the viewer.
 */
const BASE = /Windows|Android/i.test(navigator.userAgent)
  ? 'http://board-image.localhost'
  : 'board-image://localhost'

export const fullImageUrl = (fileName: string, fileExt: string, grid?: string): string =>
  `${BASE}/collection/${fileName}.${fileExt}${grid ? `?grid=${grid}` : ''}`

/** The stored size, in the unit that keeps it under four figures. */
export function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
