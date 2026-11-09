import { useEffect, useRef, useState } from 'react'
import { TagChip } from '@biu/biu-ui'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { PencilSquareIcon, PlusIcon, Square2StackIcon, Squares2X2Icon, TagIcon } from '@heroicons/react/16/solid'
import { type CollectionSchemaPack } from '@biu/type-file-system'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { CellPop } from './cell-pop.tsx'
import { TagPickPanel } from './cell-pop-draft.tsx'
import { FieldValuePop } from './field-value-pop.tsx'
import { FieldGlyph } from './fsdb-cells.tsx'
import { ensureFsdbStyle } from './fsdb-style.ts'
import { ViewModeGlyph } from './nav-glyphs.tsx'
import { PropertyRow } from './property-row.tsx'
import { tagChipIcon, tagChipLabel } from './schema-field.tsx'
import { createTag, jumpTag, loadTags, pullTags, subscribeTagChrome, tagLabel } from './tag-catalog.ts'
import { TagHostView } from './tag-host-view.tsx'
import {
  copyTagSandboxView,
  createTagSandboxView,
  deleteTagSandboxView,
  loadTagViews,
  renameTagSandboxView,
  useTagViews,
} from './tag-views.ts'

export const TABLE_VIEW_NAME = '表格'
const TABLE_VIEW_ID = 'table'

export function parseTagId(data: Record<string, unknown>): string {
  const direct = String(data.tagId ?? '').trim()
  if (direct) return direct
  const raw = data.tagIds ?? data.tags
  if (!Array.isArray(raw)) return ''
  return String(raw.find((item) => String(item ?? '').trim()) ?? '').trim()
}

export function parseTagIds(data: Record<string, unknown>): string[] {
  const id = parseTagId(data)
  return id ? [id] : []
}

export function parseBlockValues(data: Record<string, unknown>): Record<string, unknown> {
  const raw = data.values
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return { ...(raw as Record<string, unknown>) }
}

export function parseBlockViewId(data: Record<string, unknown>): string {
  const id = String(data.viewId ?? '').trim()
  return id || TABLE_VIEW_ID
}

async function resolveTagId(catalog: CollectionSchemaPack[], raw: string) {
  const key = raw.trim()
  if (!key) return ''
  if (catalog.some((tag) => tag.id === key)) return key
  const hit = catalog.find((tag) => tag.label === key)
  if (hit) return hit.id
  return (await createTag(key)).id
}

function TagSwitcher({
  value,
  writable,
  onPick,
}: {
  value: string
  writable: boolean
  onPick: (id: string) => void
}) {
  const hostRef = useRef<HTMLButtonElement>(null)
  const [catalog, setCatalog] = useState(() => loadTags())
  const [open, setOpen] = useState(false)
  useEffect(() => subscribeTagChrome(() => setCatalog(loadTags())), [])
  const label = value ? tagLabel(value) : ''
  return (
    <>
      <button
        ref={hostRef}
        type="button"
        className={`page-tag-block-switch${value ? '' : ' is-empty'}`}
        data-testid="page-tag-block-switch"
        data-tag-id={value || undefined}
        aria-label={value ? '切换标签' : '选择标签'}
        disabled={!writable}
        onClick={() => {
          if (!writable) return
          setOpen(true)
          void pullTags()
        }}
      >
        {value ? (
          <TagChip id={value} label={label} icon={tagChipIcon(value)} />
        ) : (
          <>
            <TagIcon aria-hidden className="size-[14px]" />
            <span>{writable ? '选择标签' : '没有标签'}</span>
          </>
        )}
      </button>
      {open && writable ? (
        <CellPop open anchor={hostRef.current} className="is-tag" onClose={() => setOpen(false)}>
          <TagPickPanel
            values={value ? [value] : []}
            options={catalog.map((tag) => ({ value: tag.id, label: tagChipLabel(tag), icon: tagChipIcon(tag.id) }))}
            multiple={false}
            onChipClick={(id) => jumpTag(id)}
            onJump={() => setOpen(false)}
            onPicked={() => setOpen(false)}
            onChange={(next) => {
              const picked = next[0] ?? ''
              void resolveTagId(catalog, picked).then((id) => {
                onPick(id)
                setOpen(false)
              })
            }}
          />
        </CellPop>
      ) : null}
    </>
  )
}

function TagViewSwitcher({
  tagId,
  viewId,
  writable,
  onPick,
}: {
  tagId: string
  viewId: string
  writable: boolean
  onPick: (id: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const views = useTagViews(tagId)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const current = views.find((item) => item.id === viewId)
  const label = current?.name || TABLE_VIEW_NAME
  return (
    <div className="tasks-viewdd-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`tasks-viewdd-btn tasks-viewtab is-active${open ? ' is-menu' : ''}`}
        data-testid="page-tag-block-view"
        title="呈现方式"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
      >
        {current ? <Squares2X2Icon aria-hidden className="size-[14px]" /> : <ViewModeGlyph mode="table" />}
        <span className="tasks-viewdd-name">{label}</span>
      </button>
      {open ? (
        <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={wrapRef}>
          <div className="fsdb-tool-flyout tasks-viewdd-menu" role="menu">
            <div className="tasks-sort-list">
              <div className={`tasks-viewdd-item${viewId === TABLE_VIEW_ID ? ' is-active' : ''}`}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={viewId === TABLE_VIEW_ID}
                  className="tasks-viewdd-item-main fsdb-tool-row"
                  data-testid="page-tag-view-table"
                  onClick={() => {
                    onPick(TABLE_VIEW_ID)
                    setOpen(false)
                  }}
                >
                  <ViewModeGlyph mode="table" className="tasks-viewdd-item-ico" />
                  <span className="tasks-viewdd-item-name">{TABLE_VIEW_NAME}</span>
                </button>
              </div>
              {views.map((item) => (
                <div key={item.id} className={`tasks-viewdd-item${item.id === viewId ? ' is-active' : ''}`}>
                  {renaming === item.id ? (
                    <div className="tasks-viewdd-item-main fsdb-tool-row">
                      <Squares2X2Icon aria-hidden className="tasks-viewdd-item-ico" />
                      <input
                        className="tasks-viewdd-item-name"
                        aria-label={`沙盒视图名称 ${item.name}`}
                        value={renameDraft}
                        autoFocus
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void renameTagSandboxView(tagId, item.id, renameDraft).catch(() => undefined)
                            setRenaming('')
                          }
                          if (event.key === 'Escape') setRenaming('')
                        }}
                        onBlur={() => {
                          void renameTagSandboxView(tagId, item.id, renameDraft).catch(() => undefined)
                          setRenaming('')
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.id === viewId}
                      className="tasks-viewdd-item-main fsdb-tool-row"
                      data-testid={`page-tag-view-${item.id}`}
                      onClick={() => {
                        onPick(item.id)
                        setOpen(false)
                      }}
                    >
                      <Squares2X2Icon aria-hidden className="tasks-viewdd-item-ico" />
                      <span className="tasks-viewdd-item-name">{item.name}</span>
                    </button>
                  )}
                  <span className="tasks-viewdd-item-actions">
                    <button
                      type="button"
                      className="tasks-viewdd-act"
                      title="拷贝视图"
                      disabled={!writable}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void copyTagSandboxView(tagId, item.id, tagLabel(tagId))
                          .then((view) => {
                            if (view) onPick(view.id)
                          })
                          .catch(() => undefined)
                      }}
                    >
                      <Square2StackIcon aria-hidden className="size-[14px]" />
                    </button>
                    <button
                      type="button"
                      className="tasks-viewdd-act"
                      title="重命名"
                      disabled={!writable}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setRenaming(item.id)
                        setRenameDraft(item.name)
                      }}
                    >
                      <PencilSquareIcon aria-hidden className="size-[14px]" />
                    </button>
                    <button
                      type="button"
                      className="tasks-viewdd-act is-danger"
                      title="删除"
                      disabled={!writable}
                      data-testid={`page-tag-view-delete-${item.id}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void deleteTagSandboxView(tagId, item.id)
                          .then(() => {
                            if (viewId === item.id) onPick(TABLE_VIEW_ID)
                          })
                          .catch(() => undefined)
                      }}
                    >
                      <TrashGlyph aria-hidden className="size-[14px]" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <div className="tasks-viewdd-foot">
              <button
                type="button"
                role="menuitem"
                className="tasks-viewdd-saveas fsdb-tool-row font-medium"
                data-testid="page-tag-view-create"
                disabled={!writable || creating || !tagId}
                onClick={() => {
                  if (!writable || creating || !tagId) return
                  setCreating(true)
                  void createTagSandboxView(tagId, tagLabel(tagId), `沙盒 ${views.length + 1}`)
                    .then((view) => onPick(view.id))
                    .catch(() => undefined)
                    .finally(() => {
                      setCreating(false)
                      setOpen(false)
                    })
                }}
              >
                <PlusIcon aria-hidden className="size-[14px]" />
                {creating ? '正在创建…' : '新建沙盒视图'}
              </button>
            </div>
          </div>
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}

export function TagBlockView({
  data,
  update,
  writable,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}) {
  ensureFsdbStyle()
  const tagId = parseTagId(data)
  const values = parseBlockValues(data)
  const viewId = parseBlockViewId(data)
  const [catalog, setCatalog] = useState(() => loadTags())
  const views = useTagViews(tagId)

  useEffect(() => subscribeTagChrome(() => setCatalog(loadTags())), [])
  useEffect(() => {
    void pullTags()
  }, [])
  useEffect(() => {
    if (!tagId) return
    void loadTagViews(tagId)
  }, [tagId])

  const pack = catalog.find((tag) => tag.id === tagId)
  const fields = (pack?.fields ?? []).filter((field) => !field.deleted)
  const hostRecord = { id: 'page-tag-block', title: '' }
  const sandbox = views.find((item) => item.id === viewId)
  const present = sandbox ? sandbox.id : TABLE_VIEW_ID

  function saveTagId(next: string) {
    update({
      tagId: next,
      tagIds: undefined,
      tags: undefined,
      values: next && next === tagId ? values : {},
      viewId: TABLE_VIEW_ID,
    })
  }

  function saveValues(nextBag: Record<string, unknown>) {
    update({ values: nextBag })
  }

  return (
    <div className="page-tag-block fsdb-page" data-testid="page-tag-block" onMouseDown={(event) => event.stopPropagation()}>
      <div className="tasks-toolbar">
        <div className="tasks-toolbar-left">
          <div className="tasks-viewtabs">
            <TagViewSwitcher tagId={tagId} viewId={present} writable={writable} onPick={(id) => update({ viewId: id })} />
            <TagSwitcher value={tagId} writable={writable} onPick={saveTagId} />
          </div>
        </div>
      </div>
      {tagId && present !== TABLE_VIEW_ID ? (
        <TagHostView tagId={tagId} viewId={present} pack={pack} values={values} writable={writable} onValues={saveValues} />
      ) : tagId ? (
        <div className="page-tag-block-table fsdb-detail-aside">
          <table className="tasks-table is-wrap">
            <thead>
              <tr>
                <th>
                  <span className="tasks-th">
                    <span className="tasks-th-ico">
                      <FieldGlyph kind="string" />
                    </span>
                    属性名
                  </span>
                </th>
                <th>
                  <span className="tasks-th">
                    <span className="tasks-th-ico">
                      <FieldGlyph kind="string" />
                    </span>
                    属性值
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <PropertyRow key={field.key} table field={field} fieldKey={field.key}>
                  <FieldValuePop
                    record={hostRecord}
                    fieldKey={field.key}
                    field={{ ...field, writable: writable !== false }}
                    value={values[field.key]}
                    collectionPath="/pages"
                    onSubmit={(next) => saveValues({ ...values, [field.key]: next })}
                  />
                </PropertyRow>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
