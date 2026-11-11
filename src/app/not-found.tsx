import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Not found',
  description: 'That page does not exist.',
}

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-5xl font-bold tracking-tight text-muted">404</p>
      <h1 className="text-lg font-semibold">Nothing here</h1>
      <p className="text-sm text-muted">
        The page you asked for doesn&apos;t exist — it may have been deleted, or the link is
        wrong.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/posts"
          className="flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm text-background"
        >
          Latest images
        </Link>
        <Link
          href="/collections"
          className="flex min-h-11 items-center rounded-lg border border-border px-4 text-sm"
        >
          Browse collections
        </Link>
      </div>
    </div>
  )
}
