import { tableCellRange, tableCellRangeKey, type TableCellCursor } from './table-keys.ts'

type Ref<T> = { current: T }
export type TableSelectionModel = { rowIds: string[]; rowKeys?: string[]; keys: string[]; writable: ReadonlySet<string> }
export type TableSelectionState = {
  focus: Ref<TableCellCursor | null>
  range: Ref<{ anchor: TableCellCursor; focus: TableCellCursor } | null>
  members: Ref<Set<string>>
}

/** Preserve both record identity and the exact displayed row hit by a pointer. */
export function tableCursorFromCell(cell: HTMLElement): TableCellCursor | null {
  const row = cell.closest<HTMLTableRowElement>('tr[data-record-id]')
  const id = row?.dataset.recordId, key = cell.dataset.colKey
  if (!id || !key || key.startsWith('pad:') || key === 'fsdb-col-fill') return null
  return { id, key, ...(row?.dataset.rowKey ? { rowKey: row.dataset.rowKey } : {}) }
}

/** Gesture callbacks can outlive a render. Always resolve their range against the current view. */
export class LiveTableCellSelection {
  constructor(private readonly getModel: () => TableSelectionModel, private readonly state: TableSelectionState) {}

  apply(anchor: TableCellCursor, focus: TableCellCursor, table: HTMLTableElement | null) {
    const model = this.getModel()
    const resolve = (cursor: TableCellCursor): TableCellCursor => {
      if (cursor.rowKey || !model.rowKeys) return cursor
      const rowKey = model.rowKeys[model.rowIds.indexOf(cursor.id)]
      return rowKey ? { ...cursor, rowKey } : cursor
    }
    anchor = resolve(anchor)
    focus = resolve(focus)
    this.state.range.current = { anchor, focus }
    this.state.focus.current = focus
    this.state.members.current = new Set(tableCellRange(model.rowIds, model.keys, anchor, focus, model.rowKeys).map((cell) => tableCellRangeKey(cell.id, cell.key)))
    this.paint(table)
  }

  reconcile(table: HTMLTableElement | null) {
    const range = this.state.range.current
    if (range) this.apply(range.anchor, range.focus, table)
    else this.paint(table)
  }

  paint(table: HTMLTableElement | null) {
    if (!table) return
    const { writable } = this.getModel()
    const focus = this.state.focus.current, selected = this.state.members.current
    for (const row of Array.from(table.tBodies[0]?.rows ?? [])) {
      const id = row.dataset.recordId
      if (!id) continue
      const rowKey = row.dataset.rowKey ?? id
      for (const cell of Array.from(row.cells)) {
        const key = cell.dataset.colKey
        if (!key) continue
        const active = Boolean(focus && (focus.rowKey ? focus.rowKey === rowKey : focus.id === id) && focus.key === key)
        cell.classList.toggle('is-cell-on', active)
        cell.classList.toggle('is-cell-range', !active && selected.has(tableCellRangeKey(id, key)))
        cell.classList.toggle('is-cell-ro', active && !writable.has(key))
      }
    }
  }
}
