import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { HeadlessDismiss } from '@biu/biu-ui'
import { HEADLESS_DISMISS_IGNORE } from '@biu/biu-ui/headless-dismiss'
import type { FsDetailBarProps } from '@biu/type-file-system/ui'
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  PencilSquareIcon,
  PlusIcon,
  Square2StackIcon,
  Squares2X2Icon,
  TableCellsIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/16/solid'
import { usePagePresentMode } from './source-mode.ts'
import { PAGE_PROP_HIDDEN_VIEW_ID, PAGE_PROP_SOURCE_VIEW_ID, PAGE_PROP_TABLE_VIEW_ID, usePagePropPresentMode } from './page-prop-present.ts'
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
import {
  pageFilterActive,
  usePageViewState,
} from './page-view-state.ts'
import { useStickyToolbar } from './sticky-toolbar.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'
import { HIDDEN_CONTENT_VIEW_ID, parseRecordSandboxes } from '@biu/type-file-system/record-views'
import { getDatabaseUi } from '@biu/core-file-system/database-ui'
import { EDITOR_CONTENT_VIEWS, EDITOR_DETAIL_TOOLS } from './editor-content-views.ts'
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
import { loadTagViews } from '@biu/core-file-system/tag-views'

const HIDDEN_MODE = { id: HIDDEN_CONTENT_VIEW_ID, label: '隐藏', Icon: EyeSlashIcon }

function layoutKindIcon(kind?: string) {
  return kind === 'sandbox' ? CodeBracketIcon : Squares2X2Icon
}

function propPresentIcon(propViewId: string) {
  if (propViewId === PAGE_PROP_HIDDEN_VIEW_ID) return EyeSlashIcon
  if (propViewId === PAGE_PROP_SOURCE_VIEW_ID) return CodeBracketIcon
  if (propViewId === PAGE_PROP_TABLE_VIEW_ID) return TableCellsIcon
  return SandboxKindIcon
}

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

export function RecordDetailBar({
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
  const ui = getDatabaseUi()
  useSyncExternalStore(
    (fn) => (ui ? ui.subscribe(fn) : () => undefined),
    () =>
      ui
        ? `${ui.contentViews(path).map((item) => item.id).join(',')}|${ui.detailTools(path).sorts?.length ?? 0}|${ui.detailTools(path).filters?.length ?? 0}|${ui.detailTools(path).Search ? 1 : 0}`
        : '',
  )
  const registeredModes = ui?.contentViews(path) ?? EDITOR_CONTENT_VIEWS
  const detailTools = ui ? ui.detailTools(path) : EDITOR_DETAIL_TOOLS
  const view = usePageViewState(record.id)
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
  const builtinModes = [...registeredModes, HIDDEN_MODE]
  const contentMode = listedContentViews.find((item) => item.id === contentId)
    ? { id: contentId, label: listedContentViews.find((item) => item.id === contentId)!.name, Icon: SandboxKindIcon }
    : (builtinModes.find((item) => item.id === contentId) ?? registeredModes[0] ?? HIDDEN_MODE)
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
    ? propPresent === PAGE_PROP_HIDDEN_VIEW_ID || propPresent === PAGE_PROP_SOURCE_VIEW_ID
      ? propPresent
      : propSandbox
        ? propSandbox.id
        : PAGE_PROP_TABLE_VIEW_ID
    : propSandbox
      ? propSandbox.id
      : fsActiveLayout.propViewId === PAGE_PROP_HIDDEN_VIEW_ID || fsActiveLayout.propViewId === PAGE_PROP_SOURCE_VIEW_ID
        ? fsActiveLayout.propViewId
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
    if (path === '/tags') void loadTagViews(record.id, record.views)
  }, [record.id, record.views, record.propViews, record.layouts, path, fallback, pageRecord])

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
        {detailTools.Search ? <detailTools.Search record={record} collectionPath={path} /> : null}
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
                    <div className={`tasks-viewdd-item${propViewId === PAGE_PROP_SOURCE_VIEW_ID ? ' is-active' : ''}`}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={propViewId === PAGE_PROP_SOURCE_VIEW_ID}
                        className="tasks-viewdd-item-main fsdb-tool-row"
                        data-testid="page-prop-view-source"
                        onClick={() => {
                          void setPropView(PAGE_PROP_SOURCE_VIEW_ID)
                          setOpen(null)
                        }}
                      >
                        <CodeBracketIcon aria-hidden className="tasks-viewdd-item-ico" />
                        <span className="tasks-viewdd-item-name">源码</span>
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
                {builtinModes.map((item) => {
                  const Icon = item.Icon ?? EyeSlashIcon
                  return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.id === contentId}
                    className={`tasks-viewdd-item-main fsdb-tool-row${item.id === contentId ? ' is-active' : ''}`}
                    data-testid={item.id === HIDDEN_CONTENT_VIEW_ID ? 'page-view-hidden' : undefined}
                    onClick={() => {
                      void patchLayout({ contentViewId: item.id })
                      setOpen(null)
                    }}
                  >
                    <Icon aria-hidden className="tasks-viewdd-item-ico" />
                    <span className="tasks-viewdd-item-name">{item.label}</span>
                  </button>
                  )
                })}
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
        {detailTools.sorts?.length ? (
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
                {detailTools.sorts.map((item) => (
                  <Row
                    key={item.id}
                    label={item.label}
                    on={(pageRecord ? view.sort : activeLayout.sort) === item.id}
                    onToggle={() => void patchLayout({ sort: item.id as typeof activeLayout.sort })}
                  />
                ))}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        ) : null}
        {detailTools.filters?.length ? (
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
                  label={detailTools.filterAllLabel || '全部'}
                  on={!filterOn}
                  onToggle={() => void patchLayout({ filterKinds: [] })}
                />
                {detailTools.filters.map((item) => {
                  const selected = pageRecord ? view.filterKinds : activeLayout.filterKinds
                  return (
                  <Row
                    key={item.id}
                    label={item.label}
                    on={selected.includes(item.id)}
                    onToggle={() => {
                      const has = selected.includes(item.id)
                      const next = has ? selected.filter((key) => key !== item.id) : [...selected, item.id]
                      void patchLayout({ filterKinds: next })
                    }}
                  />
                  )
                })}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        ) : null}
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
