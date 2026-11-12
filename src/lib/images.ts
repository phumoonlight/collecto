import { collectionImagePath, collectionThumbnailPath, imageUrl } from '@common/storage'
import { cdnBase } from '@/config'

/** Where the website looks for an image: `@common/storage`'s paths on this host's origin. */
export function collectionImageUrl(fileName: string, fileExt: string): string {
  return imageUrl(cdnBase(), collectionImagePath(fileName, fileExt))
}

/**
 * What a grid, a cover or a link preview draws. The thumbnail keeps the image's own extension —
 * nothing is converted. An animated image has no thumbnail (a still would stop it moving), so
 * it is the stored file itself.
 */
export function collectionThumbUrl(fileName: string, fileExt: string, animated: boolean): string {
  return animated
    ? collectionImageUrl(fileName, fileExt)
    : imageUrl(cdnBase(), collectionThumbnailPath(fileName, fileExt))
}
