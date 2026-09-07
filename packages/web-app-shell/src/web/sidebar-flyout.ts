export const SIDEBAR_FLYOUT_EDGE = 20
export const SIDEBAR_FLYOUT_HIDE_MS = 240
export const SIDEBAR_FLYOUT_KEEP = '.brand-agent-menu, .chat-sidebar-popover, [data-sidebar-flyout-keep]'

export function shouldKeepSidebarFlyout(
  clientX: number,
  peeking: boolean,
  panelWidth: number,
  viewportWidth = Number.POSITIVE_INFINITY,
) {
  if (clientX < 0 || clientX > viewportWidth) return false
  if (clientX <= SIDEBAR_FLYOUT_EDGE) return true
  if (peeking && clientX <= panelWidth + 8) return true
  return false
}

export function isSidebarFlyoutKeepTarget(node: EventTarget | null, host: Element | null) {
  if (!(node instanceof Element)) return false
  if (host?.contains(node)) return true
  return Boolean(node.closest(SIDEBAR_FLYOUT_KEEP))
}
