import { useState } from 'react'
import { BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD } from './panel'

export type CollectionInput = { name: string; mark: string }

/**
 * What a shelf is — its mark and its name — as one form, for naming a new one and for
 * editing one. `onSubmit` answers with the refusal to show, or null once it has landed.
 */
export function CollectionForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: CollectionInput
  submitLabel: string
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

      <div className="flex items-center gap-2 border-t border-border pt-3">
        {error && <p className="text-xs text-[#ff5d5f]">{error}</p>}
        <button type="submit" disabled={busy} className={`${BUTTON_SUBMIT_ON_SURFACE} ml-auto`}>
          <span aria-hidden>✅</span> {submitLabel}
        </button>
      </div>
    </form>
  )
}
