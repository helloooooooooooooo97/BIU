import { TagIcon } from '@heroicons/react/16/solid'
import type { CollectionActionInfo, DbRecord, FieldSpec } from '@biu/type-file-system'
import { AppDialog, CheckRow } from './controls.tsx'
import { tagChipLabel } from './schema-field.tsx'
import { loadTags } from './tag-catalog.ts'

export type BrowserDialogState =
  | { kind: 'action'; row: DbRecord; action: CollectionActionInfo }
  | { kind: 'alert'; title: string; body: string }
  | { kind: 'delete-record'; row: DbRecord }
  | { kind: 'delete-records'; ids: string[] }
  | { kind: 'bulk-edit'; ids: string[] }
  | { kind: 'bulk-tag'; ids: string[] }
  | null

export function BrowserDialogs({
  dlg,
  setDlg,
  collectionPath,
  labelOf,
  bulkFields,
  bulkEditKey,
  setBulkEditKey,
  bulkEditRaw,
  setBulkEditRaw,
  bulkTagIds,
  setBulkTagIds,
  onDeleteRecord,
  onDeleteRecords,
  onBulkEdit,
  onBulkTag,
  onExecuteAction,
}: {
  dlg: BrowserDialogState
  setDlg: (next: BrowserDialogState) => void
  collectionPath: string
  labelOf: (row: DbRecord) => string
  bulkFields: Array<{ key: string; field: FieldSpec }>
  bulkEditKey: string
  setBulkEditKey: (next: string) => void
  bulkEditRaw: string
  setBulkEditRaw: (next: string) => void
  bulkTagIds: string[]
  setBulkTagIds: (updater: (prev: string[]) => string[]) => void
  onDeleteRecord: (row: DbRecord) => void
  onDeleteRecords: (ids: string[]) => void
  onBulkEdit: (ids: string[], key: string, raw: string) => void
  onBulkTag: (ids: string[], tags: string[]) => void
  onExecuteAction: (row: DbRecord, action: CollectionActionInfo) => void
}) {
  if (!dlg) return null
  if (dlg.kind === 'delete-record') {
    return (
      <AppDialog
        title="删除记录"
        confirm="删除"
        danger
        onCancel={() => setDlg(null)}
        onConfirm={() => {
          const { row } = dlg
          setDlg(null)
          onDeleteRecord(row)
        }}
        body={<p>确定删除「{labelOf(dlg.row)}」？会放进回收站，可随时恢复。</p>}
      />
    )
  }
  if (dlg.kind === 'delete-records') {
    return (
      <AppDialog
        title="删除记录"
        confirm="删除"
        danger
        onCancel={() => setDlg(null)}
        onConfirm={() => {
          const { ids } = dlg
          setDlg(null)
          onDeleteRecords(ids)
        }}
        body={
          <p>
            {collectionPath === '/trash'
              ? `确定彻底删除选中的 ${dlg.ids.length} 条？不可恢复。`
              : `确定删除选中的 ${dlg.ids.length} 条记录？会放进回收站，可随时恢复。`}
          </p>
        }
      />
    )
  }
  if (dlg.kind === 'bulk-edit') {
    return (
      <AppDialog
        title={`编辑 ${dlg.ids.length} 条`}
        confirm="写入"
        disabled={!bulkEditKey}
        onCancel={() => setDlg(null)}
        onConfirm={() => {
          const { ids } = dlg
          const key = bulkEditKey
          const raw = bulkEditRaw
          setDlg(null)
          onBulkEdit(ids, key, raw)
        }}
        body={
          <div className="fsdb-bulk-form">
            <label className="fsdb-bulk-label">
              字段
              <select className="fsdb-dlg-input" value={bulkEditKey} onChange={(event) => setBulkEditKey(event.target.value)}>
                {bulkFields.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.field.label || item.key}
                  </option>
                ))}
              </select>
            </label>
            <label className="fsdb-bulk-label">
              值
              <input
                className="fsdb-dlg-input"
                value={bulkEditRaw}
                placeholder="写入到选中记录"
                onChange={(event) => setBulkEditRaw(event.target.value)}
              />
            </label>
          </div>
        }
      />
    )
  }
  if (dlg.kind === 'bulk-tag') {
    const tags = loadTags()
    return (
      <AppDialog
        title={`标签 · ${dlg.ids.length} 条`}
        confirm="贴上"
        disabled={!bulkTagIds.length}
        onCancel={() => setDlg(null)}
        onConfirm={() => {
          const { ids } = dlg
          const selectedTags = bulkTagIds
          setDlg(null)
          onBulkTag(ids, selectedTags)
        }}
        body={
          tags.length ? (
            <div className="fsdb-bulk-form">
              {tags.map((pack) => {
                const on = bulkTagIds.includes(pack.id)
                return (
                  <CheckRow
                    key={pack.id}
                    label={tagChipLabel(pack)}
                    icon={<TagIcon aria-hidden className="size-[14px]" />}
                    on={on}
                    onToggle={() =>
                      setBulkTagIds((prev) => (on ? prev.filter((id) => id !== pack.id) : [...prev, pack.id]))
                    }
                  />
                )
              })}
            </div>
          ) : (
            <p>还没有标签。先到标签库里建一个，再回来贴。</p>
          )
        }
      />
    )
  }
  if (dlg.kind === 'action') {
    return (
      <AppDialog
        title={dlg.action.label}
        confirm={dlg.action.label}
        danger={dlg.action.tone === 'danger'}
        onCancel={() => setDlg(null)}
        onConfirm={() => {
          const { row, action } = dlg
          setDlg(null)
          onExecuteAction(row, action)
        }}
        body={<p>{dlg.action.confirm}</p>}
      />
    )
  }
  if (dlg.kind === 'alert') {
    return (
      <AppDialog
        title={dlg.title}
        confirm="知道了"
        hideCancel
        onCancel={() => setDlg(null)}
        onConfirm={() => setDlg(null)}
        body={<p>{dlg.body}</p>}
      />
    )
  }
  return null
}
