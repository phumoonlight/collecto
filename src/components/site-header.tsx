import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import { collectionsHref } from '@common/collections'
import { SITE_NAME } from '@/config'

/** Which nav item is the page you are on. */
export type Section = 'posts' | 'collections'

const ITEMS: { section: Section; href: string; label: string }[] = [
  { section: 'posts', href: '/posts', label: '🖼️ Latest' },
  { section: 'collections', href: collectionsHref(), label: '🗂️ Collections' },
]

/**
 * Sticky top bar, and the site's only navigation. No account, no settings: the site displays,
 * and everything that changes it lives in the app.
 */
export function SiteHeader({ current }: { current?: Section }) {
  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/posts"
          className="min-w-0 truncate text-xl font-bold tracking-tight sm:text-2xl hover:underline"
        >
          {SITE_NAME}
          <NavProgress />
        </Link>
        <nav className="flex items-center gap-3">
          {ITEMS.map((item) => (
            <Link
              key={item.section}
              href={item.href}
              aria-current={current === item.section ? 'page' : undefined}
              className={`text-sm hover:text-foreground ${
                current === item.section ? 'text-foreground' : 'text-muted'
              }`}
            >
              {item.label}
              <NavProgress />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

/** Stand-in for the bar above, box for box, so a `loading.tsx` reserves its exact height. */
export function SiteHeaderSkeleton() {
  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="h-7 w-32 animate-pulse rounded bg-surface sm:h-8" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-16 animate-pulse rounded bg-surface" />
          <div className="h-5 w-24 animate-pulse rounded bg-surface" />
        </div>
      </div>
    </div>
  )
}
