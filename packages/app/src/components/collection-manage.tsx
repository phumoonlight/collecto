import { useState } from 'react'
import { shelfTitle } from '@common/collections'
import { api, type Collection } from '../api'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD } from './panel'

/**
 * The bar under a shelf's title while 🗂️ Manage is on: how many are selected, selecting all
 * or none of what is loaded, and moving the selection onto another shelf. Nothing moves until
 * ➡️ Change collection is pressed, so choosing from the menu is not the write. No object
 * moves either — which shelf an image is on is one column.
 */
export function ManageBar({
  collectionId,
  collections,
  selected,
  loaded,
  onSelectAll,
  onClear,
  onMoved,
}: {
  collectionId: number
  collections: Collection[]
  selected: number[]
  /** How many images are on screen — what Select all takes. */
  loaded: number
  onSelectAll: () => void
  onClear: () => void
  onMoved: (moved: number) => void
}) {
  const others = collections.filter((collection) => collection.id !== collectionId)
  const [target, setTarget] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function move() {
    if (busy || target === '' || selected.length === 0) return
    setBusy(true)
    setError(null)
    const result = await api.moveCollectionPosts(selected, target)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onMoved(result.moved)
  }

  return (
    <section className="flex flex-col gap-2 border border-accent/40 bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          {selected.length} selected
          <span className="text-muted"> of {loaded}</span>
        </span>
        <button type="button" onClick={onSelectAll} className={BUTTON_ON_SURFACE}>
          <span aria-hidden>☑️</span> Select all
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={selected.length === 0}
          className={BUTTON_ON_SURFACE}
        >
          <span aria-hidden>⬜</span> Select none
        </button>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={target}
            onChange={(event) =>
              setTarget(event.target.value === '' ? '' : Number(event.target.value))
            }
            aria-label="Move to collection"
            className={`${FIELD} bg-background`}
          >
            <option value="">Move to…</option>
            {others.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {shelfTitle(collection)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void move()}
            disabled={busy || target === '' || selected.length === 0}
            className={BUTTON_SUBMIT_ON_SURFACE}
          >
            <span aria-hidden>➡️</span> {busy ? 'Moving…' : 'Change collection'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
    </section>
  )
}
