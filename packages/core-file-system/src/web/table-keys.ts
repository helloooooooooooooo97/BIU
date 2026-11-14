export type TableCellCursor = { id: string; key: string }

export type TableKeyDir = 'up' | 'down' | 'left' | 'right' | 'home' | 'end'

const EDIT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function tableNavKeys(columns: { key: string }[]): string[] {
  return columns.map((col) => col.key).filter((key) => key && key !== 'fsdb-col-fill' && !key.startsWith('pad:'))
}

/** 表格页默认落点：第一行标题格。 */
export function firstTableTitleCell(rowIds: string[], keys: string[], labelKey?: string | null): TableCellCursor | null {
  if (!rowIds.length || !keys.length) return null
  const key = labelKey && keys.includes(labelKey) ? labelKey : keys[0]
  return { id: rowIds[0], key }
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

export const FOCUS_SHELL_TABLE = 'biu:focus-shell-table'
export const CLEAR_SHELL_TABLE_CELL = 'biu:clear-shell-table-cell'

export type TablePane = 'main' | 'inspector'

let pendingTablePane: { pane: TablePane; at: number } | null = null

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
  if (pane === 'inspector') window.dispatchEvent(new Event('biu:inspector-open'))
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

export function moveTableCell(
  rowIds: string[],
  keys: string[],
  current: TableCellCursor | null,
  dir: TableKeyDir,
): TableCellCursor | null {
  if (!rowIds.length || !keys.length) return current
  const first: TableCellCursor = { id: rowIds[0], key: keys[0] }
  if (!current) return first
  const row = Math.max(0, rowIds.indexOf(current.id))
  const col = Math.max(0, keys.indexOf(current.key))
  const at = { id: rowIds[row] ?? first.id, key: keys[col] ?? first.key }
  if (dir === 'up') {
    if (row <= 0) return at
    return { id: rowIds[row - 1], key: at.key }
  }
  if (dir === 'down') {
    if (row >= rowIds.length - 1) return at
    return { id: rowIds[row + 1], key: at.key }
  }
  if (dir === 'left') {
    if (col <= 0) return at
    return { id: at.id, key: keys[col - 1] }
  }
  if (dir === 'right') {
    if (col >= keys.length - 1) return at
    return { id: at.id, key: keys[col + 1] }
  }
  if (dir === 'home') return { id: at.id, key: keys[0] }
  return { id: at.id, key: keys[keys.length - 1] }
}
