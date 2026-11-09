import { useEffect, useRef, useState } from 'react'
import { HeadlessDismiss } from '@biu/biu-ui'
import { ChevronLeftIcon, ChevronRightIcon, PencilSquareIcon, PlusIcon, Square2StackIcon, Squares2X2Icon } from '@heroicons/react/16/solid'
import type { FsContentProps, FsDetailBarProps } from '@biu/type-file-system/ui'
import { normalizeSchemaPack } from '@biu/type-file-system'
import { LocalText } from './controls.tsx'
import { loadTagViews, useTagViews } from './tag-views.ts'
import { TagHostView } from './tag-host-view.tsx'
import { TAG_TABLE_VIEW_ID, setTagPresentMode, useTagPresentMode } from './tag-present.ts'
import { TagViewSwitcher } from './tag-view-switcher.tsx'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import {
  addRecordLayout,
  copyRecordLayout,
  deleteRecordLayout,
  loadRecordLayouts,
  renameRecordLayout,
  setActiveRecordLayoutId,
  patchActiveRecordLayout,
  useActiveRecordLayout,
  useRecordLayouts,
} from './record-layouts.ts'

const TAGS_PATH = '/tags'

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
  const layouts = useRecordLayouts(TAGS_PATH, tagId, 'table')
  const activeLayout = useActiveRecordLayout(TAGS_PATH, tagId, 'table')
  const viewRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [creatingLayout, setCreatingLayout] = useState(false)
  const [renamingView, setRenamingView] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  useEffect(() => {
    if (!tagId || stamp) return
    void loadTagViews(tagId, record.views)
    void loadRecordLayouts(TAGS_PATH, tagId, record.layouts, 'table')
  }, [tagId, record.views, record.layouts, stamp])
  if (stamp) return null
  const sandbox = views.find((item) => item.id === present)
  const viewId = sandbox ? sandbox.id : TAG_TABLE_VIEW_ID
  return (
    <div className="tasks-toolbar" data-testid="fsdb-tag-detail-bar">
      <div className="tasks-toolbar-left">
        <div className="tasks-viewdd-wrap" ref={viewRef}>
          <div className="tasks-viewtabs">
            <button
              type="button"
              className={`tasks-viewdd-btn tasks-viewtab is-active${open ? ' is-menu' : ''}`}
              aria-haspopup="menu"
              aria-expanded={open}
              data-testid="tag-layout-tab"
              onClick={() => setOpen((next) => !next)}
            >
              <Squares2X2Icon aria-hidden className="size-[14px]" />
              <span className="tasks-viewdd-name">{activeLayout.name}</span>
            </button>
          </div>
          {open ? (
            <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={viewRef}>
              <div className="fsdb-tool-flyout tasks-viewdd-menu" role="menu">
                <div className="tasks-sort-list">
                  {layouts.map((item) => (
                    <div key={item.id} className={`tasks-viewdd-item${item.id === activeLayout.id ? ' is-active' : ''}`}>
                      {renamingView === item.id ? (
                        <div className="tasks-viewdd-item-main fsdb-tool-row">
                          <Squares2X2Icon aria-hidden className="tasks-viewdd-item-ico" />
                          <input
                            className="tasks-viewdd-item-name"
                            aria-label={`视图名称 ${item.name}`}
                            value={renameDraft}
                            autoFocus
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void renameRecordLayout(TAGS_PATH, tagId, item.id, renameDraft).catch(() => undefined)
                                setRenamingView('')
                              }
                              if (event.key === 'Escape') setRenamingView('')
                            }}
                            onBlur={() => {
                              void renameRecordLayout(TAGS_PATH, tagId, item.id, renameDraft).catch(() => undefined)
                              setRenamingView('')
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={item.id === activeLayout.id}
                          className="tasks-viewdd-item-main fsdb-tool-row"
                          data-testid={`tag-layout-${item.id}`}
                          onClick={() => {
                            setActiveRecordLayoutId(TAGS_PATH, tagId, item.id)
                            setTagPresentMode(tagId, item.contentViewId)
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
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void copyRecordLayout(TAGS_PATH, tagId, item, 'table').catch(() => undefined)
                          }}
                        >
                          <Square2StackIcon aria-hidden className="size-[14px]" />
                        </button>
                        {item.builtin ? null : (
                          <>
                            <button
                              type="button"
                              className="tasks-viewdd-act"
                              title="重命名"
                              aria-label={`重命名 ${item.name}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setRenamingView(item.id)
                                setRenameDraft(item.name)
                              }}
                            >
                              <PencilSquareIcon aria-hidden className="size-[14px]" />
                            </button>
                            <button
                              type="button"
                              className="tasks-viewdd-act is-danger"
                              title="删除"
                              aria-label={`删除 ${item.name}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void deleteRecordLayout(TAGS_PATH, tagId, item.id, 'table').catch(() => undefined)
                              }}
                            >
                              <TrashGlyph aria-hidden className="size-[14px]" />
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="tasks-viewdd-foot">
                  <button
                    type="button"
                    role="menuitem"
                    className="tasks-viewdd-saveas fsdb-tool-row font-medium"
                    data-testid="tag-layout-create"
                    disabled={creatingLayout}
                    onClick={() => {
                      if (creatingLayout) return
                      setCreatingLayout(true)
                      void addRecordLayout(TAGS_PATH, tagId, 'table')
                        .catch(() => undefined)
                        .finally(() => {
                          setCreatingLayout(false)
                          setOpen(false)
                        })
                    }}
                  >
                    <PlusIcon aria-hidden className="size-[14px]" />
                    {creatingLayout ? '正在创建…' : '添加视图'}
                  </button>
                </div>
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
      </div>
      <div className="tasks-toolbar-right">
        <TagViewSwitcher
          tagId={tagId}
          viewId={viewId}
          writable
          asIcon
          testId="tag-detail-view"
          onPick={(id) => {
            setTagPresentMode(tagId, id)
            void patchActiveRecordLayout(TAGS_PATH, tagId, { contentViewId: id }, 'table')
          }}
        />
        {onPrev || onNext ? (
          <>
            <button type="button" className="tasks-icon-btn" aria-label="上一条" disabled={!canPrev} onClick={onPrev}>
              <ChevronLeftIcon aria-hidden className="size-[14px]" />
            </button>
            <button type="button" className="tasks-icon-btn" aria-label="下一条" disabled={!canNext} onClick={onNext}>
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
