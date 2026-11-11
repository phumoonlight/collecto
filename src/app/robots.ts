import type { MetadataRoute } from 'next'
import { collectionsHref } from '@common/collections'
import { siteUrl } from '@/config'

/** A search of the shelf list is one visitor's slice of `/collections`, which is indexed
 *  whole — so crawlers skip its query strings. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', `${collectionsHref()}?`],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
