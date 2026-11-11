'use client'

import { Analytics as VercelAnalytics, type BeforeSendEvent } from '@vercel/analytics/react'
import { COLLECTION_FILTER_PARAMS } from '@common/collections'

/**
 * Vercel Web Analytics stores the URL of every page view, and on the shelf list the URL
 * *is* the search: `/collections?q=ukiyo`. Sending that would hand a third
 * party what each visitor searched for, beside the city-level
 * geolocation the same data point carries — so the params are dropped before the event
 * leaves the browser. What survives is the path, which is all the pageview counts need.
 */
const SEARCH_PARAMS = Object.values(COLLECTION_FILTER_PARAMS)

function redact(event: BeforeSendEvent) {
  try {
    const url = new URL(event.url)
    if (!SEARCH_PARAMS.some((param) => url.searchParams.has(param))) return event
    for (const param of SEARCH_PARAMS) url.searchParams.delete(param)
    return { ...event, url: url.toString() }
  } catch {
    // An unparseable URL is not worth guessing at — drop the event entirely
    return null
  }
}

export function Analytics() {
  return <VercelAnalytics beforeSend={redact} />
}
