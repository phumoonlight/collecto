import { ImageRowsSkeleton } from '@/components/image-rows'
import { SiteHeaderSkeleton } from '@/components/site-header'

/** Mirrors `/posts`: the header, the heading's line box, then the rows. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4">
      <SiteHeaderSkeleton />
      <div className="h-7 w-24 animate-pulse rounded bg-surface" />
      <ImageRowsSkeleton />
    </div>
  )
}
