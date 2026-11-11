import type { Metadata } from 'next'
import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { PostCount } from '@/components/post-count'
import { SetupNotice } from '@/components/setup-notice'
import { isDatabaseConfigured } from '@/lib/db'
import { collectionsHref } from '@common/collections'
import { SITE_DESCRIPTION, SITE_NAME } from '@/config'

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
}

const DOOR =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-5 text-sm transition-colors hover:border-accent'

/**
 * The front door: the wordmark, the two ways in, and how many images are behind them. Static
 * — the count is fetched by the browser (`PostCount`), so the page touches no database.
 */
export default function HomePage() {
  const configured = isDatabaseConfigured()

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-3 py-16 text-center sm:py-24">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>

      <nav className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/posts" className={DOOR}>
          <span aria-hidden>🖼️</span> Latest
          <NavProgress />
        </Link>
        <Link href={collectionsHref()} className={DOOR}>
          <span aria-hidden>🗂️</span> Collections
          <NavProgress />
        </Link>
      </nav>

      {configured ? (
        <PostCount />
      ) : (
        <div className="w-full text-left">
          <SetupNotice />
        </div>
      )}
    </div>
  )
}
