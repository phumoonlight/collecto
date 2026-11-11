import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import postgres, { type Sql } from 'postgres'

/**
 * The migration runner. TypeScript run directly by Node (type stripping, Node 24+), so only
 * erasable syntax — no enums, no parameter properties.
 *
 *   push    apply every migration this database has not seen, then re-apply the grants
 *   list    what is applied, what is pending
 *   grant   re-apply `db/grants.sql` on its own
 *   reset   drop every table, then apply every migration and the grants from nothing
 *
 * `push` names the files it is about to run and asks first — a schema change against a live
 * board has no undo. `--yes` skips the question; without a terminal that flag is required.
 * Each file runs in its own transaction and is recorded in `_migrations`, so a failure rolls
 * back whole and nothing after it runs.
 *
 * `reset` deletes every collection and every image row. It shows what it is about to drop
 * and asks for the **database's name typed out** — `--yes` does not skip that, and without a
 * terminal it needs `--confirm=<database name>`. The images in the bucket are not touched:
 * they outlive it as orphans nothing on the board names.
 *
 * It connects as the owner (`DATABASE_URL_OWNER`), the only role that may create a table.
 */

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(here, '..', 'db', 'migrations')
const GRANTS = join(here, '..', 'db', 'grants.sql')

const url = process.env.DATABASE_URL_OWNER
if (!url) {
  console.error('DATABASE_URL_OWNER is not set — see db/README.md.')
  process.exit(1)
}

function migrations(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

async function applied(sql: Sql): Promise<Set<string>> {
  await sql`
    create table if not exists _migrations (
      name text primary key,
      at timestamptz not null default now()
    )`
  const rows = await sql<{ name: string }[]>`select name from _migrations`
  return new Set(rows.map((row) => row.name))
}

/** Which database, by name and host — never the URL, which carries a password. */
function where(sql: Sql): string {
  return `${sql.options.database} on ${sql.options.host.join(', ')}`
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

async function confirm(question: string): Promise<boolean> {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true
  if (!process.stdin.isTTY) {
    console.error('Not a terminal — re-run with --yes to apply without confirming.')
    return false
  }
  const answer = (await ask(`${question} [y/N] `)).toLowerCase()
  return answer === 'y' || answer === 'yes'
}

/**
 * Asks for the database's name, typed exactly. A `y` is easy to give without reading the
 * question; a name is not, and it is the one detail that says *which* board is about to go.
 */
async function confirmName(database: string): Promise<boolean> {
  const given = process.argv.find((arg) => arg.startsWith('--confirm='))
  if (given) return given.slice('--confirm='.length) === database
  if (!process.stdin.isTTY) {
    console.error(`Not a terminal — re-run with --confirm=${database} to reset without asking.`)
    return false
  }
  return (await ask(`Type the database name (${database}) to reset it: `)) === database
}

async function push(sql: Sql, { confirmed = false }: { confirmed?: boolean } = {}) {
  const done = await applied(sql)
  const pending = migrations().filter((name) => !done.has(name))
  if (pending.length === 0) console.log('No new migrations.')

  if (pending.length > 0) {
    console.log(`${pending.length} pending migration${pending.length === 1 ? '' : 's'}:`)
    for (const name of pending) console.log(`  ${name}`)
    console.log(`  → ${where(sql)}`)
    if (!confirmed && !(await confirm('Apply?'))) {
      console.log('Nothing applied.')
      return
    }
  }

  for (const name of pending) {
    const body = readFileSync(join(MIGRATIONS, name), 'utf8')
    // `.simple()`: the extended protocol runs exactly one statement, and a migration has many.
    await sql.begin(async (tx) => {
      await tx.unsafe(body).simple()
      await tx`insert into _migrations ${tx({ name })}`
    })
    console.log(`applied  ${name}`)
  }

  await grant(sql)
}

async function grant(sql: Sql) {
  await sql.unsafe(readFileSync(GRANTS, 'utf8')).simple()
  console.log('granted  db/grants.sql')
}

async function list(sql: Sql) {
  const done = await applied(sql)
  for (const name of migrations()) {
    console.log(`${done.has(name) ? 'applied ' : 'pending '} ${name}`)
  }
}

async function reset(sql: Sql) {
  // From the server, not the parsed options: the name typed to confirm must be the database
  // this connection is really on.
  const [{ database, user }] = await sql<{ database: string; user: string }[]>`
    select current_database() as database, current_user as user`
  const found = await sql<{ name: string; owner: string }[]>`
    select tablename as name, tableowner as owner
      from pg_tables
     where schemaname = 'public'
     order by tablename`
  const counts = found.some((table) => table.name === 'collection_posts')
    ? (
        await sql<{ collections: number; images: number }[]>`
          select (select count(*)::int from collections) as collections,
                 (select count(*)::int from collection_posts) as images`
      )[0]
    : null

  console.log(`Reset ${where(sql)}:`)
  if (found.length === 0) console.log('  (no tables)')
  for (const table of found) console.log(`  drop ${table.name}`)
  if (counts) {
    console.log(`  — ${counts.collections} collections and ${counts.images} image rows, gone for good.`)
    console.log('  The images stay in the bucket as orphans.')
  }
  console.log(`  then apply ${migrations().length} migrations and the grants.`)

  if (!(await confirmName(database))) {
    console.log('Nothing reset.')
    return
  }

  // The owner can drop only what it owns; anything else is named rather than half-dropped.
  const foreign = found.filter((table) => table.owner !== user)
  if (foreign.length > 0) {
    throw new Error(`Not owned by ${user}: ${foreign.map((t) => t.name).join(', ')} — nothing dropped.`)
  }
  await sql.begin(async (tx) => {
    for (const table of found) await tx`drop table if exists ${tx(table.name)} cascade`
  })
  console.log(`dropped  ${found.length} table${found.length === 1 ? '' : 's'}`)

  await push(sql, { confirmed: true })
}

const commands: Record<string, (sql: Sql) => Promise<void>> = { push, list, grant, reset }
const command = Object.hasOwn(commands, process.argv[2] ?? '') ? commands[process.argv[2]] : null
if (!command) {
  console.error(`Usage: migrate.mts <${Object.keys(commands).join('|')}>`)
  process.exit(1)
}

const sql = postgres(url, {
  max: 1,
  onnotice: (notice) => {
    // 42P07 is `create table if not exists` finding `_migrations` — on every run but the first.
    if (notice.code === '42P07') return
    console.log(`notice   ${notice.message}`)
  },
})
try {
  await command(sql)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
