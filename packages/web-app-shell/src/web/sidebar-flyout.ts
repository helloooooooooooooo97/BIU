export const SIDEBAR_FLYOUT_EDGE = 20
export const SIDEBAR_FLYOUT_HIDE_MS = 240
/** 唤醒热区：视口中间偏上，把正中留给标题目录。 */
export const SIDEBAR_FLYOUT_WAKE_TOP = 0.22
export const SIDEBAR_FLYOUT_WAKE_BOTTOM = 0.42
export const SIDEBAR_FLYOUT_KEEP = '.brand-agent-menu, .chat-sidebar-popover, [data-sidebar-flyout-keep]'

export function isSidebarFlyoutWakeY(clientY: number, viewportHeight: number) {
  if (viewportHeight <= 0) return true
  const top = viewportHeight * SIDEBAR_FLYOUT_WAKE_TOP
  const bottom = viewportHeight * SIDEBAR_FLYOUT_WAKE_BOTTOM
  return clientY >= top && clientY <= bottom
}

export function shouldKeepSidebarFlyout(
  clientX: number,
  clientY: number,
  peeking: boolean,
  panelWidth: number,
  viewportWidth = Number.POSITIVE_INFINITY,
  viewportHeight = 0,
) {
  if (clientX < 0 || clientX > viewportWidth) return false
  if (clientX <= SIDEBAR_FLYOUT_EDGE && isSidebarFlyoutWakeY(clientY, viewportHeight)) return true
  if (peeking && clientX <= panelWidth + 8) return true
  return false
}

export function isSidebarFlyoutKeepTarget(node: EventTarget | null, host: Element | null) {
  if (!(node instanceof Element)) return false
  if (host?.contains(node)) return true
  return Boolean(node.closest(SIDEBAR_FLYOUT_KEEP))
}
