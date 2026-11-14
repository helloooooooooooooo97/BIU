import { useEffect, useRef, useState } from 'react'
import { TagChip } from '@biu/biu-ui'
import { TagIcon } from '@heroicons/react/16/solid'
import { type CollectionSchemaPack } from '@biu/type-file-system'
import { CellPop } from './cell-pop.tsx'
import { TagPickPanel } from './cell-pop-draft.tsx'
import { FieldValuePop } from './field-value-pop.tsx'
import { FieldGlyph } from './fsdb-cells.tsx'
import { ensureFsdbStyle } from './fsdb-style.ts'
import { PropertyRow } from './property-row.tsx'
import { tagChipIcon, tagChipLabel } from './schema-field.tsx'
import { createTag, jumpTag, loadTags, pullTags, subscribeTagChrome } from './tag-catalog.ts'
import { TagHostView } from './tag-host-view.tsx'
import { TAG_TABLE_VIEW_ID } from './tag-present.ts'
import { loadTagViews, useTagViews } from './tag-views.ts'
import { TABLE_VIEW_NAME, TagViewSwitcher } from './tag-view-switcher.tsx'

export { TABLE_VIEW_NAME }

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
  return id || TAG_TABLE_VIEW_ID
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
  const present = sandbox ? sandbox.id : TAG_TABLE_VIEW_ID

  function saveTagId(next: string) {
    update({
      tagId: next,
      tagIds: undefined,
      tags: undefined,
      values: next && next === tagId ? values : {},
      viewId: TAG_TABLE_VIEW_ID,
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
      {tagId && present !== TAG_TABLE_VIEW_ID ? (
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
