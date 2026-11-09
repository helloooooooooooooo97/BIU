import { useRef, useState } from 'react'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { PencilSquareIcon, PlusIcon, Square2StackIcon, TagIcon } from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { ViewModeGlyph } from './nav-glyphs.tsx'
import { tagLabel } from './tag-catalog.ts'
import { TAG_TABLE_VIEW_ID } from './tag-present.ts'
import {
  copyTagSandboxView,
  createTagSandboxView,
  deleteTagSandboxView,
  renameTagSandboxView,
  useTagViews,
} from './tag-views.ts'

export const TABLE_VIEW_NAME = '表格'

export function TagViewSwitcher({
  tagId,
  viewId,
  writable,
  onPick,
  testId = 'page-tag-block-view',
  asIcon = false,
}: {
  tagId: string
  viewId: string
  writable: boolean
  onPick: (id: string) => void
  testId?: string
  asIcon?: boolean
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
        className={asIcon ? `tasks-sort-btn${open ? ' is-active' : ''}` : `tasks-viewdd-btn tasks-viewtab is-active${open ? ' is-menu' : ''}`}
        data-testid={testId}
        aria-label="查看模式"
        title="呈现方式"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
      >
        {current ? <TagIcon aria-hidden className="size-[14px]" /> : <ViewModeGlyph mode="table" />}
        {asIcon ? null : <span className="tasks-viewdd-name">{label}</span>}
      </button>
      {open ? (
        <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={wrapRef}>
          <div className="fsdb-tool-flyout tasks-viewdd-menu" role="menu">
            <div className="tasks-sort-list">
              <div className={`tasks-viewdd-item${viewId === TAG_TABLE_VIEW_ID ? ' is-active' : ''}`}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={viewId === TAG_TABLE_VIEW_ID}
                  className="tasks-viewdd-item-main fsdb-tool-row"
                  data-testid="page-tag-view-table"
                  onClick={() => {
                    onPick(TAG_TABLE_VIEW_ID)
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
                      <TagIcon aria-hidden className="tasks-viewdd-item-ico" />
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
                      <TagIcon aria-hidden className="tasks-viewdd-item-ico" />
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
                            if (viewId === item.id) onPick(TAG_TABLE_VIEW_ID)
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
                  void createTagSandboxView(tagId, tagLabel(tagId), '新视图')
                    .then((view) => onPick(view.id))
                    .catch(() => undefined)
                    .finally(() => {
                      setCreating(false)
                      setOpen(false)
                    })
                }}
              >
                <PlusIcon aria-hidden className="size-[14px]" />
                {creating ? '正在创建…' : '新建内容视图'}
              </button>
            </div>
          </div>
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}
