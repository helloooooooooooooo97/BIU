import type { CollectionSchema, DbRecord, FieldSpec } from '@biu/type-file-system'
import type { CollectionRowViewType } from '@biu/type-file-system/ui'

export type BoundRowField = {
  key: string
  spec?: FieldSpec
  value: unknown
  label: string
}

export function bindRowFields(
  record: DbRecord,
  schema: CollectionSchema | undefined,
  columns: string[],
): BoundRowField[] {
  const keys = columns.map((key) => String(key ?? '').trim()).filter(Boolean)
  return keys.map((key) => {
    const spec = schema?.fields[key]
    return {
      key,
      spec,
      value: record[key],
      label: String(spec?.label ?? key),
    }
  })
}

export function CollectionRowsShell({
  rows,
  schema,
  columns,
  onOpen,
  Row,
}: {
  rows: DbRecord[]
  schema?: CollectionSchema
  columns: string[]
  onOpen: (row: DbRecord) => void
  Row: CollectionRowViewType['Row']
}) {
  if (!rows.length) return <p className="fsdb-empty">暂无记录</p>
  return (
    <div className="fsdb-rows-view" data-testid="fsdb-rows-view">
      {rows.map((row) => (
        <div key={row.id} className="fsdb-rows-view-item">
          <Row record={row} fields={bindRowFields(row, schema, columns)} onOpen={() => onOpen(row)} />
        </div>
      ))}
    </div>
  )
}
