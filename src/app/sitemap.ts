import type { MetadataRoute } from 'next'
import { getSitemapCollections } from '@/lib/data/collections'
import { collectionHref, collectionsHref } from '@common/collections'
import { isDatabaseConfigured } from '@/lib/db'
import { siteUrl } from '@/config'

export const revalidate = 3600

/** The shelves, not what is on them: a shelf is a fixed listing with a name, which is a page
 *  worth finding; an image inside one is a page with no words on it. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/posts`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}${collectionsHref()}`, changeFrequency: 'daily', priority: 0.8 },
  ]

  if (!isDatabaseConfigured()) return staticRoutes

  const collections = await getSitemapCollections()
  return [
    ...staticRoutes,
    ...collections.map((collection) => ({
      url: `${base}${collectionHref(collection.id)}`,
      lastModified: new Date(collection.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
