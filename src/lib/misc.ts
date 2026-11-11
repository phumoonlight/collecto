/**
 * Small pure helpers the pages share.
 */

/** A flat 4×4 PNG of the surface colour, so the grid does not flash white while thumbs load. */
export const BLUR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQI12MQk1KCIwbiOACEtAUhL5JZBwAAAABJRU5ErkJggg=='

/**
 * How far `/posts` goes before it hands over to the collections. The feed of newest images
 * is a front page, not an archive: it stops at a hundred, and the button becomes a link to
 * the shelf list, where the rest is findable. Both the feed and its route handler read it.
 */
export const LATEST_POSTS_LIMIT = 100

const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

/** A count spelled in keycap emoji: 3691 → 3️⃣,6️⃣9️⃣1️⃣. Separators stay plain characters. */
export function emojiNumber(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  return safe
    .toLocaleString('en-US')
    .split('')
    .map((char) => (char >= '0' && char <= '9' ? KEYCAPS[Number(char)] : char))
    .join('')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Whether a POST came from a page on this site. A route handler gets no origin check from the
 * framework, so without this any page on the web could count views here with a plain
 * cross-site form. Browsers send `Origin` on every POST, so a missing one is refused.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host'))
    ?.split(',')[0]
    .trim()
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
