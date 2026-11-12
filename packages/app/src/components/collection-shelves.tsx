import { useCallback, useMemo, useState } from 'react'
import { collectionSlug, shelfTitle } from '@common/collections'
import { api, type Collection } from '../api'
import { fullImageUrl } from '../image-url'
import { BUTTON, buttonToggle } from './buttons'
import { FIELD } from './panel'
import { Modal } from './modal'
import { CollectionForm } from './collection-form'
import { useDrawnBox } from './drawn-box'

/** Cards drawn at first, and what Load more adds. */
const PAGE = 20

/**
 * Every shelf, as cards. The cover is the newest image on it, decided by the query.
 *
 * **The search is over the list already here, not a read.** The window holds the list whole
 * — it has to, since a selection can be moved to any other shelf — so a search on Enter
 * answers at once.
 */
export function ShelfList({
  collections,
  loading,
  error,
  onRefresh,
  onOpen,
  onCreated,
}: {
  collections: Collection[]
  loading: boolean
  /** Why the board could not be read, if it could not. */
  error: string | null
  onRefresh: () => void
  onOpen: (id: string) => void
  onCreated: (id: string) => void
}) {
  const [naming, setNaming] = useState(false)
  const closeNaming = useCallback(() => setNaming(false), [])
  // What is typed, and what the list is narrowed by — apart, because a search runs on Enter.
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  // Pages the drawing, not the read: each card is a full-size image to cut.
  const [limit, setLimit] = useState(PAGE)
  const search = (value: string) => {
    setDraft(value)
    setQuery(value)
    setLimit(PAGE)
  }

  // The mark, the address and the id are searched with the name: all are how a shelf gets
  // referred to.
  const needle = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      needle === ''
        ? collections
        : collections.filter(
            (collection) =>
              shelfTitle(collection).toLowerCase().includes(needle) ||
              collection.id === needle ||
              (collection.ref_id?.includes(needle) ?? false)
          ),
    [collections, needle]
  )

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 pt-4 pb-25">
      {/* Three columns, the outer two equal, so the search sits at the true centre. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold tracking-tight">🗂️ Collections</h1>
          <span className="text-xs text-muted">
            {loading
              ? 'reading…'
              : needle === ''
                ? `${collections.length} collection${collections.length === 1 ? '' : 's'}`
                : `${shown.length} of ${collections.length}`}
          </span>
        </div>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            search(draft)
          }}
          className="flex items-center gap-1"
        >
          <div className="relative">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Search collections"
              placeholder="Search collections…"
              spellCheck={false}
              className={`${FIELD} w-48 pr-8 sm:w-72`}
            />
            {(draft !== '' || query !== '') && (
              <button
                type="button"
                onClick={() => search('')}
                title="Clear the search"
                aria-label="Clear the search"
                className="absolute inset-y-0 right-0 px-2 text-xs text-muted hover:text-foreground"
              >
                <span aria-hidden>✕</span>
              </button>
            )}
          </div>
          <button type="submit" className={BUTTON}>
            <span aria-hidden>🔍</span> Search
          </button>
        </form>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setNaming((was) => !was)}
            aria-pressed={naming}
            className={buttonToggle(naming)}
          >
            <span aria-hidden>➕</span> New collection
          </button>
          <button type="button" onClick={onRefresh} disabled={loading} className={BUTTON}>
            <span aria-hidden className={`transition-opacity ${loading ? 'opacity-30' : ''}`}>
              🔄
            </span>
            Refresh
          </button>
        </div>
      </div>

      {naming && (
        <Modal title="New collection" onClose={closeNaming}>
          <CollectionForm
            initial={{ name: '', mark: '', refId: '' }}
            submitLabel="Create"
            onSubmit={async (input) => {
              const result = await api.createCollection(input)
              if (!result.ok) return result.error
              setNaming(false)
              onCreated(result.id)
              return null
            }}
          />
        </Modal>
      )}

      {error && (
        <p className="border border-[#ff5d5f]/40 bg-surface px-3 py-2 text-sm text-[#ff5d5f]">
          Could not read the board: {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {loading
            ? 'Loading…'
            : needle !== ''
              ? `Nothing here is called “${query.trim()}”.`
              : error
                ? 'Nothing to show.'
                : 'No collections yet. ➕ New collection names one.'}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,322px)] justify-center gap-0.5">
            {shown.slice(0, limit).map((collection) => (
              <li key={collection.id}>
                <ShelfCard collection={collection} onOpen={() => onOpen(collection.id)} />
              </li>
            ))}
          </ul>
          {shown.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((was) => was + PAGE)}
              className={`${BUTTON} mx-auto`}
            >
              <span aria-hidden>⬇️</span> Load {Math.min(PAGE, shown.length - limit)} more
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ShelfCard({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const { cover_file_name: cover, cover_file_ext: coverExt, cover_animated: moving } = collection
  const images = `${collection.post_count} image${collection.post_count === 1 ? '' : 's'}`
  const [box, drawn] = useDrawnBox<HTMLDivElement>()
  // Cut from the top: most covers are portraits, and a square from the middle is a torso. An
  // animated cover is the stored file (a cut copy would be a still); `object-top` crops it.
  const grid = moving ? undefined : `${drawn}-top`
  const src = cover && coverExt && drawn ? fullImageUrl(cover, coverExt, grid) : ''

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Open ${shelfTitle(collection)}`}
      className="group flex w-full flex-col overflow-hidden border border-border bg-surface text-left transition-colors hover:border-hover"
    >
      <div
        ref={box}
        className="grid aspect-square place-items-center overflow-hidden bg-background"
      >
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-top"
          />
        ) : cover ? null : (
          <span aria-hidden className="text-2xl opacity-40">
            🗂️
          </span>
        )}
      </div>
      <span className="flex flex-col gap-0.5 px-1.5 py-1">
        <span className="line-clamp-2 text-xs font-semibold">{shelfTitle(collection)}</span>
        <span className="text-[11px] text-muted">
          /{collectionSlug(collection)} · {images}
        </span>
      </span>
    </button>
  )
}
