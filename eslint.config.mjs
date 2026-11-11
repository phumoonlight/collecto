import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '**/out/**',
    '**/dist/**',
    // The app's Rust build output, and the schemas Tauri generates beside it.
    'packages/app/src-tauri/**',
  ]),
  {
    // packages/app is React, but a Tauri window rather than a Next app: `<img>` is the only
    // way it draws a picture, and there are no pages to link to.
    files: ['packages/**'],
    rules: {
      '@next/next/no-img-element': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
])

export default eslintConfig
