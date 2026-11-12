import { useEffect, useRef, useState } from 'react'
import { HeadlessDismiss } from '@biu/biu-ui'
import { HEADLESS_DISMISS_IGNORE } from '@biu/biu-ui/headless-dismiss'
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  Square2StackIcon,
  Squares2X2Icon,
  TableCellsIcon,
} from '@heroicons/react/16/solid'
import type { FsContentProps, FsDetailBarProps } from '@biu/type-file-system/ui'
import { normalizeSchemaPack } from '@biu/type-file-system'
import { parseRecordSandboxes, type RecordSandboxView } from '@biu/type-file-system/record-views'
import { LocalText } from './controls.tsx'
import { createTagSandboxView, loadTagViews, useTagViews } from './tag-views.ts'
import { createRecordSandboxView } from './record-sandboxes.ts'
import { TagHostView } from './tag-host-view.tsx'
import { TAG_TABLE_VIEW_ID, setTagPresentMode, useTagPresentMode } from './tag-present.ts'
import { TagViewSwitcher } from './tag-view-switcher.tsx'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { useStickyToolbar } from './sticky-toolbar.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'
import {
  DEFAULT_RECORD_PROP_VIEW_ID,
  addRecordLayout,
  copyRecordLayout,
  deleteRecordLayout,
  loadRecordLayouts,
  renameRecordLayout,
  setActiveRecordLayoutId,
  patchActiveRecordLayout,
  useActiveRecordLayout,
  useRecordLayouts,
  type RecordLayoutView,
} from './record-layouts.ts'

const TAGS_PATH = '/tags'

const SORTS: { id: RecordLayoutView['sort']; label: string }[] = [
  { id: 'doc', label: '默认顺序' },
  { id: 'title-asc', label: '按标题 A→Z' },
  { id: 'title-desc', label: '按标题 Z→A' },
  { id: 'kind', label: '按类型' },
]

function Row({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} className={`fsdb-checkrow fsdb-tool-row${on ? ' is-on' : ''}`} onClick={onToggle}>
      <span className="fsdb-checkrow-label">{label}</span>
    </button>
  )
}

async function saveTagPropViews(tagId: string, views: RecordSandboxView[]) {
  const id = String(tagId ?? '').trim()
  if (!id) return false
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `${TAGS_PATH}/${id}`, content: { propViews: JSON.stringify(views) } }),
  })
  if (!res.ok) return false
  window.dispatchEvent(new Event('fsdb:change'))
  return true
}

export function TagDetailBar({
  record,
  schema,
  hiddenPropertyKeys = [],
  onHiddenPropertyKeys,
  visiblePropertyKeys,
  onVisiblePropertyKeys,
  columnMenu,
  onRetry,
  configMenu,
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
  const propViews = parseRecordSandboxes(record.propViews)
  const propSandbox = propViews.find((item) => item.id === activeLayout.propViewId)
  const propViewId = propSandbox ? propSandbox.id : DEFAULT_RECORD_PROP_VIEW_ID
  const viewRef = useRef<HTMLDivElement>(null)
  const propRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  useStickyToolbar(toolbarRef)
  const [open, setOpen] = useState<string | null>(null)
  const [creatingLayout, setCreatingLayout] = useState(false)
  const [renamingView, setRenamingView] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [creatingPropView, setCreatingPropView] = useState(false)
  const [renamingPropView, setRenamingPropView] = useState('')
  const [renamePropDraft, setRenamePropDraft] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createKind, setCreateKind] = useState<'prop' | 'content'>('prop')
  const [creatingAny, setCreatingAny] = useState(false)
  const createRef = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const sortOn = activeLayout.sort !== 'doc'
  const filterOn = activeLayout.filterKinds.length > 0
  const props = Object.entries(schema?.fields ?? {})
    .filter(([key, field]) => key !== 'emoji' && key !== schema?.labelField && field.type !== 'file')
    .map(([key, field]) => ({ key, label: field.label ?? key }))
  const visibleKeys = visiblePropertyKeys ?? props.map((item) => item.key).filter((key) => !hiddenPropertyKeys.includes(key))
  useEffect(() => {
    setOpen(null)
    if (!tagId || stamp) return
    void loadTagViews(tagId, record.views)
    void loadRecordLayouts(TAGS_PATH, tagId, record.layouts, 'table')
  }, [tagId, record.views, record.layouts, stamp])
  useEffect(() => {
    if (!searchOpen) return
    searchInput.current?.focus({ preventScroll: true })
    searchInput.current?.select()
  }, [searchOpen])
  if (stamp) return null
  const sandbox = views.find((item) => item.id === present)
  const viewId = sandbox ? sandbox.id : TAG_TABLE_VIEW_ID
  const toggle = (next: string) => setOpen((prev) => (prev === next ? null : next))

  const refreshNow = async () => {
    if (refreshing) return
    setRefreshing(true)
    const started = Date.now()
    try {
      await Promise.resolve(onRetry?.())
    } finally {
      const wait = Math.max(0, 480 - (Date.now() - started))
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
      setRefreshing(false)
    }
  }

  async function createChosen(kind: 'prop' | 'content') {
    setCreateKind(kind)
    setCreateOpen(false)
    if (creatingAny) return
    setCreatingAny(true)
    try {
      if (kind === 'content') await createTagSandboxView(tagId, String(record.title ?? ''), '新视图')
      else {
        const view = await createRecordSandboxView({
          collectionPath: TAGS_PATH,
          recordId: tagId,
          fieldKey: 'propViews',
          listed: propViews,
          name: '新视图',
          title: String(record.title ?? ''),
        })
        void patchActiveRecordLayout(TAGS_PATH, tagId, { propViewId: view.id }, 'table')
      }
    } catch {
      /* ignore */
    } finally {
      setCreatingAny(false)
    }
  }

  return (
    <div
      className="tasks-toolbar"
      ref={toolbarRef}
      data-testid="fsdb-tag-detail-bar"
      data-biu-ignore
      onMouseDown={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('input,textarea,select,[contenteditable="true"]')) return
        if (target.closest('button,[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')) {
          event.preventDefault()
        }
      }}
    >
      <div className="tasks-toolbar-left">
        <div className="tasks-viewdd-wrap" ref={viewRef}>
          <div className="tasks-viewtabs">
            <button
              type="button"
              className={`tasks-viewdd-btn tasks-viewtab is-active${open === 'view' ? ' is-menu' : ''}`}
              aria-haspopup="menu"
              aria-expanded={open === 'view'}
              data-testid="tag-layout-tab"
              onClick={() => toggle('view')}
            >
              <Squares2X2Icon aria-hidden className="size-[14px]" />
              <span className="tasks-viewdd-name">{activeLayout.name}</span>
            </button>
          </div>
          {open === 'view' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={viewRef}>
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
                            setOpen(null)
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
                        {item.builtin ? null : (
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
                          setOpen(null)
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
        <HeadlessDismiss
          enabled={searchOpen}
          onDismiss={() => {
            if (!searchQuery) setSearchOpen(false)
          }}
        >
          <div className={`tasks-search-wrap${searchOpen ? ' is-open is-find' : ''}`}>
            <button
              type="button"
              className={`tasks-sort-btn${searchOpen ? ' is-active' : ''}`}
              aria-label="搜索"
              aria-expanded={searchOpen}
              title="搜索"
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false)
                  setSearchQuery('')
                } else setSearchOpen(true)
              }}
            >
              <MagnifyingGlassIcon aria-hidden className="size-[14px]" />
            </button>
            {searchOpen ? (
              <input
                ref={searchInput}
                className="tasks-search"
                value={searchQuery}
                placeholder="搜索"
                aria-label="搜索"
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setSearchOpen(false)
                    setSearchQuery('')
                  }
                }}
              />
            ) : null}
          </div>
        </HeadlessDismiss>
        <div className="tasks-sort-wrap" ref={propRef}>
          <button
            type="button"
            className={`tasks-sort-btn${open === 'props' || propViewId !== DEFAULT_RECORD_PROP_VIEW_ID ? ' is-active' : ''}`}
            aria-label="属性展示"
            title="属性展示"
            data-testid="tag-prop-view"
            onClick={() => toggle('props')}
          >
            {propViewId === DEFAULT_RECORD_PROP_VIEW_ID ? (
              <TableCellsIcon aria-hidden className="size-[14px]" />
            ) : (
              <SandboxKindIcon className="size-[14px]" />
            )}
          </button>
          {open === 'props' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={propRef}>
              <div className="tasks-sort-menu fsdb-tool-flyout" role="menu">
                <div className="tasks-sort-list">
                  <div className={`tasks-viewdd-item${propViewId === DEFAULT_RECORD_PROP_VIEW_ID ? ' is-active' : ''}`}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={propViewId === DEFAULT_RECORD_PROP_VIEW_ID}
                      className="tasks-viewdd-item-main fsdb-tool-row"
                      data-testid="tag-prop-view-table"
                      onClick={() => {
                        void patchActiveRecordLayout(TAGS_PATH, tagId, { propViewId: DEFAULT_RECORD_PROP_VIEW_ID }, 'table')
                        setOpen(null)
                      }}
                    >
                      <TableCellsIcon aria-hidden className="tasks-viewdd-item-ico" />
                      <span className="tasks-viewdd-item-name">表格</span>
                    </button>
                  </div>
                  {propViews.map((item) => (
                    <div key={item.id} className={`tasks-viewdd-item${item.id === propViewId ? ' is-active' : ''}`}>
                      {renamingPropView === item.id ? (
                        <div className="tasks-viewdd-item-main fsdb-tool-row">
                          <SandboxKindIcon className="tasks-viewdd-item-ico" />
                          <input
                            className="tasks-viewdd-item-name"
                            aria-label={`属性视图名称 ${item.name}`}
                            value={renamePropDraft}
                            autoFocus
                            onChange={(event) => setRenamePropDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                const nextName = renamePropDraft.trim()
                                if (nextName) {
                                  void saveTagPropViews(
                                    tagId,
                                    propViews.map((view) => (view.id === item.id ? { ...view, name: nextName } : view)),
                                  )
                                }
                                setRenamingPropView('')
                              }
                              if (event.key === 'Escape') setRenamingPropView('')
                            }}
                            onBlur={() => {
                              const nextName = renamePropDraft.trim()
                              if (nextName) {
                                void saveTagPropViews(
                                  tagId,
                                  propViews.map((view) => (view.id === item.id ? { ...view, name: nextName } : view)),
                                )
                              }
                              setRenamingPropView('')
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={item.id === propViewId}
                          className="tasks-viewdd-item-main fsdb-tool-row"
                          data-testid={`tag-prop-view-${item.id}`}
                          onClick={() => {
                            void patchActiveRecordLayout(TAGS_PATH, tagId, { propViewId: item.id }, 'table')
                            setOpen(null)
                          }}
                        >
                          <SandboxKindIcon className="tasks-viewdd-item-ico" />
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
                            void createRecordSandboxView({
                              collectionPath: TAGS_PATH,
                              recordId: tagId,
                              fieldKey: 'propViews',
                              listed: propViews,
                              name: `${item.name} 副本`,
                              title: String(record.title ?? ''),
                              source: item,
                            }).then((view) => {
                              void patchActiveRecordLayout(TAGS_PATH, tagId, { propViewId: view.id }, 'table')
                            })
                          }}
                        >
                          <Square2StackIcon aria-hidden className="size-[14px]" />
                        </button>
                        <button
                          type="button"
                          className="tasks-viewdd-act"
                          title="重命名"
                          aria-label={`重命名 ${item.name}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setRenamingPropView(item.id)
                            setRenamePropDraft(item.name)
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
                            void saveTagPropViews(
                              tagId,
                              propViews.filter((view) => view.id !== item.id),
                            ).then((ok) => {
                              if (ok && propViewId === item.id) {
                                void patchActiveRecordLayout(TAGS_PATH, tagId, { propViewId: DEFAULT_RECORD_PROP_VIEW_ID }, 'table')
                              }
                            })
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
                    data-testid="tag-prop-view-create"
                    disabled={creatingPropView}
                    onClick={() => {
                      if (creatingPropView) return
                      setCreatingPropView(true)
                      void createRecordSandboxView({
                        collectionPath: TAGS_PATH,
                        recordId: tagId,
                        fieldKey: 'propViews',
                        listed: propViews,
                        name: '新视图',
                        title: String(record.title ?? ''),
                      })
                        .then((view) => patchActiveRecordLayout(TAGS_PATH, tagId, { propViewId: view.id }, 'table'))
                        .catch(() => undefined)
                        .finally(() => {
                          setCreatingPropView(false)
                          setOpen(null)
                        })
                    }}
                  >
                    <PlusIcon aria-hidden className="size-[14px]" />
                    {creatingPropView ? '正在创建…' : '新建属性视图'}
                  </button>
                </div>
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
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
        <div className="tasks-sort-wrap" ref={sortRef}>
          <button
            type="button"
            className={`tasks-sort-btn${open === 'sort' || sortOn ? ' is-active' : ''}${sortOn ? ' is-custom' : ''}`}
            aria-label="排序"
            title="排序"
            onClick={() => toggle('sort')}
          >
            <span aria-hidden className="fsdb-ui-glyph" data-icon="sort" />
            {sortOn ? <span className="tasks-sort-dot" aria-hidden /> : null}
          </button>
          {open === 'sort' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={sortRef}>
              <div className="tasks-sort-menu fsdb-tool-flyout" role="menu">
                {SORTS.map((item) => (
                  <Row
                    key={item.id}
                    label={item.label}
                    on={activeLayout.sort === item.id}
                    onToggle={() => void patchActiveRecordLayout(TAGS_PATH, tagId, { sort: item.id }, 'table')}
                  />
                ))}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-filter-btn-wrap" ref={filterRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${open === 'filter' || filterOn ? ' is-active' : ''}`}
            aria-label="筛选"
            title="筛选"
            onClick={() => toggle('filter')}
          >
            <FunnelIcon aria-hidden className="size-[14px]" />
            {filterOn ? <span className="tasks-filter-dot" aria-hidden /> : null}
          </button>
          {open === 'filter' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={filterRef}>
              <div className="tasks-filter-menu fsdb-tool-flyout" role="menu">
                <Row
                  label="全部"
                  on={!filterOn}
                  onToggle={() => void patchActiveRecordLayout(TAGS_PATH, tagId, { filterKinds: [] }, 'table')}
                />
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-sort-wrap" ref={columnRef}>
          <button
            type="button"
            className={`tasks-sort-btn${open === 'columns' ? ' is-active' : ''}`}
            aria-label="可见列"
            title="可见列"
            onClick={() => toggle('columns')}
          >
            <EyeIcon aria-hidden className="size-[14px]" />
          </button>
          {open === 'columns' ? (
            <HeadlessDismiss
              onDismiss={() => setOpen(null)}
              insideRef={columnRef}
              ignoreSelector={`${HEADLESS_DISMISS_IGNORE}, [data-fsdb-col-flyout], [data-fsdb-col-tag-trigger], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`}
              inside={(node) =>
                node instanceof Element &&
                Boolean(
                  node.closest(
                    '[data-fsdb-col-flyout], [data-fsdb-col-tag-trigger], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]',
                  ),
                )
              }
            >
              {columnMenu ?? (
                <div className="tasks-sort-menu fsdb-tool-flyout" role="menu">
                  {props.length ? (
                    props.map((item) => (
                      <Row
                        key={item.key}
                        label={item.label}
                        on={visibleKeys.includes(item.key)}
                        onToggle={() => {
                          const has = visibleKeys.includes(item.key)
                          const next = has ? visibleKeys.filter((key) => key !== item.key) : [...visibleKeys, item.key]
                          onVisiblePropertyKeys?.(next)
                          onHiddenPropertyKeys?.(props.map((prop) => prop.key).filter((key) => !next.includes(key)))
                        }}
                      />
                    ))
                  ) : (
                    <div className="tasks-viewdd-empty">没有可隐藏的属性</div>
                  )}
                </div>
              )}
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-filter-btn-wrap" ref={configRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${open === 'config' ? ' is-active' : ''}`}
            aria-label="表格配置"
            title="配置"
            onClick={() => toggle('config')}
          >
            <AdjustmentsHorizontalIcon aria-hidden className="size-[14px]" />
          </button>
          {open === 'config' ? (
            <HeadlessDismiss
              onDismiss={() => setOpen(null)}
              insideRef={configRef}
              inside={(node) => node instanceof Element && Boolean(node.closest('.fsdb-detail-more-menu'))}
            >
              <div className="tasks-filter-menu fsdb-tool-flyout" role="menu">
                {configMenu}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <button
          type="button"
          className={`tasks-refresh${refreshing ? ' is-spinning' : ''}`}
          aria-label="刷新"
          title="刷新"
          disabled={refreshing}
          onClick={() => void refreshNow()}
        >
          <ArrowPathIcon aria-hidden className={`size-[14px]${refreshing ? ' fsdb-spin' : ''}`} />
        </button>
        {canPrev ? (
          <button type="button" className="tasks-refresh" title="上一条" aria-label="上一条" onClick={onPrev}>
            <ChevronLeftIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
        {canNext ? (
          <button type="button" className="tasks-refresh" title="下一条" aria-label="下一条" onClick={onNext}>
            <ChevronRightIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
        <div className="fsdb-create-group" ref={createRef}>
          <button
            type="button"
            className="fsdb-create-btn"
            aria-label="新建"
            title="新建"
            disabled={creatingAny}
            onClick={() => void createChosen(createKind)}
          >
            {creatingAny ? '正在创建…' : '新建'}
          </button>
          <HeadlessDismiss enabled={createOpen} onDismiss={() => setCreateOpen(false)}>
            <div className="fsdb-create-scope-wrap">
              <button
                type="button"
                className="fsdb-create-scope"
                aria-label="新建类型"
                aria-expanded={createOpen}
                title="新建视图类型"
                onClick={() => setCreateOpen((open) => !open)}
              >
                <ChevronDownIcon aria-hidden className="size-[14px]" />
              </button>
              {createOpen ? (
                <div className="fsdb-create-scope-menu" role="menu">
                  <button type="button" role="menuitem" className={createKind === 'prop' ? 'is-on' : ''} onClick={() => void createChosen('prop')}>
                    <SandboxKindIcon className="size-[14px]" />
                    属性视图
                  </button>
                  <button type="button" role="menuitem" className={createKind === 'content' ? 'is-on' : ''} onClick={() => void createChosen('content')}>
                    <SandboxKindIcon className="size-[14px]" />
                    内容视图
                  </button>
                </div>
              ) : null}
            </div>
          </HeadlessDismiss>
        </div>
      </div>
    </div>
  )
}

export function TagContent({ record, value, writable, onChange }: FsContentProps) {
  const tagId = String(record.id ?? '').trim()
  const stamp = tagId.includes('::')
  const present = useTagPresentMode(tagId)
  const views = useTagViews(tagId)
  const layout = useActiveRecordLayout(TAGS_PATH, tagId, 'table')
  useEffect(() => {
    if (!tagId || stamp) return
    void loadTagViews(tagId, record.views)
    void loadRecordLayouts(TAGS_PATH, tagId, record.layouts, 'table')
  }, [tagId, record.views, record.layouts, stamp])
  const sandbox = views.find((item) => item.id === layout.contentViewId) ?? views.find((item) => item.id === present)
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
