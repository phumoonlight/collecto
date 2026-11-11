/**
 * The bordered card every form in this window sits in, and the field inside it.
 */

/** The shared shell for the panels: a bordered card that names what it is. */
export function Panel({
  title,
  children,
  actions,
  close,
  pinned = false,
}: {
  title: string
  children: React.ReactNode
  /**
   * What the panel does *as a panel* — leave it, open it elsewhere, destroy it — beside
   * its heading rather than below its fields. They are not part of the form: Save answers
   * the boxes, these answer the thing the panel is about, and mixing the two put Close where
   * a return key lands and Delete a tab away from a text field.
   */
  actions?: React.ReactNode
  /**
   * The way out, held apart at the far right. Given, the heading becomes three columns with
   * `actions` centred between the title and this — so leaving the panel is never one
   * button along from the things that act on what it is about.
   */
  close?: React.ReactNode
  /**
   * Stay at the top of the scroller while the list moves under it; `'bottom'` holds it at
   * the foot instead — an image's panel, drawn after the grid it belongs to, which can be a
   * long way up or down from the tile it was opened from.
   */
  pinned?: boolean | 'bottom'
}) {
  const card = (
    <section className="flex flex-col gap-2 border border-border bg-surface px-3 py-3">
      {close ? (
        // A step more air under this heading than the plain one: its buttons are boxed, and
        // a row of boxes sitting on the first line of the body read as one crowded block.
        <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
          {/* One joined group: each button laid over its neighbour's border by a pixel, so
              the seams are single hairlines, and the hovered one lifted so its green edge
              is drawn whole rather than half under the next. */}
          <div className="flex items-center *:relative [&>*+*]:-ml-px *:hover:z-10">
            {actions}
          </div>
          <div className="flex justify-end">{close}</div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )

  if (!pinned) return card

  // The same band at the foot of the scroller, for a panel drawn *after* what it is about
  // (sticky bottom only holds an element whose place is below the fold). The card is capped
  // and centred: a few fields and a row of buttons stretched across a 1800px column put the
  // title a screen-width from the controls that act on it.
  if (pinned === 'bottom')
    return (
      <div className="sticky bottom-0 z-10 pb-4">
        <div className="mx-auto max-w-4xl shadow-[0_-10px_25px_-3px] shadow-background">{card}</div>
      </div>
    )

  // The gap above the card is part of what sticks, so the list scrolls *under* a strip of
  // page rather than up against the header. `-mt-4` and `pt-4` are the parent's own
  // `gap-4` taken back and reinstated as padding: at rest the spacing is unchanged, and
  // pinned it is an opaque band nothing can show through.
  return (
    <div className="sticky top-0 z-10 -mt-4 bg-background pt-4 shadow-lg shadow-background/80">
      {card}
    </div>
  )
}

export const FIELD =
  'min-h-9 border border-border bg-background px-3 text-sm outline-none focus:border-hover'
