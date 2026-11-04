import { WASH_TONES } from './color-swatches.ts'
import { takePageBlockFence } from './page-block-meta.ts'

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

export function parseSlideBg(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const hit = WASH_TONES.find((tone) => tone.id === raw || tone.value === raw)
  return hit?.value ?? ''
}

export function slideBgToken(value: unknown): string {
  const parsed = parseSlideBg(value)
  return WASH_TONES.find((tone) => tone.value === parsed)?.id ?? ''
}

const OPEN = /^:::([a-zA-Z][\w-]*)(?:\s+\{([^}]*)\})?\s*(?:<!--.*?-->\s*)?$/
const CLOSE = /^:::\s*(?:<!--.*?-->\s*)?$/
const GLUED_CELL = /^(:+)(cell(?:\s+\{[^}]*\})?)\s*(?:<!--.*?-->\s*)?$/

export type SlideFence = {
  raw: string
  layout: SlideLayout
  bg: string
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

function closeCell(cells: string[], cell: string[] | null) {
  if (cell && cells.length) cells[cells.length - 1] = cell.join('\n').replace(/^\n+|\n+$/g, '')
}

function openCell(cells: string[]) {
  cells.push('')
  return [] as string[]
}

/** ProseMirror 容器围栏：:::slide / :::cell，内层 :::pageBlock 成对消化。 */
export function takeSlideFence(src: string): SlideFence | null {
  const lines = src.split('\n')
  const head = OPEN.exec(lines[0] ?? '')
  if (!head || head[1] !== 'slide') return null
  const slideAttrs = attrMap(head[2] ?? '')
  const cells: string[] = []
  let cell: string[] | null = null
  const stack: string[] = ['slide']
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const glued = GLUED_CELL.exec(line)
    if (glued && glued[1].length >= 6 && glued[2]?.startsWith('cell')) {
      if (cell) {
        closeCell(cells, cell)
        stack.pop()
      }
      stack.push('cell')
      cell = openCell(cells)
      continue
    }
    const open = OPEN.exec(line)
    if (open) {
      if (open[1] === 'pageBlock' && cell) {
        const taken = takePageBlockFence(lines.slice(i).join('\n'))
        if (taken) {
          for (const part of taken.raw.split('\n')) cell.push(part)
          i += taken.raw.split('\n').length - 1
          continue
        }
      }
      stack.push(open[1] ?? '')
      if (stack.length === 2 && open[1] === 'cell') {
        cell = openCell(cells)
        continue
      }
      if (cell) cell.push(line)
      continue
    }
    if (CLOSE.test(line)) {
      const name = stack.pop()
      if (name === 'cell' && cell) {
        closeCell(cells, cell)
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
  return { raw, layout, bg: parseSlideBg(slideAttrs.bg), cells: cells.length ? cells : [''] }
}

export function emptySlideJSON(layout: SlideLayout = 'split', bg = '') {
  const slots = SLIDE_LAYOUT_META[layout].slots
  return {
    type: 'slide',
    attrs: { layout, bg: parseSlideBg(bg) },
    content: Array.from({ length: slots }, () => ({
      type: 'slideCell',
      content: [{ type: 'paragraph' }],
    })),
  }
}

export function slideFenceOpen(layout: SlideLayout, bg?: unknown) {
  const token = slideBgToken(bg)
  return token ? `:::slide {layout=${layout} bg=${token}}` : `:::slide {layout=${layout}}`
}
