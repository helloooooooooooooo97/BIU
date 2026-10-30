const SELECTED = 'data-sandbox-selected'
const LIVE = 'data-sandbox-live'
const CHANGE = 'biu:sandbox-active'

let selectedCard: HTMLElement | null = null
let livePreview: HTMLElement | null = null

function emit() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHANGE))
}

export function onSandboxActiveChange(fn: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE, fn)
  return () => window.removeEventListener(CHANGE, fn)
}

export function selectSandbox(card: HTMLElement | null) {
  if (selectedCard === card) return
  selectedCard?.removeAttribute(SELECTED)
  selectedCard = card
  if (card) card.setAttribute(SELECTED, '')
  else setLivePreview(null)
  emit()
}

export function setLivePreview(host: HTMLElement | null) {
  if (livePreview === host) {
    if (host && !document.documentElement.classList.contains('pick-mode')) {
      host.focus({ preventScroll: true })
    }
    return
  }
  livePreview?.removeAttribute(LIVE)
  livePreview = host
  if (host) {
    host.setAttribute(LIVE, '')
    if (!host.hasAttribute('tabindex')) host.tabIndex = -1
    if (!document.documentElement.classList.contains('pick-mode')) {
      host.focus({ preventScroll: true })
    }
  }
  emit()
}

export function isLivePreview(host: Element | null) {
  if (!(host instanceof HTMLElement) || livePreview !== host) return false
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('pick-mode')) return false
  return true
}

export function isSelectedSandbox(card: Element | null) {
  return Boolean(card && selectedCard === card)
}

export function clearSandboxIf(card: HTMLElement | null, preview: HTMLElement | null) {
  if (livePreview === preview) setLivePreview(null)
  if (selectedCard === card) selectSandbox(null)
}
