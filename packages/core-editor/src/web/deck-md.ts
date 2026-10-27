export const DECK_LAYOUTS = ['title', 'split', 'hero', 'trio', 'stack'] as const
export type DeckLayout = (typeof DECK_LAYOUTS)[number]

export const DECK_LAYOUT_META: Record<DeckLayout, { label: string; slots: number; columns: number[]; rows?: number[] }> = {
  title: { label: '标题', slots: 2, columns: [1], rows: [1, 2] },
  split: { label: '对开', slots: 2, columns: [1, 1] },
  hero: { label: '主从', slots: 2, columns: [1.4, 1] },
  trio: { label: '三列', slots: 3, columns: [1, 1, 1] },
  stack: { label: '纵叠', slots: 3, columns: [1], rows: [1, 1, 1] },
}

export const DECK_LAYOUT_PRESETS = DECK_LAYOUTS.map((id) => ({ id, ...DECK_LAYOUT_META[id] }))

export function isDeckLayout(value: unknown): value is DeckLayout {
  return (DECK_LAYOUTS as readonly string[]).includes(String(value))
}

const OPEN = /^:::([a-zA-Z][\w-]*)(?:\s+\{([^}]*)\})?\s*$/
const CLOSE = /^:::\s*$/

export type DeckFence = {
  raw: string
  layout: DeckLayout
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

/** ProseMirror 容器围栏：:::deck / :::cell，内层 :::pageBlock 成对消化。 */
export function takeDeckFence(src: string): DeckFence | null {
  const lines = src.split('\n')
  if (!OPEN.test(lines[0] ?? '') || OPEN.exec(lines[0] ?? '')?.[1] !== 'deck') return null
  const deckAttrs = attrMap(OPEN.exec(lines[0] ?? '')?.[2] ?? '')
  const cells: string[] = []
  let cell: string[] | null = null
  const stack: string[] = ['deck']
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
      if (name === 'deck' && stack.length === 0) {
        end = i
        break
      }
      continue
    }
    if (cell) cell.push(line)
  }
  if (end < 0) return null
  const raw = lines.slice(0, end + 1).join('\n')
  const layout = isDeckLayout(deckAttrs.layout) ? deckAttrs.layout : 'split'
  return { raw, layout, cells: cells.length ? cells : [''] }
}

export function emptyDeckJSON(layout: DeckLayout = 'split') {
  const slots = DECK_LAYOUT_META[layout].slots
  return {
    type: 'deck',
    attrs: { layout },
    content: Array.from({ length: slots }, () => ({
      type: 'deckCell',
      content: [{ type: 'paragraph' }],
    })),
  }
}
