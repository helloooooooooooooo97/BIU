import { takePageBlockFence } from './page-block-meta.ts'

const OPEN = /^:::([a-zA-Z][\w-]*)(?:\s+\{([^}]*)\})?\s*(?:<!--.*?-->\s*)?$/
const CLOSE = /^:::\s*(?:<!--.*?-->\s*)?$/
const GLUED = /^(:+)((?:row|th|td|cell)(?:\s+\{[^}]*\})?)\s*(?:<!--.*?-->\s*)?$/

export type TableFenceCell = { kind: 'th' | 'td'; md: string }
export type TableFenceRow = { cells: TableFenceCell[] }

function cellKind(name: string): 'th' | 'td' | null {
  if (name === 'th') return 'th'
  if (name === 'td' || name === 'cell') return 'td'
  return null
}

function closeCell(row: TableFenceRow | null, lines: string[] | null) {
  if (row && lines) row.cells[row.cells.length - 1] = { ...row.cells[row.cells.length - 1]!, md: lines.join('\n').replace(/^\n+|\n+$/g, '') }
}

/** 格子里有段落以外的块（pageBlock / 代码块等）时，GFM 一行表存不下。 */
export function tableNeedsFence(node: { content?: unknown }) {
  const rows = Array.isArray(node.content) ? node.content : []
  for (const row of rows) {
    const cells = Array.isArray((row as { content?: unknown }).content) ? (row as { content: unknown[] }).content : []
    for (const cell of cells) {
      const kids = Array.isArray((cell as { content?: unknown }).content) ? (cell as { content: unknown[] }).content : []
      if (kids.length !== 1) return true
      if ((kids[0] as { type?: string })?.type !== 'paragraph') return true
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

  const openCell = (kind: 'th' | 'td') => {
    ensureRow()
    row!.cells.push({ kind, md: '' })
    cell = []
    stack.push(kind)
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
          for (const part of taken.raw.split('\n')) cell.push(part)
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
        openCell(kind)
        continue
      }
      if (cell) cell.push(line)
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
      if (cell) cell.push(line)
      continue
    }
    if (cell) cell.push(line)
  }
  if (end < 0) return null
  return { raw: lines.slice(0, end + 1).join('\n'), rows: rows.filter((item) => item.cells.length) }
}
