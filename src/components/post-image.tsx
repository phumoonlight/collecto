'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { BLUR_DATA_URL } from '@/lib/misc'

/**
 * The post in the page, and pressing it opens it over the page with nothing else on
 * screen.
 *
 * In the document the picture shares the window with a header, a search box and whatever
 * of the tags reaches over the fold, and it is capped at `78dvh` so that it does. Opened,
 * it has the whole viewport and is fitted to *that* — which is the difference between the
 * two views, and the whole of it. It opens over the page rather than growing in place:
 * an image that expands mid-document pushes the tags below it a screen and a half down
 * and leaves the reader somewhere they did not scroll to.
 *
 * **Fitted, never scrolled.** A dialog the picture is bigger than is a picture you look
 * at through a letterbox — panning around a post to find out what it is of is worse than
 * seeing all of it slightly smaller, and the point of opening it was to see all of it.
 *
 * A real `<dialog>`, opened with `showModal`, because everything a lightbox has to get
 * right is already in it — Escape closes it, focus is trapped inside it, the rest of the
 * page is inert, and `::backdrop` is the dim without a div. What is left to write is the
 * click, which is the one gesture the element has no opinion about.
 *
 * There is no ✕. The picture opens by being pressed and closes the same way, and a
 * button in the corner is a second way to do the one thing in here — drawn over the post
 * it was covering, which is what opening it was for.
 *
 * `unoptimized` on purpose, in both views: the detail page shows the stored file
 * byte-for-byte. That file is the upload in its own format, compressed losslessly by the app,
 * so it already is the best version this site holds — running it through the Next optimizer
 * would re-encode it lossily and strip animation. The grid uses the thumbnail instead.
 */
/**
 * A modal dialog makes the page behind it inert, but not still: the wheel still scrolls
 * the document under the backdrop, so the picture is let go of and the reader closes the
 * dialog somewhere else entirely. Restoring the value rather than clearing it leaves a
 * page that set its own overflow the way it was.
 */
let pageOverflow = ''

function lockPage() {
  pageOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockPage() {
  document.body.style.overflow = pageOverflow
}

export function PostImage({
  src,
  alt,
  width,
  height,
}: {
  src: string
  alt: string
  width: number
  height: number
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  // Only so the opened copy is not in the markup — and not in flight — until it is
  // asked for. Closing leaves it mounted: having opened it once, opening it again is a
  // press that should show the picture rather than fetch it back.
  const [opened, setOpened] = useState(false)

  const open = () => {
    setOpened(true)
    dialog.current?.showModal()
    lockPage()
  }

  return (
    <div className="flex justify-center">
      {/* The picture is the control. A button parked in its corner was a thing to find
          before you could look closer, and it was furniture the image had to be seen
          through — where the one gesture anybody tries on a picture they want a better
          look at is clicking the picture. `cursor-zoom-in` is what says so before the
          click, since a bare image says nothing about being pressable.

          **It is also a stage of a fixed height.** Sized to the picture, the box was as
          tall as whatever post was in it, so every step of the walk moved the tags under
          it — a portrait post pushed them a screen down and the landscape one after it
          pulled them back up, which is a page rebuilding itself around each image rather
          than showing a different one. At one height the header, the picture and the
          words below it stay where they are and only the picture changes. The image is
          still never enlarged past its own pixels: a small post sits in the middle of the
          stage rather than being blown up to fill it. */}
      <button
        type="button"
        onClick={open}
        title="Open the picture"
        className="flex h-[78dvh] w-full cursor-zoom-in items-center justify-center"
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          priority
          unoptimized
          className="h-auto max-h-full w-auto max-w-full object-contain"
        />
        <span className="sr-only">Open the picture</span>
      </button>

      <dialog
        ref={dialog}
        // Anywhere closes it — the backdrop, the picture, the space either side. Opened
        // by pressing the picture and closed by pressing it again is one gesture with
        // one undo, and there is nothing else in here to press by accident.
        onClick={() => dialog.current?.close()}
        onClose={() => unlockPage()}
        aria-label={alt}
        className="m-0 h-dvh max-h-dvh w-dvw max-w-dvw overflow-hidden bg-transparent p-0 backdrop:bg-black/85 backdrop:backdrop-blur-sm"
      >
        {/* The dialog is the whole viewport, so the centring happens in here rather than
            in its own margins — `margin: auto` centres a box around its contents, and
            this box has the screen's shape whatever is in it. */}
        <div className="flex h-full w-full items-center justify-center">
          {opened && (
            <>
              {/* Sized against this box, which is the viewport — so the picture is
                  fitted to the screen and there is nothing to scroll. */}
              <Image
                src={src}
                alt={alt}
                width={width}
                height={height}
                unoptimized
                className="h-auto max-h-full w-auto max-w-full cursor-zoom-out object-contain"
              />
            </>
          )}
        </div>
      </dialog>
    </div>
  )
}
