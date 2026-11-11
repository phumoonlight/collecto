import { useEffect, useState } from 'react'
import { api, type LogEntry } from '../api'
import { BUTTON_SM, segment, SEGMENTS } from './buttons'
import { HoldButton } from './hold-button'

/**
 * What this copy of the app has done to the board — every upload, edit and delete, newest
 * first, with what the board or the bucket said, how long it took, and for an upload what the
 * lossless pass made of it. Kept in `app-cache/logs.json`, so it survives a restart, and new
 * entries land here live while the screen is open.
 *
 * A technical readout: the action is its `area:verb` and the detail its raw JSON, because the
 * reason to open this is to find a file name or an id after something went wrong.
 */
export function Logs() {
  const [entries, setEntries] = useState<LogEntry[] | null>(null)
  const [errorsOnly, setErrorsOnly] = useState(false)

  useEffect(() => {
    let alive = true
    void api.listLogs().then((list) => {
      if (alive) setEntries(list)
    })
    const unsubscribe = api.onLogEntry((entry) =>
      setEntries((current) => (current ? [entry, ...current] : current))
    )
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const shown = (entries ?? []).filter((entry) => !errorsOnly || entry.level === 'error')

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-6 pb-25">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold tracking-tight">📜 Logs</h1>
        <div className="flex items-center gap-2">
          <div className={SEGMENTS} role="group" aria-label="Show">
            <button
              type="button"
              onClick={() => setErrorsOnly(false)}
              aria-pressed={!errorsOnly}
              className={segment(!errorsOnly)}
            >
              <span aria-hidden>📜</span> All
            </button>
            <button
              type="button"
              onClick={() => setErrorsOnly(true)}
              aria-pressed={errorsOnly}
              className={segment(errorsOnly)}
            >
              <span aria-hidden>⚠️</span> Errors
            </button>
          </div>
          <button
            type="button"
            onClick={() => void api.listLogs().then(setEntries)}
            className={BUTTON_SM}
          >
            <span aria-hidden>🔄</span> Refresh
          </button>
          <HoldButton
            ms={700}
            title="Hold to clear the log"
            onHold={() => void api.clearLogs().then(() => setEntries([]))}
            className={BUTTON_SM}
          >
            <span aria-hidden>🧹</span> Hold to clear
          </HoldButton>
        </div>
      </div>

      {entries === null ? (
        <p className="text-sm text-muted">Reading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">
          {errorsOnly ? 'No errors logged.' : 'Nothing logged yet.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border border-border">
          {shown.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  )
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false)
  const failed = entry.level === 'error'
  // An upload's one-line summary of what the lossless pass did, beside the bare "ok".
  const compression =
    !failed && typeof entry.detail?.compression === 'string' ? entry.detail.compression : null

  return (
    <li className="px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span aria-hidden>{failed ? '⚠️' : '✅'}</span>
        <span className="shrink-0 font-mono text-muted">{new Date(entry.at).toLocaleString()}</span>
        <span className="shrink-0 font-mono text-foreground">{entry.action}</span>
        <span className={`min-w-0 flex-1 wrap-break-word ${failed ? 'text-[#ff8a8b]' : 'text-muted'}`}>
          {entry.message}
          {compression && <span className="text-foreground/80"> — {compression}</span>}
        </span>
      </button>
      {open && entry.detail && (
        <pre className="mt-2 overflow-x-auto bg-surface p-2 font-mono text-[11px] text-muted select-text">
          {JSON.stringify(entry.detail, null, 2)}
        </pre>
      )}
    </li>
  )
}
