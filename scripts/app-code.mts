import {
  encode,
  decode,
  generatePassphrase,
  MIN_PASSPHRASE,
  normalizePassphrase,
  type AppConnection,
} from './setup-code.mts'

/**
 * `npm run app:code` — prints the setup code the desktop app asks for on first start: the seven
 * values it needs, read from this machine's environment file, encrypted with a passphrase.
 *
 * The passphrase comes from `COLLECTO_PASSPHRASE` when it is set and not empty (the shell, or
 * the environment file); otherwise it is typed (hidden, twice), or generated when Enter is
 * pressed on an empty line. The code is checked by
 * decoding it again before it is printed.
 */

const NAMES = {
  db: 'DATABASE_URL_APP',
  cdn: 'NEXT_PUBLIC_CDN_URL',
  site: 'NEXT_PUBLIC_SITE_URL',
  account: 'R2_ACCOUNT_ID',
  key: 'R2_ACCESS_KEY_ID',
  secret: 'R2_SECRET_ACCESS_KEY',
  bucket: 'R2_BUCKET',
} as const

function read(name: string): string {
  const value = (process.env[name] ?? '').trim()
  return value && !value.includes('YOUR_') ? value : ''
}

const values = Object.fromEntries(
  Object.entries(NAMES).map(([field, name]) => [field, read(name)])
) as Record<keyof typeof NAMES, string>
const missing = Object.entries(NAMES).filter(([field]) => !values[field as keyof typeof NAMES])
if (missing.length > 0) {
  console.error(`Not set: ${missing.map(([, name]) => name).join(', ')} — see .env.example.`)
  process.exit(1)
}

const connection: AppConnection = {
  db: values.db,
  cdn: values.cdn.replace(/\/+$/, ''),
  site: values.site.replace(/\/+$/, ''),
  r2: { account: values.account, key: values.key, secret: values.secret, bucket: values.bucket },
}

/**
 * Lines read with nothing echoed — the passphrase is not left on the screen.
 *
 * **One reader for every prompt, closed once at the end.** Pausing stdin between prompts let
 * the process run out of things to wait for on Windows, so it exited at the second prompt
 * without a word. Here the terminal stays in raw mode and stdin keeps reading until `close`.
 */
function hiddenReader() {
  const input = process.stdin
  let typed = ''
  let waiting: ((line: string) => void) | null = null

  const close = () => {
    input.off('data', onData)
    input.setRawMode(false)
    input.pause()
  }

  function onData(chunk: string) {
    for (const ch of chunk) {
      if (ch === '\r' || ch === '\n') {
        // A `\r\n` pair is one Enter; a stray `\n` with nobody asking is dropped.
        if (!waiting) continue
        const done = waiting
        const line = typed
        waiting = null
        typed = ''
        process.stdout.write('\n')
        done(line)
      } else if (ch === '\u0003') {
        close()
        process.stdout.write('\n')
        process.exit(130)
      } else if (ch === '\u007f' || ch === '\b') {
        typed = [...typed].slice(0, -1).join('')
      } else if (ch >= ' ') {
        typed += ch
      }
    }
  }

  input.setRawMode(true)
  input.setEncoding('utf8')
  input.on('data', onData)
  input.resume()

  return {
    read(prompt: string): Promise<string> {
      process.stdout.write(prompt)
      return new Promise((resolve) => {
        waiting = resolve
      })
    },
    close,
  }
}

/**
 * `COLLECTO_PASSPHRASE` first — from the shell, or the environment file — and the prompt when
 * it is unset or empty, so an empty `COLLECTO_PASSPHRASE=` line in the file still asks.
 */
async function choosePassphrase(): Promise<{ passphrase: string; generated: boolean }> {
  const given = process.env.COLLECTO_PASSPHRASE ?? ''
  if (normalizePassphrase(given) !== '') return { passphrase: given, generated: false }
  if (!process.stdin.isTTY) {
    console.error('Not a terminal — set COLLECTO_PASSPHRASE to pass the passphrase.')
    process.exit(1)
  }

  const reader = hiddenReader()
  try {
    for (;;) {
      const first = await reader.read(
        `Passphrase (at least ${MIN_PASSPHRASE} characters, Enter to generate one): `
      )
      if (normalizePassphrase(first) === '') return { passphrase: generatePassphrase(), generated: true }
      if (normalizePassphrase(first).length < MIN_PASSPHRASE) {
        console.log(`Too short — at least ${MIN_PASSPHRASE} characters. A few words work well.`)
        continue
      }
      if (normalizePassphrase(await reader.read('Again: ')) !== normalizePassphrase(first)) {
        console.log('Those did not match. Try again.')
        continue
      }
      return { passphrase: first, generated: false }
    }
  } finally {
    reader.close()
  }
}

const { passphrase, generated } = await choosePassphrase()
if (normalizePassphrase(passphrase).length < MIN_PASSPHRASE) {
  console.error(`The passphrase must be at least ${MIN_PASSPHRASE} characters.`)
  process.exit(1)
}

const code = encode(connection, passphrase)
// Decoded again before it is shown: a code that does not open is worse than no code.
if (JSON.stringify(decode(code, passphrase)) !== JSON.stringify(connection)) {
  console.error('The code did not decode back to the same values — nothing printed.')
  process.exit(1)
}

console.log('\nSetup code — paste it into Collecto on first start (or Settings → Change connection):\n')
console.log(code)
if (generated) {
  console.log('\nGenerated passphrase — keep it somewhere other than the code:\n')
  console.log(`  ${passphrase}`)
}
console.log(
  '\nThe code holds the database login and the bucket key. Without the passphrase it is unreadable;' +
    '\nkeep the two apart.'
)
