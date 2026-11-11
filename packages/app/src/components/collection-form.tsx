import { useState } from 'react'
import { BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD } from './panel'

/** `refId` is the web address segment — `/collections/<refId>` — or '' for the id. */
export type CollectionInput = { name: string; mark: string; refId: string }

/**
 * What a shelf is — its mark, its name and, when editing, its web address — as one form.
 * A new collection's address is made from its name by the app (`names::ref_id_from_name`), so
 * the field is only drawn for an edit (`withAddress`). `onSubmit` answers with the refusal to
 * show, or null once it has landed.
 */
export function CollectionForm({
  initial,
  submitLabel,
  withAddress = false,
  onSubmit,
}: {
  initial: CollectionInput
  submitLabel: string
  /** Draw the address field — the edit form only. */
  withAddress?: boolean
  onSubmit: (input: CollectionInput) => Promise<string | null>
}) {
  const [input, setInput] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    setBusy(true)
    const refusal = await onSubmit(input)
    setBusy(false)
    setError(refusal)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex gap-2">
        <label className="flex w-20 shrink-0 flex-col gap-1 text-xs text-muted">
          Mark
          <input
            value={input.mark}
            onChange={(event) => setInput({ ...input, mark: event.target.value })}
            placeholder="🎴"
            className={`${FIELD} w-full text-foreground`}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Name
          <input
            autoFocus
            value={input.name}
            onChange={(event) => setInput({ ...input, name: event.target.value })}
            placeholder="My collection"
            className={`${FIELD} w-full text-foreground`}
          />
        </label>
      </div>

      {withAddress && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Address
          <div className={`${FIELD} flex items-center gap-0.5 font-mono text-foreground`}>
            <span className="text-muted">/collections/</span>
            <input
              value={input.refId}
              onChange={(event) => setInput({ ...input, refId: event.target.value })}
              placeholder="ukiyoe_studies"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </div>
          <span>
            a–z and 0–9, with single _ or - between them. Empty uses the collection&rsquo;s id.
            Changing it breaks links to the old address.
          </span>
        </label>
      )}

      {!withAddress && (
        <p className="text-xs text-muted">
          The web address is made from the name — lowercase, spaces as _, other characters left out
          — and can be changed later under ✏️ Edit.
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
        <button type="submit" disabled={busy} className={`${BUTTON_SUBMIT_ON_SURFACE} ml-auto`}>
          <span aria-hidden>✅</span> {submitLabel}
        </button>
      </div>
    </form>
  )
}
