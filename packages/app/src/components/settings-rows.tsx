import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { BUTTON_ON_SURFACE } from './buttons'

/**
 * The three shapes a setting takes on this screen: something you can only read, something
 * you type, and something you pick. Kept together because what they are is one decision —
 * a row is a label, a bordered strip and at most one control — and apart from the screen
 * because that screen is otherwise a list of sections.
 */

/** Something the app knows and you cannot change — same row, without the Edit. */
export function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {label}
      <div className="flex min-h-11 items-center border border-border bg-surface px-3">
        <span className={`min-w-0 flex-1 truncate font-mono text-xs ${value ? '' : 'text-muted'}`}>
          {value || 'Not set'}
        </span>
      </div>
    </div>
  )
}

/**
 * A setting with three answers rather than a value to type. No Edit step: the options
 * are already on screen, so an extra click to reveal what you can pick would buy the
 * protection a long typed value needs and this one does not.
 */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {label}
      <div
        role="radiogroup"
        aria-label={label}
        className="flex min-h-11 items-center gap-1 border border-border bg-surface p-1"
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-9 flex-1 px-2 text-xs transition-colors ${
                selected
                  ? 'bg-accent text-background'
                  : 'text-muted hover:bg-background hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

/**
 * A setting, shown. Edit swaps the row for the editor below, which is its own component
 * so it mounts with the current value as its draft and takes it away again on Cancel —
 * there is nowhere for a half-typed value to linger.
 */
export function Field({
  label,
  value,
  editing,
  onEdit,
  onSave,
  onCancel,
  placeholder,
  hint,
  display,
}: {
  label: string
  value: string
  editing: boolean
  onEdit: () => void
  onSave: (next: string) => void
  onCancel: () => void
  placeholder?: string
  hint?: string
  /** What the row shows when it isn't being edited, if that differs from what you type
   *  into it — a thread count reads better as "6 of 16 cores" than as a bare 6. */
  display?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {label}
      {editing ? (
        <Editor value={value} onSave={onSave} onCancel={onCancel} placeholder={placeholder} />
      ) : (
        <div className="flex min-h-11 items-center gap-2 border border-border bg-surface px-3">
          <span
            className={`min-w-0 flex-1 truncate font-mono text-xs ${value ? '' : 'text-muted'}`}
          >
            {display ?? (value || 'Not set')}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className={`${BUTTON_ON_SURFACE} whitespace-nowrap`}
          >
            <span aria-hidden>✏️</span> {value ? 'Edit' : 'Set'}
          </button>
        </div>
      )}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

function Editor({
  value,
  onSave,
  onCancel,
  placeholder,
}: {
  value: string
  onSave: (next: string) => void
  onCancel: () => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave(draft)
  }

  // Escape is the way out. Blur deliberately is not: reaching Save means clicking away
  // from the input, and a cancel on blur would take the edit with it on the way there.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') onCancel()
  }

  return (
    <form
      onSubmit={submit}
      className="flex min-h-11 items-center gap-2 border border-accent bg-surface px-3"
    >
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none"
      />
      <button type="button" onClick={onCancel} className={BUTTON_ON_SURFACE}>
        Cancel
      </button>
      <button type="submit" className={`${BUTTON_ON_SURFACE} whitespace-nowrap`}>
        <span aria-hidden>💾</span> Save
      </button>
    </form>
  )
}
