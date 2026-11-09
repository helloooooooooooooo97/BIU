import { useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import type { FsContentProps, FsDetailBarProps } from '@biu/type-file-system/ui'
import { normalizeSchemaPack } from '@biu/type-file-system'
import { LocalText } from './controls.tsx'
import { loadTagViews, useTagViews } from './tag-views.ts'
import { TagHostView } from './tag-host-view.tsx'
import { TAG_TABLE_VIEW_ID, setTagPresentMode, useTagPresentMode } from './tag-present.ts'
import { TagViewSwitcher } from './tag-view-switcher.tsx'

export function TagDetailBar({
  record,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: FsDetailBarProps) {
  const tagId = String(record.id ?? '').trim()
  const stamp = tagId.includes('::')
  const present = useTagPresentMode(tagId)
  const views = useTagViews(tagId)
  useEffect(() => {
    if (!tagId || stamp) return
    void loadTagViews(tagId, record.views)
  }, [tagId, record.views, stamp])
  if (stamp) return null
  const sandbox = views.find((item) => item.id === present)
  const viewId = sandbox ? sandbox.id : TAG_TABLE_VIEW_ID
  return (
    <div className="tasks-toolbar" data-testid="fsdb-tag-detail-bar">
      <div className="tasks-toolbar-left">
        <div className="tasks-viewtabs">
          <TagViewSwitcher
            tagId={tagId}
            viewId={viewId}
            writable
            testId="tag-detail-view"
            onPick={(id) => setTagPresentMode(tagId, id)}
          />
        </div>
      </div>
      <div className="tasks-toolbar-right">
        {onPrev || onNext ? (
          <>
            <button
              type="button"
              className="tasks-icon-btn"
              aria-label="上一条"
              disabled={!canPrev}
              onClick={onPrev}
            >
              <ChevronLeftIcon aria-hidden className="size-[14px]" />
            </button>
            <button
              type="button"
              className="tasks-icon-btn"
              aria-label="下一条"
              disabled={!canNext}
              onClick={onNext}
            >
              <ChevronRightIcon aria-hidden className="size-[14px]" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function TagContent({ record, value, writable, onChange }: FsContentProps) {
  const tagId = String(record.id ?? '').trim()
  const stamp = tagId.includes('::')
  const present = useTagPresentMode(tagId)
  const views = useTagViews(tagId)
  useEffect(() => {
    if (!tagId || stamp) return
    void loadTagViews(tagId, record.views)
  }, [tagId, record.views, stamp])
  const sandbox = views.find((item) => item.id === present)
  let fields: unknown = record.fields
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields) as unknown
    } catch {
      fields = []
    }
  }
  const pack = normalizeSchemaPack({
    id: tagId,
    label: String(record.title ?? ''),
    fields,
  })
  if (!stamp && sandbox) {
    return (
      <TagHostView
        tagId={tagId}
        viewId={sandbox.id}
        pack={pack ?? undefined}
        values={{}}
        recordPath={`/tags/${tagId}`}
        writable={writable !== false}
        onValues={() => undefined}
      />
    )
  }
  const saved = typeof value === 'string' || value == null ? String(value ?? '') : JSON.stringify(value, null, 2)
  if (writable === false) {
    return saved ? <div className="fsdb-detail-doc is-ro">{saved}</div> : null
  }
  return (
    <LocalText
      as="textarea"
      className="fsdb-detail-doc"
      value={saved}
      rows={12}
      placeholder=""
      onCommit={(next) => onChange?.(next)}
    />
  )
}
