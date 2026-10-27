export const SANDBOX_DECK_SEL = '[data-page-block="sandbox"]'

export type SandboxSlide = {
  kind: 'sandbox'
  source: string
  width?: number | string
  height?: number | string
  deck?: boolean
}

export function cssBoxSize(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `${Math.round(value)}px`
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

export const SANDBOX_FILL_HOST_PX = 280

export function sandboxLooksFillLayout(source: string) {
  const head = source.trim().slice(0, 1600)
  const pct = /\bheight\s*:\s*100%\b/i.test(head) || /\bheight\s*:\s*100vh\b/i.test(head)
  const clipped = /\boverflow\s*:\s*hidden\b/i.test(head)
  const abs = (source.match(/\bposition\s*:\s*absolute\b/gi) ?? []).length >= 3
  return (pct && clipped) || (pct && abs) || (clipped && abs)
}

export function sandboxDeckEnabled(deck: unknown) {
  return deck !== false
}

const bound = new WeakMap<Element, SandboxSlide>()

export function bindSandboxSlide(host: Element | null, slide: SandboxSlide | null) {
  if (!host) return
  if (slide) bound.set(host, slide)
  else bound.delete(host)
}

export function collectSandboxSlides(from: Element | null): Array<SandboxSlide & { host: HTMLElement }> {
  const root =
    from?.closest('.tiptap, [data-testid="page-editor"]') ??
    (from?.ownerDocument ?? (typeof document === 'undefined' ? null : document))
  if (!root || !('querySelectorAll' in root)) return []
  const list: Array<SandboxSlide & { host: HTMLElement }> = []
  for (const el of root.querySelectorAll(SANDBOX_DECK_SEL)) {
    if (!(el instanceof HTMLElement)) continue
    const slide = bound.get(el)
    if (!slide || !sandboxDeckEnabled(slide.deck)) continue
    list.push({ ...slide, host: el })
  }
  return list
}

export function sandboxDeckIndex(slides: Array<{ host: Element }>, host: Element | null) {
  if (!host) return 0
  const at = slides.findIndex((slide) => slide.host === host)
  return at < 0 ? 0 : at
}

export function stepSandboxDeck(index: number, delta: number, length: number) {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, index + delta))
}

export function sandboxDeckKeyAction(key: string): 'close' | 'first' | 'last' | -1 | 1 | null {
  if (key === 'Escape') return 'close'
  if (key === 'Home') return 'first'
  if (key === 'End') return 'last'
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown' || key === ' ') return 1
  if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp') return -1
  return null
}
