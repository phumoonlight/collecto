import { useState } from 'react'
import { collectionPostHref } from '@common/collections'
import { api, type CollectionPost } from '../api'
import { bytes, fullImageUrl } from '../image-url'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE, DANGER_ON_SURFACE } from './buttons'
import { HoldButton } from './hold-button'
import { ImageViewer } from './image-viewer'
import { FIELD, Panel } from './panel'
import { useDrawnBox } from './drawn-box'

/**
 * A tile's picture: the stored image cut to the tile's box — or, for an animated one, the stored
 * file as it is, since a cut copy is a still. The webview scales that one itself.
 */
function tileUrl(post: CollectionPost, drawn: string): string {
  return fullImageUrl(post.file_name, post.file_ext, post.animated ? undefined : drawn)
}

/** One tile, asking for its own image cut to its own box, loaded lazily. */
export function ImageCard({
  post,
  selected,
  current = false,
  onOpen,
  onView,
}: {
  post: CollectionPost
  /** Set only in manage, where a click selects rather than opens. */
  selected?: boolean
  /** The image the panel at the foot of the window is about. */
  current?: boolean
  onOpen: () => void
  /** A double click: straight to the full-size viewer. */
  onView?: () => void
}) {
  const [box, drawn] = useDrawnBox<HTMLDivElement>()

  return (
    <button
      type="button"
      onClick={onOpen}
      onDoubleClick={onView}
      title={`Image ${post.id}`}
      aria-pressed={selected}
      className={`group relative flex w-full flex-col overflow-hidden border bg-surface text-left transition-colors ${
        selected
          ? 'border-hover ring-2 ring-hover'
          : current
            ? 'border-hover outline-3 -outline-offset-3 outline-hover'
            : 'border-border hover:border-hover'
      }`}
      aria-current={current || undefined}
    >
      {selected !== undefined && (
        <span
          aria-hidden
          className={`absolute left-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full border text-xs ${
            selected
              ? 'border-hover bg-hover text-background'
              : 'border-foreground/60 bg-background/60 text-transparent'
          }`}
        >
          ✓
        </span>
      )}
      <div ref={box} className="grid h-(--row-h) place-items-center overflow-hidden bg-background">
        {drawn && (
          <img
            src={tileUrl(post, drawn)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
      </div>
    </button>
  )
}

/** How tall the panel's picture is drawn — a glance at which image this is. */
const PREVIEW_HEIGHT = 96

function Preview({ post, onView }: { post: CollectionPost; onView: () => void }) {
  const [box, drawn] = useDrawnBox<HTMLButtonElement>()
  const ratio = Math.min(2, post.width / Math.max(1, post.height))

  return (
    <button
      ref={box}
      type="button"
      onClick={onView}
      title="Look at the stored image at its full size"
      style={{ height: PREVIEW_HEIGHT, width: Math.round(PREVIEW_HEIGHT * ratio) }}
      className="shrink-0 overflow-hidden border border-border bg-background transition-colors hover:border-hover"
    >
      {drawn && (
        <img
          src={tileUrl(post, drawn)}
          alt=""
          decoding="async"
          className="h-full w-full object-cover"
        />
      )}
    </button>
  )
}

const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * What the row knows about the file, in one muted line: when it landed, its format, what it
 * weighs as stored — and what the lossless pass saved against the upload — its pixels, and how
 * many times the website has shown it.
 */
function Facts({ post }: { post: CollectionPost }) {
  const views = `${post.view_count.toLocaleString()} view${post.view_count === 1 ? '' : 's'}`
  const saved =
    post.original_size > post.file_size
      ? Math.round((100 * (post.original_size - post.file_size)) / post.original_size)
      : 0
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      <span title={post.created_at}>
        <span aria-hidden>📅</span> {DATE.format(new Date(post.created_at))}
      </span>
      <span className="uppercase">{post.file_ext}</span>
      <span
        title={`Uploaded ${bytes(post.original_size)}, stored ${bytes(post.file_size)} — losslessly`}
      >
        <span aria-hidden>💾</span> {bytes(post.file_size)}
        {saved > 0 && <span className="text-[#35c64a]"> −{saved}%</span>}
      </span>
      <span>
        <span aria-hidden>📐</span> {post.width}×{post.height}
      </span>
      <span>
        <span aria-hidden>👁️</span> {views}
      </span>
    </p>
  )
}

/**
 * One image's panel: its source, the way to look at it properly, and the way to remove it.
 * Its shelf is changed for a selection in 🗂️ Manage.
 *
 * **The source is read until it is asked to be edited** — a URL is long enough that its
 * middle is exactly where a stray paste lands. ✏️ Edit turns it into the box, ✅ Save writes
 * it, ✕ Cancel puts back what the board still holds.
 */
export function ImagePanel({
  post,
  slug,
  siteUrl,
  onClose,
  onChanged,
  onDeleted,
  viewing,
  onViewing,
  onStep,
}: {
  post: CollectionPost
  /** Its collection's address on the website (`collectionSlug`). */
  slug: string
  siteUrl: string
  /** Whether the full-size viewer is open — the shelf's, since ← / → swap this keyed panel. */
  viewing: boolean
  onViewing: (open: boolean) => void
  onStep: (delta: -1 | 1) => void
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const stored = post.source_url ?? ''
  const [source, setSource] = useState(stored)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (source === stored) {
      setEditing(false)
      return
    }
    const result = await api.saveCollectionPost({ id: post.id, sourceUrl: source })
    if (!result.ok) {
      setError(result.error)
      setSource(stored)
      return
    }
    setError(null)
    setEditing(false)
    onChanged()
  }

  return (
    <>
      <Panel
        title={`Image #${post.id}`}
        pinned="bottom"
        actions={
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={editing}
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>✏️</span> Edit
            </button>
            <button
              type="button"
              onClick={() => onViewing(true)}
              title="Look at the stored image at its full size"
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>🔍</span> Full size
            </button>
            {siteUrl && (
              <button
                type="button"
                onClick={() =>
                  void api.openExternal(`${siteUrl}${collectionPostHref(slug, post.id)}`)
                }
                className={BUTTON_ON_SURFACE}
              >
                <span aria-hidden>🌐</span> Open
              </button>
            )}
          </>
        }
        close={
          <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
            <span aria-hidden>✕</span> Close
          </button>
        }
      >
        <div className="flex gap-3">
          <Preview post={post} onView={() => onViewing(true)} />
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
            className="grid min-w-0 flex-1 grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-xs text-muted"
          >
            <label htmlFor={`source-${post.id}`} className={editing ? 'pt-2.5' : ''}>
              Source
            </label>
            {editing ? (
              // Grows to show the whole address: the tail of a URL is the part that differs.
              <textarea
                id={`source-${post.id}`}
                autoFocus
                rows={1}
                value={source}
                onChange={(event) => setSource(event.target.value.replace(/\s*\n\s*/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="https://www.pixiv.net/en/artworks/91502032"
                spellCheck={false}
                className={`${FIELD} min-w-0 resize-none py-2 break-all text-foreground field-sizing-content`}
              />
            ) : stored ? (
              <button
                type="button"
                onClick={() => void api.openExternal(stored)}
                title="Open the source in your browser"
                className="min-w-0 justify-self-start break-all text-left text-accent hover:underline"
              >
                {stored}
              </button>
            ) : (
              <span>No source</span>
            )}

            <div className="col-span-2 mt-2">
              <Facts post={post} />
            </div>
            {error && <p className="col-span-2 text-[#ff5d5f]">{error}</p>}

            {editing && (
              <div className="col-span-2 flex justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setSource(stored)
                    setEditing(false)
                    setError(null)
                  }}
                  className={BUTTON_ON_SURFACE}
                >
                  <span aria-hidden>✕</span> Cancel
                </button>
                <button type="submit" className={BUTTON_SUBMIT_ON_SURFACE}>
                  <span aria-hidden>✅</span> Save
                </button>
              </div>
            )}
          </form>
          {/* Held for two seconds: the one control here that cannot be taken back — the row
              goes and both stored objects with it. */}
          <HoldButton
            ms={2000}
            fill="bg-[#ff5d5f]/30"
            title="Hold for two seconds to delete"
            onHold={() => {
              void api.deleteCollectionPost(post.id).then((result) => {
                if (result.ok) onDeleted()
                else setError(result.error)
              })
            }}
            className={`${DANGER_ON_SURFACE} ml-12 self-end`}
          >
            <span aria-hidden>🗑️</span> Hold to delete
          </HoldButton>
        </div>
      </Panel>

      {viewing && (
        <ImageViewer
          src={fullImageUrl(post.file_name, post.file_ext)}
          label={`Image ${post.id}`}
          onClose={() => onViewing(false)}
          onStep={onStep}
        />
      )}
    </>
  )
}
