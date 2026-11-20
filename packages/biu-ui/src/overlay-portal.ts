/** 统一浮层层级与 Portal 容器：分享页 z-index:220，沙盒放大 --biu-z-modal(200)，聊天浮窗 400~449。 */
export const OVERLAY_Z = {
  float: 80,
  dropdown: 90,
  modal: 200,
  sharePage: 220,
  popover: 300,
  menu: 340,
  shareLift: 360,
  expandLift: 360,
  chatOverlayMin: 400,
  chatOverlayMax: 449,
  chatLift: 500,
  tooltip: 520,
  pick: 500,
} as const

export const SHARE_OVERLAY_Z = OVERLAY_Z.shareLift
export const EXPAND_OVERLAY_Z = OVERLAY_Z.expandLift
export const CHAT_OVERLAY_Z = OVERLAY_Z.chatLift
export const TOOLTIP_OVERLAY_Z = OVERLAY_Z.tooltip
export const EXPAND_OVERLAY_SEL = '[data-page-host-expanded],[data-sandbox-expanded],[data-testid="html-deck"]'
export const CHAT_OVERLAY_SEL = '[data-testid="chat-overlay-panel"]'

/** 聊天浮窗置顶计数必须限制在 [400, 449] 区间，绝不允许越过 CHAT_OVERLAY_Z(500) 或 Pick 遮罩。 */
export function clampChatOverlayZ(z: number): number {
  const span = OVERLAY_Z.chatOverlayMax - OVERLAY_Z.chatOverlayMin + 1
  if (z < OVERLAY_Z.chatOverlayMin) return OVERLAY_Z.chatOverlayMin
  if (z <= OVERLAY_Z.chatOverlayMax) return z
  return OVERLAY_Z.chatOverlayMin + ((z - OVERLAY_Z.chatOverlayMin) % span)
}

/**
 * 解析浮层 Portal 挂载容器：
 * - 聊天浮窗内触发的浮层直接挂到 document.body，避免被带 isolation:isolate 的放大块劫持层叠上下文；
 * - 放大块 / 分享页内触发的浮层挂到其所在容器；
 * - 兼容未传 anchor 的调用方：若存在聊天浮窗则优先 document.body，否则沿用放大块 / 分享页 / body 顺序。
 */
export function overlayPortalRoot(anchor?: Element | null): HTMLElement | null {
  if (typeof document === 'undefined') return null
  if (anchor) {
    if (anchor.closest(CHAT_OVERLAY_SEL)) return document.body
    const expanded = anchor.closest(EXPAND_OVERLAY_SEL) as HTMLElement | null
    if (expanded) return expanded
    const share = anchor.closest('.fsdb-share-page') as HTMLElement | null
    if (share) return share
    return document.body
  }
  if (document.querySelector(CHAT_OVERLAY_SEL)) return document.body
  return (
    (document.querySelector(EXPAND_OVERLAY_SEL) as HTMLElement | null) ??
    (document.querySelector('.fsdb-share-page') as HTMLElement | null) ??
    document.body
  )
}

export function overlayZ(base = 200, anchor?: Element | null): number {
  if (typeof document === 'undefined') return base
  let z = base
  if (document.documentElement.classList.contains('share')) z = Math.max(z, SHARE_OVERLAY_Z)
  if (anchor?.closest(EXPAND_OVERLAY_SEL) || document.querySelector(EXPAND_OVERLAY_SEL)) {
    z = Math.max(z, EXPAND_OVERLAY_Z)
  }
  if (anchor?.closest(CHAT_OVERLAY_SEL) || document.querySelector(CHAT_OVERLAY_SEL)) {
    z = Math.max(z, CHAT_OVERLAY_Z)
  }
  return z
}
