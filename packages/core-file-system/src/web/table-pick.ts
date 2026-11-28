import { pickIdFromText, type PickRangeCell, type PickRef } from '@biu/core-pick/web'
import { escapeTsvCell, type TableCellCursor } from './table-keys.ts'
import { fieldPickId } from './pick-dom.ts'

export type TableSelectionCellInfo = {
  id: string
  path?: string
  title?: string
  field: string
  label: string
  type: string
  text: string
  selection?: string
}

export type BuildTableSelectionPicksInput = {
  cursors: TableCellCursor[]
  recordKind: string
  collectionPath: string
  collectionLabel?: string
  route: string
  readCell: (cursor: TableCellCursor) => TableSelectionCellInfo | null | undefined
}

/**
 * 把表格单元格选区构造成 PickRef：
 * - 单格：保留原有单格芯片（带 field、type、path、title、text）
 * - 多格矩形选区：合并为 1 个选区芯片（如「页面 · 3 行 × 2 列」），在 `cells` 中携带完整结构化数据，在 `text` 中附带 TSV 预览。
 */
export function buildTableSelectionPicks(input: BuildTableSelectionPicksInput): PickRef[] {
  const { cursors, recordKind, collectionPath, collectionLabel, route, readCell } = input
  const resolved: Array<{ cursor: TableCellCursor; info: TableSelectionCellInfo }> = []
  for (const cursor of cursors) {
    if (!cursor.key || cursor.key === 'actions') continue
    const info = readCell(cursor)
    if (!info) continue
    resolved.push({ cursor, info })
  }
  if (!resolved.length) return []

  if (resolved.length === 1) {
    const { info } = resolved[0]!
    return [
      {
        kind: recordKind,
        id: fieldPickId(info.id, info.field),
        label: info.label,
        route,
        ...(info.path ? { path: info.path } : {}),
        ...(info.title ? { title: info.title } : {}),
        field: info.field,
        type: info.type,
        ...(info.text ? { text: info.text } : {}),
        ...(info.selection ? { selection: info.selection } : {}),
      },
    ]
  }

  const rowKeys: string[] = []
  const rowMap = new Map<string, string[]>()
  const colKeys: string[] = []
  const colSet = new Set<string>()
  const cells: PickRangeCell[] = []

  for (const { cursor, info } of resolved) {
    const rowId = cursor.rowKey || cursor.id
    let bucket = rowMap.get(rowId)
    if (!bucket) {
      bucket = []
      rowMap.set(rowId, bucket)
      rowKeys.push(rowId)
    }
    bucket.push(info.text)
    if (!colSet.has(info.field)) {
      colSet.add(info.field)
      colKeys.push(info.field)
    }
    cells.push({
      ...(info.path ? { path: info.path } : {}),
      id: info.id,
      ...(info.title ? { title: info.title } : {}),
      field: info.field,
      ...(info.label ? { label: info.label } : {}),
      ...(info.type ? { type: info.type } : {}),
      ...(info.text ? { text: info.text } : {}),
    })
  }

  const rowCount = rowKeys.length
  const colCount = colKeys.length
  const host = String(collectionLabel ?? '').trim() || recordKind || '表格'
  const summary = `${host} · ${rowCount} 行 × ${colCount} 列`
  const plain = rowKeys
    .map((key) => (rowMap.get(key) ?? []).map(escapeTsvCell).join('\t'))
    .join('\n')
  const rangeKey = `${collectionPath}|${rowKeys.join(',')}|${colKeys.join(',')}`

  return [
    {
      kind: recordKind,
      id: `range:${pickIdFromText(rangeKey)}`,
      label: summary,
      title: summary,
      route,
      ...(collectionPath ? { path: collectionPath } : {}),
      ...(plain ? { text: plain } : {}),
      cells,
    },
  ]
}
