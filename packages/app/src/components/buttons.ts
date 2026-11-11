/**
 * How a button is drawn in this window, in one place: an emoji, its words, in a square box
 * with a hairline border. Hover adds a ground and the green `--hover` border.
 *
 * The hover ground has to be a step from what the button sits on, so there are two:
 * `hover:bg-surface` on the page, `hover:bg-background` inside a panel (already `bg-surface`).
 * Separate constants rather than two classes in one list, because two `hover:bg-*` utilities
 * on one element are decided by stylesheet order, not by the order they are written.
 */

/** Disabled is `muted`, and the emoji in its `aria-hidden` span is dimmed beside it. */
const DISABLED =
  'disabled:cursor-default disabled:text-muted disabled:hover:border-border disabled:hover:bg-transparent disabled:[&_[aria-hidden]]:opacity-40'

const SHAPE = `group flex shrink-0 items-center gap-1.5 border transition-colors ${DISABLED}`

const LIT = 'border-accent text-accent hover:border-hover'

const QUIET = 'border-border text-muted hover:border-hover hover:text-foreground'

/** The default: a control on the page's own ground. */
export const BUTTON = `${SHAPE} ${QUIET} min-h-9 px-2 text-sm hover:bg-surface`

/** The same, smaller — a control that rides beside a line of text. */
export const BUTTON_SM = `${SHAPE} ${QUIET} min-h-8 px-2 text-xs hover:bg-surface`

/** For a button inside a panel or a bordered row, which is already `bg-surface`. */
export const BUTTON_ON_SURFACE = `${SHAPE} ${QUIET} min-h-8 px-2 text-xs hover:bg-background`

/** A delete inside a panel, in red — drawn on a `HoldButton`, whose sweep fills it. */
export const DANGER_ON_SURFACE = `${SHAPE} min-h-8 px-2 text-xs border-[#ff5d5f]/50 text-[#ff5d5f] hover:border-[#ff5d5f] hover:bg-background hover:text-[#ff8a8b]`

/** A button that opens something which stays open — accent while it is showing. */
export const buttonToggle = (active: boolean): string =>
  `${SHAPE} min-h-9 px-2 text-sm hover:bg-surface ${active ? LIT : QUIET}`

/** The one that finishes a form — solid accent, so the way out is found without reading. */
const SOLID =
  'border-accent bg-accent font-semibold text-background hover:border-hover hover:bg-hover disabled:border-border disabled:bg-transparent'

export const BUTTON_SUBMIT = `${SHAPE} min-h-9 px-3 text-sm ${SOLID}`

/** The same, inside a panel — a filled button reads the same on either ground. */
export const BUTTON_SUBMIT_ON_SURFACE = BUTTON_SUBMIT

/** A pair of segments in a track — one control with two positions. `role="group"`. */
export const SEGMENTS = 'flex items-center gap-0.5 border border-border p-0.5'

/** One position of it. Filled is *on*. */
export const segment = (active: boolean): string =>
  `flex shrink-0 items-center gap-1 px-2 py-0.5 text-xs transition-colors ${
    active ? 'bg-accent font-semibold text-background' : 'text-muted hover:text-foreground'
  }`
