import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * The migration runner.
 *
 *   push    apply every migration this database has not seen, then re-apply the grants
 *   list    what is applied, what is pending
 *   grant   re-apply `db/grants.sql` on its own
 *
 * `push` names the files it is about to run and asks first — a schema change against a live
 * board has no undo. `--yes` skips the question; without a terminal that flag is required.
 * Each file runs in its own transaction and is recorded in `_migrations`, so a failure rolls
 * back whole and nothing after it runs. There is no `reset`, deliberately.
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

function migrations() {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

async function applied(sql) {
  await sql`
    create table if not exists _migrations (
      name text primary key,
      at timestamptz not null default now()
    )`
  const rows = await sql`select name from _migrations`
  return new Set(rows.map((row) => row.name))
}

async function confirm(question) {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true
  if (!process.stdin.isTTY) {
    console.error('Not a terminal — re-run with --yes to apply without confirming.')
    return false
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}

async function push(sql) {
  const done = await applied(sql)
  const pending = migrations().filter((name) => !done.has(name))
  if (pending.length === 0) console.log('No new migrations.')

  if (pending.length > 0) {
    console.log(`${pending.length} pending migration${pending.length === 1 ? '' : 's'}:`)
    for (const name of pending) console.log(`  ${name}`)
    // Which database, by host and name — never the URL, which carries a password.
    console.log(`  → ${sql.options.database} on ${sql.options.host.join(', ')}`)
    if (!(await confirm('Apply?'))) {
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

async function grant(sql) {
  await sql.unsafe(readFileSync(GRANTS, 'utf8')).simple()
  console.log('granted  db/grants.sql')
}

async function list(sql) {
  const done = await applied(sql)
  for (const name of migrations()) {
    console.log(`${done.has(name) ? 'applied ' : 'pending '} ${name}`)
  }
}

const commands = { push, list, grant }
const command = commands[process.argv[2]]
if (!command) {
  console.error(`Usage: migrate.mjs <${Object.keys(commands).join('|')}>`)
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: (notice) => console.log(`notice   ${notice.message}`) })
try {
  await command(sql)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
