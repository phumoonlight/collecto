import type { MetadataRoute } from 'next'
import { collectionsHref } from '@common/collections'
import { siteUrl } from '@/config'

/**
 * Crawlers that gather training data for AI models, or fetch pages for AI answers. They are
 * asked to stay out entirely; search engines are not affected (`Google-Extended` and
 * `Applebot-Extended` are opt-outs from AI use, not from search). robots.txt is a request —
 * the real block is Vercel's Firewall → Bot Management → AI Bots, which this backs up.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'PerplexityBot',
  'Perplexity-User',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'FacebookBot',
  'cohere-ai',
  'Diffbot',
  'ImagesiftBot',
  'Omgilibot',
  'Timpibot',
  'YouBot',
  'AI2Bot',
]

/** A search of the shelf list is one visitor's slice of `/collections`, which is indexed
 *  whole — so crawlers skip its query strings. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: '/' },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', `${collectionsHref()}?`],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
