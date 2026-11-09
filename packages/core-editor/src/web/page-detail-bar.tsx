import { useEffect, useRef, useState } from 'react'
import { HeadlessDismiss } from '@biu/biu-ui'
import { HEADLESS_DISMISS_IGNORE } from '@biu/biu-ui/headless-dismiss'
import type { FsDetailBarProps } from '@biu/type-file-system/ui'
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  EyeIcon,
  FunnelIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  QueueListIcon,
  Square2StackIcon,
  Squares2X2Icon,
  TableCellsIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/16/solid'
import { setPagePresentMode, usePagePresentMode } from './source-mode.ts'
import { PAGE_PROP_TABLE_VIEW_ID, setPagePropPresentMode, usePagePropPresentMode } from './page-prop-present.ts'
import {
  copyPagePropSandboxView,
  createPagePropSandboxView,
  deletePagePropSandboxView,
  loadPagePropViews,
  renamePagePropSandboxView,
  usePagePropViews,
} from './page-prop-views.ts'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { copyPageSandboxView, createPageSandboxView, deletePageSandboxView, loadPageViews, renamePageSandboxView, usePageViews } from './page-views.ts'
import { kindLabel } from './block-id.ts'
import {
  pageFilterActive,
  patchPageFind,
  patchPageViewState,
  usePageFind,
  usePageViewState,
  type PageSort,
} from './page-view-state.ts'
import { useStickyToolbar } from './sticky-toolbar.ts'

const MODES = [
  { id: 'doc' as const, label: '文档', Icon: DocumentTextIcon },
  { id: 'outline' as const, label: '大纲', Icon: ListBulletIcon },
  { id: 'table' as const, label: '表格', Icon: TableCellsIcon },
  { id: 'source' as const, label: '源码', Icon: CodeBracketIcon },
]

const KINDS = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'table', 'pageBlock', 'slide', 'blockMath', 'image']

const SORTS: { id: PageSort; label: string }[] = [
  { id: 'doc', label: '原文顺序' },
  { id: 'title-asc', label: '按标题 A→Z' },
  { id: 'title-desc', label: '按标题 Z→A' },
  { id: 'kind', label: '按块类型' },
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

export function PageDetailBar({
  record,
  schema,
  collectionPath,
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
  const present = usePagePresentMode(record.id)
  const pageViews = usePageViews(record.id)
  const propPresent = usePagePropPresentMode(record.id)
  const propViews = usePagePropViews(record.id)
  const view = usePageViewState(record.id)
  const find = usePageFind(record.id)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const propRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  useStickyToolbar(toolbarRef)
  const custom = pageViews.find((item) => item.id === present)
  const current = custom
    ? { id: custom.id, label: custom.name, Icon: Squares2X2Icon }
    : (MODES.find((item) => item.id === present) ?? MODES[0])
  const CurrentIcon = current.Icon
  const [creatingView, setCreatingView] = useState(false)
  const [renamingView, setRenamingView] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [creatingPropView, setCreatingPropView] = useState(false)
  const [renamingPropView, setRenamingPropView] = useState('')
  const [renamePropDraft, setRenamePropDraft] = useState('')
  const pageRecord = !collectionPath || collectionPath === '/pages'
  const propSandbox = propViews.find((item) => item.id === propPresent)
  const propViewId = propSandbox ? propSandbox.id : PAGE_PROP_TABLE_VIEW_ID
  const filterOn = pageFilterActive(view)
  const sortOn = view.sort !== 'doc'
  const props = Object.entries(schema?.fields ?? {})
    .filter(([key, field]) => key !== 'emoji' && key !== schema?.labelField && field.type !== 'file')
    .map(([key, field]) => ({ key, label: field.label ?? key }))
  const visibleKeys = visiblePropertyKeys ?? props.map((item) => item.key).filter((key) => !hiddenPropertyKeys.includes(key))

  useEffect(() => {
    setOpen(null)
    void loadPageViews(record.id, record.views)
    void loadPagePropViews(record.id, record.propViews)
  }, [record.id, record.views, record.propViews])

  useEffect(() => {
    if (!find.open) return
    searchInput.current?.focus({ preventScroll: true })
    searchInput.current?.select()
  }, [find.open])

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

  return (
    <div
      className="tasks-toolbar"
      ref={toolbarRef}
      data-testid="fsdb-page-detail-bar"
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
              onClick={() => toggle('view')}
            >
              <CurrentIcon aria-hidden className="size-[14px]" />
              <span className="tasks-viewdd-name">{current.label}</span>
            </button>
          </div>
          {open === 'view' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={viewRef}>
              <div className="fsdb-tool-flyout tasks-viewdd-menu" role="menu">
                <div className="tasks-sort-list">
                  {MODES.map((item) => (
                    <div key={item.id} className={`tasks-viewdd-item${item.id === current.id ? ' is-active' : ''}`}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={item.id === current.id}
                        className="tasks-viewdd-item-main fsdb-tool-row"
                        onClick={() => {
                          setPagePresentMode(record.id, item.id)
                          setOpen(null)
                        }}
                      >
                        <item.Icon aria-hidden className="tasks-viewdd-item-ico" />
                        <span className="tasks-viewdd-item-name">{item.label}</span>
                      </button>
                      <span className="tasks-viewdd-item-actions">
                        <button
                          type="button"
                          className="tasks-viewdd-act"
                          title="拷贝视图"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void copyPageSandboxView(record.id, item.id, String(record.title ?? ''), item.label).catch(() => undefined)
                          }}
                        >
                          <Square2StackIcon aria-hidden className="size-[14px]" />
                        </button>
                      </span>
                    </div>
                  ))}
                  {pageViews.map((item) => (
                    <div key={item.id} className={`tasks-viewdd-item${item.id === present ? ' is-active' : ''}`}>
                      {renamingView === item.id ? (
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
                                void renamePageSandboxView(record.id, item.id, renameDraft).catch(() => undefined)
                                setRenamingView('')
                              }
                              if (event.key === 'Escape') setRenamingView('')
                            }}
                            onBlur={() => {
                              void renamePageSandboxView(record.id, item.id, renameDraft).catch(() => undefined)
                              setRenamingView('')
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={item.id === present}
                          className="tasks-viewdd-item-main fsdb-tool-row"
                          data-testid={`page-view-${item.id}`}
                          onClick={() => {
                            setPagePresentMode(record.id, item.id)
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
                            void copyPageSandboxView(record.id, item.id, String(record.title ?? '')).catch(() => undefined)
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
                        <button
                          type="button"
                          className="tasks-viewdd-act is-danger"
                          title="删除"
                          aria-label={`删除 ${item.name}`}
                          data-testid={`page-view-delete-${item.id}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void deletePageSandboxView(record.id, item.id).catch(() => undefined)
                          }}
                        >
                          <TrashGlyph aria-hidden className="size-[14px]" />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
      </div>
      <div className="tasks-toolbar-right">
        <HeadlessDismiss
          enabled={find.open}
          onDismiss={() => {
            if (!find.query) patchPageFind(record.id, { open: false, index: 0, total: 0 })
          }}
        >
          <div className={`tasks-search-wrap${find.open ? ' is-open is-find' : ''}`} ref={searchRef}>
            <button
              type="button"
              className={`tasks-sort-btn${find.open ? ' is-active' : ''}`}
              aria-label="搜索"
              aria-expanded={find.open}
              title="搜索"
              onClick={() => patchPageFind(record.id, find.open ? { open: false, query: '', index: 0, total: 0 } : { open: true })}
            >
              <MagnifyingGlassIcon aria-hidden className="size-[14px]" />
            </button>
            {find.open ? (
              <>
                <input
                  ref={searchInput}
                  className="tasks-search"
                  value={find.query}
                  placeholder="搜索"
                  aria-label="正文搜索"
                  data-testid="page-find"
                  onChange={(event) => patchPageFind(record.id, { query: event.target.value, index: 0 })}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      patchPageFind(record.id, { open: false, query: '', index: 0, total: 0 })
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      patchPageFind(record.id, { index: find.index + (event.shiftKey ? -1 : 1) })
                    }
                  }}
                />
                <span className="page-find-count" data-testid="page-find-count">
                  {find.query.trim() ? `${find.total ? find.index + 1 : 0}/${find.total}` : ''}
                </span>
                <button type="button" className="page-find-btn" title="上一个" aria-label="上一个" onClick={() => patchPageFind(record.id, { index: find.index - 1 })}>
                  <ChevronUpIcon aria-hidden className="size-3.5" />
                </button>
                <button type="button" className="page-find-btn" title="下一个" aria-label="下一个" onClick={() => patchPageFind(record.id, { index: find.index + 1 })}>
                  <ChevronDownIcon aria-hidden className="size-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </HeadlessDismiss>
        {pageRecord ? (
          <div className="tasks-sort-wrap" ref={propRef}>
            <button
              type="button"
              className={`tasks-sort-btn${open === 'props' || propViewId !== PAGE_PROP_TABLE_VIEW_ID ? ' is-active' : ''}`}
              aria-label="属性展示"
              title="属性展示"
              data-testid="page-prop-view"
              onClick={() => toggle('props')}
            >
              <QueueListIcon aria-hidden className="size-[14px]" />
            </button>
            {open === 'props' ? (
              <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={propRef}>
                <div className="tasks-sort-menu fsdb-tool-flyout" role="menu">
                  <div className="tasks-sort-list">
                    <div className={`tasks-viewdd-item${propViewId === PAGE_PROP_TABLE_VIEW_ID ? ' is-active' : ''}`}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={propViewId === PAGE_PROP_TABLE_VIEW_ID}
                        className="tasks-viewdd-item-main fsdb-tool-row"
                        data-testid="page-prop-view-table"
                        onClick={() => {
                          setPagePropPresentMode(record.id, PAGE_PROP_TABLE_VIEW_ID)
                          setOpen(null)
                        }}
                      >
                        <TableCellsIcon aria-hidden className="tasks-viewdd-item-ico" />
                        <span className="tasks-viewdd-item-name">表格</span>
                      </button>
                      <span className="tasks-viewdd-item-actions">
                        <button
                          type="button"
                          className="tasks-viewdd-act"
                          title="拷贝视图"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void copyPagePropSandboxView(record.id, PAGE_PROP_TABLE_VIEW_ID, String(record.title ?? ''), '表格').catch(() => undefined)
                          }}
                        >
                          <Square2StackIcon aria-hidden className="size-[14px]" />
                        </button>
                      </span>
                    </div>
                    {propViews.map((item) => (
                      <div key={item.id} className={`tasks-viewdd-item${item.id === propViewId ? ' is-active' : ''}`}>
                        {renamingPropView === item.id ? (
                          <div className="tasks-viewdd-item-main fsdb-tool-row">
                            <QueueListIcon aria-hidden className="tasks-viewdd-item-ico" />
                            <input
                              className="tasks-viewdd-item-name"
                              aria-label={`属性视图名称 ${item.name}`}
                              value={renamePropDraft}
                              autoFocus
                              onChange={(event) => setRenamePropDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void renamePagePropSandboxView(record.id, item.id, renamePropDraft).catch(() => undefined)
                                  setRenamingPropView('')
                                }
                                if (event.key === 'Escape') setRenamingPropView('')
                              }}
                              onBlur={() => {
                                void renamePagePropSandboxView(record.id, item.id, renamePropDraft).catch(() => undefined)
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
                            data-testid={`page-prop-view-${item.id}`}
                            onClick={() => {
                              setPagePropPresentMode(record.id, item.id)
                              setOpen(null)
                            }}
                          >
                            <QueueListIcon aria-hidden className="tasks-viewdd-item-ico" />
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
                              void copyPagePropSandboxView(record.id, item.id, String(record.title ?? '')).catch(() => undefined)
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
                            data-testid={`page-prop-view-delete-${item.id}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              void deletePagePropSandboxView(record.id, item.id).catch(() => undefined)
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
                      data-testid="page-prop-view-create"
                      disabled={creatingPropView}
                      onClick={() => {
                        if (creatingPropView) return
                        setCreatingPropView(true)
                        void createPagePropSandboxView(record.id, String(record.title ?? ''), '新视图')
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
        ) : null}
        <div className="tasks-sort-wrap" ref={modeRef}>
          <button
            type="button"
            className={`tasks-sort-btn${open === 'mode' ? ' is-active' : ''}`}
            aria-label="查看模式"
            title="呈现方式"
            onClick={() => toggle('mode')}
          >
            <CurrentIcon aria-hidden className="size-[14px]" />
          </button>
          {open === 'mode' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={modeRef}>
              <div className="tasks-sort-menu fsdb-tool-flyout" role="menu">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.id === current.id}
                    className={`tasks-viewdd-item-main fsdb-tool-row${item.id === current.id ? ' is-active' : ''}`}
                    onClick={() => {
                      setPagePresentMode(record.id, item.id)
                      setOpen(null)
                    }}
                  >
                    <item.Icon aria-hidden className="tasks-viewdd-item-ico" />
                    <span className="tasks-viewdd-item-name">{item.label}</span>
                  </button>
                ))}
                <div className="tasks-viewdd-foot">
                  <button
                    type="button"
                    role="menuitem"
                    className="tasks-viewdd-saveas fsdb-tool-row font-medium"
                    data-testid="page-view-create"
                    disabled={creatingView}
                    onClick={() => {
                      if (creatingView) return
                      setCreatingView(true)
                      void createPageSandboxView(record.id, String(record.title ?? ''), '新视图')
                        .catch(() => undefined)
                        .finally(() => {
                          setCreatingView(false)
                          setOpen(null)
                        })
                    }}
                  >
                    <PlusIcon aria-hidden className="size-[14px]" />
                    {creatingView ? '正在创建…' : '新建内容视图'}
                  </button>
                </div>
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
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
                    on={view.sort === item.id}
                    onToggle={() => patchPageViewState(record.id, { sort: item.id })}
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
                  label="全部类型"
                  on={!filterOn}
                  onToggle={() => patchPageViewState(record.id, { filterKinds: [] })}
                />
                {KINDS.map((kind) => (
                  <Row
                    key={kind}
                    label={kindLabel(kind)}
                    on={view.filterKinds.includes(kind)}
                    onToggle={() => {
                      const has = view.filterKinds.includes(kind)
                      const next = has ? view.filterKinds.filter((item) => item !== kind) : [...view.filterKinds, kind]
                      patchPageViewState(record.id, { filterKinds: next })
                    }}
                  />
                ))}
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
          <button
            type="button"
            className="tasks-refresh"
            title="上一条"
            aria-label="上一条"
            onClick={onPrev}
          >
            <ChevronLeftIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
        {canNext ? (
          <button
            type="button"
            className="tasks-refresh"
            title="下一条"
            aria-label="下一条"
            onClick={onNext}
          >
            <ChevronRightIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
