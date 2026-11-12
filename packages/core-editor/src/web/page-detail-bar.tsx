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
  EyeSlashIcon,
  FunnelIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  Square2StackIcon,
  Squares2X2Icon,
  TableCellsIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/16/solid'
import { usePagePresentMode } from './source-mode.ts'
import { PAGE_PROP_HIDDEN_VIEW_ID, PAGE_PROP_TABLE_VIEW_ID, usePagePropPresentMode } from './page-prop-present.ts'
import {
  copyPagePropSandboxView,
  createPagePropSandboxView,
  deletePagePropSandboxView,
  loadPagePropViews,
  renamePagePropSandboxView,
  usePagePropViews,
} from './page-prop-views.ts'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { copyPageSandboxView, createPageSandboxView, deletePageSandboxView, loadPageViews, usePageViews } from './page-views.ts'
import {
  addPageLayout,
  copyPageLayout,
  deletePageLayout,
  loadPageLayouts,
  renamePageLayout,
  selectPageLayout,
  patchActivePageLayout,
  useActivePageLayout,
  usePageLayouts,
} from './page-layouts.ts'
import { kindLabel } from './block-id.ts'
import {
  pageFilterActive,
  patchPageFind,
  usePageFind,
  usePageViewState,
  type PageSort,
} from './page-view-state.ts'
import { useStickyToolbar } from './sticky-toolbar.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'
import { parseRecordSandboxes } from '@biu/type-file-system/record-views'
import {
  addRecordLayout,
  copyRecordLayout,
  deleteRecordLayout,
  loadRecordLayouts,
  patchActiveRecordLayout,
  renameRecordLayout,
  setActiveRecordLayoutId,
  useActiveRecordLayout,
  useRecordLayouts,
} from '@biu/core-file-system/record-layouts'
import { createRecordSandboxView, writeRecordViewCatalog } from '@biu/core-file-system/record-sandboxes'

const MODES = [
  { id: 'doc' as const, label: '文档', Icon: DocumentTextIcon },
  { id: 'outline' as const, label: '大纲', Icon: ListBulletIcon },
  { id: 'table' as const, label: '表格', Icon: TableCellsIcon },
  { id: 'source' as const, label: '源码', Icon: CodeBracketIcon },
  { id: 'hidden' as const, label: '隐藏', Icon: EyeSlashIcon },
]

function layoutKindIcon(kind?: string) {
  return kind === 'sandbox' ? CodeBracketIcon : Squares2X2Icon
}

function propPresentIcon(propViewId: string) {
  if (propViewId === PAGE_PROP_HIDDEN_VIEW_ID) return EyeSlashIcon
  if (propViewId === PAGE_PROP_TABLE_VIEW_ID) return TableCellsIcon
  return SandboxKindIcon
}

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
  const path = String(collectionPath ?? '').trim() || '/pages'
  const pageRecord = path === '/pages'
  const fallback = path === '/tags' ? 'table' : 'doc'
  const present = usePagePresentMode(record.id)
  const pageViews = usePageViews(record.id)
  const pageLayouts = usePageLayouts(record.id)
  const pageActiveLayout = useActivePageLayout(record.id)
  const fsLayouts = useRecordLayouts(path, record.id, fallback)
  const fsActiveLayout = useActiveRecordLayout(path, record.id, fallback)
  const layouts = pageRecord ? pageLayouts : fsLayouts
  const activeLayout = pageRecord ? pageActiveLayout : fsActiveLayout
  const propPresent = usePagePropPresentMode(record.id)
  const pagePropViews = usePagePropViews(record.id)
  const listedPropViews = pageRecord ? pagePropViews : parseRecordSandboxes(record.propViews)
  const listedContentViews = pageRecord ? pageViews : parseRecordSandboxes(record.views)
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
  const contentId = pageRecord ? present : fsActiveLayout.contentViewId
  const contentMode = listedContentViews.find((item) => item.id === contentId)
    ? { id: contentId, label: listedContentViews.find((item) => item.id === contentId)!.name, Icon: SandboxKindIcon }
    : (MODES.find((item) => item.id === contentId) ?? MODES[0])
  const CurrentIcon = contentMode.Icon
  const [creatingView, setCreatingView] = useState(false)
  const [creatingLayout, setCreatingLayout] = useState(false)
  const [renamingView, setRenamingView] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [creatingPropView, setCreatingPropView] = useState(false)
  const [renamingPropView, setRenamingPropView] = useState('')
  const [renamePropDraft, setRenamePropDraft] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createKind, setCreateKind] = useState<'prop' | 'content'>('prop')
  const [creatingAny, setCreatingAny] = useState(false)
  const createRef = useRef<HTMLDivElement>(null)
  const propSandbox = listedPropViews.find((item) => item.id === (pageRecord ? propPresent : fsActiveLayout.propViewId))
  const propViewId = pageRecord
    ? propPresent === PAGE_PROP_HIDDEN_VIEW_ID
      ? PAGE_PROP_HIDDEN_VIEW_ID
      : propSandbox
        ? propSandbox.id
        : PAGE_PROP_TABLE_VIEW_ID
    : propSandbox
      ? propSandbox.id
      : fsActiveLayout.propViewId === 'hidden'
        ? 'hidden'
        : PAGE_PROP_TABLE_VIEW_ID
  const LayoutIcon = layoutKindIcon(activeLayout.kind)
  const PropIcon = propPresentIcon(propViewId)
  const filterOn = pageRecord ? pageFilterActive(view) : activeLayout.filterKinds.length > 0
  const sortOn = pageRecord ? view.sort !== 'doc' : activeLayout.sort !== 'doc'
  const props = Object.entries(schema?.fields ?? {})
    .filter(([key, field]) => key !== 'emoji' && key !== schema?.labelField && field.type !== 'file')
    .map(([key, field]) => ({ key, label: field.label ?? key }))
  const visibleKeys = visiblePropertyKeys ?? props.map((item) => item.key).filter((key) => !hiddenPropertyKeys.includes(key))

  async function setPropView(next: string) {
    if (pageRecord) await patchActivePageLayout(record.id, { propViewId: next })
    await patchActiveRecordLayout(path, record.id, { propViewId: next }, fallback)
  }

  async function patchLayout(patch: { contentViewId?: string; sort?: typeof activeLayout.sort; filterKinds?: string[] }) {
    if (pageRecord) await patchActivePageLayout(record.id, patch)
    else await patchActiveRecordLayout(path, record.id, patch, fallback)
  }

  async function renamePropView(viewId: string, name: string) {
    const nextName = name.trim()
    if (!nextName) return
    if (pageRecord) {
      await renamePagePropSandboxView(record.id, viewId, nextName)
      return
    }
    await writeRecordViewCatalog(
      path,
      record.id,
      'propViews',
      listedPropViews.map((item) => (item.id === viewId ? { ...item, name: nextName } : item)),
    )
  }

  async function createChosen(kind: 'prop' | 'content') {
    setCreateKind(kind)
    setCreateOpen(false)
    if (creatingAny) return
    setCreatingAny(true)
    try {
      if (kind === 'prop') {
        if (pageRecord) await createPagePropSandboxView(record.id, String(record.title ?? ''), '新视图')
        else {
          const view = await createRecordSandboxView({
            collectionPath: path,
            recordId: record.id,
            fieldKey: 'propViews',
            listed: listedPropViews,
            name: '新视图',
            title: String(record.title ?? ''),
          })
          await setPropView(view.id)
        }
      } else if (pageRecord) await createPageSandboxView(record.id, String(record.title ?? ''), '新视图')
      else {
        const view = await createRecordSandboxView({
          collectionPath: path,
          recordId: record.id,
          fieldKey: 'views',
          listed: listedContentViews,
          name: '新视图',
          title: String(record.title ?? ''),
        })
        await patchActiveRecordLayout(path, record.id, { contentViewId: view.id }, fallback)
      }
    } catch {
      /* ignore */
    } finally {
      setCreatingAny(false)
    }
  }

  useEffect(() => {
    setOpen(null)
    if (pageRecord) {
      void loadPageViews(record.id, record.views)
      void loadPagePropViews(record.id, record.propViews)
      void loadPageLayouts(record.id, record.layouts)
    }
    void loadRecordLayouts(path, record.id, record.layouts, fallback)
  }, [record.id, record.views, record.propViews, record.layouts, path, fallback, pageRecord])

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
              data-testid="page-layout-tab"
              onClick={() => toggle('view')}
            >
              <LayoutIcon aria-hidden className="size-[14px]" />
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
                          {item.kind === 'sandbox' ? (
                            <CodeBracketIcon aria-hidden className="tasks-viewdd-item-ico" />
                          ) : (
                            <Squares2X2Icon aria-hidden className="tasks-viewdd-item-ico" />
                          )}
                          <input
                            className="tasks-viewdd-item-name"
                            aria-label={`视图名称 ${item.name}`}
                            value={renameDraft}
                            autoFocus
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void (pageRecord ? renamePageLayout(record.id, item.id, renameDraft) : renameRecordLayout(path, record.id, item.id, renameDraft)).catch(() => undefined)
                                setRenamingView('')
                              }
                              if (event.key === 'Escape') setRenamingView('')
                            }}
                            onBlur={() => {
                              void (pageRecord ? renamePageLayout(record.id, item.id, renameDraft) : renameRecordLayout(path, record.id, item.id, renameDraft)).catch(() => undefined)
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
                          data-testid={`page-layout-${item.id}`}
                          onClick={() => {
                            if (pageRecord) selectPageLayout(record.id, item)
                            else setActiveRecordLayoutId(path, record.id, item.id)
                            setOpen(null)
                          }}
                        >
                          {item.kind === 'sandbox' ? (
                            <CodeBracketIcon aria-hidden className="tasks-viewdd-item-ico" />
                          ) : (
                            <Squares2X2Icon aria-hidden className="tasks-viewdd-item-ico" />
                          )}
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
                            void (pageRecord ? copyPageLayout(record.id, item) : copyRecordLayout(path, record.id, item, fallback)).catch(() => undefined)
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
                            data-testid={`page-layout-delete-${item.id}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              void (pageRecord ? deletePageLayout(record.id, item.id) : deleteRecordLayout(path, record.id, item.id, fallback)).catch(() => undefined)
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
                    data-testid="page-layout-create"
                    disabled={creatingLayout}
                    onClick={() => {
                      if (creatingLayout) return
                      setCreatingLayout(true)
                      void (pageRecord ? addPageLayout(record.id) : addRecordLayout(path, record.id, fallback))
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
        <div className="tasks-sort-wrap" ref={propRef}>
            <button
              type="button"
              className={`tasks-sort-btn${open === 'props' || propViewId === PAGE_PROP_HIDDEN_VIEW_ID || propViewId !== PAGE_PROP_TABLE_VIEW_ID ? ' is-active' : ''}`}
              aria-label="属性展示"
              title="属性展示"
              data-testid="page-prop-view"
              onClick={() => toggle('props')}
            >
              <PropIcon aria-hidden className="size-[14px]" />
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
                          void setPropView(PAGE_PROP_TABLE_VIEW_ID)
                          setOpen(null)
                        }}
                      >
                        <TableCellsIcon aria-hidden className="tasks-viewdd-item-ico" />
                        <span className="tasks-viewdd-item-name">表格</span>
                      </button>
                    </div>
                    <div className={`tasks-viewdd-item${propViewId === PAGE_PROP_HIDDEN_VIEW_ID ? ' is-active' : ''}`}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={propViewId === PAGE_PROP_HIDDEN_VIEW_ID}
                        className="tasks-viewdd-item-main fsdb-tool-row"
                        data-testid="page-prop-view-hidden"
                        onClick={() => {
                          void setPropView(PAGE_PROP_HIDDEN_VIEW_ID)
                          setOpen(null)
                        }}
                      >
                        <EyeSlashIcon aria-hidden className="tasks-viewdd-item-ico" />
                        <span className="tasks-viewdd-item-name">隐藏</span>
                      </button>
                    </div>
                    {listedPropViews.map((item) => (
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
                                  void renamePropView(item.id, renamePropDraft).catch(() => undefined)
                                  setRenamingPropView('')
                                }
                                if (event.key === 'Escape') setRenamingPropView('')
                              }}
                              onBlur={() => {
                                void renamePropView(item.id, renamePropDraft).catch(() => undefined)
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
                              void setPropView(item.id)
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
                              void (pageRecord
                                ? copyPagePropSandboxView(record.id, item.id, String(record.title ?? ''))
                                : createRecordSandboxView({
                                    collectionPath: path,
                                    recordId: record.id,
                                    fieldKey: 'propViews',
                                    listed: listedPropViews,
                                    name: `${item.name} 副本`,
                                    title: String(record.title ?? ''),
                                    source: item,
                                  })
                              )
                                .then((view) => {
                                  if (view) return setPropView(view.id)
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
                              void (pageRecord
                                ? deletePagePropSandboxView(record.id, item.id)
                                : writeRecordViewCatalog(
                                    path,
                                    record.id,
                                    'propViews',
                                    listedPropViews.filter((view) => view.id !== item.id),
                                  ).then(() => {
                                    if (propViewId === item.id) return setPropView(PAGE_PROP_TABLE_VIEW_ID)
                                  })
                              ).catch(() => undefined)
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
                        void (pageRecord
                          ? createPagePropSandboxView(record.id, String(record.title ?? ''), '新视图')
                          : createRecordSandboxView({
                              collectionPath: path,
                              recordId: record.id,
                              fieldKey: 'propViews',
                              listed: listedPropViews,
                              name: '新视图',
                              title: String(record.title ?? ''),
                            })
                        )
                          .then((view) => {
                            if (view) return setPropView(view.id)
                          })
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
        <div className="tasks-sort-wrap" ref={modeRef}>
          <button
            type="button"
            className={`tasks-sort-btn${open === 'mode' || contentId === 'hidden' ? ' is-active' : ''}`}
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
                    aria-checked={item.id === contentId}
                    className={`tasks-viewdd-item-main fsdb-tool-row${item.id === contentId ? ' is-active' : ''}`}
                    data-testid={item.id === 'hidden' ? 'page-view-hidden' : undefined}
                    onClick={() => {
                      void patchLayout( { contentViewId: item.id })
                      setOpen(null)
                    }}
                  >
                    <item.Icon aria-hidden className="tasks-viewdd-item-ico" />
                    <span className="tasks-viewdd-item-name">{item.label}</span>
                  </button>
                ))}
                {listedContentViews.map((item) => (
                  <div key={item.id} className={`tasks-viewdd-item${item.id === contentId ? ' is-active' : ''}`}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.id === contentId}
                      className="tasks-viewdd-item-main fsdb-tool-row"
                      data-testid={`page-view-${item.id}`}
                      onClick={() => {
                        void patchLayout( { contentViewId: item.id })
                        setOpen(null)
                      }}
                    >
                      <SandboxKindIcon className="tasks-viewdd-item-ico" />
                      <span className="tasks-viewdd-item-name">{item.name}</span>
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
                          void copyPageSandboxView(record.id, item.id, String(record.title ?? '')).then((view) => {
                            if (view) return patchLayout({ contentViewId: view.id })
                          }).catch(() => undefined)
                        }}
                      >
                        <Square2StackIcon aria-hidden className="size-[14px]" />
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
                        .then((view) => {
                          if (view) return patchLayout({ contentViewId: view.id })
                        })
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
                    on={(pageRecord ? view.sort : activeLayout.sort) === item.id}
                    onToggle={() => void patchLayout( { sort: item.id })}
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
                  onToggle={() => void patchLayout( { filterKinds: [] })}
                />
                {KINDS.map((kind) => (
                  <Row
                    key={kind}
                    label={kindLabel(kind)}
                    on={view.filterKinds.includes(kind)}
                    onToggle={() => {
                      const has = view.filterKinds.includes(kind)
                      const next = has ? view.filterKinds.filter((item) => item !== kind) : [...view.filterKinds, kind]
                      void patchLayout( { filterKinds: next })
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
