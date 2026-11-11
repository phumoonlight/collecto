import 'server-only'
import postgres, { type Sql } from 'postgres'
import { databaseUrl } from '@/config'

/**
 * The website's one connection to the board, as `collecto_web` — a role that may select from
 * both tables and `update (view_count) on collection_posts`, and nothing else. The database
 * enforces that, so one handle is enough.
 *
 * One pool per server instance, built lazily so `isDatabaseConfigured()` can be false and the
 * setup notice can render rather than the import throwing.
 */
let pool: Sql | null = null

export function db(): Sql {
  if (!pool) {
    pool = postgres(databaseUrl()!, {
      // A serverless instance holds few connections briefly; Neon's pooled endpoint does the
      // real multiplexing on the other side.
      max: 5,
      // A pooler hands out a different backend each time, so a statement cache is dead weight.
      prepare: false,
    })
  }
  return pool
}

/** True once `.env.local` (or Vercel) holds a real connection string. */
export function isDatabaseConfigured(): boolean {
  const url = databaseUrl()
  return Boolean(url && !url.includes('YOUR_'))
}
