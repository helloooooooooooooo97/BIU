/** py-1 + leading-5 + margin-bottom 1px on `.chat-session-row`. */
export const SESSION_ROW_PX = 29
export const SESSION_WINDOW_OVERSCAN = 4
export const SESSION_WINDOW_VIEWPORT_FALLBACK = 720

export type SessionWindowSlice = {
  start: number
  end: number
  padTop: number
  padBottom: number
}

export const EMPTY_SESSION_WINDOW: SessionWindowSlice = { start: 0, end: 0, padTop: 0, padBottom: 0 }

export function sessionWindowSlice(
  count: number,
  scrollTop: number,
  viewportH: number,
  rowPx = SESSION_ROW_PX,
  overscan = SESSION_WINDOW_OVERSCAN,
): SessionWindowSlice {
  if (count <= 0) return EMPTY_SESSION_WINDOW
  const view = viewportH > 0 ? viewportH : SESSION_WINDOW_VIEWPORT_FALLBACK
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowPx) - overscan)
  const visible = Math.ceil(view / rowPx) + overscan * 2
  const end = Math.min(count, start + Math.max(visible, 1))
  return {
    start,
    end,
    padTop: start * rowPx,
    padBottom: Math.max(0, count - end) * rowPx,
  }
}

export function sessionWindowUnchanged(
  count: number,
  prev: { top: number; height: number },
  next: { top: number; height: number },
  rowPx = SESSION_ROW_PX,
) {
  if (prev.top === next.top && prev.height === next.height) return true
  const a = sessionWindowSlice(count, prev.top, prev.height, rowPx)
  const b = sessionWindowSlice(count, next.top, next.height, rowPx)
  return a.start === b.start && a.end === b.end && a.padTop === b.padTop && a.padBottom === b.padBottom
}

/** Spacer covering the whole list so an off-screen group does not paint mascots. */
export function sessionWindowHidden(count: number, rowPx = SESSION_ROW_PX): SessionWindowSlice {
  if (count <= 0) return EMPTY_SESSION_WINDOW
  return { start: 0, end: 0, padTop: 0, padBottom: count * rowPx }
}

export function sessionWindowFromHost(
  count: number,
  host: HTMLElement,
  scroller: HTMLElement,
  rowPx = SESSION_ROW_PX,
  overscan = SESSION_WINDOW_OVERSCAN,
): SessionWindowSlice {
  if (count <= 0) return EMPTY_SESSION_WINDOW
  const hostRect = host.getBoundingClientRect()
  const scrollerRect = scroller.getBoundingClientRect()
  const slack = overscan * rowPx
  // Folded/off-screen groups have no box. A one-row group can measure under
  // `rowPx` after subpixel rounding; treating that as hidden flash-loops.
  if (
    hostRect.height <= 0 ||
    hostRect.bottom < scrollerRect.top - slack ||
    hostRect.top > scrollerRect.bottom + slack
  ) {
    return sessionWindowHidden(count, rowPx)
  }
  const top = Math.max(0, scrollerRect.top - hostRect.top)
  const view = scroller.clientHeight || scrollerRect.height || SESSION_WINDOW_VIEWPORT_FALLBACK
  return sessionWindowSlice(count, top, view, rowPx, overscan)
}

export function chatScrollRoot(from: HTMLElement | null) {
  return from?.closest('[data-chat-scroll]') as HTMLElement | null
}
