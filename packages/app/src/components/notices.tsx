import { useEffect, useState } from 'react'
import { api, type LogEntry } from '../api'

/** Long enough to read a sentence naming a path; the ✕ is there for sooner. */
const NOTICE_MS = 10_000

/**
 * Failures, raised in the corner of whichever screen is open. They come from the activity
 * log rather than from each screen, because the failure that matters most — a stored object
 * left in the bucket after its row was deleted — arrives after the screen that asked has
 * already been told `ok` and moved on. The Logs screen holds the full entry.
 */
export function Notices() {
  const [notices, setNotices] = useState<LogEntry[]>([])

  useEffect(
    () =>
      api.onLogEntry((entry) => {
        if (entry.level !== 'error') return
        setNotices((current) => [...current, entry])
        setTimeout(
          () => setNotices((current) => current.filter((notice) => notice.id !== entry.id)),
          NOTICE_MS
        )
      }),
    []
  )

  if (notices.length === 0) return null

  return (
    <div
      role="alert"
      className="fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="flex items-start gap-2 border border-[#ff5d5f]/50 bg-surface px-3 py-2 text-xs shadow-lg"
        >
          <span aria-hidden>⚠️</span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-muted">{notice.action}</p>
            <p className="wrap-break-word text-[#ff8a8b]">{notice.message}</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setNotices((current) => current.filter((other) => other.id !== notice.id))
            }
            className="text-muted hover:text-foreground"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      ))}
    </div>
  )
}
