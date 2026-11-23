import { takePageBlockFence } from './page-block-meta.ts'

const OPEN = /^:::([a-zA-Z][\w-]*)(?:\s+\{([^}]*)\})?\s*(?:<!--.*?-->\s*)?$/
const CLOSE = /^:::\s*(?:<!--.*?-->\s*)?$/
const GLUED = /^(:+)((?:row|th|td|cell)(?:\s+\{[^}]*\})?)\s*(?:<!--.*?-->\s*)?$/

export type TableFenceCellAttrs = {
  background?: string
  align?: string
  colspan?: number
  rowspan?: number
}
export type TableFenceCell = { kind: 'th' | 'td'; md: string; attrs?: TableFenceCellAttrs }
export type TableFenceRow = { cells: TableFenceCell[] }

function parseCellFenceAttrs(raw?: string): TableFenceCellAttrs | undefined {
  if (!raw || !raw.trim()) return undefined
  const out: TableFenceCellAttrs = {}
  const bg = raw.match(/\bbg=(?:"([^"]*)"|'([^']*)'|([^\s}]+))/i)
  if (bg) out.background = String(bg[1] ?? bg[2] ?? bg[3] ?? '').trim()
  const align = raw.match(/\balign=(left|center|right)\b/i)?.[1]?.toLowerCase()
  if (align) out.align = align
  const colspan = Number(raw.match(/\bcolspan=(\d+)\b/i)?.[1])
  if (Number.isFinite(colspan) && colspan > 1) out.colspan = colspan
  const rowspan = Number(raw.match(/\browspan=(\d+)\b/i)?.[1])
  if (Number.isFinite(rowspan) && rowspan > 1) out.rowspan = rowspan
  return Object.keys(out).length ? out : undefined
}

export function formatCellFenceAttrs(attrs?: Record<string, unknown> | null): string {
  if (!attrs || typeof attrs !== 'object') return ''
  const parts: string[] = []
  const bg = typeof attrs.background === 'string' ? attrs.background.trim() : ''
  if (bg) parts.push(`bg=${JSON.stringify(bg)}`)
  const align = typeof attrs.align === 'string' ? attrs.align.trim().toLowerCase() : ''
  if (align === 'left' || align === 'center' || align === 'right') parts.push(`align=${align}`)
  const colspan = Number(attrs.colspan)
  if (Number.isFinite(colspan) && colspan > 1) parts.push(`colspan=${Math.round(colspan)}`)
  const rowspan = Number(attrs.rowspan)
  if (Number.isFinite(rowspan) && rowspan > 1) parts.push(`rowspan=${Math.round(rowspan)}`)
  return parts.length ? ` {${parts.join(' ')}}` : ''
}

function paragraphHasRichMarks(para: unknown): boolean {
  const content = Array.isArray((para as { content?: unknown })?.content)
    ? ((para as { content: unknown[] }).content)
    : []
  for (const child of content) {
    const marks = Array.isArray((child as { marks?: unknown })?.marks)
      ? ((child as { marks: Array<{ type?: string }> }).marks)
      : []
    if (marks.some((m) => m?.type === 'textStyle' || m?.type === 'highlight')) return true
  }
  return false
}

function cellKind(name: string): 'th' | 'td' | null {
  if (name === 'th') return 'th'
  if (name === 'td' || name === 'cell') return 'td'
  return null
}

function closeCell(row: TableFenceRow | null, lines: string[] | null) {
  if (row && lines) row.cells[row.cells.length - 1] = { ...row.cells[row.cells.length - 1]!, md: lines.join('\n').replace(/^\n+|\n+$/g, '') }
}

/** 格子里有段落以外的块、合并/底色/对齐、或富文本颜色/高亮 mark 时，GFM 一行表存不下，改走 :::table 围栏。 */
export function tableNeedsFence(node: { content?: unknown }) {
  const rows = Array.isArray(node.content) ? node.content : []
  for (const row of rows) {
    const cells = Array.isArray((row as { content?: unknown }).content) ? (row as { content: unknown[] }).content : []
    for (const cell of cells) {
      const attrs = (cell as { attrs?: Record<string, unknown> }).attrs
      if (attrs) {
        if (attrs.background || attrs.align) return true
        if (Number(attrs.colspan) > 1 || Number(attrs.rowspan) > 1) return true
      }
      const kids = Array.isArray((cell as { content?: unknown }).content) ? (cell as { content: unknown[] }).content : []
      if (kids.length !== 1) return true
      if ((kids[0] as { type?: string })?.type !== 'paragraph') return true
      if (paragraphHasRichMarks(kids[0])) return true
    }
  }
  return false
}

export function takeTableFence(src: string) {
  const lines = src.split('\n')
  const head = OPEN.exec(lines[0] ?? '')
  if (!head || head[1] !== 'table') return null
  const rows: TableFenceRow[] = []
  let row: TableFenceRow | null = null
  let cell: string[] | null = null
  const stack = ['table']
  let end = -1

  const ensureRow = () => {
    if (row) return
    row = { cells: [] }
    rows.push(row)
    stack.push('row')
  }

  const openCell = (kind: 'th' | 'td', attrRaw?: string) => {
    ensureRow()
    const attrs = parseCellFenceAttrs(attrRaw)
    row!.cells.push(attrs ? { kind, md: '', attrs } : { kind, md: '' })
    cell = []
    stack.push(kind)
  }

  const pushCellLine = (line: string) => {
    cell?.push(line)
  }

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const glued = GLUED.exec(line)
    if (glued && glued[1].length >= 6) {
      const name = String(glued[2] ?? '').split(/\s/)[0] ?? ''
      if (cell && row) {
        closeCell(row, cell)
        stack.pop()
        cell = null
      }
      if (name === 'row') {
        if (row && stack[stack.length - 1] === 'row') stack.pop()
        row = { cells: [] }
        rows.push(row)
        stack.push('row')
        continue
      }
      const kind = cellKind(name)
      if (kind) {
        openCell(kind)
        continue
      }
    }
    const open = OPEN.exec(line)
    if (open) {
      if ((open[1] === 'editorBlock' || open[1] === 'pageBlock') && cell) {
        const taken = takePageBlockFence(lines.slice(i).join('\n'))
        if (taken) {
          for (const part of taken.raw.split('\n')) pushCellLine(part)
          i += taken.raw.split('\n').length - 1
          continue
        }
      }
      if (open[1] === 'row') {
        if (cell && row) {
          closeCell(row, cell)
          cell = null
          stack.pop()
        }
        if (row && stack[stack.length - 1] === 'row') stack.pop()
        row = { cells: [] }
        rows.push(row)
        stack.push('row')
        continue
      }
      const kind = cellKind(open[1] ?? '')
      if (kind) {
        if (cell && row) {
          closeCell(row, cell)
          stack.pop()
        }
        openCell(kind, open[2])
        continue
      }
      pushCellLine(line)
      continue
    }
    if (CLOSE.test(line)) {
      const name = stack.pop()
      if ((name === 'th' || name === 'td') && cell && row) {
        closeCell(row, cell)
        cell = null
        continue
      }
      if (name === 'row') {
        row = null
        continue
      }
      if (name === 'table' && stack.length === 0) {
        end = i
        break
      }
      pushCellLine(line)
      continue
    }
    pushCellLine(line)
  }
  if (end < 0) return null
  return { raw: lines.slice(0, end + 1).join('\n'), rows: rows.filter((item) => item.cells.length) }
}
