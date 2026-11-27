import type { CollectionInfo, DbRecord } from '@biu/type-file-system'
import { collectionNoun } from '../catalog-views.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { idleTableIconKind } from './nav-glyphs.tsx'
import { defaultViewId } from './view-storage.ts'

export function SourceTableCell({
  record,
  tables,
  onOpenTable,
}: {
  record: DbRecord
  tables: CollectionInfo[]
  onOpenTable?: (path: string, viewId?: string) => void
}) {
  const path = normalizeCollectionPath(String(record.tablePath ?? ''))
  if (!path || path === '/') return null
  const table = tables.find((item) => item.path === path)
  const viewId = defaultViewId(path)
  const name = collectionNoun({ path, label: table?.label, view: table?.view })
  const jump = `全部${name}`
  const icon = String(record.tableIcon ?? table?.view?.icon ?? '').trim()
  const mark = (
    <>
      <span className="fsdb-record-mark is-sm" data-icon={idleTableIconKind(icon)} aria-hidden />
      <span className="fsdb-title-text">{name}</span>
    </>
  )
  if (!onOpenTable) {
    return (
      <span className="fsdb-source-table" title={jump}>
        {mark}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="fsdb-source-table"
      data-biu-ignore
      title={jump}
      aria-label={jump}
      onClick={(event) => {
        event.stopPropagation()
        onOpenTable(path, viewId)
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {mark}
    </button>
  )
}
