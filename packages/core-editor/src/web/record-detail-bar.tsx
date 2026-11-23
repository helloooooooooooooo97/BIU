import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { HeadlessDismiss } from '@biu/biu-ui'
import { HEADLESS_DISMISS_IGNORE } from '@biu/biu-ui/headless-dismiss'
import { HeadlessPopover } from '@biu/biu-ui/headless-popover'
import type { FsDetailBarProps } from '@biu/type-file-system/ui'
import {
  ArrowPathIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  EyeSlashIcon,
  FunnelIcon,
  PencilSquareIcon,
  PlusIcon,
  ShareIcon,
  Square2StackIcon,
  Squares2X2Icon,
  TableCellsIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { patchEditorCommentsUi, useEditorCommentsUi, usePageFind } from './editor-view-state.ts'
import { useStickyToolbar } from './sticky-toolbar.ts'
import { useToolbarOverflow } from '@biu/core-file-system/toolbar-overflow'
import { SandboxKindIcon } from '@biu/core-file-system/sandbox-kind-icon'
import {
  DEFAULT_RECORD_PROP_VIEW_ID,
  HIDDEN_CONTENT_VIEW_ID,
  SOURCE_RECORD_PROP_VIEW_ID,
} from '@biu/type-file-system/record-views'
import { getDatabaseUi, recordContentFallback } from '@biu/core-file-system/database-ui'
import { EDITOR_CONTENT_VIEWS, EDITOR_DETAIL_TOOLS } from './editor-content-views.ts'
import {
  loadRecordLayouts,
  patchActiveRecordLayout,
  useActiveRecordLayout,
  useRecordLayouts,
} from '@biu/core-file-system/record-layouts'
import { hydrateRecordViewCatalog, useRecordViewCatalog } from '@biu/core-file-system/record-view-catalog'
import { copyViewCatalog, createViewCatalog, deleteViewCatalog, renameViewCatalog, selectViewCatalog, selectedViewCatalogId } from '@biu/core-file-system/view-catalog'

const HIDDEN_MODE = { id: HIDDEN_CONTENT_VIEW_ID, label: '隐藏', Icon: EyeSlashIcon }

function propPresentIcon(propViewId: string) {
  if (propViewId === HIDDEN_CONTENT_VIEW_ID) return EyeSlashIcon
  if (propViewId === SOURCE_RECORD_PROP_VIEW_ID) return CodeBracketIcon
  if (propViewId === DEFAULT_RECORD_PROP_VIEW_ID) return TableCellsIcon
  return SandboxKindIcon
}

function Row({
  label,
  on,
  onToggle,
  switchControl = false,
}: {
  label: string
  on: boolean
  onToggle: () => void
  switchControl?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      className={`fsdb-checkrow fsdb-tool-row${on ? ' is-on' : ''}${switchControl ? ' is-switch' : ''}`}
      onClick={onToggle}
    >
      <span className="fsdb-checkrow-label">{label}</span>
      {switchControl ? (
        <span className="fsdb-checkrow-right">
          <span className={`fsdb-group-switch${on ? ' is-on' : ''}`} aria-hidden>
            <span className="fsdb-group-switch-thumb" />
          </span>
        </span>
      ) : null}
    </button>
  )
}

type DetailSettingsTab = 'view' | 'columns' | 'filter' | 'sort'

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
  share,
  shareLabel,
}: FsDetailBarProps) {
  const find = usePageFind(record.id)
  const commentsUi = useEditorCommentsUi(record.id)
  const path = String(collectionPath ?? '').trim()
  const fallback = recordContentFallback(path)
  const layouts = useRecordLayouts(path, record.id, fallback)
  const activeLayout = useActiveRecordLayout(path, record.id, fallback)
  const catalog = useRecordViewCatalog(path, record.id)
  const listedPropViews = catalog.propViews
  const listedContentViews = catalog.views
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
  const [open, setOpen] = useState<string | null>(null)
  const [settingsTab, setSettingsTab] = useState<DetailSettingsTab>('view')
  const [openAcc, setOpenAcc] = useState<'content' | 'prop' | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const propRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const shareRef = useRef<HTMLDivElement>(null)
  const commentRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const bindToolbar = useToolbarOverflow(toolbarRef)
  useStickyToolbar(toolbarRef)
  const contentId = selectedViewCatalogId(path, record, 'views')
  const builtinModes = [...registeredModes, HIDDEN_MODE]
  const contentMode = listedContentViews.find((item) => item.id === contentId)
    ? { id: contentId, label: listedContentViews.find((item) => item.id === contentId)!.name, Icon: SandboxKindIcon }
    : (builtinModes.find((item) => item.id === contentId) ?? registeredModes[0] ?? HIDDEN_MODE)
  const CurrentIcon = contentMode.Icon ?? EyeSlashIcon
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
  const livePropId = catalog.propViewId || activeLayout.propViewId
  const propSandbox = listedPropViews.find((item) => item.id === livePropId)
  const propViewId = livePropId === HIDDEN_CONTENT_VIEW_ID || livePropId === SOURCE_RECORD_PROP_VIEW_ID
    ? livePropId
    : propSandbox
      ? propSandbox.id
      : DEFAULT_RECORD_PROP_VIEW_ID
  const PropIcon = propPresentIcon(propViewId)
  const filterOn = activeLayout.filterKinds.length > 0
  const rawSort = activeLayout.sort
  const defaultSortId = detailTools.sorts?.[0]?.id ?? 'doc'
  const currentSort = detailTools.sorts?.some((item) => item.id === rawSort) ? rawSort : defaultSortId
  const sortOn = currentSort !== defaultSortId
  const props = Object.entries(schema?.fields ?? {})
    .filter(([key, field]) => key !== 'emoji' && key !== schema?.labelField && field.type !== 'file')
    .map(([key, field]) => ({ key, label: field.label ?? key }))
  const visibleKeys = visiblePropertyKeys ?? props.map((item) => item.key).filter((key) => !hiddenPropertyKeys.includes(key))

  async function setPropView(next: string) {
    selectViewCatalog(path, record, 'propViews', next)
  }

  async function patchLayout(patch: { contentViewId?: string; sort?: typeof activeLayout.sort; filterKinds?: string[] }) {
    await patchActiveRecordLayout(path, record.id, patch, fallback)
  }

  async function renamePropView(viewId: string, name: string) {
    const nextName = name.trim()
    if (!nextName) return
    await Promise.resolve(renameViewCatalog(path, record, 'propViews', viewId, nextName))
  }

  async function createChosen(kind: 'prop' | 'content') {
    setCreateKind(kind)
    setCreateOpen(false)
    if (creatingAny) return
    setCreatingAny(true)
    try {
      await Promise.resolve(createViewCatalog(path, record, kind === 'prop' ? 'propViews' : 'views'))
    } catch {
      /* ignore */
    } finally {
      setCreatingAny(false)
    }
  }

  useEffect(() => {
    setOpen(null)
    hydrateRecordViewCatalog(path, record.id, {
      views: record.views,
      propViews: record.propViews,
      layouts: record.layouts,
    })
    void loadRecordLayouts(path, record.id, record.layouts, fallback)
  }, [record.id, record.views, record.propViews, record.layouts, path, fallback, record])

  const toggle = (next: string) => setOpen((prev) => (prev === next ? null : next))
  const openSettingsTab = (tab: DetailSettingsTab) => {
    if (open === 'settings' && settingsTab === tab) {
      setOpen(null)
      return
    }
    setSettingsTab(tab)
    setOpen('settings')
  }
  const propCustom = propViewId !== DEFAULT_RECORD_PROP_VIEW_ID
  const contentCustom = contentId !== (registeredModes[0]?.id ?? '')
  const activeContentLabel =
    builtinModes.find((item) => item.id === contentId)?.label ??
    listedContentViews.find((item) => item.id === contentId)?.name ??
    '文档'
  const activePropLabel =
    propViewId === DEFAULT_RECORD_PROP_VIEW_ID
      ? '表格'
      : propViewId === SOURCE_RECORD_PROP_VIEW_ID
        ? '源码'
        : propViewId === HIDDEN_CONTENT_VIEW_ID
          ? '隐藏'
          : (listedPropViews.find((item) => item.id === propViewId)?.name ?? '表格')
  const settingsTabs: Array<{ id: DetailSettingsTab; label: string; dot?: boolean }> = [
    { id: 'view', label: '视图', dot: propCustom || contentCustom },
    { id: 'columns', label: '属性' },
    ...(detailTools.filters?.length ? [{ id: 'filter' as const, label: '筛选', dot: filterOn }] : []),
    ...(detailTools.sorts?.length ? [{ id: 'sort' as const, label: '排序', dot: sortOn }] : []),
  ]

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
      ref={bindToolbar}
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
                                void Promise.resolve(renameViewCatalog(path, record, 'layouts', item.id, renameDraft)).catch((error) => {
                                  console.warn('[record-detail-bar] rename layout failed', item.id, error)
                                })
                                setRenamingView('')
                              }
                              if (event.key === 'Escape') setRenamingView('')
                            }}
                            onBlur={() => {
                              void Promise.resolve(renameViewCatalog(path, record, 'layouts', item.id, renameDraft)).catch((error) => {
                                console.warn('[record-detail-bar] rename layout failed', item.id, error)
                              })
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
                            selectViewCatalog(path, record, 'layouts', item.id)
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
                            copyViewCatalog(path, record, 'layouts', item.id)
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
                              deleteViewCatalog(path, record, 'layouts', item.id)
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
                      void Promise.resolve(createViewCatalog(path, record, 'layouts'))
                        .catch((error) => {
                          console.warn('[record-detail-bar] create layout failed', path, error)
                        })
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
      <div className={`tasks-toolbar-right${find.open ? ' is-searching' : ''}`}>
        {detailTools.Search ? <detailTools.Search record={record} collectionPath={path} /> : null}
        {!find.open ? (
        <>
        {propCustom ? (
          <div className="tasks-sort-wrap" ref={propRef}>
            <button
              type="button"
              className={`tasks-sort-btn is-active${open === 'settings' && settingsTab === 'view' ? ' is-custom' : ''}`}
              aria-label="属性展示"
              title="属性展示"
              data-testid="page-prop-view"
              onClick={() => openSettingsTab('view')}
            >
              <PropIcon aria-hidden className="size-[14px]" />
            </button>
          </div>
        ) : null}
        {contentCustom ? (
          <div className="tasks-sort-wrap" ref={modeRef}>
            <button
              type="button"
              className={`tasks-sort-btn is-active${open === 'settings' && settingsTab === 'view' ? ' is-custom' : ''}`}
              aria-label="查看模式"
              title="呈现方式"
              onClick={() => openSettingsTab('view')}
            >
              <CurrentIcon aria-hidden className="size-[14px]" />
            </button>
          </div>
        ) : null}
        {detailTools.sorts?.length && sortOn ? (
          <div className="tasks-sort-wrap" ref={sortRef}>
            <button
              type="button"
              className="tasks-sort-btn is-active is-custom"
              aria-label="排序"
              title="排序"
              onClick={() => openSettingsTab('sort')}
            >
              <span aria-hidden className="fsdb-ui-glyph" data-icon="sort" />
              <span className="tasks-sort-dot" aria-hidden />
            </button>
          </div>
        ) : null}
        {detailTools.filters?.length && filterOn ? (
          <div className="tasks-filter-btn-wrap" ref={filterRef}>
            <button
              type="button"
              className="tasks-refresh tasks-rbar-btn is-active"
              aria-label="筛选"
              title="筛选"
              onClick={() => openSettingsTab('filter')}
            >
              <FunnelIcon aria-hidden className="size-[14px]" />
              <span className="tasks-filter-dot" aria-hidden />
            </button>
          </div>
        ) : null}
        <div className="tasks-filter-btn-wrap" ref={configRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${open === 'settings' ? ' is-active' : ''}`}
            aria-label="视图设置"
            title="视图设置"
            data-testid="fsdb-detail-view-settings-btn"
            onClick={() => {
              if (open === 'settings') {
                setOpen(null)
              } else {
                setSettingsTab('view')
                setOpen('settings')
              }
            }}
          >
            <Cog6ToothIcon aria-hidden className="size-[15px]" />
          </button>
          {open === 'settings' ? (
            <HeadlessPopover
              open
              anchorRef={configRef}
              onOpenChange={(next) => {
                if (!next) setOpen(null)
              }}
              align="end"
              sideOffset={6}
              zIndex={200}
              ignoreSelector={`${HEADLESS_DISMISS_IGNORE}, [data-fsdb-col-flyout], [data-fsdb-col-tag-trigger], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay], .fsdb-detail-more-menu`}
              inside={(node) =>
                Boolean(
                  (node instanceof Node &&
                    (configRef.current?.contains(node) ||
                      propRef.current?.contains(node) ||
                      modeRef.current?.contains(node) ||
                      sortRef.current?.contains(node) ||
                      filterRef.current?.contains(node))) ||
                    (node instanceof Element &&
                      node.closest(
                        '[data-fsdb-col-flyout], [data-fsdb-col-tag-trigger], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay], .fsdb-detail-more-menu',
                      )),
                )
              }
            >
              <div className="fsdb-page fsdb-query-flyout">
                <div className="fsdb-vset" role="dialog" aria-label="视图设置" data-testid="fsdb-detail-view-settings">
                  <div className="fsdb-vset-tabs" role="tablist">
                    {settingsTabs.map((item) => {
                      const active = settingsTab === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={`fsdb-vset-tab${active ? ' is-active' : ''}`}
                          onClick={() => {
                            setOpenAcc(null)
                            setSettingsTab(item.id)
                          }}
                        >
                          <span>{item.label}</span>
                          {item.dot ? <span className="fsdb-vset-tab-dot" aria-hidden /> : null}
                        </button>
                      )
                    })}
                  </div>
                  <div className="fsdb-vset-body">
                    {settingsTab === 'view' ? (
                      <>
                        <div className="fsdb-group-acc-row" data-testid="fsdb-detail-prop-acc">
                          <button
                            type="button"
                            className={`fsdb-group-acc-btn${openAcc === 'prop' ? ' is-open' : ''}`}
                            aria-expanded={openAcc === 'prop'}
                            onClick={() => setOpenAcc((prev) => (prev === 'prop' ? null : 'prop'))}
                          >
                            <span className="fsdb-group-panel-label">属性视图</span>
                            <span className="fsdb-group-acc-val">
                              <span className="fsdb-group-acc-val-text">{activePropLabel}</span>
                              <ChevronRightIcon
                                aria-hidden
                                className={`size-3.5 fsdb-col-menu-chev sidebar-chevron${openAcc === 'prop' ? ' is-open' : ''}`}
                              />
                            </span>
                          </button>
                          <div className={`fsdb-inline-fold${openAcc === 'prop' ? ' is-open' : ''}`} aria-hidden={openAcc !== 'prop'}>
                            <div className="fsdb-inline-fold-inner">
                              <div className="fsdb-inline-sub" role="menu">
                                <div className={`tasks-viewdd-item${propViewId === DEFAULT_RECORD_PROP_VIEW_ID ? ' is-active' : ''}`}>
                                  <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={propViewId === DEFAULT_RECORD_PROP_VIEW_ID}
                                    className="tasks-viewdd-item-main fsdb-tool-row"
                                    data-testid="page-prop-view-table"
                                    onClick={() => {
                                      void setPropView(DEFAULT_RECORD_PROP_VIEW_ID)
                                      setOpenAcc(null)
                                    }}
                                  >
                                    <TableCellsIcon aria-hidden className="tasks-viewdd-item-ico" />
                                    <span className="tasks-viewdd-item-name">表格</span>
                                    {propViewId === DEFAULT_RECORD_PROP_VIEW_ID ? (
                                      <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check ml-auto" />
                                    ) : null}
                                  </button>
                                </div>
                                <div className={`tasks-viewdd-item${propViewId === SOURCE_RECORD_PROP_VIEW_ID ? ' is-active' : ''}`}>
                                  <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={propViewId === SOURCE_RECORD_PROP_VIEW_ID}
                                    className="tasks-viewdd-item-main fsdb-tool-row"
                                    data-testid="page-prop-view-source"
                                    onClick={() => {
                                      void setPropView(SOURCE_RECORD_PROP_VIEW_ID)
                                      setOpenAcc(null)
                                    }}
                                  >
                                    <CodeBracketIcon aria-hidden className="tasks-viewdd-item-ico" />
                                    <span className="tasks-viewdd-item-name">源码</span>
                                    {propViewId === SOURCE_RECORD_PROP_VIEW_ID ? (
                                      <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check ml-auto" />
                                    ) : null}
                                  </button>
                                </div>
                                <div className={`tasks-viewdd-item${propViewId === HIDDEN_CONTENT_VIEW_ID ? ' is-active' : ''}`}>
                                  <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={propViewId === HIDDEN_CONTENT_VIEW_ID}
                                    className="tasks-viewdd-item-main fsdb-tool-row"
                                    data-testid="page-prop-view-hidden"
                                    onClick={() => {
                                      void setPropView(HIDDEN_CONTENT_VIEW_ID)
                                      setOpenAcc(null)
                                    }}
                                  >
                                    <EyeSlashIcon aria-hidden className="tasks-viewdd-item-ico" />
                                    <span className="tasks-viewdd-item-name">隐藏</span>
                                    {propViewId === HIDDEN_CONTENT_VIEW_ID ? (
                                      <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check ml-auto" />
                                    ) : null}
                                  </button>
                                </div>
                                {listedPropViews.map((item) => {
                                  const active = item.id === propViewId
                                  return (
                                    <div key={item.id} className={`tasks-viewdd-item${active ? ' is-active' : ''}`}>
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
                                                void renamePropView(item.id, renamePropDraft).catch((error) => {
                                                  console.warn('[record-detail-bar] rename prop view failed', item.id, error)
                                                })
                                                setRenamingPropView('')
                                              }
                                              if (event.key === 'Escape') setRenamingPropView('')
                                            }}
                                            onBlur={() => {
                                              void renamePropView(item.id, renamePropDraft).catch((error) => {
                                                console.warn('[record-detail-bar] rename prop view failed', item.id, error)
                                              })
                                              setRenamingPropView('')
                                            }}
                                          />
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          role="menuitemradio"
                                          aria-checked={active}
                                          className="tasks-viewdd-item-main fsdb-tool-row"
                                          data-testid={`page-prop-view-${item.id}`}
                                          onClick={() => {
                                            void setPropView(item.id)
                                            setOpenAcc(null)
                                          }}
                                        >
                                          <SandboxKindIcon className="tasks-viewdd-item-ico" />
                                          <span className="tasks-viewdd-item-name">{item.name}</span>
                                          {active ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check ml-auto" /> : null}
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
                                            copyViewCatalog(path, record, 'propViews', item.id)
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
                                            deleteViewCatalog(path, record, 'propViews', item.id)
                                          }}
                                        >
                                          <TrashGlyph aria-hidden className="size-[14px]" />
                                        </button>
                                      </span>
                                    </div>
                                  )
                                })}
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="fsdb-vset-mode-add"
                                  data-testid="page-prop-view-create"
                                  disabled={creatingPropView}
                                  onClick={() => {
                                    if (creatingPropView) return
                                    setCreatingPropView(true)
                                    void Promise.resolve(createViewCatalog(path, record, 'propViews'))
                                      .catch((error) => {
                                        console.warn('[record-detail-bar] create prop view failed', path, error)
                                      })
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
                          </div>
                        </div>

                        <div className="fsdb-group-acc-row" data-testid="fsdb-detail-content-acc">
                          <button
                            type="button"
                            className={`fsdb-group-acc-btn${openAcc === 'content' ? ' is-open' : ''}`}
                            aria-expanded={openAcc === 'content'}
                            onClick={() => setOpenAcc((prev) => (prev === 'content' ? null : 'content'))}
                          >
                            <span className="fsdb-group-panel-label">内容视图</span>
                            <span className="fsdb-group-acc-val">
                              <span className="fsdb-group-acc-val-text">{activeContentLabel}</span>
                              <ChevronRightIcon
                                aria-hidden
                                className={`size-3.5 fsdb-col-menu-chev sidebar-chevron${openAcc === 'content' ? ' is-open' : ''}`}
                              />
                            </span>
                          </button>
                          <div className={`fsdb-inline-fold${openAcc === 'content' ? ' is-open' : ''}`} aria-hidden={openAcc !== 'content'}>
                            <div className="fsdb-inline-fold-inner">
                              <div className="fsdb-inline-sub" role="menu">
                                {builtinModes.map((item) => {
                                  const Icon = item.Icon ?? EyeSlashIcon
                                  const active = item.id === contentId
                                  return (
                                    <div key={item.id} className={`tasks-viewdd-item${active ? ' is-active' : ''}`}>
                                      <button
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={active}
                                        className="tasks-viewdd-item-main fsdb-tool-row"
                                        data-testid={item.id === HIDDEN_CONTENT_VIEW_ID ? 'page-view-hidden' : undefined}
                                        onClick={() => {
                                          selectViewCatalog(path, record, 'views', item.id)
                                          setOpenAcc(null)
                                        }}
                                      >
                                        <Icon aria-hidden className="tasks-viewdd-item-ico" />
                                        <span className="tasks-viewdd-item-name">{item.label}</span>
                                        {active ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check ml-auto" /> : null}
                                      </button>
                                    </div>
                                  )
                                })}
                                {listedContentViews.map((item) => {
                                  const active = item.id === contentId
                                  return (
                                    <div key={item.id} className={`tasks-viewdd-item${active ? ' is-active' : ''}`}>
                                      <button
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={active}
                                        className="tasks-viewdd-item-main fsdb-tool-row"
                                        data-testid={`page-view-${item.id}`}
                                        onClick={() => {
                                          selectViewCatalog(path, record, 'views', item.id)
                                          setOpenAcc(null)
                                        }}
                                      >
                                        <SandboxKindIcon className="tasks-viewdd-item-ico" />
                                        <span className="tasks-viewdd-item-name">{item.name}</span>
                                        {active ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check ml-auto" /> : null}
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
                                            copyViewCatalog(path, record, 'views', item.id)
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
                                            deleteViewCatalog(path, record, 'views', item.id)
                                          }}
                                        >
                                          <TrashGlyph aria-hidden className="size-[14px]" />
                                        </button>
                                      </span>
                                    </div>
                                  )
                                })}
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="fsdb-vset-mode-add"
                                  data-testid="page-view-create"
                                  disabled={creatingView}
                                  onClick={() => {
                                    if (creatingView) return
                                    setCreatingView(true)
                                    void Promise.resolve(createViewCatalog(path, record, 'views'))
                                      .catch((error) => {
                                        console.warn('[record-detail-bar] create content view failed', path, error)
                                      })
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
                          </div>
                        </div>

                        {configMenu ? (
                          <div className="fsdb-group-panel-section">
                            {configMenu}
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {settingsTab === 'columns' ? (
                      propViewId === DEFAULT_RECORD_PROP_VIEW_ID ? (
                        columnMenu ?? (
                          <div className="fsdb-col-menu-list">
                            {props.length ? (
                              props.map((item) => (
                                <Row
                                  key={item.key}
                                  label={item.label}
                                  on={visibleKeys.includes(item.key)}
                                  switchControl
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
                        )
                      ) : (
                        <div className="tasks-viewdd-empty">仅表格属性视图支持调整可见属性</div>
                      )
                    ) : null}

                    {settingsTab === 'filter' && detailTools.filters?.length ? (
                      <>
                        <div className="fsdb-query-head">
                          <span className="fsdb-query-head-title">筛选设置</span>
                          <span className="fsdb-query-head-toggle">
                            <span className="fsdb-query-toggle-label">{filterOn ? '已生效' : '未生效'}</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={filterOn}
                              aria-label="启用筛选"
                              className={`fsdb-group-switch${filterOn ? ' is-on' : ''}`}
                              onClick={() => {
                                if (filterOn) {
                                  void patchLayout({ filterKinds: [] })
                                } else if (detailTools.filters?.[0]) {
                                  void patchLayout({ filterKinds: [detailTools.filters[0].id] })
                                }
                              }}
                            >
                              <span className="fsdb-group-switch-thumb" />
                            </button>
                          </span>
                        </div>
                        <Row
                          label={detailTools.filterAllLabel || '全部'}
                          on={!filterOn}
                          onToggle={() => void patchLayout({ filterKinds: [] })}
                        />
                        {detailTools.filters.map((item) => {
                          const selected = activeLayout.filterKinds
                          return (
                            <Row
                              key={item.id}
                              label={item.label}
                              on={selected.includes(item.id)}
                              switchControl
                              onToggle={() => {
                                const has = selected.includes(item.id)
                                const next = has ? selected.filter((key) => key !== item.id) : [...selected, item.id]
                                void patchLayout({ filterKinds: next })
                              }}
                            />
                          )
                        })}
                      </>
                    ) : null}

                    {settingsTab === 'sort' && detailTools.sorts?.length ? (
                      <>
                        <div className="fsdb-query-head">
                          <span className="fsdb-query-head-title">排序设置</span>
                        </div>
                        {detailTools.sorts.map((item) => (
                          <Row
                            key={item.id}
                            label={item.label}
                            on={currentSort === item.id}
                            onToggle={() => void patchLayout({ sort: item.id as typeof activeLayout.sort })}
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </HeadlessPopover>
          ) : null}
        </div>
        {share ? (
          <div className="tasks-filter-btn-wrap" ref={shareRef}>
            <button
              type="button"
              className={`tasks-refresh tasks-rbar-btn${open === 'share' ? ' is-active' : ''}`}
              aria-label={shareLabel || '分享'}
              aria-haspopup="dialog"
              aria-expanded={open === 'share'}
              title={shareLabel || '分享'}
              data-testid="fsdb-detail-share"
              onClick={() => toggle('share')}
            >
              <ShareIcon aria-hidden className="size-[14px]" />
            </button>
            {open === 'share' ? (
              <HeadlessPopover
                open
                anchorRef={shareRef}
                onOpenChange={(next) => {
                  if (!next) setOpen(null)
                }}
                align="end"
                sideOffset={6}
                zIndex={200}
                inside={(node) => Boolean(node instanceof Node && shareRef.current?.contains(node))}
              >
                <div className="fsdb-page fsdb-query-flyout">
                  <div className="fsdb-detail-more-menu has-share" role="dialog" style={{ minWidth: 360 }}>
                    {share}
                  </div>
                </div>
              </HeadlessPopover>
            ) : null}
          </div>
        ) : null}
        <div className="tasks-filter-btn-wrap" ref={commentRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn editor-comment-trigger${open === 'comments' || commentsUi.open ? ' is-active' : ''}`}
            aria-label="批注"
            aria-haspopup="menu"
            aria-expanded={open === 'comments'}
            title={commentsUi.openCount ? `批注 (${commentsUi.openCount})` : '批注'}
            onClick={() => toggle('comments')}
          >
            <ChatBubbleBottomCenterTextIcon aria-hidden className="size-[14px]" />
            {commentsUi.openCount > 0 ? (
              <span className="editor-comment-badge" data-testid="editor-comment-badge">
                {commentsUi.openCount}
              </span>
            ) : null}
          </button>
          {open === 'comments' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={commentRef}>
              <div className="tasks-filter-menu fsdb-tool-flyout" role="menu" data-testid="editor-comment-menu">
                <Row
                  label={commentsUi.openCount ? `未解决 (${commentsUi.openCount})` : '未解决'}
                  on={commentsUi.open && commentsUi.filter === 'open'}
                  onToggle={() => {
                    patchEditorCommentsUi(record.id, { open: true, filter: 'open' })
                    setOpen(null)
                  }}
                />
                <Row
                  label={commentsUi.resolvedCount ? `已解决 (${commentsUi.resolvedCount})` : '已解决'}
                  on={commentsUi.open && commentsUi.filter === 'resolved'}
                  onToggle={() => {
                    patchEditorCommentsUi(record.id, { open: true, filter: 'resolved' })
                    setOpen(null)
                  }}
                />
                <Row
                  label={
                    commentsUi.openCount + commentsUi.resolvedCount > 0
                      ? `全部 (${commentsUi.openCount + commentsUi.resolvedCount})`
                      : '全部'
                  }
                  on={commentsUi.open && commentsUi.filter === 'all'}
                  onToggle={() => {
                    patchEditorCommentsUi(record.id, { open: true, filter: 'all' })
                    setOpen(null)
                  }}
                />
                <Row
                  label="隐藏批注"
                  on={!commentsUi.open}
                  onToggle={() => {
                    patchEditorCommentsUi(record.id, { open: false, draftAnchor: null })
                    setOpen(null)
                  }}
                />
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
        </>
        ) : null}
      </div>
    </div>
  )
}
