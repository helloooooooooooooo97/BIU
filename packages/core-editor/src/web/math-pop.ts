type Open = {
  panel: HTMLElement
  onDoc: (event: Event) => void
  onScroll: () => void
}

let open: Open | null = null

export function closeMathPop() {
  if (!open) return
  document.removeEventListener('pointerdown', open.onDoc, true)
  window.removeEventListener('scroll', open.onScroll, true)
  window.removeEventListener('resize', open.onScroll)
  open.panel.remove()
  open = null
}

function placeBelow(panel: HTMLElement, anchor: Element) {
  const r = anchor.getBoundingClientRect()
  const gap = 6
  const pad = 8
  panel.style.left = `${Math.max(pad, r.left)}px`
  panel.style.top = `${r.bottom + gap}px`
  const box = panel.getBoundingClientRect()
  if (box.right > window.innerWidth - pad) {
    panel.style.left = `${Math.max(pad, window.innerWidth - pad - box.width)}px`
  }
  if (box.bottom > window.innerHeight - pad) {
    panel.style.top = `${Math.max(pad, r.top - box.height - gap)}px`
  }
}

/** 点公式后在下方弹出 LaTeX 输入，不用浏览器 prompt。 */
export function openMathPop(args: { anchor: Element; latex: string; onCommit: (next: string) => void }) {
  closeMathPop()
  const panel = document.createElement('div')
  panel.className = 'page-math-pop'
  panel.dataset.testid = 'page-math-pop'
  const input = document.createElement('textarea')
  input.className = 'page-math-pop-input'
  input.value = args.latex
  input.rows = args.latex.includes('\n') || args.latex.length > 48 ? 3 : 1
  input.setAttribute('aria-label', 'LaTeX')
  input.spellcheck = false
  panel.appendChild(input)
  document.body.appendChild(panel)
  const onScroll = () => {
    if (args.anchor.isConnected) placeBelow(panel, args.anchor)
    else closeMathPop()
  }
  placeBelow(panel, args.anchor)
  const finish = (commit: boolean) => {
    const next = input.value
    closeMathPop()
    if (commit) args.onCommit(next)
  }
  input.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      finish(false)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      finish(true)
    }
  })
  const onDoc = (event: Event) => {
    const target = event.target
    if (target instanceof Node && panel.contains(target)) return
    finish(true)
  }
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onDoc, true)
  })
  open = { panel, onDoc, onScroll }
  input.focus()
  input.select()
}
