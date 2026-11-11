/**
 * Where an image lives in the bucket. Paths are derived from `file_name` (the md5) and
 * `file_ext` and never stored. The thumbnail keeps the image's own extension, because no
 * image is ever converted to another format. Spelled again in Rust as `src-tauri/src/paths.rs`,
 * which is the side that writes them — keep the two in step.
 *
 * Nothing here reads the environment: the base is an argument, which each host supplies.
 */

export const COLLECTION_POST_PREFIX = 'collections/posts'
export const COLLECTION_THUMB_PREFIX = 'collections/thumbs'

export function collectionImagePath(fileName: string, fileExt: string): string {
  return `${COLLECTION_POST_PREFIX}/${fileName}.${fileExt}`
}

export function collectionThumbnailPath(fileName: string, fileExt: string): string {
  return `${COLLECTION_THUMB_PREFIX}/${fileName}.${fileExt}`
}

/** The public URL of a stored object. `base` has no trailing slash. */
export function imageUrl(base: string, path: string): string {
  return `${base}/${path}`
}

/** Thumbnails are bounded to 720×360 — the grid lays a panorama out at most 2:1. */
export const THUMB_MAX_HEIGHT = 360
export const THUMB_MAX_RATIO = 2
