import { useEffect } from 'react'

/**
 * One stored image, full size, over everything.
 *
 * Escape or a click anywhere closes it — the picture included, since clicking a tile is what
 * opened it and clicking again is the natural way back. ← / → step through the caller's
 * sequence where it has one.
 *
 * `src` is the `board-image://` address of the stored file (`main/image-protocol.ts`), served
 * from the disk cache the grid already filled — so opening an image the grid has drawn
 * costs no download, and nothing multi-megabyte crosses the bridge as base64.
 */
export function ImageViewer({
  src,
  label,
  onClose,
  onStep,
}: {
  src: string
  label: string
  onClose: () => void
  /** ← / → to the previous / next image, where the caller has a sequence to walk. */
  onStep?: (delta: -1 | 1) => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (onStep && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        onStep(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onStep])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4"
    >
      <img src={src} alt="" className="min-h-0 flex-1 cursor-zoom-out object-contain" />
    </div>
  )
}
