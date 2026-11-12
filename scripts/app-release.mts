import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The last step of `npm run app:build`: moves the NSIS installer out of Cargo's build folder,
 * deep under `packages/app/src-tauri/target/`, into `release/` at the repo root, where it is
 * easy to find. A rebuild of the same version replaces its file; other versions stay.
 */

const BUNDLE = 'packages/app/src-tauri/target/release/bundle/nsis'
const RELEASE = 'release'

let installers: string[]
try {
  installers = readdirSync(BUNDLE).filter((name) => name.endsWith('-setup.exe'))
} catch {
  installers = []
}
if (installers.length === 0) {
  console.error(`No installer in ${BUNDLE} — did the build finish?`)
  process.exit(1)
}

mkdirSync(RELEASE, { recursive: true })
for (const name of installers) {
  // Copied, then removed: a rename fails when the two folders are on different drives.
  copyFileSync(join(BUNDLE, name), join(RELEASE, name))
  rmSync(join(BUNDLE, name))
  console.log(`release/${name}`)
}
