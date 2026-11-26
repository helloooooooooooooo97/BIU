import { lazy, memo, Suspense, useEffect, useRef, useState, type ReactElement, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownTrayIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  GlobeAltIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/16/solid'
import { HEADLESS_DISMISS_IGNORE, HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import { emitFsdbChange, type CollectionInfo, type CollectionSchema, type DbRecord, type FieldSpec } from '@biu/type-file-system'
import type { CollectionRowViewType, CollectionViewType } from '@biu/type-file-system/ui'
import { collectionNoun } from '../catalog-views.ts'
import { savedViewRecordPath } from '../paths.ts'
import { countFilterRules, type FilterGroup, type SortRule } from '../query-logic.ts'
import type { BrowserDialogState } from './browser-dialogs.tsx'
import { askNewPlugin } from './browser-row-title.tsx'
import { LocalText } from './controls.tsx'
import { PAGES_COLLECTION_PATH, PLUGINS_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH, isIndexCollection, isSystemCollection } from './database-path.ts'
import { readJson } from './db-client.ts'
import type { GroupBucket, ViewMode } from './fields.ts'
import { ModeGlyph, VIEW_MODES } from './fsdb-cells.tsx'
import { TableGlyph, UiGlyph, ViewModeGlyph } from './nav-glyphs.tsx'
import { PageBanner } from './page-banner.tsx'
import type { QueryField } from './query-menus.tsx'
import { ViewOrderMenu } from './view-order-menu.tsx'
import { canEditSavedView, viewStateKey, type GroupConfig, type SavedView } from './saved-view.ts'
import type { TableSandboxItem } from '../shared/table-sandbox-model.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'

const QueryFlyout = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.QueryFlyout })))
const ViewSettingsMenu = lazy(() => import('./view-settings-menu.tsx').then((m) => ({ default: m.ViewSettingsMenu })))
import type { ViewSettingsTab } from './view-settings-menu.tsx'

const QUERY_NEST_IGNORE = `${HEADLESS_DISMISS_IGNORE}, .db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`

export type BrowserListChromeProps = {
  sheet: boolean
  collectionPath: string
  title: string
  activeViewId: string | null
  activeView?: SavedView
  views: SavedView[]
  viewBanner: unknown
  setViewBanner: (next: unknown) => void
  commitViewName: (viewId: string, raw: string) => void
  bindToolbar: (node: HTMLDivElement | null) => void
  viewRef: RefObject<HTMLDivElement | null>
  viewMenuOpen: boolean
  setViewMenuOpen: (open: boolean) => void
  toggleMenu: (which: 'view' | 'mode' | 'sort' | 'columns' | 'filter' | 'config' | 'group' | 'layout') => void
  selectView: (view: SavedView) => void
  copyView: (source?: SavedView, overrides?: Partial<SavedView>) => void
  deleteView: (view: SavedView, path?: string) => void
  persistViewOrder: (ids: string[]) => void
  addEmptyView: () => void
  pickedIds: string[]
  setPickedIds: (ids: string[]) => void
  sendPickedRowsToChat: () => void
  canBulkDelete: boolean
  inTrash: boolean
  items: DbRecord[]
  setDlg: (dlg: BrowserDialogState | null) => void
  bulkRef: RefObject<HTMLDivElement | null>
  bulkMenuRef: RefObject<HTMLDivElement | null>
  bulkMenuOpen: boolean
  setBulkMenuOpen: (next: boolean | ((open: boolean) => boolean)) => void
  bulkMenuBox: { top: number; left: number }
  canTag: boolean
  setBulkTagIds: (ids: string[]) => void
  exportPicked: () => Promise<void> | void
  lockedKind?: string
  lockedKindLabel?: string
  toolbarRightRef: RefObject<HTMLDivElement | null>
  searchExpanded: boolean
  viewsSaveError: boolean
  setViewsSaveError: (next: boolean) => void
  query: string
  setQuery: (next: string) => void
  setSearchOpen: (next: boolean | ((open: boolean) => boolean)) => void
  searchRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  modeRef: RefObject<HTMLDivElement | null>
  modeMenuOpen: boolean
  setModeMenuOpen: (open: boolean) => void
  mode: ViewMode
  setMode: (mode: ViewMode) => void
  extraViews: CollectionViewType[]
  extraRows: CollectionRowViewType[]
  sandboxViews?: TableSandboxItem[]
  onCreateSandboxView?: () => void
  patchActiveView: (patch: Partial<SavedView>) => void
  sortRef: RefObject<HTMLDivElement | null>
  sortMenuOpen: boolean
  setSortMenuOpen: (open: boolean) => void
  sortCustom: boolean
  sorts: SortRule[]
  sortFields: QueryField[]
  applySorts: (next: SortRule[]) => void
  filterRef: RefObject<HTMLDivElement | null>
  filterOpen: boolean
  setFilterOpen: (open: boolean) => void
  filterActive: boolean
  filterTree: FilterGroup
  filterFields: QueryField[]
  filterValueOptions: (field: QueryField) => { value: string; label: string }[]
  applyFilterTree: (next: FilterGroup) => void
  groupRef: RefObject<HTMLDivElement | null>
  groupOpen: boolean
  setGroupOpen: (open: boolean) => void
  grouping: boolean
  activeGroup?: { key: string; field: FieldSpec } | null
  groupBy: string
  groupConfig?: GroupConfig
  panelGroups: GroupBucket[]
  groupFields: QueryField[]
  setGroupKey: (next: string) => void
  setGroupSettings: (next: GroupConfig | undefined) => void
  columnRef: RefObject<HTMLDivElement | null>
  columnMenuOpen: boolean
  setColumnMenuOpen: (open: boolean) => void
  renderVisibleColumnsFlyout: () => ReactElement
  configRef: RefObject<HTMLDivElement | null>
  configOpen: boolean
  setConfigOpen: (open: boolean) => void
  schema?: CollectionSchema
  parentKey?: string | null
  wrapCells: boolean
  setWrap: (next: boolean) => void
  truncateCells: boolean
  setTruncate: (next: boolean) => void
  showRowNumbers: boolean
  setRowNumbers: (next: boolean) => void
  freezeTitle: boolean
  setFreezeTitleCol: (next: boolean) => void
  showTree: boolean
  setTree: (next: boolean) => void
  pageSize: number
  changePageSize: (next: number) => void
  refreshing: boolean
  refreshNow: () => Promise<void> | void
  notice: string
  canCreate: boolean
  canAskNewPlugin: boolean
  createRecord: () => Promise<void> | void
  isDataOverview: boolean
  createTypeOpen: boolean
  setCreateTypeOpen: (next: boolean | ((open: boolean) => boolean)) => void
  createTypeTable?: CollectionInfo
  createTypePath: string
  setCreateTypePath: (next: string) => void
  overviewCreateTables: CollectionInfo[]
  createScopeOpen: boolean
  setCreateScopeOpen: (next: boolean | ((open: boolean) => boolean)) => void
  createScope: 'personal' | 'workspace' | 'shared' | 'local'
  setCreateScope: (next: 'personal' | 'workspace' | 'shared' | 'local') => void
  localData: boolean
  hasExternalViews?: boolean
}

export const BrowserListChrome = memo(function BrowserListChrome(props: BrowserListChromeProps) {
  const {
    sheet,
    collectionPath,
    title,
    activeViewId,
    activeView,
    views,
    viewBanner,
    setViewBanner,
    commitViewName,
    bindToolbar,
    viewRef,
    viewMenuOpen,
    setViewMenuOpen,
    toggleMenu,
    selectView,
    copyView,
    deleteView,
    persistViewOrder,
    addEmptyView,
    pickedIds,
    setPickedIds,
    sendPickedRowsToChat,
    canBulkDelete,
    inTrash,
    items,
    setDlg,
    bulkRef,
    bulkMenuRef,
    bulkMenuOpen,
    setBulkMenuOpen,
    bulkMenuBox,
    canTag,
    setBulkTagIds,
    exportPicked,
    lockedKind,
    lockedKindLabel,
    toolbarRightRef,
    searchExpanded,
    viewsSaveError,
    setViewsSaveError,
    query,
    setQuery,
    setSearchOpen,
    searchRef,
    searchInputRef,
    modeRef,
    modeMenuOpen,
    setModeMenuOpen,
    mode,
    setMode,
    extraViews,
    extraRows,
    sandboxViews = [],
    onCreateSandboxView,
    patchActiveView,
    sortRef,
    sortMenuOpen,
    setSortMenuOpen,
    sortCustom,
    sorts,
    sortFields,
    applySorts,
    filterRef,
    filterOpen,
    setFilterOpen,
    filterActive,
    filterTree,
    filterFields,
    filterValueOptions,
    applyFilterTree,
    groupRef,
    groupOpen,
    setGroupOpen,
    grouping,
    activeGroup,
    groupBy,
    groupConfig,
    panelGroups,
    groupFields,
    setGroupKey,
    setGroupSettings,
    columnRef,
    columnMenuOpen,
    setColumnMenuOpen,
    renderVisibleColumnsFlyout,
    configRef,
    configOpen,
    setConfigOpen,
    schema,
    parentKey,
    wrapCells,
    setWrap,
    truncateCells,
    setTruncate,
    showRowNumbers,
    setRowNumbers,
    freezeTitle,
    setFreezeTitleCol,
    showTree,
    setTree,
    pageSize,
    changePageSize,
    refreshing,
    refreshNow,
    notice,
    canCreate,
    canAskNewPlugin,
    createRecord,
    isDataOverview,
    createTypeOpen,
    setCreateTypeOpen,
    createTypeTable,
    createTypePath,
    setCreateTypePath,
    overviewCreateTables,
    createScopeOpen,
    setCreateScopeOpen,
    createScope,
    setCreateScope,
    localData,
    hasExternalViews = false,
  } = props

  const [settingsTab, setSettingsTab] = useState<ViewSettingsTab>('view')
  const [groupSaveBusy, setGroupSaveBusy] = useState(false)
  const [groupSaveHint, setGroupSaveHint] = useState('')
  const savedBaselineRef = useRef<Map<string, SavedView>>(new Map())

  // 记录只读视图初次载入/服务端更新时的基准快照，用于识别前端会话临时修改（重置 / 另存为个人视图）。
  useEffect(() => {
    if (!activeView || canEditSavedView(activeView)) return
    const key = `${collectionPath}::${activeView.id}`
    const prev = savedBaselineRef.current.get(key)
    if (!prev || prev.updatedAt !== activeView.updatedAt) {
      savedBaselineRef.current.set(key, activeView)
    }
  }, [collectionPath, activeView?.id, activeView?.updatedAt])

  const readOnlyBaseline =
    activeView && !canEditSavedView(activeView)
      ? savedBaselineRef.current.get(`${collectionPath}::${activeView.id}`) ?? null
      : null
  const hasReadOnlyDraftChanges = Boolean(
    activeView &&
      readOnlyBaseline &&
      viewStateKey(activeView) !== viewStateKey(readOnlyBaseline),
  )

  const saveAsDynamicGroup = async () => {
    if (groupSaveBusy) return
    const defaultName = activeView?.name ? `${activeView.name} 动态组` : '新建动态成员组'
    const raw = window.prompt('输入动态成员组名称（将拷贝当前成员筛选条件，后续修改视图不影响成员组）：', defaultName)
    const name = raw?.trim()
    if (!name) return
    setGroupSaveBusy(true)
    setGroupSaveHint('')
    try {
      await readJson('/api/account/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          kind: 'dynamic',
          filterTree,
        }),
      })
      setGroupSaveHint(`已保存动态组「${name}」`)
      window.setTimeout(() => setGroupSaveHint(''), 2400)
    } catch (err) {
      setGroupSaveHint(err instanceof Error ? err.message : '保存动态组失败')
      window.setTimeout(() => setGroupSaveHint(''), 3000)
    } finally {
      setGroupSaveBusy(false)
    }
  }

  const openSettingsTab = (tab: ViewSettingsTab) => {
    if (configOpen && settingsTab === tab) {
      setConfigOpen(false)
      return
    }
    setSettingsTab(tab)
    setConfigOpen(true)
  }

  return (
    <>
      {sheet ? null : (
        <>
          <PageBanner
            value={viewBanner}
            writable={Boolean(activeViewId)}
            path={activeViewId ? savedViewRecordPath(collectionPath, activeViewId) : undefined}
            title={activeView?.name ?? title}
            onChange={(next) => {
              if (!activeViewId) return
              const path = savedViewRecordPath(collectionPath, activeViewId)
              if (!path) return
              const prev = viewBanner
              void readJson<{ value?: { banner?: unknown } }>('/api/db/update', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path, content: { banner: next } }),
              })
                .then((data) => {
                  setViewBanner(data.value?.banner ?? next)
                  emitFsdbChange({ scope: 'content', path })
                })
                .catch(() => {
                  setViewBanner(prev)
                })
            }}
          />
          <div className="fsdb-detail-icon-slot">
            <span className="fsdb-detail-title-icon" aria-hidden>
              <ViewModeGlyph mode={activeView?.mode} className="" />
            </span>
          </div>
          <div className="fsdb-detail-title-row">
            <div className="fsdb-detail-title-block">
              {activeView && canEditSavedView(activeView) ? (
                <h1 className="fsdb-detail-title">
                  <LocalText
                    as="textarea"
                    className="fsdb-detail-title-input"
                    value={activeView.name}
                    autoSize
                    aria-label="视图名称"
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return
                      if (event.key !== 'Enter' || event.shiftKey) return
                      event.preventDefault()
                      event.currentTarget.blur()
                    }}
                    onCommit={(raw) => commitViewName(activeView.id, raw)}
                  />
                </h1>
              ) : (
                <h1 className="fsdb-detail-title">{activeView ? activeView.name : title}</h1>
              )}
            </div>
          </div>
        </>
      )}

      <div
        className="tasks-toolbar"
        ref={bindToolbar}
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
          {sheet && !hasExternalViews ? (
            <div className="tasks-viewtabs">
              <span className="tasks-viewdd-btn tasks-viewtab is-active" style={{ cursor: 'default' }}>
                <ViewModeGlyph mode={mode} />
                <span className="tasks-viewdd-name">{title || '收集'}</span>
              </span>
            </div>
          ) : (
            <div className="tasks-viewdd-wrap" ref={viewRef}>
              <div className="tasks-viewtabs">
                <button
                  type="button"
                  className={`tasks-viewdd-btn tasks-viewtab is-active${viewMenuOpen ? ' is-menu' : ''}`}
                  data-testid="fsdb-view-tab"
                  aria-haspopup="menu"
                  aria-expanded={viewMenuOpen}
                  onClick={() => toggleMenu('view')}
                >
                  {activeView ? <ViewModeGlyph mode={activeView.mode} /> : <UiGlyph icon="squares" />}
                  <span className="tasks-viewdd-name">{activeView?.name ?? '未保存'}</span>
                </button>
              </div>
              {viewMenuOpen ? (
                <Suspense fallback={null}>
                  <QueryFlyout
                    anchorRef={viewRef}
                    onClose={() => setViewMenuOpen(false)}
                    ignoreSelector={QUERY_NEST_IGNORE}
                    align="start"
                  >
                    <ViewOrderMenu
                      views={views}
                      activeViewId={activeViewId}
                      onSelect={(view) => {
                        selectView(view)
                        setViewMenuOpen(false)
                      }}
                      onCopy={copyView}
                      onDelete={deleteView}
                      onReorder={persistViewOrder}
                      onAdd={() => addEmptyView()}
                    />
                  </QueryFlyout>
                </Suspense>
              ) : null}
            </div>
          )}
          {pickedIds.length ? (
            <div className="fsdb-bulk-slot">
              <div className="fsdb-bulk" data-testid="fsdb-bulk-bar">
                <span
                  className="fsdb-bulk-count"
                  role="button"
                  tabIndex={0}
                  title="取消选择"
                  onClick={() => setPickedIds([])}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setPickedIds([])
                    }
                  }}
                >
                  {pickedIds.length} 已选
                </span>
                <button
                  type="button"
                  className="tasks-icon-btn"
                  data-testid="fsdb-bulk-chat"
                  aria-label="送到会话"
                  title="送到会话 ⌘L"
                  onClick={() => sendPickedRowsToChat()}
                >
                  <ChatBubbleLeftRightIcon aria-hidden className="size-[14px]" />
                </button>
                {canBulkDelete && pickedIds.some((id) => !(collectionPath === PLUGINS_COLLECTION_PATH && items.find((row) => row.id === id)?.builtin === true)) ? (
                  <button
                    type="button"
                    className="tasks-icon-btn is-danger"
                    data-testid="fsdb-bulk-delete"
                    aria-label={inTrash ? '彻底删除选中' : '删除选中'}
                    title={`${inTrash ? '彻底删除' : '删除'}选中的 ${pickedIds.length} 条`}
                    onClick={() =>
                      setDlg({
                        kind: 'delete-records',
                        ids: pickedIds.filter((id) => !(collectionPath === PLUGINS_COLLECTION_PATH && items.find((row) => row.id === id)?.builtin === true)),
                      })
                    }
                  >
                    <TrashIcon aria-hidden className="size-[14px]" />
                  </button>
                ) : null}
                <div className="fsdb-bulk-more" ref={bulkRef}>
                  <button
                    type="button"
                    className={`tasks-icon-btn${bulkMenuOpen ? ' is-active' : ''}`}
                    data-testid="fsdb-bulk-more"
                    aria-label="更多操作"
                    aria-expanded={bulkMenuOpen}
                    title="更多"
                    onClick={() => setBulkMenuOpen((open) => !open)}
                  >
                    <EllipsisHorizontalIcon aria-hidden className="size-[14px]" />
                  </button>
                  {bulkMenuOpen
                    ? createPortal(
                        <HeadlessDismiss
                          onDismiss={() => setBulkMenuOpen(false)}
                          inside={(node) =>
                            Boolean(
                              node instanceof Node &&
                                (bulkRef.current?.contains(node) || bulkMenuRef.current?.contains(node)),
                            )
                          }
                        >
                          <div
                            ref={bulkMenuRef}
                            className="fsdb-tool-flyout fsdb-bulk-menu is-fixed"
                            role="menu"
                            style={{ top: bulkMenuBox.top, left: bulkMenuBox.left, zIndex: overlayZ(200) }}
                          >
                            {canTag ? (
                              <button
                                type="button"
                                className="tasks-sort-item fsdb-tool-row"
                                data-testid="fsdb-bulk-tag"
                                onClick={() => {
                                  setBulkTagIds([])
                                  setDlg({ kind: 'bulk-tag', ids: pickedIds })
                                  setBulkMenuOpen(false)
                                }}
                              >
                                <span className="tasks-sort-item-label">
                                  <TagIcon aria-hidden className="size-[14px]" />
                                  标签
                                </span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="tasks-sort-item fsdb-tool-row"
                              data-testid="fsdb-bulk-export"
                              onClick={() => {
                                void exportPicked()
                                setBulkMenuOpen(false)
                              }}
                            >
                              <span className="tasks-sort-item-label">
                                <ArrowDownTrayIcon aria-hidden className="size-[14px]" />
                                导出
                              </span>
                            </button>
                          </div>
                        </HeadlessDismiss>,
                        overlayPortalRoot() ?? document.body,
                      )
                    : null}
                </div>
              </div>
            </div>
          ) : null}
          {lockedKind ? (
            <span className="fsdb-locked-filter" data-testid="fsdb-locked-kind" title="按组件类型筛选，不可更改">
              {lockedKindLabel}
            </span>
          ) : null}
        </div>
        <div className={`tasks-toolbar-right${searchExpanded ? ' is-searching' : ''}`} ref={toolbarRightRef}>
          {viewsSaveError ? (
            <div className="fsdb-views-error" role="alert">
              <span>视图没有保存到数据库，本地仍是上一次成功保存的状态。请重试。</span>
              <button type="button" onClick={() => setViewsSaveError(false)}>
                知道了
              </button>
            </div>
          ) : null}
          <HeadlessDismiss
            enabled={searchExpanded}
            onDismiss={() => {
              if (!query) setSearchOpen(false)
            }}
            onEscapeKeyDown={(event) => {
              if (query) event.preventDefault()
            }}
          >
            <div className={`tasks-search-wrap${searchExpanded ? ' is-open' : ''}`} ref={searchRef}>
              <button
                type="button"
                className={`tasks-sort-btn${searchExpanded ? ' is-active' : ''}`}
                aria-label="搜索"
                aria-expanded={searchExpanded}
                title="搜索"
                onClick={() => {
                  if (query) {
                    searchInputRef.current?.focus({ preventScroll: true })
                    return
                  }
                  setSearchOpen((open) => !open)
                }}
              >
                <UiGlyph icon="search" />
              </button>
              {searchExpanded ? (
                <input
                  ref={searchInputRef}
                  className="tasks-search"
                  value={query}
                  placeholder="搜索"
                  aria-label="搜索"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Escape') return
                    if (!query) setSearchOpen(false)
                    else e.currentTarget.blur()
                  }}
                />
              ) : null}
            </div>
          </HeadlessDismiss>
          {!searchExpanded ? (
            <>
              {mode !== 'table' ? (
                <div className="tasks-sort-wrap" ref={modeRef}>
                  <button
                    type="button"
                    className={`tasks-sort-btn${configOpen && settingsTab === 'view' ? ' is-active' : ''}`}
                    aria-label="查看模式"
                    title={`模式：${
                      VIEW_MODES.find((item) => item.id === mode)?.label ??
                      sandboxViews.find((item) => item.id === mode)?.name ??
                      extraRows.find((item) => item.id === mode)?.label ??
                      extraViews.find((item) => item.id === mode)?.label ??
                      mode
                    }`}
                    onClick={() => openSettingsTab('view')}
                  >
                    {sandboxViews.some((item) => item.id === mode) ? (
                      <SandboxKindIcon />
                    ) : (
                      <ModeGlyph id={mode} extra={extraViews} rows={extraRows} />
                    )}
                  </button>
                </div>
              ) : null}
              {sortCustom ? (
                <div className="tasks-sort-wrap" ref={sortRef}>
                  <button
                    type="button"
                    className={`tasks-sort-btn is-custom${configOpen && settingsTab === 'sort' ? ' is-active' : ''}`}
                    aria-label="排序"
                    title={`${sorts.length} 个排序`}
                    onClick={() => openSettingsTab('sort')}
                  >
                    <UiGlyph icon="sort" />
                    <span className="tasks-sort-dot" aria-hidden />
                  </button>
                </div>
              ) : null}
              {filterActive ? (
                <div className="tasks-filter-btn-wrap" ref={filterRef}>
                  <button
                    type="button"
                    className="tasks-refresh tasks-rbar-btn is-active"
                    aria-label="筛选"
                    title={`${countFilterRules(filterTree)} 条筛选`}
                    onClick={() => openSettingsTab('filter')}
                  >
                    <UiGlyph icon="filter" />
                    <span className="tasks-filter-dot" aria-hidden />
                  </button>
                </div>
              ) : null}
              {grouping ? (
                <div className="tasks-sort-wrap" ref={groupRef}>
                  <button
                    type="button"
                    className={`tasks-sort-btn is-custom${configOpen && settingsTab === 'group' ? ' is-active' : ''}`}
                    aria-label="分组"
                    title={activeGroup ? `分组：${activeGroup.field.label ?? activeGroup.key}` : '分组'}
                    onClick={() => openSettingsTab('group')}
                  >
                    <UiGlyph icon="stack" />
                    <span className="tasks-sort-dot" aria-hidden />
                  </button>
                </div>
              ) : null}
              <div className="tasks-filter-btn-wrap" ref={configRef}>
                <button
                  type="button"
                  className={`tasks-refresh tasks-rbar-btn${configOpen ? ' is-active' : ''}`}
                  aria-label="视图设置"
                  title="视图设置"
                  data-testid="fsdb-view-settings-btn"
                  onClick={() => {
                    if (configOpen) {
                      setConfigOpen(false)
                    } else {
                      setSettingsTab('view')
                      setConfigOpen(true)
                    }
                  }}
                >
                  <Cog6ToothIcon aria-hidden className="size-[15px]" />
                </button>
                {configOpen ? (
                  <Suspense fallback={null}>
                    <QueryFlyout
                      anchorRef={configRef}
                      onClose={() => setConfigOpen(false)}
                      ignoreSelector={`${QUERY_NEST_IGNORE}, [data-fsdb-col-flyout], [data-fsdb-col-tag-trigger]`}
                      inside={(node) =>
                        Boolean(
                          (node instanceof Node &&
                            (modeRef.current?.contains(node) ||
                              sortRef.current?.contains(node) ||
                              filterRef.current?.contains(node) ||
                              groupRef.current?.contains(node))) ||
                            (node instanceof Element &&
                              node.closest(
                                '.db-search-menu, .fsdb-cellselect-menu, [data-fsdb-col-flyout], [data-fsdb-col-tag-trigger], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]',
                              )),
                        )
                      }
                    >
                      <ViewSettingsMenu
                        tab={settingsTab}
                        onTabChange={setSettingsTab}
                        sheet={sheet && !hasExternalViews}
                        collectionPath={collectionPath}
                        title={title}
                        activeView={activeView}
                        commitViewName={commitViewName}
                        onSaveAsPersonal={activeView ? () => copyView(activeView, { scope: 'personal' }) : undefined}
                        mode={mode}
                        setMode={setMode}
                        extraViews={extraViews}
                        extraRows={extraRows}
                        sandboxViews={sandboxViews}
                        onCreateSandboxView={onCreateSandboxView}
                        patchActiveView={patchActiveView}
                        wrapCells={wrapCells}
                        setWrap={setWrap}
                        truncateCells={truncateCells}
                        setTruncate={setTruncate}
                        showRowNumbers={showRowNumbers}
                        setRowNumbers={setRowNumbers}
                        parentKey={parentKey}
                        showTree={showTree}
                        setTree={setTree}
                        pageSize={pageSize}
                        changePageSize={changePageSize}
                        renderVisibleColumnsFlyout={renderVisibleColumnsFlyout}
                        filterActive={filterActive}
                        filterTree={filterTree}
                        filterFields={filterFields}
                        filterValueOptions={filterValueOptions}
                        applyFilterTree={applyFilterTree}
                        sortCustom={sortCustom}
                        sorts={sorts}
                        sortFields={sortFields}
                        applySorts={applySorts}
                        grouping={grouping}
                        groupBy={groupBy}
                        groupConfig={groupConfig}
                        panelGroups={panelGroups.map((item) => ({
                          key: item.key,
                          label: item.label,
                          count: item.total ?? item.rows.length,
                        }))}
                        groupFields={groupFields}
                        setGroupKey={setGroupKey}
                        setGroupSettings={setGroupSettings}
                        onClose={() => setConfigOpen(false)}
                      />
                    </QueryFlyout>
                  </Suspense>
                ) : null}
              </div>
              {!sheet && !hasExternalViews && hasReadOnlyDraftChanges && activeView && readOnlyBaseline ? (
                <div
                  className="fsdb-readonly-draft-pill"
                  data-testid="fsdb-readonly-draft-pill"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 12,
                    background: 'var(--biu-color-bg-subtle, rgba(128,128,128,0.1))',
                    border: 'var(--biu-stroke-width, 1px) solid var(--biu-color-border, rgba(128,128,128,0.2))',
                    color: 'var(--biu-color-text-muted)',
                  }}
                >
                  <span>临时预览</span>
                  <button
                    type="button"
                    data-testid="fsdb-readonly-draft-reset"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '0 2px',
                      cursor: 'pointer',
                      color: 'var(--biu-color-text)',
                      fontSize: 12,
                    }}
                    onClick={() => {
                      patchActiveView(readOnlyBaseline)
                      selectView(readOnlyBaseline)
                    }}
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    data-testid="fsdb-readonly-draft-save-as"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '0 2px',
                      cursor: 'pointer',
                      color: 'var(--biu-color-accent, var(--biu-color-text))',
                      fontWeight: 500,
                      fontSize: 12,
                    }}
                    onClick={() => copyView(activeView, { scope: 'personal' })}
                  >
                    另存为我的视图
                  </button>
                </div>
              ) : null}
              {!sheet && !localData && collectionPath === WORKSPACE_MEMBERS_COLLECTION_PATH ? (
                <button
                  type="button"
                  className="tasks-refresh"
                  data-testid="fsdb-save-dynamic-group"
                  disabled={groupSaveBusy}
                  title={groupSaveHint || '将当前筛选条件拷贝保存为动态成员组（与视图解耦）'}
                  onClick={() => void saveAsDynamicGroup()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: 'auto', padding: '0 8px', fontSize: 12 }}
                >
                  <UsersIcon aria-hidden className="size-[13px]" />
                  <span>{groupSaveHint || '保存为动态组'}</span>
                </button>
              ) : null}
              <div className="fsdb-refresh-wrap">
                <button
                  type="button"
                  className={`tasks-refresh${refreshing ? ' is-spinning' : ''}`}
                  aria-label="刷新"
                  title="刷新"
                  disabled={refreshing}
                  onClick={() => void refreshNow()}
                >
                  <UiGlyph icon="refresh" className={refreshing ? 'fsdb-spin' : undefined} />
                </button>
                {notice ? (
                  <span className="fsdb-refresh-toast" role="status">
                    <CheckCircleIcon aria-hidden className="size-[14px]" />
                    {notice}
                  </span>
                ) : null}
              </div>
              {canCreate || canAskNewPlugin ? (
                <div className="fsdb-create-group">
                  <button
                    type="button"
                    className="fsdb-create-btn"
                    aria-label={canAskNewPlugin ? '新建插件' : '新建记录'}
                    title="新建"
                    data-testid={canAskNewPlugin ? 'fsdb-ask-new-plugin' : undefined}
                    onClick={() => {
                      if (canAskNewPlugin) askNewPlugin(createScope)
                      else void createRecord()
                    }}
                  >
                    新建
                  </button>
                  {isDataOverview ? (
                    <HeadlessDismiss enabled={createTypeOpen} onDismiss={() => setCreateTypeOpen(false)}>
                      <div className="fsdb-create-scope-wrap">
                        <button
                          type="button"
                          className="fsdb-create-scope"
                          aria-label="新建类型"
                          aria-expanded={createTypeOpen}
                          title={`新建${collectionNoun({
                            path: createTypeTable?.path ?? PAGES_COLLECTION_PATH,
                            label: createTypeTable?.label,
                            view: createTypeTable?.view,
                          })}`}
                          onClick={() => setCreateTypeOpen((open) => !open)}
                        >
                          <TableGlyph icon={createTypeTable?.view?.icon} />
                        </button>
                        {createTypeOpen ? (
                          <div className="fsdb-create-scope-menu" role="menu">
                            {overviewCreateTables.map((table) => (
                              <button
                                key={table.path}
                                type="button"
                                role="menuitem"
                                className={table.path === (createTypeTable?.path ?? createTypePath) ? 'is-on' : ''}
                                onClick={() => {
                                  setCreateTypePath(table.path)
                                  setCreateTypeOpen(false)
                                }}
                              >
                                <TableGlyph icon={table.view?.icon} />
                                {collectionNoun(table)}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </HeadlessDismiss>
                  ) : (
                    <HeadlessDismiss enabled={createScopeOpen} onDismiss={() => setCreateScopeOpen(false)}>
                      <div className="fsdb-create-scope-wrap">
                        <button
                          type="button"
                          className="fsdb-create-scope"
                          aria-label="新建归属"
                          aria-expanded={createScopeOpen}
                          title={
                            createScope === 'workspace'
                              ? '空间内容，全部成员可编辑'
                              : createScope === 'shared'
                                ? localData
                                  ? '共享到局域网，数据仍留在本机'
                                  : '公开链接，所有人可查看'
                                : localData
                                  ? '私人内容，仅自己可处理，数据留在本机'
                                  : '私人内容，仅自己可处理'
                          }
                          onClick={() => setCreateScopeOpen((open) => !open)}
                        >
                          <UiGlyph icon={createScope === 'workspace' ? 'users' : createScope === 'shared' ? 'globe' : 'user'} />
                        </button>
                        {createScopeOpen ? (
                          <div className="fsdb-create-scope-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className={createScope === 'personal' ? 'is-on' : ''}
                              onClick={() => {
                                setCreateScope('personal')
                                setCreateScopeOpen(false)
                              }}
                            >
                              <UserIcon aria-hidden className="size-[14px]" />
                              私人
                            </button>
                            {localData ? null : (
                              <button
                                type="button"
                                role="menuitem"
                                className={createScope === 'workspace' ? 'is-on' : ''}
                                onClick={() => {
                                  setCreateScope('workspace')
                                  setCreateScopeOpen(false)
                                }}
                              >
                                <UsersIcon aria-hidden className="size-[14px]" />
                                空间
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className={createScope === 'shared' ? 'is-on' : ''}
                              onClick={() => {
                                setCreateScope('shared')
                                setCreateScopeOpen(false)
                              }}
                            >
                              <GlobeAltIcon aria-hidden className="size-[14px]" />
                              共享
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </HeadlessDismiss>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  )
})
