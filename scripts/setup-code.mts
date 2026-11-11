import { createCipheriv, createDecipheriv, randomBytes, randomInt, scryptSync } from 'node:crypto'

/**
 * The app's setup code: the seven values the desktop app needs, encrypted with a passphrase,
 * as one line of text. Decoded by `packages/app/src-tauri/src/setup.rs` — the two must agree
 * on every constant below.
 *
 *   collecto2.<salt>.<nonce>.<ciphertext+tag>      (each part base64url, no padding)
 *
 * The key is scrypt(passphrase, salt; N = 2^17, r = 8, p = 1) → 32 bytes, deliberately slow so
 * that guessing passphrases offline is expensive. The values are a JSON object encrypted with
 * AES-256-GCM, which also detects a wrong passphrase or a damaged code; the prefix is
 * authenticated as associated data. The passphrase is trimmed and NFC-normalized first, so the
 * same characters typed differently give the same key.
 */

export const PREFIX = 'collecto2'
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }

export type AppConnection = {
  db: string
  cdn: string
  site: string
  r2: { account: string; key: string; secret: string; bucket: string }
}

export const MIN_PASSPHRASE = 12

export function normalizePassphrase(raw: string): string {
  return raw.trim().normalize('NFC')
}

function key(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(normalizePassphrase(passphrase), salt, 32, SCRYPT)
}

/** `salt` and `nonce` are random unless given — only a test vector fixes them. */
export function encode(
  connection: AppConnection,
  passphrase: string,
  salt: Buffer = randomBytes(16),
  nonce: Buffer = randomBytes(12)
): string {
  const cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), nonce)
  cipher.setAAD(Buffer.from(PREFIX))
  const sealed = Buffer.concat([
    cipher.update(JSON.stringify(connection), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ])
  return [PREFIX, salt, nonce, sealed]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

export function decode(code: string, passphrase: string): AppConnection {
  const [prefix, salt, nonce, sealed] = code.trim().split('.')
  if (prefix !== PREFIX || !salt || !nonce || !sealed) throw new Error('Not a Collecto setup code.')
  const bytes = Buffer.from(sealed, 'base64url')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(passphrase, Buffer.from(salt, 'base64url')),
    Buffer.from(nonce, 'base64url')
  )
  decipher.setAAD(Buffer.from(PREFIX))
  decipher.setAuthTag(bytes.subarray(bytes.length - 16))
  const json = Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()])
  return JSON.parse(json.toString('utf8')) as AppConnection
}

/**
 * Short, common, unambiguous words. Six of them is 48 bits — with scrypt's cost per guess, far
 * beyond what an offline attacker can try — and still something a person can type.
 */
const WORDS = (
  'acid acorn actor agent album alarm alien alley amber ample angle ankle apple april apron ' +
  'arena armor arrow atlas attic audio autumn avocado awake bacon badge bagel baker bamboo ' +
  'banjo barn basil beach beard berry bicycle birch blade blanket bloom blue bonus border ' +
  'bottle brave bread brick bridge broom bubble bucket buffalo bundle butter cabin cactus ' +
  'camel candle canoe canyon carbon carpet castle cedar cello chalk cherry chess circle cliff ' +
  'clock cloud clover cobalt cocoa comet copper coral cotton cradle crane crayon crystal ' +
  'cupcake curtain daisy dancer delta denim desert dolphin domino donkey dragon dune eagle ' +
  'echo elbow ember engine falcon feather fern fiddle flute forest fossil fox galaxy garden ' +
  'garlic geyser ginger glacier globe goose granite grape gravel harbor hazel helmet heron ' +
  'honey hornet igloo island ivory jacket jaguar jasmine jelly jungle kayak kettle kiwi koala ' +
  'ladder lagoon lantern lemon lily lizard lobster locket lotus magnet mango maple marble ' +
  'meadow melon meteor mint mitten monkey mosaic moss muffin nectar needle nest noodle nutmeg ' +
  'oasis ocean olive onion orbit orchid otter owl paddle panda paper parrot peach pebble ' +
  'pepper piano pickle pigeon pillow pine planet plum pocket pony prism pumpkin puzzle quartz ' +
  'quill rabbit radar raven ribbon river robin rocket ruby saddle salmon sandal satin scarf ' +
  'shell silver sketch sloth snail spark spider sponge spruce squid stable statue storm ' +
  'sugar summit sunset swan tablet tango teapot thistle thunder tiger timber tomato topaz ' +
  'torch tulip tundra turtle umbrella valley velvet violet violin walnut walrus wave whale ' +
  'willow window winter wizard wolf yacht yarn yogurt zebra zipper'
).split(' ')

export function generatePassphrase(words = 6): string {
  return Array.from({ length: words }, () => WORDS[randomInt(WORDS.length)]).join(' ')
}

export const WORD_COUNT = WORDS.length
