'use client'

import { SITE_NAME } from '@/config'

/**
 * Last-resort boundary: errors thrown by the root layout itself never reach
 * `error.tsx`, so this file has to ship its own <html>/<body> and inline styling
 * (globals.css belongs to the layout that just failed).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          background: '#0d0f14',
          color: '#e5e7eb',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <h1 style={{ fontSize: '1.125rem', margin: 0 }}>{SITE_NAME} is temporarily unavailable</h1>
        {error.digest && (
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => retry()}
          style={{
            minHeight: '2.75rem',
            padding: '0 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#60a5fa',
            color: '#0d0f14',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
