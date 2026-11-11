import { useEffect, useRef, useState } from 'react'

/** How long a press has to last by default. Long enough that a click on the way past cannot
 *  reach it, short enough that meaning it does not feel like waiting. */
const HOLD_MS = 700

/**
 * A button that acts only when held.
 *
 * For a control with no undo that sits where a pointer passes often — Mark as read, which
 * moves an artist from wherever you are looking to the bottom of the list, and deleting a
 * collection image, which takes two stored objects with it (held for two seconds). A confirmation
 * dialog would be a second click on every single use; a hold costs a moment on every use
 * and a stray click nothing. The fill sweeping across the button is the progress, so
 * letting go early visibly takes it back.
 *
 * Space and Enter hold it too, so it is not a pointer-only control; key repeat is ignored,
 * since a held key fires `keydown` over and over.
 */
export function HoldButton({
  onHold,
  disabled = false,
  className,
  title,
  ms = HOLD_MS,
  fill = 'bg-accent/25',
  children,
}: {
  onHold: () => void
  disabled?: boolean
  className: string
  title?: string
  /** How long the hold is. Longer for a control that destroys something. */
  ms?: number
  /** The sweep's colour class, so a destructive hold can fill in the colour it is drawn in. */
  fill?: string
  children: React.ReactNode
}) {
  const [progress, setProgress] = useState(0)
  const frame = useRef<number | null>(null)
  const started = useRef(0)

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    setProgress(0)
  }

  const start = () => {
    if (disabled || frame.current !== null) return
    started.current = performance.now()
    const tick = (now: number) => {
      const done = Math.min(1, (now - started.current) / ms)
      setProgress(done)
      if (done < 1) {
        frame.current = requestAnimationFrame(tick)
        return
      }
      frame.current = null
      setProgress(0)
      onHold()
    }
    frame.current = requestAnimationFrame(tick)
  }

  // A button unmounted mid-hold — the list re-sorting under it — must not fire afterwards.
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    []
  )

  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? 'Hold to confirm'}
      onPointerDown={(event) => {
        if (event.button === 0) start()
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault()
          start()
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop()
      }}
      onBlur={stop}
      className={`relative overflow-hidden ${className}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 ${fill}`}
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative flex items-center gap-1.5">{children}</span>
    </button>
  )
}
