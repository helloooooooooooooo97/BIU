export type TableCellCursor = { id: string; key: string }

export type TableKeyDir = 'up' | 'down' | 'left' | 'right' | 'home' | 'end'

const EDIT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function tableNavKeys(columns: { key: string }[]): string[] {
  return columns.map((col) => col.key).filter((key) => key && key !== 'fsdb-col-fill' && !key.startsWith('pad:'))
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

/** 最左格再按 ←（不是 Tab / Shift）离开表格，交给左侧边栏。 */
export function tableLeaveToSidebar(
  dir: TableKeyDir | null,
  opts: { key: string; shift?: boolean; keys: string[]; current: TableCellCursor | null },
) {
  if (dir !== 'left' || opts.shift || opts.key !== 'ArrowLeft') return false
  if (!opts.current || !opts.keys.length) return false
  return opts.keys.indexOf(opts.current.key) === 0
}

export const FOCUS_SHELL_SIDEBAR = 'biu:focus-shell-sidebar'
export const FOCUS_SHELL_TABLE = 'biu:focus-shell-table'

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
