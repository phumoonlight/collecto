import { collectionImagePath, collectionThumbnailPath, imageUrl } from '@common/storage'
import { cdnBase } from '@/config'

/** Where the website looks for an image: `@common/storage`'s paths on this host's origin. */
export function collectionImageUrl(fileName: string, fileExt: string): string {
  return imageUrl(cdnBase(), collectionImagePath(fileName, fileExt))
}

/** The thumbnail keeps the image's own extension — nothing is converted. */
export function collectionThumbUrl(fileName: string, fileExt: string): string {
  return imageUrl(cdnBase(), collectionThumbnailPath(fileName, fileExt))
}
