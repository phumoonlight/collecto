import { useState } from 'react'
import { api, type AppStatus, type Preferences } from '../api'
import { bytes } from '../image-url'
import { BUTTON_SM, buttonToggle } from './buttons'
import { ConnectionForm } from './connection-form'
import { HoldButton } from './hold-button'
import { Choice, Field, Readout } from './settings-rows'

const PNG_LEVELS: { value: string; label: string }[] = [
  { value: '2', label: 'Fast' },
  { value: '4', label: 'Balanced' },
  { value: '6', label: 'Maximum' },
]

/**
 * Three sections, and only one of them is settings.
 *
 * **Connection** is which board this copy writes to: set from a setup code on first start, kept
 * in the OS credential store, and changeable here.
 * **Compression** is the real settings, about this machine rather than the board: how many
 * cores the lossless pass may take, and how hard it works on PNGs. **Cache** is a readout and
 * an escape hatch.
 */
export function Settings({ status, onChanged }: { status: AppStatus; onChanged: () => void }) {
  // Seeded from what the Rust side is running with, which is also what a save answers with —
  // so the screen never shows a value that was refused.
  const [values, setValues] = useState<Preferences>(status.preferences)
  const [editingThreads, setEditingThreads] = useState(false)
  const [changing, setChanging] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  async function save(patch: Partial<Preferences>) {
    const updated = { ...values, ...patch }
    setValues(updated)
    setEditingThreads(false)
    setValues(await api.savePreferences(updated))
    onChanged()
  }

  /** A cleared box is a slip, not a request for zero threads. */
  function saveThreads(next: string) {
    const typed = Number.parseInt(next, 10)
    if (!Number.isFinite(typed)) {
      setEditingThreads(false)
      return
    }
    void save({ encodeThreads: Math.min(Math.max(typed, 1), status.cpu.count) })
  }

  const level = PNG_LEVELS.some((option) => option.value === String(values.pngLevel))
    ? String(values.pngLevel)
    : '4'

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pt-8 pb-25">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="flex gap-1 text-lg font-bold tracking-tight">
            <span aria-hidden>🔌</span>
            Connection
          </h1>
          <p className="mt-1 text-sm text-muted">
            Which database and bucket this copy writes to. Set from a setup code made by{' '}
            <code>npm run app:code</code>, and kept in Windows Credential Manager — never in a file,
            and never in the app itself.
          </p>
        </div>

        <Readout label="Database" value={status.databaseHost} />
        <Readout label="Images" value={status.cdnUrl} />
        <Readout label="Site" value={status.siteUrl} />
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setChanging((was) => !was)}
            aria-pressed={changing}
            className={buttonToggle(changing)}
          >
            <span aria-hidden>🔁</span> Change connection
          </button>
          <HoldButton
            ms={1200}
            title="Hold to disconnect this machine"
            onHold={() =>
              void api.clearConnection().then((result) => {
                // Reloaded, so no screen keeps state from the board it was showing.
                if (result.ok) window.location.reload()
                else setDisconnectError(result.error)
              })
            }
            className={BUTTON_SM}
          >
            <span aria-hidden>⏏️</span> Hold to disconnect
          </HoldButton>
        </div>
        {disconnectError && <p className="text-sm text-[#ff5d5f]">{disconnectError}</p>}
        {changing && (
          <ConnectionForm onConnected={() => window.location.reload()} />
        )}

        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => void api.openDataFolder()} className={BUTTON_SM}>
            <span aria-hidden>📁</span> Open data folder
          </button>
          <span className="text-xs text-muted">
            <code>save.json</code> — these preferences, as plain JSON. Nothing secret is in it.
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="flex gap-1 text-lg font-bold tracking-tight">
            <span aria-hidden>🧵</span>
            Compression
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every upload keeps its own format and is compressed <em>losslessly</em>: JPEGs get
            optimized Huffman tables and progressive scans, PNGs a full oxipng pass, lossless WebPs
            libwebp&rsquo;s maximum effort. Each result is checked pixel for pixel against the
            original and kept only if it matches and is smaller. GIFs and lossy WebPs are stored as
            uploaded.
          </p>
        </div>

        <Field
          label="Encoder threads"
          placeholder={String(status.cpu.count)}
          display={`${values.encodeThreads} of ${status.cpu.count} cores`}
          hint="Fewer threads is the same result, only slower — and leaves the rest of the machine alone."
          value={String(values.encodeThreads)}
          editing={editingThreads}
          onEdit={() => setEditingThreads(true)}
          onSave={saveThreads}
          onCancel={() => setEditingThreads(false)}
        />

        <Choice
          label="PNG effort"
          value={level}
          options={PNG_LEVELS}
          onChange={(next) => void save({ pngLevel: Number(next) })}
          hint="How many filter and deflate strategies oxipng tries. Every level is lossless; higher is a little smaller and slower."
        />

        <Choice
          label="Zopfli for PNG"
          value={values.zopfli ? 'on' : 'off'}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'on', label: 'On' },
          ]}
          onChange={(next) => void save({ zopfli: next === 'on' })}
          hint="A few percent smaller again, at many times the time. Worth it for a handful of large PNGs, not for a batch of hundreds."
        />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="flex gap-1 text-lg font-bold tracking-tight">
            <span aria-hidden>🗃️</span>
            Cache
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every image this window has drawn, kept by its md5 — so it can never go stale — with the
            grid&rsquo;s resized copies beside it, and the collection list for a day. 🔄 Refresh on
            the collections screen reads the board again past the day.
          </p>
        </div>

        <Readout
          label="Held"
          value={`${status.cache.images} image${status.cache.images === 1 ? '' : 's'}, ${bytes(status.cache.bytes)}${
            status.cache.collectionsReadAt
              ? ` · list read ${new Date(status.cache.collectionsReadAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
              : ''
          }`}
        />
        <Readout label="Folder" value={status.cache.dir} />

        <div className="flex items-center gap-3">
          <HoldButton
            ms={700}
            title="Hold to clear the cache"
            onHold={() => void api.clearCache().then(onChanged)}
            className={BUTTON_SM}
          >
            <span aria-hidden>🧹</span> Hold to clear cache
          </HoldButton>
          <span className="text-xs text-muted">
            Nothing is lost — images are fetched again the next time they are drawn.
          </span>
        </div>
      </div>
    </div>
  )
}
