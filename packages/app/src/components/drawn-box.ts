import { useEffect, useRef, useState } from 'react'

/**
 * The box this ref is on, in device pixels, as `<width>x<height>` — what a tile asks main to
 * resize and crop to (`main/grid-image.ts`), so the window draws the copy 1:1 and does no
 * scaling of its own. Null until the box is measured.
 *
 * Measured rather than computed from `--row-h`, because the same picture is a row tile, a
 * square shelf cover and an artist's example, each sized by different rules, and the box is
 * the one answer all three already agree on — a shelf cover does not even know its image's
 * shape. A resize that changes the answer (a breakpoint, a screen with another scale) asks
 * again; main caches each size.
 */
export function useDrawnBox<T extends HTMLElement>(): [React.RefObject<T | null>, string | null] {
  const ref = useRef<T>(null)
  const [drawn, setDrawn] = useState<string | null>(null)

  useEffect(() => {
    const box = ref.current
    if (!box) return
    const measure = () => {
      // The padding box — inside any border, which is where an `h-full w-full` image sits
      const { clientWidth: width, clientHeight: height } = box
      if (width === 0 || height === 0) return
      const scale = window.devicePixelRatio
      setDrawn(`${Math.round(width * scale)}x${Math.round(height * scale)}`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  return [ref, drawn]
}
