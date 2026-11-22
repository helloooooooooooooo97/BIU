import { lazy, memo, Suspense, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownTrayIcon,
  Bars3BottomLeftIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PlusIcon,
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
import { countFilterRules, type FilterGroup, type GroupConfig, type SortRule } from '../query-logic.ts'
import type { BrowserDialogState } from './browser-dialogs.tsx'
import { askNewPlugin, askNewPresentation } from './browser-row-title.tsx'
import { CheckRow, LocalText } from './controls.tsx'
import { PAGES_COLLECTION_PATH, PLUGINS_COLLECTION_PATH } from './database-path.ts'
import { readJson } from './db-client.ts'
import type { GroupBucket, ViewMode } from './fields.ts'
import { ModeGlyph, VIEW_MODES } from './fsdb-cells.tsx'
import { TableGlyph, UiGlyph, ViewModeGlyph } from './nav-glyphs.tsx'
import { PageBanner } from './page-banner.tsx'
import { FlyoutEmpty, SearchableFlyout, flyoutQueryMatch } from './flyout-search.tsx'
import { ViewOrderMenu } from './view-order-menu.tsx'
import type { SavedView } from './view-storage.ts'

const SortQueryMenu = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.SortQueryMenu })))
const FilterQueryMenu = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.FilterQueryMenu })))
const GroupQueryMenu = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.GroupQueryMenu })))
const QueryFlyout = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.QueryFlyout })))

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
  copyView: (source?: SavedView) => void
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
  patchActiveView: (patch: Partial<SavedView>) => void
  sortRef: RefObject<HTMLDivElement | null>
  sortMenuOpen: boolean
  setSortMenuOpen: (open: boolean) => void
  sortCustom: boolean
  sorts: SortRule[]
  sortFields: Array<{ key: string; field: FieldSpec }>
  applySorts: (next: SortRule[]) => void
  filterRef: RefObject<HTMLDivElement | null>
  filterOpen: boolean
  setFilterOpen: (open: boolean) => void
  filterActive: boolean
  filterTree: FilterGroup
  filterFields: Array<{ key: string; field: FieldSpec }>
  filterValueOptions: (key: string) => string[]
  applyFilterTree: (next: FilterGroup) => void
  groupRef: RefObject<HTMLDivElement | null>
  groupOpen: boolean
  setGroupOpen: (open: boolean) => void
  grouping: boolean
  activeGroup?: { key: string; field: FieldSpec } | null
  groupBy: string
  groupConfig?: GroupConfig
  panelGroups: GroupBucket[]
  groupFields: Array<{ key: string; field: FieldSpec }>
  setGroupKey: (next: string) => void
  setGroupSettings: (next: GroupConfig | undefined) => void
  columnRef: RefObject<HTMLDivElement | null>
  columnMenuOpen: boolean
  setColumnMenuOpen: (open: boolean) => void
  renderVisibleColumnsFlyout: () => ReactNode
  configRef: RefObject<HTMLDivElement | null>
  configOpen: boolean
  setConfigOpen: (open: boolean) => void
  schema?: CollectionSchema
  parentKey?: string
  wrapCells: boolean
  setWrap: (next: boolean) => void
  truncateCells: boolean
  setTruncate: (next: boolean) => void
  freezeTitle: boolean
  setFreezeTitleCol: (next: boolean) => void
  showTree: boolean
  setTree: (next: boolean) => void
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
  createScope: 'personal' | 'workspace' | 'shared'
  setCreateScope: (next: 'personal' | 'workspace' | 'shared') => void
  localData: boolean
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
    freezeTitle,
    setFreezeTitleCol,
    showTree,
    setTree,
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
  } = props

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
              {activeView ? (
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
                <h1 className="fsdb-detail-title">{title}</h1>
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
          {sheet ? null : (
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
              <div className="tasks-sort-wrap" ref={modeRef}>
                <button
                  type="button"
                  className={`tasks-sort-btn${modeMenuOpen ? ' is-active' : ''}`}
                  aria-label="查看模式"
                  title={`模式：${
                    VIEW_MODES.find((item) => item.id === mode)?.label ??
                    extraRows.find((item) => item.id === mode)?.label ??
                    extraViews.find((item) => item.id === mode)?.label ??
                    mode
                  }`}
                  onClick={() => toggleMenu('mode')}
                >
                  <ModeGlyph id={mode} extra={extraViews} rows={extraRows} />
                </button>
                {modeMenuOpen ? (
                  <HeadlessDismiss onDismiss={() => setModeMenuOpen(false)} insideRef={modeRef}>
                    <SearchableFlyout className="tasks-sort-menu">
                      {(q) => {
                        const modes = VIEW_MODES.filter((opt) => flyoutQueryMatch(opt.label, q))
                        const viewsList = extraViews.filter((opt) => flyoutQueryMatch(opt.label, q))
                        const rowsList = extraRows.filter((opt) => flyoutQueryMatch(opt.label, q))
                        return (
                          <>
                            {modes.map((opt) => (
                              <CheckRow
                                key={opt.id}
                                icon={<ModeGlyph id={opt.id} extra={extraViews} rows={extraRows} />}
                                label={opt.label}
                                on={mode === opt.id}
                                onToggle={() => {
                                  setMode(opt.id)
                                  patchActiveView({ mode: opt.id })
                                  setModeMenuOpen(false)
                                }}
                              />
                            ))}
                            {viewsList.map((opt) => (
                              <CheckRow
                                key={opt.id}
                                icon={<ModeGlyph id={opt.id} extra={extraViews} rows={extraRows} />}
                                label={opt.label}
                                on={mode === opt.id}
                                onToggle={() => {
                                  setMode(opt.id)
                                  patchActiveView({ mode: opt.id })
                                  setModeMenuOpen(false)
                                }}
                              />
                            ))}
                            {rowsList.map((opt) => (
                              <CheckRow
                                key={opt.id}
                                icon={<ModeGlyph id={opt.id} extra={extraViews} rows={extraRows} />}
                                label={opt.label}
                                on={mode === opt.id}
                                onToggle={() => {
                                  setMode(opt.id)
                                  patchActiveView({ mode: opt.id })
                                  setModeMenuOpen(false)
                                }}
                              />
                            ))}
                            {q.trim() && !modes.length && !viewsList.length && !rowsList.length ? <FlyoutEmpty /> : null}
                            <button
                              type="button"
                              className="fsdb-mode-plus"
                              data-testid="fsdb-mode-plus"
                              aria-label="添加呈现方式"
                              title="添加呈现方式"
                              onClick={() => {
                                setModeMenuOpen(false)
                                askNewPresentation({ path: collectionPath, title })
                              }}
                            >
                              <PlusIcon aria-hidden className="size-[14px]" />
                              添加呈现方式
                            </button>
                          </>
                        )
                      }}
                    </SearchableFlyout>
                  </HeadlessDismiss>
                ) : null}
              </div>
              <div className="tasks-sort-wrap" ref={sortRef}>
                <button
                  type="button"
                  className={`tasks-sort-btn${sortMenuOpen ? ' is-active' : ''}${sortCustom ? ' is-custom' : ''}`}
                  aria-label="排序"
                  title={sortCustom ? `${sorts.length} 个排序` : '排序'}
                  onClick={() => toggleMenu('sort')}
                >
                  <UiGlyph icon="sort" />
                  {sortCustom ? <span className="tasks-sort-dot" aria-hidden /> : null}
                </button>
                {sortMenuOpen ? (
                  <Suspense fallback={null}>
                    <QueryFlyout
                      anchorRef={sortRef}
                      onClose={() => setSortMenuOpen(false)}
                      ignoreSelector={QUERY_NEST_IGNORE}
                      inside={(node) =>
                        node instanceof Element &&
                        Boolean(node.closest('.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))
                      }
                    >
                      <SortQueryMenu sorts={sorts} fields={sortFields} onChange={applySorts} />
                    </QueryFlyout>
                  </Suspense>
                ) : null}
              </div>
              <div className="tasks-filter-btn-wrap" ref={filterRef}>
                <button
                  type="button"
                  className={`tasks-refresh tasks-rbar-btn${filterOpen || filterActive ? ' is-active' : ''}`}
                  aria-label="筛选"
                  title={filterActive ? `${countFilterRules(filterTree)} 条筛选` : '筛选'}
                  onClick={() => toggleMenu('filter')}
                >
                  <UiGlyph icon="filter" />
                  {filterActive ? <span className="tasks-filter-dot" aria-hidden /> : null}
                </button>
                {filterOpen ? (
                  <Suspense fallback={null}>
                    <QueryFlyout
                      anchorRef={filterRef}
                      onClose={() => setFilterOpen(false)}
                      ignoreSelector={QUERY_NEST_IGNORE}
                      inside={(node) =>
                        node instanceof Element &&
                        Boolean(node.closest('.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))
                      }
                    >
                      <FilterQueryMenu
                        tree={filterTree}
                        fields={filterFields}
                        valueOptions={filterValueOptions}
                        onChange={applyFilterTree}
                      />
                    </QueryFlyout>
                  </Suspense>
                ) : null}
              </div>
              <div className="tasks-sort-wrap" ref={groupRef}>
                <button
                  type="button"
                  className={`tasks-sort-btn${groupOpen ? ' is-active' : ''}${grouping ? ' is-custom' : ''}`}
                  aria-label="分组"
                  title={activeGroup ? `分组：${activeGroup.field.label ?? activeGroup.key}` : '分组'}
                  onClick={() => toggleMenu('group')}
                >
                  <UiGlyph icon="stack" />
                  {grouping ? <span className="tasks-sort-dot" aria-hidden /> : null}
                </button>
                {groupOpen ? (
                  <Suspense fallback={null}>
                    <QueryFlyout anchorRef={groupRef} onClose={() => setGroupOpen(false)}>
                      <GroupQueryMenu
                        groupBy={groupBy}
                        groupConfig={groupConfig}
                        groups={panelGroups.map((item) => ({
                          key: item.key,
                          label: item.label,
                          count: item.total ?? item.rows.length,
                        }))}
                        fields={groupFields}
                        onChange={setGroupKey}
                        onChangeConfig={setGroupSettings}
                        onClose={() => setGroupOpen(false)}
                      />
                    </QueryFlyout>
                  </Suspense>
                ) : null}
              </div>
              <div className="tasks-sort-wrap" ref={columnRef}>
                <button
                  type="button"
                  className={`tasks-sort-btn${columnMenuOpen ? ' is-active' : ''}`}
                  aria-label="可见列"
                  title="可见列"
                  onClick={() => toggleMenu('columns')}
                >
                  <UiGlyph icon="eye" />
                </button>
                {columnMenuOpen ? (
                  <HeadlessDismiss
                    onDismiss={() => setColumnMenuOpen(false)}
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
                    {renderVisibleColumnsFlyout()}
                  </HeadlessDismiss>
                ) : null}
              </div>
              {mode === 'table' ? (
                <div className="tasks-filter-btn-wrap" ref={configRef}>
                  <button
                    type="button"
                    className={`tasks-refresh tasks-rbar-btn${configOpen ? ' is-active' : ''}`}
                    aria-label="表格配置"
                    title="表格配置"
                    onClick={() => toggleMenu('config')}
                  >
                    <UiGlyph icon="sliders" />
                  </button>
                  {configOpen ? (
                    <HeadlessDismiss onDismiss={() => setConfigOpen(false)} insideRef={configRef}>
                      <SearchableFlyout className="tasks-filter-menu">
                        {(q) => {
                          const wrap = flyoutQueryMatch('单元格换行', q)
                          const trunc = flyoutQueryMatch('文本缩略', q)
                          const freeze = Boolean(schema?.labelField) && flyoutQueryMatch('冻结标题列', q)
                          const tree = parentKey && flyoutQueryMatch('树形展示', q)
                          return (
                            <>
                              {wrap ? (
                                <CheckRow
                                  icon={<Bars3BottomLeftIcon aria-hidden className="size-[14px]" />}
                                  label="单元格换行"
                                  on={wrapCells}
                                  onToggle={() => setWrap(!wrapCells)}
                                />
                              ) : null}
                              {trunc ? (
                                <CheckRow
                                  icon={<EllipsisHorizontalIcon aria-hidden className="size-[14px]" />}
                                  label="文本缩略"
                                  on={truncateCells}
                                  onToggle={() => setTruncate(!truncateCells)}
                                />
                              ) : null}
                              {freeze ? (
                                <CheckRow
                                  icon={<LockClosedIcon aria-hidden className="size-[14px]" />}
                                  label="冻结标题列"
                                  on={freezeTitle}
                                  onToggle={() => setFreezeTitleCol(!freezeTitle)}
                                />
                              ) : null}
                              {tree ? (
                                <CheckRow
                                  icon={<ChevronRightIcon aria-hidden className="size-[14px]" />}
                                  label="树形展示"
                                  on={showTree}
                                  onToggle={() => setTree(!showTree)}
                                />
                              ) : null}
                              {q.trim() && !wrap && !trunc && !freeze && !tree ? <FlyoutEmpty /> : null}
                            </>
                          )
                        }}
                      </SearchableFlyout>
                    </HeadlessDismiss>
                  ) : null}
                </div>
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
              {(canCreate || canAskNewPlugin) && !sheet ? (
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
