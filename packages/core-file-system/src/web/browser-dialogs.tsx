import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronDownIcon, TagIcon } from '@heroicons/react/16/solid'
import { useFloatingPosition } from '@biu/biu-ui/floating-position'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import type { CollectionActionInfo, DbRecord, FieldSpec } from '@biu/type-file-system'
import { AppDialog, CheckRow } from './controls.tsx'
import { TRASH_COLLECTION_PATH } from './database-path.ts'
import { tagChipLabel } from './schema-field.tsx'
import { loadTags } from './tag-catalog.ts'

export type BrowserDialogState =
  | { kind: 'action'; row: DbRecord; action: CollectionActionInfo }
  | { kind: 'alert'; title: string; body: string }
  | { kind: 'delete-record'; row: DbRecord }
  | { kind: 'delete-records'; ids: string[] }
  | { kind: 'bulk-edit'; ids: string[] }
  | { kind: 'bulk-tag'; ids: string[] }
  | {
      kind: 'release-member-view'
      viewName: string
      action: 'unlock' | 'delete'
      grantCount: number
      resolve: (mode: 'freeze' | 'revoke' | null) => void
    }
  | null

function BulkFieldSelect({
  value,
  fields,
  onChange,
}: {
  value: string
  fields: Array<{ key: string; field: FieldSpec }>
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = fields.find((item) => item.key === value) ?? fields[0]
  const pos = useFloatingPosition(open ? triggerRef.current : null, menuRef, {
    enabled: open,
    placement: 'bottom-start',
    offset: 4,
    fallbackWidth: 220,
    fallbackHeight: Math.min(fields.length * 36 + 10, 260),
  })
  const portalRoot = typeof document !== 'undefined' ? overlayPortalRoot() : null
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`fsdb-share-select-trigger${open ? ' is-open' : ''}`}
        aria-label="选择字段"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{current ? current.field.label || current.key : '选择字段'}</span>
        <ChevronDownIcon aria-hidden className="fsdb-share-select-chevron size-3.5" />
      </button>
      {open && portalRoot
        ? createPortal(
            <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={triggerRef}>
              <div
                ref={menuRef}
                className="fsdb-share-select-menu"
                role="listbox"
                aria-label="选择字段"
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  minWidth: Math.max(200, pos.anchorWidth),
                  maxHeight: pos.maxHeight,
                  zIndex: overlayZ(OVERLAY_Z.menu),
                }}
              >
                {fields.map((item) => {
                  const selected = item.key === value
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`fsdb-share-select-option${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        onChange(item.key)
                        setOpen(false)
                      }}
                    >
                      <span className="fsdb-share-select-option-copy">
                        <strong>{item.field.label || item.key}</strong>
                      </span>
                      {selected ? <CheckIcon aria-hidden className="fsdb-share-select-check size-3.5" /> : null}
                    </button>
                  )
                })}
              </div>
            </HeadlessDismiss>,
            portalRoot,
          )
        : null}
    </>
  )
}

function ReleaseMemberViewDialog({
  viewName,
  action,
  grantCount,
  onDone,
}: {
  viewName: string
  action: 'unlock' | 'delete'
  grantCount: number
  onDone: (mode: 'freeze' | 'revoke' | null) => void
}) {
  const [mode, setMode] = useState<'freeze' | 'revoke'>('freeze')
  const verb = action === 'delete' ? '删除' : '解锁'
  return (
    <AppDialog
      title={`${verb}动态成员视图`}
      confirm={mode === 'freeze' ? `固化名单并${verb}` : `取消授权并${verb}`}
      danger={mode === 'revoke' || action === 'delete'}
      onCancel={() => onDone(null)}
      onConfirm={() => onDone(mode)}
      body={
        <>
          <p>
            锁定成员视图「{viewName}」正被 {grantCount} 条记录动态引用，请选择处理方式：
          </p>
          <div className="fsdb-release-choices" role="radiogroup" aria-label="动态引用处理方式">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'freeze'}
              className={`fsdb-release-choice${mode === 'freeze' ? ' is-on' : ''}`}
              onClick={() => setMode('freeze')}
            >
              <strong>固化为当前静态名单</strong>
              <span>保留这 {grantCount} 条记录现有成员的访问权限，再{verb}视图</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'revoke'}
              className={`fsdb-release-choice${mode === 'revoke' ? ' is-on' : ''}`}
              onClick={() => setMode('revoke')}
            >
              <strong>取消所有关联授权</strong>
              <span>撤销这 {grantCount} 条记录对该成员视图的动态授权，再{verb}视图</span>
            </button>
          </div>
        </>
      }
    />
  )
}

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
            {collectionPath === TRASH_COLLECTION_PATH
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
              <BulkFieldSelect value={bulkEditKey} fields={bulkFields} onChange={setBulkEditKey} />
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
  if (dlg.kind === 'release-member-view') {
    return (
      <ReleaseMemberViewDialog
        viewName={dlg.viewName}
        action={dlg.action}
        grantCount={dlg.grantCount}
        onDone={(mode) => {
          const done = dlg.resolve
          setDlg(null)
          done(mode)
        }}
      />
    )
  }
  return null
}
