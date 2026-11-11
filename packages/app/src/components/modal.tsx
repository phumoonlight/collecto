import { useEffect } from 'react'
import { BUTTON_ON_SURFACE } from './buttons'
import { Panel } from './panel'

/**
 * A `Panel` over everything, for a short form that has no business being as wide as the
 * screen — naming or editing a shelf is four controls, and laid inline across a 1800px column
 * the name box alone ran to a metre of empty field.
 *
 * Escape, ✕ Close or a click on the dimmed ground closes it; a click inside does not. It
 * says nothing about saving — the form inside does that, and closes it through `onClose`
 * when it lands.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-40 grid place-items-center bg-background/80 p-4"
    >
      <div onClick={(event) => event.stopPropagation()} className="w-full max-w-lg">
        <Panel
          title={title}
          actions={
            <button type="button" onClick={onClose} className={BUTTON_ON_SURFACE}>
              <span aria-hidden>✕</span> Close
            </button>
          }
        >
          {children}
        </Panel>
      </div>
    </div>
  )
}
