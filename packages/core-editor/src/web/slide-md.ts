export const SLIDE_LAYOUTS = ['title', 'split', 'hero', 'trio', 'stack'] as const
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number]

export const SLIDE_LAYOUT_META: Record<SlideLayout, { label: string; slots: number; columns: number[]; rows?: number[] }> = {
  title: { label: '标题', slots: 2, columns: [1], rows: [1, 2] },
  split: { label: '对开', slots: 2, columns: [1, 1] },
  hero: { label: '主从', slots: 2, columns: [1.4, 1] },
  trio: { label: '三列', slots: 3, columns: [1, 1, 1] },
  stack: { label: '纵叠', slots: 3, columns: [1], rows: [1, 1, 1] },
}

export const SLIDE_LAYOUT_PRESETS = SLIDE_LAYOUTS.map((id) => ({ id, ...SLIDE_LAYOUT_META[id] }))

export function isSlideLayout(value: unknown): value is SlideLayout {
  return (SLIDE_LAYOUTS as readonly string[]).includes(String(value))
}

const OPEN = /^:::([a-zA-Z][\w-]*)(?:\s+\{([^}]*)\})?\s*$/
const CLOSE = /^:::\s*$/

export type SlideFence = {
  raw: string
  layout: SlideLayout
  cells: string[]
}

function attrMap(raw: string) {
  const out: Record<string, string> = {}
  for (const part of raw.trim().split(/\s+/)) {
    const cut = part.indexOf('=')
    if (cut < 0) continue
    out[part.slice(0, cut)] = part.slice(cut + 1).replace(/^["']|["']$/g, '')
  }
  return out
}

/** ProseMirror 容器围栏：:::slide / :::cell，内层 :::pageBlock 成对消化。 */
export function takeSlideFence(src: string): SlideFence | null {
  const lines = src.split('\n')
  if (!OPEN.test(lines[0] ?? '') || OPEN.exec(lines[0] ?? '')?.[1] !== 'slide') return null
  const slideAttrs = attrMap(OPEN.exec(lines[0] ?? '')?.[2] ?? '')
  const cells: string[] = []
  let cell: string[] | null = null
  const stack: string[] = ['slide']
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const open = OPEN.exec(line)
    if (open) {
      stack.push(open[1] ?? '')
      if (stack.length === 2 && open[1] === 'cell') {
        cell = []
        cells.push('')
        continue
      }
      if (cell) cell.push(line)
      continue
    }
    if (CLOSE.test(line)) {
      const name = stack.pop()
      if (name === 'cell' && cell) {
        cells[cells.length - 1] = cell.join('\n').replace(/^\n+|\n+$/g, '')
        cell = null
        continue
      }
      if (cell) cell.push(line)
      if (name === 'slide' && stack.length === 0) {
        end = i
        break
      }
      continue
    }
    if (cell) cell.push(line)
  }
  if (end < 0) return null
  const raw = lines.slice(0, end + 1).join('\n')
  const layout = isSlideLayout(slideAttrs.layout) ? slideAttrs.layout : 'split'
  return { raw, layout, cells: cells.length ? cells : [''] }
}

export function emptySlideJSON(layout: SlideLayout = 'split') {
  const slots = SLIDE_LAYOUT_META[layout].slots
  return {
    type: 'slide',
    attrs: { layout },
    content: Array.from({ length: slots }, () => ({
      type: 'slideCell',
      content: [{ type: 'paragraph' }],
    })),
  }
}
