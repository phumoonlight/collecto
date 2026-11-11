/** Shown instead of data when the database connection is missing. */
export function SetupNotice() {
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-6 text-center text-sm text-yellow-400">
      <p className="font-medium">The database is not configured</p>
      <p className="mt-1 text-yellow-400/80">
        Add <code>DATABASE_URL</code> and <code>NEXT_PUBLIC_CDN_URL</code> to{' '}
        <code>.env.local</code>, then <code>npm run db:push</code>.
      </p>
    </div>
  )
}
