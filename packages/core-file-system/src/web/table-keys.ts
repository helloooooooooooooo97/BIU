export type TableCellCursor = { id: string; key: string; rowKey?: string }

export type TableKeyDir = 'up' | 'down' | 'left' | 'right' | 'home' | 'end'

const EDIT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function tableNavKeys(columns: { key: string }[]): string[] {
  return columns.map((col) => col.key).filter((key) => key && key !== 'fsdb-col-fill' && !key.startsWith('pad:'))
}

/** 表格页默认落点：第一行标题格。 */
export function firstTableTitleCell(rowIds: string[], keys: string[], labelKey?: string | null, rowKeys?: string[]): TableCellCursor | null {
  if (!rowIds.length || !keys.length) return null
  const key = labelKey && keys.includes(labelKey) ? labelKey : keys[0]
  return { id: rowIds[0], key, ...(rowKeys ? { rowKey: rowKeys[0] } : {}) }
}

export function tableKeyDir(key: string, shift = false): TableKeyDir | null {
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  if (key === 'Home') return 'home'
  if (key === 'End') return 'end'
  if (key === 'Tab') return shift ? 'left' : 'right'
  return null
}

/** 选中格子后：Shift+Enter 与工具栏「新建」相同。⌘Enter / ⌘⇧Enter 留给标题打开。 */
export function tableCreateKey(opts: { key: string; shift: boolean; meta?: boolean; ctrl?: boolean; alt?: boolean }) {
  if (opts.key !== 'Enter' || !opts.shift) return false
  if (opts.meta || opts.ctrl || opts.alt) return false
  return true
}

/** 标题格：⌘Enter 当前页打开，⌘⇧Enter 在右侧打开。 */
export function tableTitleOpenWhere(opts: {
  key: string
  shift: boolean
  meta?: boolean
  ctrl?: boolean
  alt?: boolean
  labelKey?: string | null
  cellKey: string
}): 'page' | 'inspector' | null {
  if (opts.alt || opts.key !== 'Enter') return null
  if (!(opts.meta || opts.ctrl)) return null
  if (!opts.labelKey || opts.cellKey !== opts.labelKey) return null
  return opts.shift ? 'inspector' : 'page'
}

/** 标题格上：Shift+→ 展开，Shift+← 收起。 */
export function tableTreeArrowAction(
  dir: TableKeyDir,
  opts: { shift: boolean; treeOn: boolean; labelKey?: string | null; cellKey: string; hasKids: boolean; collapsed: boolean },
): 'expand' | 'collapse' | null {
  if (!opts.shift || !opts.treeOn || !opts.hasKids || !opts.labelKey || opts.cellKey !== opts.labelKey) return null
  if (dir === 'right' && opts.collapsed) return 'expand'
  if (dir === 'left' && !opts.collapsed) return 'collapse'
  return null
}

export function tableActionButtons(td: HTMLElement | null) {
  if (!td) return [] as HTMLElement[]
  return [...td.querySelectorAll<HTMLElement>('button:not(:disabled), [role="button"]')].filter((el) => el.closest('td') === td)
}

export function tableActionButtonStep(count: number, index: number, dir: 'left' | 'right') {
  if (count <= 0) return 0
  if (dir === 'right') return Math.min(count - 1, index + 1)
  return Math.max(0, index - 1)
}

/** 动作列左右走到头就离开格子，否则只在按钮间移动。 */
export function tableActionArrowLeave(count: number, index: number, dir: 'left' | 'right') {
  if (count <= 0) return true
  if (dir === 'left') return index <= 0
  return index >= count - 1
}

/** 选中格子后 Delete / Backspace 清空该字段。动作列不处理。 */
export function tableClearedValue(kind: string) {
  if (kind === 'action') return undefined
  if (kind === 'boolean') return false
  if (kind === 'multi-select' || kind === 'multi-ref' || kind === 'image' || kind === 'attachment' || kind === 'document') {
    return []
  }
  if (kind === 'tag') return { tags: [], values: {} }
  if (kind === 'number' || kind === 'datetime') return null
  return ''
}

export function tableClearKey(key: string) {
  return key === 'Delete' || key === 'Backspace'
}

/** 选中文字/数字格后，字母或数字直接进编辑。 */
export function tableTypeToEditChar(key: string, kind: string) {
  if (key.length !== 1) return null
  if (kind === 'number') return /[0-9.+\-]/.test(key) ? key : null
  if (kind === 'string' || kind === 'text' || kind === 'url' || kind === 'email') {
    return /[\p{L}\p{N}]/u.test(key) ? key : null
  }
  return null
}

export function tableKeyFromEditingTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null
  if (!el) return false
  if (EDIT_TAGS.has(el.tagName)) return true
  if (el.isContentEditable) return true
  return Boolean(el.closest('.fsdb-cell-pop, [role="menu"], [role="listbox"], .fsdb-headless-pop, dialog'))
}

import { CLEAR_SHELL_TABLE_CELL, FOCUS_SHELL_TABLE, INSPECTOR_OPEN_EVENT } from './fsdb-events.ts'

export { CLEAR_SHELL_TABLE_CELL, FOCUS_SHELL_TABLE }

export type TablePane = 'main' | 'inspector'

let pendingTablePane: { pane: TablePane; at: number } | null = null

/** ⌘L：把当前格子送到会话，和文档选区一样。 */
export function tableSendChatHotkey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === 'l' || event.key === 'L'
}

/** ⌘C / Ctrl+C：复制当前选中的单元格或矩形选区。 */
export function tableCopyHotkey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === 'c' || event.key === 'C'
}

export function escapeTsvCell(value: string) {
  if (!/[\t\r\n"]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/** 把选中的表格单元格序列化为剪贴板文本：单格原样输出，多格输出 TSV（行间 \n、列间 \t），跳过 actions 列。 */
export function formatTableCellsForClipboard(
  cursors: TableCellCursor[],
  readText: (cursor: TableCellCursor) => string | null | undefined,
): string | null {
  const rows: Array<{ key: string; cells: string[] }> = []
  const byRow = new Map<string, string[]>()
  let count = 0
  let singleText = ''
  for (const cursor of cursors) {
    if (!cursor.key || cursor.key === 'actions') continue
    const text = readText(cursor)
    if (text === null || text === undefined) continue
    const rowId = cursor.rowKey || cursor.id
    let bucket = byRow.get(rowId)
    if (!bucket) {
      bucket = []
      byRow.set(rowId, bucket)
      rows.push({ key: rowId, cells: bucket })
    }
    bucket.push(text)
    count += 1
    singleText = text
  }
  if (count === 0) return null
  if (count === 1) return singleText
  return rows.map((row) => row.cells.map(escapeTsvCell).join('\t')).join('\n')
}

function copyTextFallback(text: string) {
  if (typeof document === 'undefined' || !document.body) return false
  const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = text
  area.readOnly = true
  area.style.position = 'fixed'
  area.style.opacity = '0'
  area.style.pointerEvents = 'none'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  try {
    area.focus({ preventScroll: true })
    area.select()
    return typeof document.execCommand === 'function' ? document.execCommand('copy') : false
  } catch {
    return false
  } finally {
    area.remove()
    if (prev && prev.isConnected) prev.focus({ preventScroll: true })
  }
}

export function writeClipboardText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    void navigator.clipboard.writeText(text).catch(() => {
      copyTextFallback(text)
    })
    return true
  }
  return copyTextFallback(text)
}

/** ⌘\\ 在主栏和检查器之间来回切。 */
export function tablePaneHotkey(event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === '\\' || event.code === 'Backslash'
}

export function tablePaneOther(pane: TablePane): TablePane {
  return pane === 'inspector' ? 'main' : 'inspector'
}

export type TablePaneRest =
  | { kind: 'cell'; path: string; viewId: string; id: string; key: string }
  | { kind: 'title'; path: string; viewId: string; detailId: string; start: number; end: number }
  | { kind: 'content'; path: string; viewId: string; detailId: string }

const paneRest: Record<TablePane, TablePaneRest | null> = { main: null, inspector: null }

export function rememberTablePaneRest(pane: TablePane, rest: TablePaneRest | null) {
  paneRest[pane] = rest
}

export function readTablePaneRest(
  pane: TablePane,
  place: { path: string; viewId: string; detailId?: string | null },
): TablePaneRest | null {
  const rest = paneRest[pane]
  if (!rest) return null
  if (rest.path !== place.path || rest.viewId !== place.viewId) return null
  if (rest.kind === 'cell') return place.detailId ? null : rest
  if (rest.detailId !== (place.detailId ?? '')) return null
  return rest
}

export function tablePaneFromEvent(event: Event): TablePane | null {
  const pane = (event as CustomEvent<{ pane?: TablePane }>).detail?.pane
  return pane === 'inspector' || pane === 'main' ? pane : null
}

export function requestTablePaneFocus(pane: TablePane) {
  pendingTablePane = { pane, at: Date.now() }
  if (typeof window === 'undefined') return
  if (pane === 'inspector') window.dispatchEvent(new Event(INSPECTOR_OPEN_EVENT))
  window.dispatchEvent(new CustomEvent(FOCUS_SHELL_TABLE, { detail: { pane } }))
}

/** 左右栏同时只保留一个选中格：声明本栏占用，另一栏清掉。 */
export function claimTableCellPick(pane: TablePane) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CLEAR_SHELL_TABLE_CELL, { detail: { pane } }))
}

export function consumePendingTablePane(pane: TablePane) {
  if (!pendingTablePane || pendingTablePane.pane !== pane) return false
  if (Date.now() - pendingTablePane.at > 1500) return false
  pendingTablePane = null
  return true
}

export function peekPendingTablePane(pane: TablePane) {
  if (!pendingTablePane || pendingTablePane.pane !== pane) return false
  return Date.now() - pendingTablePane.at <= 1500
}

/** Excel 式矩形选区：从锚点拖到焦点，包含两端。 */
export function tableCellRange(
  rowIds: string[],
  keys: string[],
  a: TableCellCursor,
  b: TableCellCursor,
  rowKeys?: string[],
): TableCellCursor[] {
  const r1 = rowKeys && a.rowKey ? rowKeys.indexOf(a.rowKey) : rowIds.indexOf(a.id)
  const r2 = rowKeys && b.rowKey ? rowKeys.indexOf(b.rowKey) : rowIds.indexOf(b.id)
  const c1 = keys.indexOf(a.key)
  const c2 = keys.indexOf(b.key)
  if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return [b]
  const rMin = Math.min(r1, r2)
  const rMax = Math.max(r1, r2)
  const cMin = Math.min(c1, c2)
  const cMax = Math.max(c1, c2)
  const out: TableCellCursor[] = []
  for (let r = rMin; r <= rMax; r += 1) {
    for (let c = cMin; c <= cMax; c += 1) {
      const id = rowIds[r]
      const key = keys[c]
      if (id && key) out.push({ id, key, ...(rowKeys ? { rowKey: rowKeys[r] } : {}) })
    }
  }
  return out.length ? out : [b]
}

export function tableCellRangeKey(id: string, key: string) {
  return `${id}\0${key}`
}

/** 单元格矩形里的行，去重且保持从上到下的顺序。 */
export function tableCellRangeRowIds(cells: TableCellCursor[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const cell of cells) {
    if (!cell.id || seen.has(cell.id)) continue
    seen.add(cell.id)
    ids.push(cell.id)
  }
  return ids
}

export function moveTableCell(
  rowIds: string[],
  keys: string[],
  current: TableCellCursor | null,
  dir: TableKeyDir,
  rowKeys?: string[],
): TableCellCursor | null {
  if (!rowIds.length || !keys.length) return current
  const at = (row: number, col: number): TableCellCursor => ({ id: rowIds[row]!, key: keys[col]!, ...(rowKeys ? { rowKey: rowKeys[row] } : {}) })
  if (!current) return at(0, 0)
  const row = Math.max(0, rowKeys && current.rowKey ? rowKeys.indexOf(current.rowKey) : rowIds.indexOf(current.id))
  const col = Math.max(0, keys.indexOf(current.key))
  if (dir === 'up') return at(Math.max(0, row - 1), col)
  if (dir === 'down') return at(Math.min(rowIds.length - 1, row + 1), col)
  if (dir === 'left') return at(row, Math.max(0, col - 1))
  if (dir === 'right') return at(row, Math.min(keys.length - 1, col + 1))
  if (dir === 'home') return at(row, 0)
  return at(row, keys.length - 1)
}
