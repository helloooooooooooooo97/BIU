const pins: { el: HTMLElement; top: number }[] = []

function isYScroll(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const overflow = getComputedStyle(el).overflowY
  return overflow === 'auto' || overflow === 'scroll'
}

export function nearestYScroll(el: Element | null) {
  for (let node = el instanceof HTMLElement ? el : el?.parentElement; node; node = node.parentElement) {
    if (isYScroll(node)) return node
  }
  return null
}

export function capturePageScroll(from?: Element | null) {
  pins.length = 0
  const seen = new Set<HTMLElement>()
  const add = (el: Element | null) => {
    const box = isYScroll(el) ? el : nearestYScroll(el)
    if (!box || seen.has(box)) return
    seen.add(box)
    pins.push({ el: box, top: box.scrollTop })
  }
  add(from ?? null)
  if (typeof document === 'undefined') return
  add(document.activeElement)
  add(document.querySelector('.fsdb-right-body'))
  add(document.querySelector('[data-testid="fsdb-detail-main"]'))
}

export function restorePageScroll() {
  for (const pin of pins) pin.el.scrollTop = pin.top
}
