/** 分享页是 z-index:220 的全屏层；页面沙盒放大是 --biu-z-modal(200)。挂到 body 的菜单会被盖住。 */
export const SHARE_OVERLAY_Z = 360
export const EXPAND_OVERLAY_Z = 360
export const CHAT_OVERLAY_Z = 500
export const EXPAND_OVERLAY_SEL = '[data-page-host-expanded],[data-sandbox-expanded],[data-testid="html-deck"]'
export const CHAT_OVERLAY_SEL = '[data-testid="chat-overlay-panel"]'

export function overlayPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return (
    (document.querySelector(EXPAND_OVERLAY_SEL) as HTMLElement | null) ??
    (document.querySelector('.fsdb-share-page') as HTMLElement | null) ??
    document.body
  )
}

export function overlayZ(base = 200): number {
  if (typeof document === 'undefined') return base
  let z = base
  if (document.documentElement.classList.contains('share')) z = Math.max(z, SHARE_OVERLAY_Z)
  if (document.querySelector(EXPAND_OVERLAY_SEL)) z = Math.max(z, EXPAND_OVERLAY_Z)
  if (document.querySelector(CHAT_OVERLAY_SEL)) z = Math.max(z, CHAT_OVERLAY_Z)
  return z
}
