import { writeStorageString } from '@biu/biu-ui/client-storage'
import { registerWorkspaceCache } from './workspace-client-store.ts'
import { useBrowserPopovers } from './use-browser-popovers.ts'
import { useBrowserBulkUi } from './use-browser-bulk-ui.ts'
import { useBrowserViewConfig } from './use-browser-view-config.ts'
import { useBrowserDetailState } from './use-browser-detail-state.ts'
import {
  lazy,
  Suspense,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { CollectionActionInfo, CollectionInfo, CollectionSchema, DbRecord, FieldSpec, FieldType } from '@biu/type-file-system'
import { emitFsdbChange, fsdbRecordChangeReloadsList, parseFsdbChange } from '@biu/type-file-system'
import { inspectorPaneAcceptsKeys } from './inspector-pane-cost.ts'
import { subscribeHistoryNavigation } from './history-nav.ts'
import type { CollectionChrome, CollectionRowViewType, CollectionViewType } from '@biu/type-file-system/ui'
import { getSidebarPersist, setSidebarPersist, SIDEBAR_PERSIST } from '@biu/web-session-view'
import {
  contentFieldKey,
  defaultColumnKeys,
  tagSourceKey,
  flattenTagColumns,
  tagColumnTitle,
  fieldEntries,
  flattenTree,
  formatField,
  filterFieldValueOptions,
  groupField,
  groupListKeys,
  mergeListFilters,
  groupRecords,
  groupableFields,
  hasMissingProjectedColumns,
  listProjectionKeys,
  overlayListed,
  parentFieldKey,
  parseTagFlatColumnKey,
  pinActionColumn,
  readTagFlatValue,
  resolveFieldType,
  uniqueValues,
  type GroupBucket,
  type ViewMode,
} from './fields.ts'
import { placeCreatedRow } from './group-insert.ts'
import { TableEditHistory } from './table-edit-history.ts'
import { collectionListCachePath } from './list-cache-scope.ts'
import { listAttributeGroups, listGroupedCollection } from './group-list.ts'
import { TREE_HAS_KIDS, listTreeChildren, listTreeCollection, treeRootFilter } from './tree-list.ts'
import { buildCrumbs, crumbHotkeyPane, crumbParentHotkey, parentCrumbTarget, type CrumbTarget } from './sidebar-nav.ts'
import { fieldPickAttrs, pickDomAttrs, recordPickKind, recordSourcePath } from './pick-dom.ts'
import { recordPreviewEmoji, crumbRecordLabel } from './sidebar-preview.ts'
import { recordPreviewMascot } from './record-mark.tsx'
import {
  COL_WIDTH_MAX,
  COL_WIDTH_MIN,
  applyGroupConfig,
  groupConfigStateKey,
  normalizeColumnWidths,
  normalizeGroupConfig,
  normalizePageSize,
  normalizeSavedView,
  rankListedViews,
  viewIsFresher,
  viewStateKey,
  type GroupConfig,
  type SavedView,
} from './saved-view.ts'
import { LiveTableCellSelection, tableCursorFromCell, type TableSelectionModel } from './table-cell-selection.ts'
import { startTableColumnResize } from './table-col-resize.ts'
import {
  WindowedTable,
  type TableCheckStore,
  type TableChromeBag,
  type TablePaintBag,
  type TablePaintNode,
} from './windowed-table.tsx'
import {
  EMPTY_HOLD_NODES,
  LIST_SEED_COLUMNS,
  LISTED_MUTATION_EVENT,
  collectSheetColumns,
  collectionFromAppUrl,
  emptyListHold,
  forgetListCache,
  isListColumn,
  listHoldFromCache,
  overviewStampOf,
  overlayListedRow,
  patchListCacheRecords,
  peekListCache,
  recordsFingerprint,
  remapGroupedRecords,
  rememberListCache,
  retainSavedColumn,
  rowsWithTreeKids,
  sameSavedViews,
  schemaFingerprint,
  type ListedMutation,
  type StatResult,
  type TableHoldSnap,
} from './browser-list-cache.ts'
import { createTableSandboxItem, normalizeTableSandboxViews, type TableSandboxItem } from '../shared/table-sandbox-model.ts'
import { DockHoverTip } from './browser-row-title.tsx'
import { RecordActions, RowCheck } from './browser-row-controls.tsx'
import { BrowserCellPopOverlay, renderBrowserCell } from './browser-cell-renderer.tsx'
import { BrowserHeader } from './browser-header.tsx'
import { BrowserListChrome } from './browser-toolbar.tsx'
import { createBrowserTableNav } from './use-browser-table-nav.ts'
import { createBrowserViewCrud } from './use-browser-view-crud.ts'
import { useViewDisplayApplier } from './use-browser-view-display.ts'
import { createBrowserMutations } from './use-browser-mutations.ts'
import { buildTableIconLookup, createBrowserTablePaint } from './browser-table-paint.tsx'
import { BrowserRecordStage } from './browser-record-stage.tsx'
import { normalizeColumnSummaries } from './column-summary.ts'
import { activeColumnSandboxItem, normalizeColumnViews, resolveColumnSandboxItems } from './column-sandbox-model.ts'
import { ColumnHeaderMenu, type ColumnHeaderMenuTarget } from './column-header-menu.tsx'
import { KeyedSerialQueue, PendingFieldPatchTracker } from './record-write-queue.ts'
import { ViewSyncController } from './view-sync-controller.ts'
import { captureTableFoldSnapshot as captureFoldSnapshot, playTableFoldFlip } from './table-fold-flip.ts'
import { BrowserDialogs } from './browser-dialogs.tsx'
export { WindowedTable } from './windowed-table.tsx'
import { useStickyToolbar } from './sticky-toolbar.ts'
import { useToolbarOverflow } from './toolbar-overflow.ts'
import { draftFromRecord, sameStringDraft, placedActions } from './fsdb-cells.tsx'
import { ensureFsdbStyle } from './fsdb-style.ts'
import {
  DATA_COLLECTION_PATH,
  PAGES_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  isIndexCollection,
  isOverviewCreatableCollection,
  isSystemCollection,
} from './database-path.ts'
import {
  FSDB_CHANGE_EVENT,
  FSDB_CRUMB_LABELS_EVENT,
  FSDB_DETAIL_REFRESH_EVENT,
  FSDB_LIST_READY_EVENT,
  FSDB_SHARES_CHANGE_EVENT,
  INSPECTOR_CLOSE_EVENT,
  INSPECTOR_OPEN_EVENT,
  OPEN_SESSION_EVENT,
  PICK_MODE_EVENT,
  SHELL_LAYOUT_EVENT,
  SHELL_SIDEBAR_WIDTH_EVENT,
  TOGGLE_SHELL_SIDEBAR_EVENT,
} from './fsdb-events.ts'
import { getDatabaseUi } from './database-ui.ts'
import {
  activeViewStorageKey,
  fetchSavedView,
  getStarredViews,
  getStarredViewsVersion,
  isViewStarred,
  loadOmittedViewIds,
  loadViews,
  pullSavedViews,
  rememberRecords,
  rememberViews,
  loadCollapsedGroups,
  pickViewForRoute,
  routeViewNeedsFetch,
  subscribeStarredViews,
  viewForPath,
  withViewDisplay,
} from './view-storage.ts'
import {
  getPagePrefs,
  getPageWidth,
  getPageWidthVersion,
  getWorkspaceProfile,
  subscribePageWidth,
} from './page-width.ts'
import { reportInspectorPaneMenu } from './inspector-pane-menu.tsx'
import { ViewPaneMenu } from './pane-more-menu.tsx'
import { HttpError, invalidateListReads, listCollection, readJson } from './db-client.ts'
import { savedViewRecordPath } from '../paths.ts'
import { findViewNeighbor, indexOnPage, locateViewRecord, pageOfIndex, type ViewNeighborQuery } from './view-adjacent.ts'
import { setViaDataCrumbs, viaDataViewId } from './data-chrome.ts'
import { paintCollectionViews } from './collection-nav.ts'
import {
  TABLE_WINDOW_OVERSCAN,
  tableColumnWidth,
  tablePinColOffsets,
  tablePinCount,
  type TableColumnSlice,
} from './table-window.ts'
import { markPaintedListReady, rememberPreviewTotalForView, resetPaintedListReady } from './sidebar-preview.ts'
import { publishDataSidebar, releaseDataSidebar, type DataSidebarLive } from './data-sidebar-host.ts'
import {
  builtinAllView,
  builtinScopeView,
  catalogLockFilters,
  displayNameForView,
  isBuiltinAllViewId,
  mergeTableViews,
  parseBuiltinScopeViewId,
  stampRowOpenTarget,
  stubBuiltinBlockKindView,
  stubBuiltinScopeView,
  viewDomainOf,
  type DataScope,
  type ViewDomain,
} from '../catalog-views.ts'
import { tableModeFor } from '../paths.ts'
import { SAVED_VIEW_EVENT, rememberInspectorWorkingView, showRecordInInspector } from './inspector-db-route.ts'
import {
  CLEAR_SHELL_TABLE_CELL,
  FOCUS_SHELL_TABLE,
  claimTableCellPick,
  consumePendingTablePane,
  firstTableTitleCell,
  peekPendingTablePane,
  requestTablePaneFocus,
  tableKeyFromEditingTarget,
  tableNavKeys,
  tablePaneFromEvent,
  tablePaneHotkey,
  tablePaneOther,
  type TableCellCursor,
} from './table-keys.ts'
import { isViewCatalogField, selectedViewCatalogOption } from './view-catalog.ts'
import { jumpTag, loadTags, pullTags, subscribeTags } from './tag-catalog.ts'
import {
  collectQueryFields,
  isCustomSorts,
  countFilterRules,
  defaultOpForKind,
  emptyFilterGroup,
  emptyFilterRule,
  emptySortRule,
  encodeListFilter,
  filterEditorStateKey,
  filterTreeStateKey,
  matchListFilterRecord,
  normalizeSorts,
  resolveViewFilterTree,
  sortsStateKey,
  type FilterGroup,
  type SortRule,
} from '../query-logic.ts'

const SchemaFieldEditor = lazy(() => import('./schema-field.tsx').then((m) => ({ default: m.SchemaFieldEditor })))
const VisibleColumnsFlyout = lazy(() => import('./column-order-menu.tsx').then((m) => ({ default: m.VisibleColumnsFlyout })))
const LazySharePanel = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.SharePanel })))

function DataSidebarPublisher(props: DataSidebarLive) {
  useLayoutEffect(() => {
    publishDataSidebar(props)
  })
  useLayoutEffect(() => () => releaseDataSidebar(), [])
  return null
}

function SharePanel(props: ComponentProps<typeof LazySharePanel>) {
  return <Suspense fallback={null}><LazySharePanel {...props} /></Suspense>
}

const EMPTY_VIEWS: CollectionViewType[] = []
const EMPTY_ROW_VIEWS: CollectionRowViewType[] = []
const EMPTY_PICK = {}

let cachedLocalData: boolean | null = null
registerWorkspaceCache('browser-local-data', () => {
  cachedLocalData = null
})

function sameGroupBuckets(a: GroupBucket[], b: GroupBucket[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!
    const y = b[i]!
    if (x.key !== y.key || x.label !== y.label || x.total !== y.total || x.rows.length !== y.rows.length) {
      return false
    }
    if (recordsFingerprint(x.rows) !== recordsFingerprint(y.rows)) return false
  }
  return true
}

function flatMapKey(obj: Record<string, boolean | number | string | undefined>): string {
  let out = ''
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out += `${key}=${obj[key]}\x1f`
    }
  }
  return out
}

const EMPTY_FILTERS: Record<string, string> = {}

const EMPTY_COL_WINDOW: TableColumnSlice = { pin: 0, start: 0, end: 0, padLeft: 0, padRight: 0 }

type PendingPathQuery = {
  listed: SavedView[]
  view: SavedView
  fetchQuery: string
  sortField: string
  sortDir: 'asc' | 'desc'
  sorts: SortRule[]
  queryFilters: Record<string, unknown>
  groupBy: string
  pageSize: number
  wrapCells: boolean
  tree: boolean
  listColumns: string[] | undefined
  activeViewId: string
}

type OriginViewNav = {
  items: Array<DbRecord & { id: string }>
  total: number
  page: number
  pageSize: number
  viewId: string
  query: ViewNeighborQuery
}

export function CollectionBrowser({
  moduleId,
  collectionPath,
  title,
  blurb,
  chrome,
  tables = [],
  onOpenTable,
  lockedFilters = EMPTY_FILTERS,
  routeRecordId = null,
  routeViewId,
  expandedViewKey,
  onExpandedViewKeyChange,
  onOpenView,
  onOpenRecord,
  onCloseRecord,
  onCrumbTarget,
  crumbFromData = false,
  embed = false,
  inspectorPaneId,
  sheet = false,
  externalViews,
  onOpenRow,
  resolveViews,
}: {
  moduleId?: string
  collectionPath: string
  title: string
  blurb: string
  chrome?: CollectionChrome
  tables?: CollectionInfo[]
  onOpenTable?: (path: string, viewId?: string) => void
  lockedFilters?: Record<string, string>
  routeRecordId?: string | null
  routeViewId?: string
  expandedViewKey?: string | null
  onExpandedViewKeyChange?: (key: string | null) => void
  onOpenView?: (viewId: string) => void
  onOpenRecord?: (recordId: string, viewId?: string | null, collection?: string) => void
  onCloseRecord?: () => void
  onCrumbTarget?: (target: CrumbTarget) => void
  crumbFromData?: boolean
  /** 检查器内页：只有中间舞台，不写侧栏开关/视图存储。 */
  embed?: boolean
  inspectorPaneId?: string
  /** 嵌在详情里的收集表：用同一套表组件，但不写视图、不出现视图切换。 */
  sheet?: boolean
  /** 嵌入页内块时的外部持久化多视图（由宿主页面存储，不写 /views）。 */
  externalViews?: {
    views: SavedView[]
    activeViewId?: string
    onChange?: (views: SavedView[], activeViewId: string) => void
  }
  /** 返回 true 则自己处理这一行，不打开本表详情。 */
  onOpenRow?: (row: DbRecord) => boolean
  resolveViews?: (path: string, user: SavedView[]) => SavedView[]
}) {
  ensureFsdbStyle()
  const nested = embed || sheet
  const routeScope: DataScope | null = (() => {
    const builtin = routeViewId ? parseBuiltinScopeViewId(routeViewId) : null
    if (builtin) return builtin.scope
    if (routeViewId && isBuiltinAllViewId(routeViewId)) return null
    const stored = routeViewId ? loadViews(collectionPath).find((view) => view.id === routeViewId) : null
    if (!stored) return null
    const domain = viewDomainOf(stored)
    return domain === 'all' ? null : domain
  })()
  const listedViews = (path: string, user: SavedView[]) => {
    const skipIds = loadOmittedViewIds(path)
    const listed = resolveViews
      ? resolveViews(path, user)
      : mergeTableViews(
          tables.find((item) => item.path === path) ?? {
            path,
            label: path === collectionPath ? title : path.replace(/^\//, ''),
          },
          user,
          skipIds,
        )
    return listed
  }
  const paintListedViews = (path: string) => {
    const remembered = loadViews(path)
    return rankListedViews(
      listedViews(path, remembered).map((view) => withViewDisplay(path, view)),
      remembered,
    )
  }
  const dataPath = collectionPath
  const cachePath = collectionListCachePath(dataPath, sheet, lockedFilters)
  const tableEditHistory = useMemo(() => new TableEditHistory(), [cachePath])
  const tableEditHistoryRef = useRef(tableEditHistory)
  tableEditHistoryRef.current = tableEditHistory
  const peekBrowserCache: typeof peekListCache = (path, viewId, minLimit) =>
    peekListCache(collectionListCachePath(path, sheet, lockedFilters), viewId, minLimit)
  const [stat, setStat] = useState<StatResult | null>(() => peekBrowserCache(dataPath, routeViewId)?.stat ?? null)
  const [items, setItems] = useState<Array<DbRecord & { path?: string }>>(() => peekBrowserCache(dataPath, routeViewId)?.items ?? [])
  const [error, setError] = useState('')
  const {
    openDetailId,
    setOpenDetailId,
    detailRow,
    setDetailRow,
    originNav,
    setOriginNav,
    detailBody,
    setDetailBody,
    detailBodyStatus,
    setDetailBodyStatus,
    detailBodyError,
    setDetailBodyError,
    draft,
    setDraft,
    acting,
    setActing,
  } = useBrowserDetailState<OriginViewNav>(routeRecordId)
  const actingRef = useRef(false)
  const initialView = (() => {
    const stored = viewForPath(collectionPath, routeViewId)
    const listed = paintListedViews(collectionPath)
    return pickViewForRoute(listed, collectionPath, routeViewId) || stored || listed[0] || null
  })()
  const dbUi = getDatabaseUi()
  const extraViews = useSyncExternalStore(
    (fn) => (dbUi ? dbUi.subscribe(fn) : () => undefined),
    () => dbUi?.views(collectionPath) ?? EMPTY_VIEWS,
    () => dbUi?.views(collectionPath) ?? EMPTY_VIEWS,
  )
  const extraRows = useSyncExternalStore(
    (fn) => (dbUi ? dbUi.subscribe(fn) : () => undefined),
    () => dbUi?.rowViews(collectionPath) ?? EMPTY_ROW_VIEWS,
    () => dbUi?.rowViews(collectionPath) ?? EMPTY_ROW_VIEWS,
  )
  const [query, setQuery] = useState(initialView?.query ?? '')
  const [page, setPage] = useState(0)
  const [localData, setLocalData] = useState(() => cachedLocalData === true)
  const [localKnown, setLocalKnown] = useState(() => cachedLocalData != null)
  const [createScope, setCreateScope] = useState<'personal' | 'workspace' | 'shared' | 'local'>(
    routeScope === 'workspace' ? 'workspace' : routeScope === 'shared' ? 'shared' : 'personal',
  )
  const creatingGroupsRef = useRef(new Set<string>())
  const [creatingGroup, setCreatingGroup] = useState<string | null>(null)
  const [createTypePath, setCreateTypePath] = useState(PAGES_COLLECTION_PATH)
  useEffect(() => {
    let live = true
    void getWorkspaceProfile()
      .then((body) => {
        if (!live) return
        const device = body?.dataLocation === 'device' || body?.localData === true
        cachedLocalData = device
        setLocalKnown(true)
        setLocalData(device)
        if (device) setCreateScope((current) => (current === 'shared' ? 'shared' : 'personal'))
        else setCreateScope((current) => (current === 'local' ? 'personal' : current))
      })
      .catch(() => {
        if (live) setLocalKnown(true)
      })
    return () => {
      live = false
    }
  }, [])
  const [total, setTotal] = useState(() => peekBrowserCache(dataPath, routeViewId)?.total ?? 0)
  const hasExternalViews = Boolean(sheet && externalViews?.views?.length)
  const initialExternalViews = useMemo(
    () => (hasExternalViews ? externalViews!.views.map((view) => normalizeSavedView(view)) : undefined),
    // Seeded once on mount; CollectionBrowser owns live edits and writes back via externalViews.onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const initialSheetView = useMemo(() => {
    if (!initialExternalViews?.length) return undefined
    const wantId = String(externalViews?.activeViewId ?? '').trim()
    return initialExternalViews.find((view) => view.id === wantId) ?? initialExternalViews[0]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const externalViewsOnChangeRef = useRef(externalViews?.onChange)
  externalViewsOnChangeRef.current = externalViews?.onChange
  const {
    pageSize,
    setPageSize,
    fetchQuery,
    setFetchQuery,
    mode,
    setMode,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    sorts,
    setSorts,
    filters,
    setFilters,
    filterTree,
    setFilterTree,
    columnKeys,
    setColumnKeys,
    columnWidths,
    setColumnWidths,
    columnSummaries,
    setColumnSummaries,
    columnViews,
    setColumnViews,
    wrapCells,
    setWrapCells,
    truncateCells,
    setTruncateCells,
    showRowNumbers,
    setShowRowNumbers,
    freezeTitle,
    setFreezeTitle,
    freezeUntil,
    setFreezeUntil,
    groupBy,
    setGroupBy,
    groupConfig,
    setGroupConfig,
    showTree,
    setShowTree,
  } = useBrowserViewConfig(
    initialSheetView ??
      (sheet && dataPath === DATA_COLLECTION_PATH
        ? initialView
          ? { ...initialView, groupBy: 'table' }
          : ({ groupBy: 'table' } as SavedView)
        : initialView),
    initialSheetView
      ? initialSheetView.columns ?? []
      : sheet
        ? collectSheetColumns(loadTags().find((pack) => pack.id === String(lockedFilters.tag ?? lockedFilters.tagId ?? '').trim()))
        : initialView?.columns ?? [],
  )
  const customView = extraViews.find((view) => view.id === mode)
  const rowView = customView ? undefined : extraRows.find((view) => view.id === mode)
  const columnSummariesRef = useRef(columnSummaries)
  columnSummariesRef.current = columnSummaries
  const columnViewsRef = useRef(columnViews)
  columnViewsRef.current = columnViews
  const [colHeaderMenu, setColHeaderMenu] = useState<ColumnHeaderMenuTarget | null>(null)
  const [resizingCol, setResizingCol] = useState<string | null>(null)
  const [cellPop, setCellPop] = useState<(TableCellCursor & { seed?: string }) | null>(null)
  const [cellPickEpoch, setCellPickEpoch] = useState(0)
  const cellPickRef = useRef<TableCellCursor | null>(null)
  const cellRangeRef = useRef<{ anchor: TableCellCursor; focus: TableCellCursor } | null>(null)
  const cellRangeSetRef = useRef(new Set<string>())
  const actionHoverIndexRef = useRef(0)
  const cellRepickRef = useRef(false)
  const cellAnchorRef = useRef<HTMLElement | null>(null)
  const cellPopPtrRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null)
  const tableDragScrollStopRef = useRef<(() => void) | null>(null)
  const tableNavLiveRef = useRef<(event: KeyboardEvent) => void>(() => {})
  const tablePaneHotkeyLiveRef = useRef<(event: KeyboardEvent) => void>(() => {})
  const tablePaneFocusLiveRef = useRef<(event?: Event) => void>(() => {})
  const tableAutoLandLiveRef = useRef<() => void>(() => {})
  const tableAutoLandedRef = useRef('')
  const crumbBackLiveRef = useRef<(event: KeyboardEvent) => void>(() => {})
  const tableCellClaimLiveRef = useRef<(event: Event) => void>(() => {})
  const tablePaneFocusInLiveRef = useRef<(event: FocusEvent) => void>(() => {})
  const tablePasteLiveRef = useRef<(event: ClipboardEvent) => void>(() => {})
  useEffect(() => {
    const keysLive = () => inspectorPaneAcceptsKeys(embed, pageRef.current)
    const onTableNavKey = (event: KeyboardEvent) => {
      if (!keysLive()) return
      tableNavLiveRef.current(event)
    }
    const onTablePasteEvent = (event: ClipboardEvent) => {
      if (!keysLive()) return
      tablePasteLiveRef.current(event)
    }
    const onPaneHotkey = (event: KeyboardEvent) => {
      if (!keysLive()) return
      tablePaneHotkeyLiveRef.current(event)
    }
    const onCrumbBack = (event: KeyboardEvent) => {
      if (!keysLive()) return
      crumbBackLiveRef.current(event)
    }
    const onFocusTable = (event: Event) => tablePaneFocusLiveRef.current(event)
    const onCellClaim = (event: Event) => tableCellClaimLiveRef.current(event)
    const onFocusIn = (event: FocusEvent) => tablePaneFocusInLiveRef.current(event)
    window.addEventListener('keydown', onTableNavKey)
    window.addEventListener('paste', onTablePasteEvent)
    window.addEventListener('keydown', onPaneHotkey, true)
    window.addEventListener('keydown', onCrumbBack, true)
    window.addEventListener(FOCUS_SHELL_TABLE, onFocusTable)
    window.addEventListener(CLEAR_SHELL_TABLE_CELL, onCellClaim)
    window.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onTableNavKey)
      window.removeEventListener('paste', onTablePasteEvent)
      window.removeEventListener('keydown', onPaneHotkey, true)
      window.removeEventListener('keydown', onCrumbBack, true)
      window.removeEventListener(FOCUS_SHELL_TABLE, onFocusTable)
      window.removeEventListener(CLEAR_SHELL_TABLE_CELL, onCellClaim)
      window.removeEventListener('focusin', onFocusIn)
      tableDragScrollStopRef.current?.()
      tableDragScrollStopRef.current = null
    }
  }, [])
  useEffect(() => {
    if (sheet) return
    const pane = embed ? 'inspector' : 'main'
    if (!peekPendingTablePane(pane)) return
    tablePaneFocusLiveRef.current()
  })
  const [tagCatalog, setTagCatalog] = useState(() => loadTags())
  const tablePathsKey = tables
    .map((table) => table.path)
    .slice()
    .sort()
    .join('\n')
  const [views, setViews] = useState<SavedView[]>(() => initialExternalViews ?? paintListedViews(collectionPath))
  const [viewsSaveError, setViewsSaveError] = useState(false)
  const [activeViewId, setActiveViewId] = useState<string | null>(initialSheetView?.id ?? initialView?.id ?? null)
  const [routeViewReady, setRouteViewReady] = useState(() => !routeViewNeedsFetch(collectionPath, routeViewId))
  const routeViewReadyRef = useRef(routeViewReady)
  routeViewReadyRef.current = routeViewReady
  const catalogLocks = useMemo(() => {
    if (sheet) return lockedFilters
    return { ...catalogLockFilters(activeViewId, views), ...lockedFilters }
  }, [activeViewId, lockedFilters, sheet, views])
  const queryFilters = useMemo(
    () => encodeListFilter(catalogLocks, filterTree),
    [catalogLocks, filterTree],
  )
  const queryFiltersKey = JSON.stringify(queryFilters)
  const queryFiltersRef = useRef(queryFilters)
  queryFiltersRef.current = queryFilters
  const lockedFilterKeys = Object.keys(catalogLocks)
  const lockedSource = catalogLocks.tablePath ?? ''
  const lockedKind = String(catalogLocks.blockKind ?? '').trim()
  const sheetPackId = String(catalogLocks.tag ?? catalogLocks.tagId ?? '').trim()
  const sheetPack = useMemo(
    () => (sheet && sheetPackId ? tagCatalog.find((pack) => pack.id === sheetPackId) : undefined),
    [sheet, sheetPackId, tagCatalog],
  )
  const lockedKindLabel =
    views.find((view) => view.id === activeViewId)?.name ||
    stubBuiltinBlockKindView(activeViewId ?? '')?.name ||
    lockedKind
  useEffect(() => {
    if (!lockedSource) return
    setMode('table')
  }, [lockedSource])
  const detailId = openDetailId
  const setDetailId = (id: string | null, row?: DbRecord | null) => {
    if (id) setCellPop(null)
    setOpenDetailId(id)
    if (id && row) setDetailRow(row)
    if (!id) setDetailRow(null)
    queueMicrotask(() => {
      if (id) onOpenRecord?.(id, activeViewId, dataPath)
      else onCloseRecord?.()
    })
  }
  const openRow = (row: DbRecord) => {
    setCellPop(null)
    const jump = chrome?.openRow?.(row)
    if (jump && jump.kind === 'table') {
      onOpenTable?.(jump.path, jump.viewId)
      return
    }
    if (jump && jump.kind === 'record') {
      if (onOpenRecord) {
        onOpenRecord(jump.recordId, activeViewId, jump.collection)
        return
      }
    }
    if (onOpenRow?.(row)) return
    setDetailId(row.id, row)
  }
  const openRowSplit = (row: DbRecord) => {
    const jump = chrome?.openRow?.(row)
    const fromData = isDataOverview || crumbFromData
    if (fromData) setViaDataCrumbs(true, isDataOverview ? (activeViewId ?? undefined) : viaDataViewId())
    if (jump && jump.kind === 'record') {
      showRecordInInspector(jump.collection ?? collectionPath, jump.recordId, fromData ? undefined : activeViewId, nested ? { newTab: true } : undefined)
      return
    }
    if (jump && jump.kind === 'table') {
      onOpenTable?.(jump.path, jump.viewId)
      return
    }
    showRecordInInspector(collectionPath, row.id, fromData ? undefined : activeViewId, nested ? { newTab: true } : undefined)
  }
  const [hydrated, setHydrated] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(() => getSidebarPersist(SIDEBAR_PERSIST.viewsOpen(moduleId || collectionPath)) !== '0')
  const [sidebarGone, setSidebarGone] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(() => getSidebarPersist(SIDEBAR_PERSIST.inspectorOpen) === '1')
  const {
    toggleMenu,
    viewMenuOpen,
    setViewMenuOpen,
    modeMenuOpen,
    setModeMenuOpen,
    sortMenuOpen,
    setSortMenuOpen,
    columnMenuOpen,
    setColumnMenuOpen,
    filterOpen,
    setFilterOpen,
    configOpen,
    setConfigOpen,
    groupOpen,
    setGroupOpen,
    layoutOpen,
    setLayoutOpen,
    bulkMenuOpen,
    setBulkMenuOpen,
    createScopeOpen,
    setCreateScopeOpen,
    createTypeOpen,
    setCreateTypeOpen,
  } = useBrowserPopovers()
  const bulkRef = useRef<HTMLDivElement>(null)
  const {
    searchOpen,
    setSearchOpen,
    notice,
    setNotice,
    pickedIds,
    setPickedIds,
    pickMode,
    setPickMode,
    dlg,
    setDlg,
    bulkEditKey,
    setBulkEditKey,
    bulkEditRaw,
    setBulkEditRaw,
    bulkTagIds,
    setBulkTagIds,
    bulkMenuBox,
  } = useBrowserBulkUi(bulkMenuOpen, bulkRef)
  const applyViewDisplay = useViewDisplayApplier({
    setMode,
    setSortField,
    setSortDir,
    setSorts,
    setFilters,
    setFilterTree,
    setColumnKeys,
    setColumnWidths,
    setColumnSummaries,
    setColumnViews,
    setGroupBy,
    setGroupConfig,
    setShowTree,
    setWrapCells,
    setTruncateCells,
    setShowRowNumbers,
    setFreezeTitle,
    setFreezeUntil,
    setQuery,
    setFetchQuery,
    setPageSize,
  })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [treeKidsByParent, setTreeKidsByParent] = useState<Record<string, DbRecord[]>>({})
  const treeKidsByParentRef = useRef(treeKidsByParent)
  treeKidsByParentRef.current = treeKidsByParent
  const treeKidsInflight = useRef(new Set<string>())
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    loadCollapsedGroups(collectionPath, initialView?.id ?? routeViewId ?? '', initialView?.groupBy ?? ''),
  )
  const tableFoldFlipRef = useRef<Map<string, number> | null>(null)
  function captureTableFoldSnapshot() {
    tableFoldFlipRef.current = captureFoldSnapshot(tableRef.current?.tBodies[0]?.rows)
  }
  useLayoutEffect(() => {
    const prev = tableFoldFlipRef.current
    if (!prev) return
    tableFoldFlipRef.current = null
    playTableFoldFlip(tableRef.current?.tBodies[0]?.rows, prev)
  }, [collapsedGroups, collapsed])
  useEffect(() => {
    setCollapsedGroups(loadCollapsedGroups(collectionPath, activeViewId ?? routeViewId ?? '', groupBy))
  }, [activeViewId, collectionPath, groupBy, routeViewId])
  const [groupPages, setGroupPages] = useState<Record<string, number>>({})
  const [groupFillKeys, setGroupFillKeys] = useState<string[]>([])
  const [groupBuckets, setGroupBuckets] = useState<GroupBucket[]>(() => peekBrowserCache(dataPath, routeViewId)?.groupBuckets ?? [])
  const [paintedPath, setPaintedPath] = useState(dataPath)
  const tablePaintSnapshotRef = useRef<TableHoldSnap | null>(null)
  const tableHoldRef = useRef<TableHoldSnap | null>(null)
  const releaseHoldOnPaintRef = useRef(false)
  const [, setHoldNav] = useState(0)
  const collectionPathRef = useRef(collectionPath)
  collectionPathRef.current = collectionPath
  const dataPathRef = useRef(dataPath)
  dataPathRef.current = dataPath
  const pendingPathQueryRef = useRef<PendingPathQuery | null>(null)
  const adoptListCacheForViewRef = useRef<(path: string, view: SavedView | null | undefined) => void>(() => undefined)
  adoptListCacheForViewRef.current = (path, view) => {
    const cached = view ? peekBrowserCache(path, view.id, normalizePageSize(view.pageSize)) : undefined
    if (cached) {
      const snap = listHoldFromCache(cached, view ?? null, path)
      tableHoldRef.current = snap
      releaseHoldOnPaintRef.current = snap.nodes !== EMPTY_HOLD_NODES
      pendingPathQueryRef.current = null
      setItems(cached.items)
      setStat(cached.stat)
      setTotal(cached.total)
      setGroupBuckets(cached.groupBuckets ?? [])
      setGroupPages({})
      setGroupFillKeys([])
      setCollapsedGroups(loadCollapsedGroups(path, view?.id ?? '', view?.groupBy ?? ''))
      setPage(0)
      return
    }
    if (path === collectionPathRef.current) {
      tableHoldRef.current = null
      releaseHoldOnPaintRef.current = false
      return
    }
    tableHoldRef.current = tablePaintSnapshotRef.current ?? emptyListHold(tablePaintSnapshotRef.current, view ?? null, path)
    releaseHoldOnPaintRef.current = false
  }
  const holdNavRef = useRef<(path: string, viewId?: string) => void>(() => undefined)
  holdNavRef.current = (path, viewId) => {
    if (!path) return
    const sameCollection = path === collectionPathRef.current
    if (sameCollection && (!viewId || viewId === activeViewIdRef.current)) return
    const listed = paintListedViews(path)
    const view = pickViewForRoute(listed, path, viewId) || viewForPath(path, viewId)
    if (sameCollection) {
      adoptListCacheForViewRef.current(path, view)
      return
    }
    const cached = peekBrowserCache(path, view?.id, normalizePageSize(view?.pageSize))
    if (cached) {
      tableHoldRef.current = listHoldFromCache(cached, view, path)
      return
    }
    tableHoldRef.current = emptyListHold(tablePaintSnapshotRef.current, view, path)
  }
  const pathSwitchHandledRef = useRef(false)
  const layoutPathRef = useRef<string | null>(null)
  const prevSchemaDefaultSig = useRef('')
  if (paintedPath !== dataPath) {
    setPaintedPath(dataPath)
    pathSwitchHandledRef.current = true
    prevSchemaDefaultSig.current = ''
    const stored = viewForPath(collectionPath, routeViewId)
    const listed = paintListedViews(collectionPath)
    rememberViews(collectionPath, listed)
    const rawNext = stored || listed[0] ? pickViewForRoute(listed, collectionPath, routeViewId) || stored || listed[0] : null
    const next = sheet && dataPath === DATA_COLLECTION_PATH && rawNext ? { ...rawNext, groupBy: 'table' } : rawNext
    const cached = peekBrowserCache(dataPath, next?.id, normalizePageSize(next?.pageSize))
    const adoptView = (view: SavedView | null | undefined, schema?: CollectionSchema) => {
      if (!view) {
        setViews([])
        setActiveViewId(null)
        setQuery('')
        setFetchQuery('')
        setFilters({})
        setFilterTree(emptyFilterGroup())
        setSorts(normalizeSorts(undefined, 'title', 'asc'))
        return
      }
      setViews((prev) => (sameSavedViews(prev, listed) ? prev : listed))
      setActiveViewId(view.id)
      applyViewDisplay(
        view,
        sheet
          ? collectSheetColumns(sheetPack)
          : pinActionColumn(schema, view.columns, placedActions(schema, 'row').length > 0),
      )
    }
    if (cached) {
      const snap = listHoldFromCache(cached, next, dataPath)
      tableHoldRef.current = snap
      releaseHoldOnPaintRef.current = snap.nodes !== EMPTY_HOLD_NODES
      pendingPathQueryRef.current = null
      setItems(cached.items)
      setStat(cached.stat)
      setTotal(cached.total)
      setGroupBuckets(cached.groupBuckets ?? [])
      setGroupPages({})
      setGroupFillKeys([])
      setCollapsedGroups(loadCollapsedGroups(dataPath, next?.id ?? '', next?.groupBy ?? ''))
      setCollapsed({})
      setTreeKidsByParent({})
      treeKidsInflight.current = new Set()
      setError('')
      setPage(0)
      adoptView(next, cached.stat?.schema)
    } else {
      // 上一张表的 shareScope 组（私人/空间）不能顶到新表 URL 上，否则看起来像同一张表在重分组。
      // 成员表没有分享列：若 groupBy 还留着 shareScope，会走空组桶，主区只剩表头。
      setGroupBy(next?.groupBy ?? '')
      setGroupConfig(normalizeGroupConfig(next?.groupConfig))
      setGroupBuckets([])
      releaseHoldOnPaintRef.current = false
      tableHoldRef.current = emptyListHold(tablePaintSnapshotRef.current, next, dataPath)
      pendingPathQueryRef.current = next
        ? {
            listed,
            view: next,
            fetchQuery: next.query ?? '',
            sortField: next.sortField,
            sortDir: next.sortDir,
            sorts: normalizeSorts(next.sorts, next.sortField, next.sortDir),
            queryFilters: encodeListFilter(
              { ...catalogLockFilters(next.id, listed), ...lockedFilters },
              resolveViewFilterTree(next),
            ),
            groupBy: next.groupBy ?? '',
            pageSize: normalizePageSize(next.pageSize),
            wrapCells: !!next.wrap,
            tree: Boolean(next.tree),
            listColumns: listProjectionKeys({
              schema: undefined,
              columns: next.columns.length ? next.columns : LIST_SEED_COLUMNS,
              groupBy: next.groupBy ?? '',
            }),
            activeViewId: next.id,
          }
        : null
    }
  }
  const groupPagesRef = useRef(groupPages)
  groupPagesRef.current = groupPages
  const groupBucketsRef = useRef(groupBuckets)
  groupBucketsRef.current = groupBuckets
  const tagCatalogRef = useRef(tagCatalog)
  tagCatalogRef.current = tagCatalog
  const groupByRef = useRef(groupBy)
  groupByRef.current = groupBy
  const loadedIdentityRef = useRef('')
  const loadedColumnsRef = useRef<Set<string> | null | undefined>(undefined)
  const prevNonColumnReloadKeyRef = useRef('')
  const loadTreeKidsRef = useRef<(parentId: string, force?: boolean) => Promise<void>>(async () => {})
  const loadedPagesRef = useRef<Record<string, number>>({})
  const listColumns = useMemo(() => {
    if (customView) return undefined
    const currentSchema = stat?.schema
    const cellKeys = chrome?.cells ? Object.keys(chrome.cells) : []
    const fieldKeys = currentSchema
      ? Object.keys(currentSchema.fields).filter(
          (key) => isListColumn(key) && resolveFieldType(currentSchema.fields[key]!) !== 'file',
        )
      : []
    const tagKeys = flattenTagColumns(tagCatalog).map((item) => item.key)
    const allowed = new Set([...fieldKeys, ...tagKeys, ...cellKeys])
    const seedColumns = LIST_SEED_COLUMNS
    const requested = [
      ...(columnKeys.length ? columnKeys : currentSchema ? defaultColumnKeys(currentSchema, [...allowed]) : seedColumns),
      ...cellKeys,
    ]
    const visible = requested.filter(
      (key) =>
        !currentSchema ||
        allowed.has(key) ||
        Boolean(parseTagFlatColumnKey(key)) ||
        key === 'shareScope' ||
        key === 'shareRole' ||
        cellKeys.includes(key),
    )
    const columns = visible.length ? visible : [...(columnKeys.length ? columnKeys : ['title']), ...cellKeys]
    if (!columns.length) return undefined
    const queryKeys = [...collectQueryFields(sorts, filterTree, currentSchema?.labelField ?? 'title')]
    return listProjectionKeys({ schema: currentSchema, columns: [...columns, ...queryKeys], groupBy })
  }, [chrome, columnKeys, customView, tagCatalog, filterTree, groupBy, sheet, sheetPack, sorts, stat])
  const listColumnsKey = listColumns?.join('\0') ?? ''
  const [refreshing, setRefreshing] = useState(false)
  const noticeTimer = useRef<number>(0)
  const quietUntil = useRef(0)
  const reloadGen = useRef(0)
  const reloadInflightRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null)
  const listReadySent = useRef(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const confirmedCreates = useRef(new Set<string>())
  const hydratePath = useRef('')
  const viewsRef = useRef<SavedView[]>([])
  const skipPersistGen = useRef(0)
  const viewsWriteGenRef = useRef(0)
  const persistActiveViewRef = useRef<() => void>(() => {})
  const activeViewIdRef = useRef<string | null>(null)
  const routeViewIdRef = useRef<string | undefined>(routeViewId)
  routeViewIdRef.current = routeViewId
  const viewSyncRef = useRef<ViewSyncController | null>(null)
  if (!viewSyncRef.current) viewSyncRef.current = new ViewSyncController()
  const syncViewsRef = useRef<() => Promise<void>>(async () => {})
  const adoptViewRef = useRef<(view: SavedView) => void>(() => undefined)
  const hydratedDetail = useRef('')
  const crumbRef = useRef<HTMLElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const bindToolbar = useToolbarOverflow(toolbarRef)
  const toolbarRightRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const bulkMenuRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchExpanded = searchOpen || query.length > 0
  useStickyToolbar(toolbarRef)

  function toggleViewsOpen() {
    if (!nested) {
      window.dispatchEvent(new Event(TOGGLE_SHELL_SIDEBAR_EVENT))
      return
    }
    setViewsOpen((prev) => {
      const next = !prev
      setSidebarPersist(SIDEBAR_PERSIST.viewsOpen(moduleId || collectionPath), next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    if (nested) return
    function applyLayout(left: number, inspector: number) {
      setViewsOpen(left > 0)
      setSidebarGone(left <= 0)
      setInspectorOpen(inspector > 0)
    }
    function onLayout(event: Event) {
      const detail = (event as CustomEvent<{ left?: unknown; inspector?: unknown }>).detail
      const left = Number(detail?.left)
      const inspector = Number(detail?.inspector)
      if (!Number.isFinite(left) || !Number.isFinite(inspector)) return
      applyLayout(left, inspector)
    }
    function onWidth(event: Event) {
      const n = (event as CustomEvent<number>).detail
      if (typeof n !== 'number' || !Number.isFinite(n)) return
      setViewsOpen(n > 0)
      setSidebarGone(n <= 0)
    }
    function onOpen() {
      setInspectorOpen(true)
    }
    function onClose() {
      setInspectorOpen(false)
    }
    window.addEventListener(SHELL_LAYOUT_EVENT, onLayout)
    window.addEventListener(SHELL_SIDEBAR_WIDTH_EVENT, onWidth)
    window.addEventListener(INSPECTOR_OPEN_EVENT, onOpen)
    window.addEventListener(INSPECTOR_CLOSE_EVENT, onClose)
    const shell = document.querySelector('[data-testid="app-shell"]')
    if (shell instanceof HTMLElement) {
      const styles = getComputedStyle(shell)
      const left = Number.parseFloat(styles.getPropertyValue('--sidebar-col'))
      const inspector = Number.parseFloat(styles.getPropertyValue('--inspector-width'))
      if (Number.isFinite(left) && Number.isFinite(inspector)) applyLayout(left, inspector)
    }
    return () => {
      window.removeEventListener(SHELL_LAYOUT_EVENT, onLayout)
      window.removeEventListener(SHELL_SIDEBAR_WIDTH_EVENT, onWidth)
      window.removeEventListener(INSPECTOR_OPEN_EVENT, onOpen)
      window.removeEventListener(INSPECTOR_CLOSE_EVENT, onClose)
    }
  }, [nested])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus({ preventScroll: true })
  }, [searchOpen])

  useEffect(() => {
    if (!pickedIds.length) setBulkMenuOpen(false)
  }, [pickedIds.length, setBulkMenuOpen])

  const schemaRef = useRef(stat?.schema)
  schemaRef.current = stat?.schema
  const statHoldRef = useRef(stat)
  statHoldRef.current = stat
  const skipColumnReload = useRef(false)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const filterValueOptions = useCallback((item: { kind: FieldType; key: string; field: FieldSpec }) => {
    return filterFieldValueOptions(itemsRef.current, item.key, item.field, loadTags())
  }, [])
  const totalRef = useRef(total)
  totalRef.current = total
  const treeParentKey = parentFieldKey(stat?.schema)
  const listIdentityKey = `${dataPath}\0${pageSize}\0${fetchQuery}\0${sortField}\0${sortDir}\0${sortsStateKey(sorts)}\0${JSON.stringify(queryFilters)}\0${activeViewId ?? ''}\0${customView ? 'full' : 'proj'}\0${groupBy}\0tree:${showTree && treeParentKey && dataPath !== DATA_COLLECTION_PATH ? treeParentKey : ''}`
  const nonColumnReloadKey = `${listIdentityKey}\0${groupBy ? JSON.stringify(groupPages) : page}\0${groupFillKeys.join('\0')}`
  const reloadKey = `${nonColumnReloadKey}\0${listColumnsKey}`
  if (releaseHoldOnPaintRef.current && paintedPath === dataPath && tableHoldRef.current?.nodes !== EMPTY_HOLD_NODES) {
    releaseHoldOnPaintRef.current = false
    tableHoldRef.current = null
  }
  const reload = useCallback(async (opts?: { force?: boolean; reuseGroups?: boolean }) => {
    const waitingHold = Boolean(pendingPathQueryRef.current || tableHoldRef.current)
    if (!opts?.force && !waitingHold && !routeViewReadyRef.current) return true
    if (!opts?.force && Date.now() < quietUntil.current) return true
    const hit = reloadInflightRef.current
    if (!opts?.force && hit?.key === reloadKey) return hit.promise
    const gen = ++reloadGen.current
    const fetchPath = dataPath
    const staleFetch = () => gen !== reloadGen.current || dataPathRef.current !== fetchPath
    const promise = (async () => {
    const pending = pendingPathQueryRef.current
    const switching = Boolean(pending || tableHoldRef.current)
    const reqQuery = pending?.fetchQuery ?? fetchQuery
    const reqSortField = pending?.sortField ?? sortField
    const reqSortDir = pending?.sortDir ?? sortDir
    const reqSorts = pending?.sorts ?? sorts
    const reqFilters = pending?.queryFilters ?? queryFilters
    const reqGroupBy = pending?.groupBy ?? groupBy
    const reqPageSize = pageSize
    if (pending) pending.pageSize = reqPageSize
    const reqWrap = pending?.wrapCells ?? wrapCells
    const reqTree = (pending?.tree ?? showTree) && dataPath !== DATA_COLLECTION_PATH
    const reqColumns = pending?.listColumns ?? listColumns
    const reqViewId = pending?.activeViewId ?? activeViewId
    const listOpts = {
      path: dataPath,
      query: reqQuery,
      sortField: reqSortField,
      sortDir: reqSortDir,
      sorts: reqSorts,
      filters: reqFilters,
      columns: reqColumns,
      fresh: Boolean(opts?.force),
    }
    try {
      const heldStat = switching ? null : statHoldRef.current
      const nextStatPromise = heldStat?.schema
        ? Promise.resolve(heldStat)
        : readJson<StatResult>(`/api/db/stat?path=${encodeURIComponent(dataPath)}`, undefined, { fresh: Boolean(opts?.force) })
      let reqParentKey = parentFieldKey(schemaRef.current)
      if (reqTree && !reqParentKey) {
        reqParentKey = parentFieldKey((await nextStatPromise).schema)
      }
      const listPage = (input: {
        path: string
        limit: number
        offset?: number
        query?: string
        sortField?: string
        sortDir?: string
        sorts?: typeof reqSorts
        filters?: Record<string, unknown>
        columns?: string[]
      }) =>
        listTreeCollection({
          ...input,
          tree: reqTree && Boolean(reqParentKey),
          parentKey: reqParentKey,
          list: (next) => listCollection({ ...next, fresh: Boolean(opts?.force) }),
        })
      const extraGroupValues = (schema?: CollectionSchema) => {
        const group = groupField(schema, reqGroupBy, tagCatalog)
        if (!group || group.field.enum?.length) return []
        const kind = resolveFieldType(group.field)
        if (kind === 'datetime' || kind === 'number' || kind === 'boolean') return []
        const fromRows = switching ? [] : uniqueValues(itemsRef.current, group.key, group.field)
        if (group.key === 'table' || group.key === 'tablePath') {
          const fromTables = tables
            .map((table) =>
              group.key === 'tablePath'
                ? String(table.path ?? '').trim()
                : String(table.view?.title ?? table.label ?? table.path.replace(/^\//, '')).trim(),
            )
            .filter(Boolean)
          return [...new Set([...fromTables, ...fromRows])]
        }
        if (kind === 'tag' && !parseTagFlatColumnKey(group.key)) {
          const fromCatalog = tagCatalog.map((pack) => String(pack.id ?? '').trim()).filter(Boolean)
          return [...new Set([...fromCatalog, ...fromRows])]
        }
        if (switching) return []
        return fromRows
      }
      const loadGroups = (schema?: CollectionSchema) =>
        listGroupedCollection({
          ...listOpts,
          groupBy: reqGroupBy,
          groupValues: () => listAttributeGroups({
            ...listOpts, groupBy: reqGroupBy,
            filters: reqTree && reqParentKey
              ? mergeListFilters(reqFilters, treeRootFilter(reqParentKey)) ?? reqFilters
              : reqFilters,
          }),
          schema,
          packs: tagCatalog,
          extraValues: extraGroupValues(schema),
          pageSize: reqPageSize,
          groupPages: switching || opts?.force ? {} : groupPagesRef.current,
          wrap: reqWrap,
          fillKeys: switching || opts?.force ? [] : groupFillKeys,
          reuseUnchanged: Boolean(opts?.reuseGroups && !opts?.force && !switching && loadedIdentityRef.current === listIdentityKey),
          previous:
            !opts?.force && !switching && loadedIdentityRef.current === listIdentityKey
              ? groupBucketsRef.current
              : undefined,
          previousPages: switching || opts?.force ? {} : loadedPagesRef.current,
          list: (input) =>
            listTreeCollection({
              ...input,
              tree: reqTree && Boolean(reqParentKey),
              parentKey: reqParentKey,
              list: (next) => listCollection({ ...next, fresh: Boolean(opts?.force) }),
            }),
        })
      let nextStat: StatResult
      let listed: { items: Array<DbRecord & { path?: string }>; total: number; schema?: CollectionSchema }
      let buckets: GroupBucket[] = []
      const loadUngrouped = () => listPage({ ...listOpts, limit: reqPageSize, offset: switching ? 0 : page * reqPageSize })
      if (reqGroupBy) {
        const cachedSchema = switching ? undefined : schemaRef.current
        const cachedKeys = groupListKeys(cachedSchema, reqGroupBy, extraGroupValues(cachedSchema), tagCatalog)
        if (cachedKeys.length) {
          const [statResult, grouped] = await Promise.all([nextStatPromise, loadGroups(cachedSchema)])
          nextStat = statResult
          if (staleFetch()) return true
          if (grouped) {
            listed = grouped
            buckets = grouped.buckets
          } else {
            listed = await loadUngrouped()
          }
        } else {
          nextStat = await nextStatPromise
          if (staleFetch()) return true
          const grouped = await loadGroups(nextStat.schema)
          if (staleFetch()) return true
          if (grouped) {
            listed = grouped
            buckets = grouped.buckets
          } else {
            listed = await loadUngrouped()
          }
        }
      } else {
        const [statResult, ungrouped] = await Promise.all([nextStatPromise, loadUngrouped()])
        nextStat = statResult
        listed = ungrouped
      }
      if (staleFetch()) return true
      const nextSchema = listed.schema ?? nextStat.schema
      const pendingView = pendingPathQueryRef.current
      pendingPathQueryRef.current = null
      tableHoldRef.current = null
      if (pendingView) {
        skipColumnReload.current = true
        const view = pendingView.view
        setViews((prev) => (sameSavedViews(prev, pendingView.listed) ? prev : pendingView.listed))
        setActiveViewId(view.id)
        applyViewDisplay(
          view,
          sheet
            ? collectSheetColumns(sheetPack)
            : pinActionColumn(nextSchema, view.columns, placedActions(nextSchema, 'row').length > 0),
          {
            sorts: pendingView.sorts,
            groupBy: pendingView.groupBy,
            wrapCells: pendingView.wrapCells,
            query: pendingView.fetchQuery,
            pageSize: pendingView.pageSize,
          },
        )
        setPage(0)
        setGroupPages({})
        setGroupFillKeys([])
        setCollapsed({})
        setTreeKidsByParent({})
        treeKidsInflight.current = new Set()
        setCollapsedGroups(loadCollapsedGroups(dataPath, pendingView.activeViewId, pendingView.groupBy))
      }
      setStat((prev) =>
        prev?.schema && schemaFingerprint(prev.schema) === schemaFingerprint(nextSchema) ? prev : { ...nextStat, schema: nextSchema },
      )
      const listedIds = new Set(listed.items.map((row) => String(row.id)))
      const keptCreates = itemsRef.current.filter(
        (item) => confirmedCreates.current.has(String(item.id)) && !listedIds.has(String(item.id)),
      )
      let nextBuckets = buckets
      if (reqGroupBy && keptCreates.length) {
        const parentField = parentFieldKey(nextSchema)
        for (const row of keptCreates) {
          const parentId = parentField ? String(row[parentField] ?? '').trim() : ''
          nextBuckets = placeCreatedRow(nextBuckets, row, reqGroupBy, nextSchema, tagCatalog, parentId)
        }
      }
      setGroupBuckets((prev) => (sameGroupBuckets(prev, nextBuckets) ? prev : nextBuckets))
      setItems((prev) => {
        if (pendingView) {
          confirmedCreates.current = new Set()
          setTotal(listed.total)
          return listed.items
        }
        const kept = prev.filter((item) => confirmedCreates.current.has(String(item.id)) && !listed.items.some((row) => row.id === item.id))
        for (const row of listed.items) confirmedCreates.current.delete(String(row.id))
        const next = kept.length ? [...kept, ...listed.items] : listed.items
        setTotal(listed.total + kept.length)
        return recordsFingerprint(prev) === recordsFingerprint(next) ? prev : next
      })
      const openId = detailIdRef.current
      if (openId) {
        const hit = listed.items.find((item) => item.id === openId)
        if (hit) setDetailRow((prev) => (prev?.id === openId ? applyPendingDetailPatches(overlayListed(prev, hit, listColumns)) : prev))
      }
      rememberListCache(
        cachePath,
        {
          items: listed.items,
          total: listed.total,
          stat: { ...nextStat, schema: nextSchema },
          groupBuckets: buckets,
          listLimit: reqPageSize,
        },
        reqViewId,
      )
      if (reqViewId) rememberPreviewTotalForView(collectionPath, reqViewId, listed.total)
      setError('')
      loadedIdentityRef.current = pendingView
        ? `${dataPath}\0${reqPageSize}\0${pendingView.fetchQuery}\0${pendingView.sortField}\0${pendingView.sortDir}\0${sortsStateKey(pendingView.sorts)}\0${JSON.stringify(pendingView.queryFilters)}\0${pendingView.activeViewId}\0${customView ? 'full' : 'proj'}\0${pendingView.groupBy}`
        : listIdentityKey
      loadedColumnsRef.current = reqColumns ? new Set(reqColumns) : null
      loadedPagesRef.current = { ...groupPagesRef.current }
      if (!listReadySent.current) listReadySent.current = true
      return true
    } catch (err) {
      if (staleFetch()) return false
      pendingPathQueryRef.current = null
      tableHoldRef.current = null
      setError(String(err))
      if (!listReadySent.current) listReadySent.current = true
      return false
    }
    })()
    reloadInflightRef.current = { key: reloadKey, promise }
    try {
      return await promise
    } finally {
      if (reloadInflightRef.current?.promise === promise) reloadInflightRef.current = null
      if ((pendingPathQueryRef.current || tableHoldRef.current) && !reloadInflightRef.current) {
        void reloadRef.current({ force: true })
      }
    }
  }, [activeViewId, cachePath, collectionPath, customView, dataPath, tagCatalog, fetchQuery, groupBy, groupFillKeys, listColumns, listIdentityKey, queryFilters, page, pageSize, reloadKey, sortDir, sortField, sorts, wrapCells, showTree])
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  const detailIdRef = useRef<string | null>(null)
  detailIdRef.current = detailId
  const detailRowRef = useRef(detailRow)
  detailRowRef.current = detailRow
  const pendingFieldTrackerRef = useRef<PendingFieldPatchTracker | null>(null)
  if (!pendingFieldTrackerRef.current) pendingFieldTrackerRef.current = new PendingFieldPatchTracker()
  const applyPendingDetailPatches = useCallback(
    (row: DbRecord): DbRecord => pendingFieldTrackerRef.current!.overlay(row, overlayListedRow),
    [],
  )
  const contentGen = useRef(0)
  const contentVersions = useRef(new Map<string, number>())
  const contentWriteQueueRef = useRef<KeyedSerialQueue | null>(null)
  if (!contentWriteQueueRef.current) contentWriteQueueRef.current = new KeyedSerialQueue()
  const fieldWriteQueueRef = useRef<KeyedSerialQueue | null>(null)
  if (!fieldWriteQueueRef.current) fieldWriteQueueRef.current = new KeyedSerialQueue()
  const recordGen = useRef(0)
  const sourceRecordPath = (row?: DbRecord | null, id = '') => {
    const table = String(row?.tablePath ?? '').trim()
    const source = String(row?.sourceId ?? '').trim()
    if (dataPath === DATA_COLLECTION_PATH && table && source) return `${table}/${source}`
    return `${dataPath}/${id || row?.id || ''}`
  }

  const sourceDeleteTarget = (row?: DbRecord | null) => {
    const table = String(row?.tablePath ?? '').trim()
    const source = String(row?.sourceId ?? '').trim()
    if (dataPath === DATA_COLLECTION_PATH && table && source) return { path: table, id: source }
    return { path: dataPath, id: String(row?.id ?? '') }
  }

  const pullDetailBody = useCallback(() => {
    const id = detailIdRef.current
    if (!id) {
      setDetailBody(null)
      setDetailBodyStatus('ready')
      setDetailBodyError('')
      return
    }
    const path = sourceRecordPath(detailRowRef.current, id)
    const gen = ++contentGen.current
    void readJson<{ value?: unknown; version?: number }>(`/api/db/content?path=${encodeURIComponent(path)}`, undefined, { fresh: true })
      .then((data) => {
        if (gen !== contentGen.current || contentWriteQueueRef.current!.hasPending(path)) return
        if (Number.isInteger(data.version)) contentVersions.current.set(path, data.version!)
        else contentVersions.current.delete(path)
        setDetailBody(data.value ?? null)
        setDetailBodyStatus('ready')
        setDetailBodyError('')
      })
      .catch((error) => {
        if (gen !== contentGen.current) return
        setDetailBody(null)
        setDetailBodyStatus('failed')
        setDetailBodyError(error instanceof Error ? error.message : '正文加载失败')
      })
  }, [dataPath])
  const pullDetailRecord = useCallback(() => {
    const id = detailIdRef.current
    if (!id) return
    const gen = ++recordGen.current
    void readJson<{ value?: DbRecord }>(`/api/db/read?path=${encodeURIComponent(`${dataPath}/${id}`)}`, undefined, { fresh: true })
      .then((data) => {
        const row = data.value
        if (gen !== recordGen.current || !row?.id) return
        setDetailRow((prev) => {
          if (prev?.id && prev.id !== row.id) return prev
          return applyPendingDetailPatches({ ...prev, ...row, banner: row.banner ?? null })
        })
        mapListedRecords((item) => (item.id === row.id ? overlayListedRow(item, row) : item))
        patchListCacheRecords(dataPath, (item) => (item.id === row.id ? overlayListedRow(item, row) : item))
      })
      .catch((error) => {
        console.warn('[fsdb] pullDetailRecord failed', dataPath, error)
      })
  }, [dataPath])
  const refreshOpenDetail = useCallback(() => {
    invalidateListReads()
    void pullTags()
    pullDetailBody()
    pullDetailRecord()
    const id = detailIdRef.current
    if (id) {
      window.dispatchEvent(
        new CustomEvent(FSDB_DETAIL_REFRESH_EVENT, { detail: { path: dataPath, id } }),
      )
    }
  }, [dataPath, pullDetailBody, pullDetailRecord])
  const steppingView = useRef(false)

  useEffect(() => {
    const id = window.setTimeout(() => {
      setFetchQuery((prev) => (prev === query ? prev : query))
    }, 280)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    setPage((prev) => (prev === 0 ? prev : 0))
    setGroupPages((prev) => (Object.keys(prev).length ? {} : prev))
    setGroupFillKeys((prev) => (prev.length ? [] : prev))
  }, [fetchQuery, queryFiltersKey, sortField, sortDir, pageSize, groupBy, collectionPath, dataPath, showTree])

  async function refreshNow() {
    if (refreshing) return
    setRefreshing(true)
    const started = Date.now()
    const ok = await reloadRef.current({ force: true })
    const wait = Math.max(0, 480 - (Date.now() - started))
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
    setRefreshing(false)
    if (!ok) return
    setNotice('刷新成功')
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 1800)
  }

  useLayoutEffect(() => {
    const pathChanged = layoutPathRef.current !== dataPath
    layoutPathRef.current = dataPath
    const pathHandled = pathSwitchHandledRef.current
    pathSwitchHandledRef.current = false
    skipColumnReload.current = false
    const adoptRoutedView = () => {
      const stored = viewForPath(collectionPath, routeViewId)
      const listed = paintListedViews(collectionPath)
      rememberViews(collectionPath, listed)
      if (stored || listed[0]) {
        const next = pickViewForRoute(listed, collectionPath, routeViewId) || stored || listed[0]
        setViews((prev) => (sameSavedViews(prev, listed) ? prev : listed))
        if (next) applyView(next)
        return
      }
      setViews([])
      setActiveViewId(null)
      setQuery('')
      setFilters({})
      setFilterTree(emptyFilterGroup())
      setSorts(normalizeSorts(undefined, 'title', 'asc'))
    }
    if (!pathChanged && !pathHandled) {
      if (viewSyncRef.current!.shouldSkipRouteAdopt(collectionPath, routeViewId, false)) return
      adoptRoutedView()
      return
    }
    viewSyncRef.current!.clear()
    hydratePath.current = ''
    loadedIdentityRef.current = ''
    loadedColumnsRef.current = undefined
    prevNonColumnReloadKeyRef.current = ''
    loadedPagesRef.current = {}
    hydratedDetail.current = ''
    confirmedCreates.current = new Set()
    const pendingRouteView = routeViewNeedsFetch(collectionPath, routeViewId)
    routeViewReadyRef.current = !pendingRouteView
    reloadGen.current += 1
    setRouteViewReady((prev) => (prev === !pendingRouteView ? prev : !pendingRouteView))
    const holding = Boolean(tableHoldRef.current)
    const holdingRows = holding && tableHoldRef.current?.nodes !== EMPTY_HOLD_NODES
    const destCached = peekBrowserCache(dataPath, routeViewId, pageSize)
    if (!holdingRows && !destCached) {
      listReadySent.current = false
      pageRef.current?.removeAttribute('data-list-ready')
      resetPaintedListReady()
      setHydrated((prev) => (prev ? false : prev))
    }
    if (pathHandled) return
    setCollapsed((prev) => (Object.keys(prev).length ? {} : prev))
    setTreeKidsByParent((prev) => (Object.keys(prev).length ? {} : prev))
    treeKidsInflight.current = new Set()
    const cached = peekBrowserCache(dataPath, routeViewId, pageSize)
    setItems(cached?.items ?? [])
    setStat(cached?.stat ?? null)
    setTotal(cached?.total ?? 0)
    setGroupBuckets(cached?.groupBuckets ?? [])
    setGroupPages((prev) => (Object.keys(prev).length ? {} : prev))
    setGroupFillKeys((prev) => (prev.length ? [] : prev))
    setCollapsedGroups(loadCollapsedGroups(collectionPath, routeViewId ?? activeViewId ?? '', groupBy))
    setError('')
    setPage((prev) => (prev === 0 ? prev : 0))
    if (hasExternalViews) return
    const stored = viewForPath(collectionPath, routeViewId)
    const listed = paintListedViews(collectionPath)
    rememberViews(collectionPath, listed)
    if (stored || listed[0]) {
      const next = pickViewForRoute(listed, collectionPath, routeViewId) || stored || listed[0]
      setViews((prev) => (sameSavedViews(prev, listed) ? prev : listed))
      if (next) {
        setActiveViewId(next.id)
        applyViewDisplay(
          next,
          sheet
            ? collectSheetColumns(sheetPack)
            : pinActionColumn(
                cached?.stat?.schema,
                next.columns,
                placedActions(cached?.stat?.schema, 'row').length > 0,
              ),
        )
      }
    } else {
      setViews([])
      setActiveViewId(null)
      setQuery('')
      setFilters({})
      setFilterTree(emptyFilterGroup())
      setSorts(normalizeSorts(undefined, 'title', 'asc'))
    }
  }, [collectionPath, dataPath, routeViewId, tablePathsKey])

  useLayoutEffect(() => {
    if (!listReadySent.current) return
    const page = pageRef.current
    if (!page || page.getAttribute('data-list-ready') === '1') return
    page.setAttribute('data-list-ready', '1')
    markPaintedListReady()
    window.dispatchEvent(new Event(FSDB_LIST_READY_EVENT))
  })

  useEffect(() => {
    let debounce = 0
    let pendingViews = false
    let pendingTags = false
    let pendingData = false
    const onChange = (event: Event) => {
      const change = parseFsdbChange(event)
      if (change.scope === 'content') {
        const path = String(change.path ?? '')
        const id = detailIdRef.current
        if (id && path.endsWith(`/${id}`)) pullDetailBody()
        return
      }
      if (change.scope === 'records' && !fsdbRecordChangeReloadsList(change, dataPathRef.current)) return
      if (change.scope === 'views') pendingViews = true
      else if (change.scope === 'tags') pendingTags = true
      else pendingData = true
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => {
        const viewsTouched = pendingViews
        const tagsTouched = pendingTags
        const dataTouched = pendingData
        pendingViews = false
        pendingTags = false
        pendingData = false
        if (dataTouched) {
          void pullTags()
          // 页面记录打开时不要把整张表（私人/空间/共享三包）再拉一遍。
          // 装全部页面插件会连续 bump /plugins，每个 change 都 force list 会把 Chrome 打到 ERR_INSUFFICIENT_RESOURCES。
          if (detailIdRef.current) {
            refreshOpenDetail()
          } else if (Date.now() < quietUntil.current) {
            // 刚创建的子行还在本地树里；立刻 force 顶层列表会把子节点从分组里冲掉。
          } else {
            void reloadRef.current({ force: true })
          }
        } else if (tagsTouched) {
          void pullTags()
        }
        if (viewsTouched) void syncViewsRef.current()
      }, 120)
    }
    window.addEventListener(FSDB_CHANGE_EVENT, onChange)
    window.addEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
    return () => {
      window.clearTimeout(debounce)
      window.removeEventListener(FSDB_CHANGE_EVENT, onChange)
      window.removeEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
    }
  }, [collectionPath, dataPath, nested, pullDetailBody, pullDetailRecord, refreshOpenDetail])

  useEffect(() => {
    if (routeRecordId) return
    void pullTags()
  }, [collectionPath, routeRecordId])

  useEffect(() => {
    if (nested) return
    return subscribeHistoryNavigation((url) => {
      const next = collectionFromAppUrl(url != null ? String(url) : window.location.pathname)
      if (!next) return
      const before = tableHoldRef.current
      holdNavRef.current(next.collection, next.viewId)
      if (tableHoldRef.current !== before) setHoldNav((n) => n + 1)
    })
  }, [nested])

  useEffect(() => subscribeTags(undefined, () => setTagCatalog(loadTags())), [])

  useEffect(() => {
    const onMode = (event: Event) => {
      setPickMode(Boolean((event as CustomEvent<{ picking?: boolean }>).detail?.picking))
    }
    window.addEventListener(PICK_MODE_EVENT, onMode)
    return () => window.removeEventListener(PICK_MODE_EVENT, onMode)
  }, [])

  useEffect(() => {
    if (!routeRecordId || statHoldRef.current?.schema) return
    let cancelled = false
    void readJson<StatResult>(`/api/db/stat?path=${encodeURIComponent(dataPath)}`).then((nextStat) => {
      if (cancelled || !nextStat?.schema) return
      setStat((prev) => (prev?.schema ? prev : nextStat))
    }).catch((error) => {
      if (!cancelled) console.warn('[fsdb] stat prefetch failed', dataPath, error)
    })
    return () => {
      cancelled = true
    }
  }, [dataPath, routeRecordId])

  useEffect(() => {
    if (routeRecordId) void import('./record-detail.tsx')
  }, [routeRecordId])

  useEffect(() => {
    const missingColumns = hasMissingProjectedColumns(loadedColumnsRef.current, listColumns)
    const needsLoad =
      loadedIdentityRef.current !== listIdentityKey ||
      missingColumns ||
      Boolean(tableHoldRef.current) ||
      Boolean(pendingPathQueryRef.current) ||
      !listReadySent.current
    if (skipColumnReload.current) {
      skipColumnReload.current = false
      if (!needsLoad) return
    }
    if (!needsLoad && prevNonColumnReloadKeyRef.current === nonColumnReloadKey) return
    if (routeRecordId) return
    if (!routeViewReadyRef.current && !pendingPathQueryRef.current && !tableHoldRef.current) return
    prevNonColumnReloadKeyRef.current = nonColumnReloadKey
    void reloadRef.current({ force: needsLoad, reuseGroups: !needsLoad })
    if (missingColumns && showTree && treeParentKey && dataPath !== DATA_COLLECTION_PATH) {
      for (const parentId of Object.keys(treeKidsByParentRef.current)) {
        void loadTreeKidsRef.current(parentId, true)
      }
    }
  }, [dataPath, listColumns, listColumnsKey, listIdentityKey, nonColumnReloadKey, routeRecordId, routeViewReady, showTree, treeParentKey])

  useLayoutEffect(() => {
    setOpenDetailId(routeRecordId)
    if (!routeRecordId) {
      setDetailRow(null)
      setError('')
    }
  }, [routeRecordId])

  useEffect(() => {
    if (!detailId) {
      setDetailRow(null)
      return
    }
    let cancelled = false
    void readJson<{ value?: DbRecord }>(`/api/db/read?path=${encodeURIComponent(`${dataPath}/${detailId}`)}`)
      .then((data) => {
        const row = data.value
        if (cancelled || !row?.id) return
        setDetailRow(applyPendingDetailPatches(row))
      })
      .catch((error) => {
        if (cancelled || !(error instanceof HttpError) || error.status !== 404) return
        if (itemsRef.current.some((item) => item.id === detailId)) return
        setOpenDetailId(null)
        setDetailRow(null)
        queueMicrotask(() => onCloseRecord?.())
      })
    return () => {
      cancelled = true
    }
  }, [collectionPath, dataPath, detailId, reloadKey])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const schema = stat?.schema
  const isDataOverview = dataPath === DATA_COLLECTION_PATH
  const subsetLocked = lockedFilterKeys.length > 0 && !(sheet && isDataOverview)
  const overviewCreateTables = useMemo(
    () => tables.filter((table) => isOverviewCreatableCollection(table)),
    [tables],
  )
  const canCreate =
    (isDataOverview ? overviewCreateTables.length > 0 : Boolean(schema?.records?.create)) && !subsetLocked
  const canAskNewPlugin = collectionPath === PLUGINS_COLLECTION_PATH && !subsetLocked
  const createTypeTable =
    overviewCreateTables.find((table) => table.path === createTypePath) ??
    overviewCreateTables.find((table) => table.path === PAGES_COLLECTION_PATH) ??
    overviewCreateTables[0]
  const canDelete = (Boolean(schema?.records?.delete) || isDataOverview) && !subsetLocked
  const inTrash = collectionPath === TRASH_COLLECTION_PATH
  const canBulkDelete = (canDelete || inTrash) && !subsetLocked
  const canTag = Boolean(schema?.fields.tag?.writable) && !subsetLocked
  const bulkFields = useMemo(
    () =>
      fieldEntries(schema).filter(({ key, field }) => {
        if (!field.writable || field.computed) return false
        if (key === 'id' || key === 'createdAt' || key === 'updatedAt' || key === 'createdBy' || key === 'updatedBy') return false
        const kind = resolveFieldType(field)
        return kind !== 'file' && kind !== 'action' && kind !== 'image' && kind !== 'attachment' && kind !== 'tag'
      }),
    [schema],
  )
  useEffect(() => {
    setPickedIds([])
  }, [collectionPath])
  const bodyKey = contentFieldKey(schema)
  const entries = useMemo(() => fieldEntries(schema), [schema])
  const rowActionColumn = placedActions(schema, 'row').length > 0
  const allColumns = useMemo(
    () => [
      ...entries.filter((item) => isListColumn(item.key) && item.key !== bodyKey && resolveFieldType(item.field) !== 'file'),
      ...(rowActionColumn
        ? [{ key: 'actions', kind: 'action' as const, field: { type: 'action' as const, label: '动作' } }]
        : []),
      ...flattenTagColumns(tagCatalog),
    ],
    [bodyKey, entries, tagCatalog, rowActionColumn],
  )
  const allColumnKeys = useMemo(() => allColumns.map((item) => item.key), [allColumns])
  const schemaDefaultKeys = useMemo(
    () => pinActionColumn(schema, defaultColumnKeys(schema, allColumnKeys.filter((key) => key !== 'actions')), rowActionColumn),
    [allColumnKeys, rowActionColumn, schema],
  )
  const schemaDefaultSig = schemaDefaultKeys.join('\0')
  const columns = useMemo(() => {
    const requested = columnKeys.length
      ? columnKeys
      : sheet && !hasExternalViews
        ? collectSheetColumns(sheetPack)
        : schemaDefaultKeys
    const order = pinActionColumn(
      schema,
      requested.filter((key) => retainSavedColumn(key, schema, allColumnKeys)),
      rowActionColumn,
    )
    return order
      .map((key) => {
        const hit = allColumns.find((item) => item.key === key)
        if (hit) return hit
        if (key === 'actions') return { key, kind: 'action' as const, field: { type: 'action' as const, label: '动作' } }
        if (key === 'shareScope') return { key, kind: 'select' as const, field: { type: 'select' as const, label: '分享' } }
        if (key === 'shareRole') return { key, kind: 'select' as const, field: { type: 'select' as const, label: '权限' } }
        if (key === 'ownerTable') return { key, kind: 'select' as const, field: { type: 'select' as const, label: '归属' } }
        const tag = parseTagFlatColumnKey(key)
        if (tag) {
          const pack = tagCatalog.find((entry) => entry.id === tag.packId)
          return { key, kind: 'select' as const, field: { type: 'select' as const, label: tag.fieldKey }, packId: tag.packId, packLabel: pack?.label }
        }
        return null
      })
      .filter(Boolean) as typeof allColumns
  }, [allColumnKeys, allColumns, columnKeys, rowActionColumn, schema, schemaDefaultKeys, sheet, sheetPack, tagCatalog])
  const tableColumns = useMemo(
    () =>
      showRowNumbers
        ? ([{ key: '__rowNumber', kind: 'number' as const, field: { type: 'number' as const, label: '#' } }, ...columns] as typeof columns)
        : columns,
    [columns, showRowNumbers],
  )

  const colWindowRef = useRef<TableColumnSlice>(EMPTY_COL_WINDOW)
  const tableChromeRef = useRef<TableChromeBag>({
    paintHeadTh: () => null,
    onPointerDown: undefined,
    onPointerMove: undefined,
    onClick: () => undefined,
    onKeyDown: undefined,
    onMouseOver: undefined,
  })

  function startColResize(event: ReactPointerEvent<HTMLSpanElement>, colKey: string) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    const sourceTable = handle.closest('table')
    const mainTable = tableRef.current ?? sourceTable
    if (!mainTable) return
    const heads = Array.from((sourceTable ?? mainTable).querySelectorAll<HTMLElement>('thead th[data-col-key]:not(.fsdb-rownum-th)'))
    const startX = event.clientX
    const snapshot: Record<string, number> = {}
    for (const th of heads) {
      const key = th.dataset.colKey
      if (!key || key === '__rowNumber') continue
      snapshot[key] = Math.round(th.getBoundingClientRect().width || 120)
    }
    for (const col of columns) {
      if (snapshot[col.key] == null) snapshot[col.key] = tableColumnWidth(col.key, columnWidths[col.key], col.key === schema?.labelField)
    }
    startTableColumnResize({
      handle,
      table: mainTable,
      pinnedTable: sourceTable && sourceTable !== mainTable ? sourceTable : null,
      colKey,
      startX,
      pointerId: event.pointerId,
      snapshot,
      isPinnedFirst: colKey === schema?.labelField,
      minWidth: COL_WIDTH_MIN,
      maxWidth: COL_WIDTH_MAX,
      onStart: () => setResizingCol(colKey),
      onCommit: (nextWidths) => {
        setColumnWidths(nextWidths)
        setResizingCol(null)
      },
    })
  }
  const groupFields = useMemo(() => groupableFields(schema, tagCatalog), [tagCatalog, schema])
  const activeGroup = groupField(schema, groupBy, tagCatalog)
  const grouping = Boolean(activeGroup)
  const filterFields = useMemo(
    () =>
      [
        ...entries,
        ...flattenTagColumns(tagCatalog).map((item) => ({
          key: item.key,
          kind: item.kind,
          field: { ...item.field, label: tagColumnTitle(item) },
        })),
      ].filter(
        (item) =>
          item.key !== bodyKey &&
          resolveFieldType(item.field) !== 'file' &&
          item.key !== 'shareScope' &&
          !lockedFilterKeys.includes(item.key),
      ),
    [bodyKey, entries, tagCatalog, lockedFilterKeys],
  )
  const sortFields = useMemo(
    () => filterFields.filter((item) => item.field.sortable !== false),
    [filterFields],
  )

  useEffect(() => {
    if (!sheet || hasExternalViews) return
    const defaults = pinActionColumn(schema, collectSheetColumns(sheetPack), rowActionColumn)
    setColumnKeys((prev) => {
      const packKeys = defaults.filter((key) => key !== 'title' && key !== 'actions' && key !== 'table')
      const base = prev.length ? prev : defaults
      const added = packKeys.filter((key) => !base.includes(key))
      const next = pinActionColumn(schema, [...base, ...added], rowActionColumn)
      if (next.length === prev.length && next.every((key, index) => key === prev[index])) return prev
      return next
    })
  }, [hasExternalViews, rowActionColumn, schema, sheet, sheetPack])
  useEffect(() => {
    if (sheet && !hasExternalViews) return
    if (!schemaDefaultKeys.length) return
    const prevDefaults = prevSchemaDefaultSig.current ? prevSchemaDefaultSig.current.split('\0').filter(Boolean) : []
    prevSchemaDefaultSig.current = schemaDefaultSig
    const saved = viewsRef.current.find((view) => view.id === activeViewIdRef.current)?.columns ?? []
    setColumnKeys((prev) => {
      const source = prev.length ? prev : saved
      const grown = prev.length && prevDefaults.length ? schemaDefaultKeys.filter((key) => !prevDefaults.includes(key)) : []
      const kept = pinActionColumn(
        schema,
        [
          ...source.filter((key) => retainSavedColumn(key, schema, allColumnKeys)),
          ...grown.filter((key) => retainSavedColumn(key, schema, allColumnKeys) && !source.includes(key)),
        ],
        rowActionColumn,
      )
      if (source.length) {
        if (!kept.length) return prev.length ? prev : pinActionColumn(schema, source, rowActionColumn)
        if (kept.length === prev.length && kept.every((key, index) => key === prev[index])) return prev
        return kept
      }
      skipPersistGen.current += 1
      return schemaDefaultKeys
    })
  }, [allColumnKeys, rowActionColumn, schema, schemaDefaultKeys, schemaDefaultSig, sheet])

  useEffect(() => {
    if (!schema || sortFields.some((item) => item.key === sortField)) return
    const fallback =
      sortFields.find((item) => item.key === 'updatedAt') ??
      sortFields.find((item) => item.key === 'title') ??
      sortFields[0]
    if (fallback) {
      setSortField(fallback.key)
      setSortDir(fallback.key === 'updatedAt' ? 'desc' : 'asc')
    }
  }, [schema, sortField, sortFields])

  const visible = items

  const rawGrouped = useMemo(() => {
    if (!grouping) return groupRecords(visible, schema, groupBy, tagCatalog)
    if (groupBuckets.length) return groupBuckets
    // 分享列是计算属性。用行上的 shareScope 再分组，会把「分享出去的私人记录」先画进共享，等 $scope 组桶到了再跳。
    if (groupBy === 'shareScope') return []
    return groupRecords(visible, schema, groupBy, tagCatalog)
  }, [tagCatalog, groupBuckets, groupBy, grouping, schema, visible])
  const panelGroups = useMemo(
    () => (grouping ? applyGroupConfig(rawGrouped, groupConfig, { includeHidden: true }) : []),
    [groupConfig, grouping, rawGrouped],
  )
  const grouped = useMemo(
    () => (grouping ? applyGroupConfig(rawGrouped, groupConfig) : rawGrouped),
    [groupConfig, grouping, rawGrouped],
  )
  const parentKey = useMemo(() => parentFieldKey(schema, items), [items, schema])
  const treeOn = Boolean(parentKey) && showTree && dataPath !== DATA_COLLECTION_PATH
  const flattenRows = useCallback(
    (rows: DbRecord[]) => {
      if (!parentKey || !treeOn) return rows.map((row) => ({ row, depth: 0, hasKids: false, kidCount: 0 }))
      return flattenTree(rowsWithTreeKids(rows, treeKidsByParent), parentKey, collapsed).map((item) => {
        const loaded = treeKidsByParent[item.row.id] ?? treeKidsByParent[String(item.row.sourceId ?? '')]
        const hasKids = loaded ? loaded.length > 0 : Boolean(item.row[TREE_HAS_KIDS]) || item.hasKids
        return {
          ...item,
          hasKids,
          kidCount: loaded ? loaded.length : item.kidCount,
        }
      })
    },
    [collapsed, parentKey, treeKidsByParent, treeOn],
  )
  const loadTreeKids = useCallback(
    async (parentId: string, force = false) => {
      const key = String(parentId ?? '').trim()
      const field = String(parentKey ?? '').trim()
      if (!key || !field || !treeOn) return
      if (
        (!force && Object.prototype.hasOwnProperty.call(treeKidsByParentRef.current, key)) ||
        treeKidsInflight.current.has(key)
      ) {
        return
      }
      treeKidsInflight.current.add(key)
      try {
        const listed = await listTreeChildren({
          path: dataPath,
          parentKey: field,
          parentId: key,
          sortField,
          sortDir,
          sorts,
          columns: listColumns,
          list: (input) => listCollection({ ...input, fresh: true }),
        })
        setTreeKidsByParent((prev) => {
          const incoming = listed.items
          if (!force && Object.prototype.hasOwnProperty.call(prev, key)) return prev
          const incomingIds = new Set(incoming.map((row) => String(row.id)))
          const kept = (prev[key] ?? []).filter(
            (row) => confirmedCreates.current.has(String(row.id)) && !incomingIds.has(String(row.id)),
          )
          return { ...prev, [key]: kept.length ? [...kept, ...incoming] : incoming }
        })
      } finally {
        treeKidsInflight.current.delete(key)
      }
    },
    [dataPath, listColumns, parentKey, sortDir, sortField, sorts, treeOn],
  )
  loadTreeKidsRef.current = loadTreeKids
  const pickableIds = useMemo(() => {
    const rows = grouping ? grouped.flatMap((group) => group.rows) : visible
    return flattenRows(rows).map((item) => item.row.id)
  }, [flattenRows, grouped, grouping, visible])
  const tablePaintNodes = useMemo(() => {
    const nodes: TablePaintNode[] = []
    if (grouping) {
      if (!grouped.length) {
        nodes.push({ kind: 'empty', key: 'empty' })
        return nodes
      }
      for (const group of grouped) {
        const groupKey = group.key || 'unset'
        const count = group.total ?? group.rows.length
        const folded = Boolean(collapsedGroups[groupKey])
        nodes.push({
          kind: 'group-head',
          key: `gh:${groupKey}`,
          groupKey,
          label: group.label,
          count,
          folded,
        })
        if (folded) continue
        const pages = Math.max(1, Math.ceil(count / pageSize))
        const pageIndex = Math.min(groupPages[groupKey] ?? 0, pages - 1)
        const paged = group.total != null ? group.rows : group.rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
        const listed = flattenRows(paged)
        for (let idx = 0; idx < listed.length; idx += 1) {
          const item = listed[idx]!
          nodes.push({
            kind: 'row',
            key: `${groupKey}:${item.row.id}`,
            keyPrefix: `${group.key}:`,
            row: item.row,
            depth: item.depth,
            hasKids: item.hasKids,
            kidCount: item.kidCount,
            rowNumber: pageIndex * pageSize + idx + 1,
            fold: collapsed[item.row.id] !== false,
            treeOn,
          })
        }
        if (
          listed.length &&
          columns.some((col) => {
            if (col.key === 'actions') return false
            const op = columnSummaries[col.key]
            return Boolean(op && op !== 'none')
          })
        ) {
          const groupRows = listed.map((item) => item.row)
          nodes.push({
            kind: 'summary',
            key: `gs:${groupKey}`,
            rows: groupRows,
            stamp: `${JSON.stringify(columnSummaries)}\0${recordsFingerprint(groupRows)}\0${count}`,
            partial: count > paged.length,
          })
        }
        if (count > pageSize) {
          nodes.push({
            kind: 'group-pager',
            key: `gp:${groupKey}`,
            groupKey,
            count,
            pageIndex,
            pageSize,
          })
        }
      }
      return nodes
    }
    const listed = flattenRows(visible)
    if (!listed.length) {
      nodes.push({ kind: 'empty', key: 'empty' })
      return nodes
    }
    for (let idx = 0; idx < listed.length; idx += 1) {
      const item = listed[idx]!
      nodes.push({
        kind: 'row',
        key: item.row.id,
        keyPrefix: '',
        row: item.row,
        depth: item.depth,
        hasKids: item.hasKids,
        kidCount: item.kidCount,
        rowNumber: page * pageSize + idx + 1,
        fold: collapsed[item.row.id] !== false,
        treeOn,
      })
    }
    if (
      listed.length &&
      columns.some((col) => {
        if (col.key === 'actions') return false
        const op = columnSummaries[col.key]
        return Boolean(op && op !== 'none')
      })
    ) {
      const allRows = listed.map((item) => item.row)
      nodes.push({
        kind: 'summary',
        key: 'summary:all',
        rows: allRows,
        stamp: `${JSON.stringify(columnSummaries)}\0${recordsFingerprint(allRows)}\0${total}`,
        partial: total > visible.length,
      })
    }
    return nodes
  }, [collapsed, collapsedGroups, columnSummaries, columns, flattenRows, groupPages, grouped, grouping, pageSize, sheet, total, treeOn, visible])
  const selectionModel = useMemo<TableSelectionModel>(() => ({
    rowIds: tablePaintNodes.flatMap((node) => node.kind === 'row' && node.row.id ? [node.row.id] : []),
    rowKeys: tablePaintNodes.flatMap((node) => node.kind === 'row' && node.row.id ? [node.key] : []),
    keys: tableNavKeys(columns),
    writable: new Set(columns.filter((col) => cellFieldWritable(col.field)).map((col) => col.key)),
  }), [tablePaintNodes, columns])
  const selectionModelRef = useRef(selectionModel)
  selectionModelRef.current = selectionModel
  const liveSelectionRef = useRef<LiveTableCellSelection | null>(null)
  if (!liveSelectionRef.current) liveSelectionRef.current = new LiveTableCellSelection(() => selectionModelRef.current, {
    focus: cellPickRef, range: cellRangeRef, members: cellRangeSetRef,
  })
  const tablePaintRef = useRef<TablePaintBag>({ colSpan: 1, error: '', renderNode: () => null })
  const tableRef = useRef<HTMLTableElement>(null)
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const tableStageRef = useRef<HTMLDivElement>(null)
  const checkStackRef = useRef<HTMLDivElement>(null)
  const checkHoverRef = useRef<string | 'head' | null>(null)
  const effectiveFreezeUntil = freezeUntil || (freezeTitle ? (schema?.labelField ?? 'title') : '')
  const columnPinCount = tablePinCount(tableColumns.map((col) => col.key), schema?.labelField, freezeTitle, freezeUntil)
  const pinOffsets = useMemo(
    () => tablePinColOffsets(tableColumns.map((col) => col.key), columnWidths, columnPinCount, schema?.labelField),
    [columnPinCount, columnWidths, tableColumns, schema?.labelField],
  )
  const pinStamp = useMemo(
    () => [...(pinOffsets?.entries() ?? [])].map(([k, v]) => `${k}:${v.left}:${v.isEdge ? 1 : 0}`).join(','),
    [pinOffsets],
  )
  const tableResetKey = `${activeViewId ?? ''}\0${collectionPath}\0${groupBy}\0${page}\0${pageSize}\0${query}`
  const tagViewsStamp = useMemo(
    () =>
      tagCatalog
        .flatMap((pack) =>
          pack.fields.flatMap((field) =>
            field.views?.length ? [`${pack.id}:${field.key}:${JSON.stringify(field.views)}`] : [],
          ),
        )
        .join('\0'),
    [tagCatalog],
  )
  const columnViewsStamp = useMemo(
    () => `${JSON.stringify(columnViews)}\0${tagViewsStamp}\0${pinStamp}`,
    [columnViews, tagViewsStamp, pinStamp],
  )
  const checkLayoutExtra = useMemo(
    () =>
      [
        grouping ? 1 : 0,
        page,
        pageSize,
        detailId ?? '',
        pickedIds.join(','),
        items.map((row) => row.id).join(','),
        grouped.map((group) => `${group.key}:${group.rows.length}`).join(','),
        flatMapKey(collapsed),
        flatMapKey(collapsedGroups),
        flatMapKey(columnWidths),
      ].join('\0'),
    [collapsed, collapsedGroups, columnWidths, detailId, grouped, grouping, items, page, pageSize, pickedIds],
  )

  const onVisibleRange = useCallback((start: number, end: number) => {
    if (!grouping) return
    const until = Math.min(tablePaintNodes.length, end + TABLE_WINDOW_OVERSCAN)
    const needed = new Set<string>()
    for (let i = start; i < until; i += 1) {
      const node = tablePaintNodes[i]
      if (!node) continue
      if (node.kind === 'group-head' || node.kind === 'group-pager') needed.add(node.groupKey)
      else if (node.kind === 'row' && node.keyPrefix) needed.add(node.keyPrefix.replace(/:$/, ''))
    }
    const extra: string[] = []
    for (const key of needed) {
      const group = grouped.find((item) => (item.key || 'unset') === key)
      if (!group) continue
      const total = group.total ?? group.rows.length
      const pageIndex = Math.max(0, groupPages[key] ?? 0)
      const expected = Math.min(pageSize, Math.max(0, total - pageIndex * pageSize))
      if (expected > group.rows.length) extra.push(key)
    }
    if (!extra.length) return
    setGroupFillKeys((prev) => {
      let changed = false
      const next = [...prev]
      for (const key of extra) {
        if (next.includes(key)) continue
        next.push(key)
        changed = true
      }
      return changed ? next : prev
    })
  }, [grouped, grouping, groupPages, pageSize, tablePaintNodes])

  const paintCheckHover = useCallback((next: string | 'head' | null, force = false) => {
    if (!force && checkHoverRef.current === next) return
    const root = checkStackRef.current
    if (root) {
      const key = next == null ? null : String(next)
      for (const el of Array.from(root.querySelectorAll('.fsdb-check-slot'))) {
        el.classList.toggle('is-hover', key != null && el.getAttribute('data-check') === key)
      }
    }
    checkHoverRef.current = next
  }, [])

  const pickedIdSet = useMemo(() => new Set(pickedIds), [pickedIds])
  const tableIcons = useMemo(() => buildTableIconLookup(tables), [tables])
  const togglePicked = useCallback((ids: string[], on: boolean) => {
    setPickedIds((prev) => {
      if (on) {
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        return [...next]
      }
      const drop = new Set(ids)
      return prev.filter((id) => !drop.has(id))
    })
  }, [])

  const checkDrawRef = useRef({
    renderHead: () => <RowCheck ids={pickableIds} pickedIdSet={pickedIdSet} onTogglePicked={togglePicked} />,
    renderRow: (id: string) => <RowCheck id={id} pickedIdSet={pickedIdSet} onTogglePicked={togglePicked} />,
    hasPicked: () => pickedIds.length > 0,
  })
  checkDrawRef.current.renderHead = () => <RowCheck ids={pickableIds} pickedIdSet={pickedIdSet} onTogglePicked={togglePicked} />
  checkDrawRef.current.renderRow = (id: string) => <RowCheck id={id} pickedIdSet={pickedIdSet} onTogglePicked={togglePicked} />
  checkDrawRef.current.hasPicked = () => pickedIds.length > 0

  const checkListenersRef = useRef(new Set<() => void>())
  const checkVersionRef = useRef(0)
  const checkStore = useMemo<TableCheckStore>(() => ({
    subscribe: (listener) => {
      checkListenersRef.current.add(listener)
      return () => { checkListenersRef.current.delete(listener) }
    },
    getVersion: () => checkVersionRef.current,
    hasPicked: () => checkDrawRef.current.hasPicked(),
    renderHead: () => checkDrawRef.current.renderHead(),
    renderRow: (id: string) => checkDrawRef.current.renderRow(id),
  }), [])

  useLayoutEffect(() => {
    checkVersionRef.current += 1
    for (const listener of checkListenersRef.current) listener()
  }, [pickableIds, pickedIds])

  const renderCheckHead = useCallback(() => checkDrawRef.current.renderHead(), [])
  const renderCheckRow = useCallback((id: string) => checkDrawRef.current.renderRow(id), [])

  const listedSelected = detailId ? items.find((item) => item.id === detailId) : undefined
  const selected = useMemo(() => {
    if (!detailId) return null
    if (detailRow?.id === detailId) {
      const merged = listedSelected ? overlayListed(detailRow, listedSelected, listColumns) : detailRow
      return applyPendingDetailPatches(merged)
    }
    return applyPendingDetailPatches(listedSelected ?? { id: detailId })
  }, [applyPendingDetailPatches, detailId, detailRow, listColumns, listedSelected])
  const viewIndex = selected ? indexOnPage(selected.id, items, page, pageSize) : null
  const originStamp = crumbFromData ? overviewStampOf(collectionPath, selected, detailId) : ''
  const originIndex = crumbFromData
    ? originNav
      ? indexOnPage(originStamp, originNav.items, originNav.page, originNav.pageSize)
      : null
    : viewIndex
  const originTotal = crumbFromData ? (originNav?.total ?? 0) : total
  const canStepPrev = originIndex != null && originIndex > 0
  const canStepNext = originIndex != null && originIndex < originTotal - 1
  const stepViewRecord = async (delta: -1 | 1) => {
    if (!selected || steppingView.current) return
    steppingView.current = true
    try {
      if (crumbFromData && originNav) {
        const hit = await findViewNeighbor({
          currentId: originStamp,
          delta,
          items: originNav.items,
          page: originNav.page,
          pageSize: originNav.pageSize,
          total: originNav.total,
          query: originNav.query,
          list: listCollection,
        })
        if (!hit) return
        const stamp = stampRowOpenTarget(hit.row ?? { id: hit.id })
        if (!stamp) return
        onOpenRecord?.(stamp.recordId, undefined, stamp.collection)
        return
      }
      const hit = await findViewNeighbor({
        currentId: selected.id,
        delta,
        items,
        page,
        pageSize,
        total,
        query: {
          path: dataPath,
          query: fetchQuery,
          sortField,
          sortDir,
          sorts,
          filters: queryFilters,
          columns: listColumns,
        },
        list: listCollection,
      })
      if (!hit) return
      if (hit.page !== page) setPage(hit.page)
      setDetailId(hit.id, hit.row ?? null)
    } finally {
      steppingView.current = false
    }
  }
  useEffect(() => {
    if (!crumbFromData || !detailId) {
      setOriginNav(null)
      return
    }
    const viewId = viaDataViewId()
    const view = viewForPath(DATA_COLLECTION_PATH, viewId)
    const size = normalizePageSize(view?.pageSize)
    const query: ViewNeighborQuery = {
      path: DATA_COLLECTION_PATH,
      query: view?.query || '',
      sortField: view?.sortField || 'updatedAt',
      sortDir: view?.sortDir || 'desc',
      sorts: view?.sorts,
      filters: encodeListFilter(view?.filters ?? {}, resolveViewFilterTree(view ?? { filters: {} })),
      columns: ['title', 'table', 'tablePath', 'sourceId', 'emoji', 'mascot'],
    }
    const stampId = overviewStampOf(collectionPath, detailRow, detailId)
    let cancelled = false
    void (async () => {
      const located = await locateViewRecord(stampId, size, 0, query, listCollection)
      if (cancelled) return
      if (!located) {
        const first = await listCollection({
          path: DATA_COLLECTION_PATH,
          limit: size,
          offset: 0,
          query: query.query,
          sortField: query.sortField,
          sortDir: query.sortDir,
          sorts: query.sorts,
          filters: query.filters,
          columns: query.columns,
        })
        if (cancelled) return
        setOriginNav({ items: first.items, total: first.total, page: 0, pageSize: size, viewId, query })
        return
      }
      const nextPage = pageOfIndex(located.index, size)
      const listed = await listCollection({
        path: DATA_COLLECTION_PATH,
        limit: size,
        offset: nextPage * size,
        query: query.query,
        sortField: query.sortField,
        sortDir: query.sortDir,
        sorts: query.sorts,
        filters: query.filters,
        columns: query.columns,
      })
      if (cancelled) return
      setOriginNav({ items: listed.items, total: listed.total, page: nextPage, pageSize: size, viewId, query })
    })()
    return () => {
      cancelled = true
    }
  }, [collectionPath, crumbFromData, detailId, detailRow])
  useEffect(() => {
    // A sheet shows source records, not tag definitions. Publishing its stamped
    // IDs under /tags overwrites the outer tag list's breadcrumb records.
    if (sheet) return
    const rows = items.map((row) => ({
      id: row.id,
      label: crumbRecordLabel(row, schema?.labelField),
      emoji: recordPreviewEmoji(row),
      mascot: recordPreviewMascot(row),
    }))
    if (selected && !rows.some((row) => row.id === selected.id)) {
      rows.push({
        id: selected.id,
        label: crumbRecordLabel(selected, schema?.labelField),
        emoji: recordPreviewEmoji(selected),
        mascot: recordPreviewMascot(selected),
      })
    }
    rememberRecords(collectionPath, rows, routeViewId ?? activeViewId ?? undefined)
    window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
  }, [activeViewId, collectionPath, items, routeViewId, schema?.labelField, selected, sheet])
  const filterActive = countFilterRules(filterTree) > 0
  const activeView =
    views.find((view) => view.id === activeViewId) ??
    (activeViewId ? stubBuiltinScopeView(activeViewId, views) ?? undefined : undefined)
  const isKPlus1Cloud = !sheet && !localData && tableModeFor(collectionPath) === 'k-plus-1'
  const activeDomain: ViewDomain = activeView ? viewDomainOf(activeView) : (routeScope ?? 'all')
  const domainViews = useMemo(() => {
    if (!isKPlus1Cloud) return views
    if (activeDomain === 'all') {
      return views.filter((view) => viewDomainOf(view) === 'all')
    }
    const baseAll = views.find((view) => isBuiltinAllViewId(view.id)) ?? builtinAllView({ path: collectionPath, label: title })
    const scopedBuiltin = builtinScopeView(baseAll, activeDomain)
    const scopedCustom = views.filter(
      (view) => !isBuiltinAllViewId(view.id) && !view.builtin && viewDomainOf(view) === activeDomain,
    )
    return [scopedBuiltin, ...scopedCustom]
  }, [activeDomain, collectionPath, isKPlus1Cloud, title, views])
  const sandboxViews = useMemo(() => normalizeTableSandboxViews(activeView?.sandboxViews) ?? [], [activeView?.sandboxViews])
  const activeSandboxView = useMemo(() => sandboxViews.find((item) => item.id === mode), [mode, sandboxViews])
  const sortCustom = isCustomSorts(
    sorts,
    activeView?.builtin ? 'updatedAt' : (schema?.labelField ?? 'title'),
    activeView?.builtin ? 'desc' : 'asc',
  )
  const queryFields = useMemo(
    () => collectQueryFields(sorts, filterTree, schema?.labelField ?? 'title'),
    [filterTree, schema?.labelField, sorts],
  )
  const [viewBanner, setViewBanner] = useState<unknown>(null)
  useEffect(() => {
    if (sheet || !activeViewId) {
      setViewBanner(null)
      return
    }
    const path = savedViewRecordPath(collectionPath, activeViewId)
    if (!path) {
      setViewBanner(null)
      return
    }
    let cancelled = false
    const load = (clear = false) => {
      if (clear) setViewBanner(null)
      void readJson<{ value?: { banner?: unknown } }>(`/api/db/read?path=${encodeURIComponent(path)}`, undefined, { fresh: true })
        .then((data) => {
          if (!cancelled) setViewBanner(data.value?.banner ?? null)
        })
        .catch(() => {
          if (!cancelled && clear) setViewBanner(null)
        })
    }
    load(true)
    const onChange = (event: Event) => {
      const change = parseFsdbChange(event)
      if (change.scope !== 'content' || (change.path && change.path !== path)) return
      load(false)
    }
    window.addEventListener(FSDB_CHANGE_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(FSDB_CHANGE_EVENT, onChange)
    }
  }, [sheet, collectionPath, activeViewId])
  useSyncExternalStore(subscribeStarredViews, getStarredViewsVersion, () => 0)
  useSyncExternalStore(subscribePageWidth, getPageWidthVersion, () => 0)
  const viewStarred = Boolean(activeViewId && isViewStarred(getStarredViews(), collectionPath, activeViewId))
  const pageWidth = getPageWidth()
  const pagePrefs = getPagePrefs()
  useLayoutEffect(() => {
    if (!inspectorPaneId || !embed || detailId) return
    const canShare = Boolean(activeViewId) && !isSystemCollection(collectionPath) && !isIndexCollection(collectionPath)
    reportInspectorPaneMenu(
      inspectorPaneId,
      <ViewPaneMenu
        collectionPath={collectionPath}
        viewId={activeViewId}
        share={
          canShare && activeViewId ? (
            <SharePanel
              embedded
              localOnly={localData}
              target={{
                kind: 'view',
                collection: collectionPath,
                viewId: activeViewId,
                title: activeView?.name ?? title,
              }}
            />
          ) : null
        }
      />,
    )
    return () => reportInspectorPaneMenu(inspectorPaneId, null)
  }, [activeView?.name, activeViewId, collectionPath, detailId, embed, inspectorPaneId, localData, title])

  useEffect(() => {
    hydratedDetail.current = ''
    if (!detailId || !schema) {
      setDraft({})
      return
    }
  }, [detailId, schema])

  useEffect(() => {
    if (!detailId || !schema) return
    if (detailRow?.id !== detailId) return
    const protectedRow = applyPendingDetailPatches(detailRow)
    const next = draftFromRecord(schema, protectedRow, bodyKey, detailBody)
    setDraft((prev) => {
      const labelKey = schema.labelField
      if (labelKey && typeof document !== 'undefined') {
        const active = document.activeElement
        if (
          active instanceof HTMLElement &&
          active.classList.contains('fsdb-detail-title-input') &&
          pageRef.current?.contains(active) &&
          prev[labelKey] !== undefined
        ) {
          next[labelKey] = prev[labelKey]!
        }
      }
      return sameStringDraft(prev, next) ? prev : next
    })
    hydratedDetail.current = detailId
  }, [applyPendingDetailPatches, bodyKey, detailId, detailRow, schema])

  useEffect(() => {
    if (!bodyKey || !detailId || !schema) return
    const formatted = draftFromRecord(schema, { id: detailId }, bodyKey, detailBody)[bodyKey] ?? ''
    setDraft((prev) => (prev[bodyKey] === formatted ? prev : { ...prev, [bodyKey]: formatted }))
  }, [bodyKey, detailBody, detailId, schema])

  useEffect(() => {
    if (!detailId) {
      contentGen.current += 1
      setDetailBody(null)
      setDetailBodyStatus('ready')
      setDetailBodyError('')
      return
    }
    setDetailBody(null)
    setDetailBodyStatus('loading')
    setDetailBodyError('')
    pullDetailBody()
  }, [collectionPath, dataPath, detailId, pullDetailBody])

  function rememberActiveView(id: string) {
    activeViewIdRef.current = id
    setActiveViewId(id)
    if (nested) return
    try {
      writeStorageString(activeViewStorageKey(collectionPath), id)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (nested || sheet || !collectionPath || !activeViewId) return
    try {
      writeStorageString(activeViewStorageKey(collectionPath), activeViewId)
    } catch {
      /* ignore */
    }
  }, [activeViewId, collectionPath, nested, sheet])

  function applyView(view: SavedView) {
    const current = viewsRef.current.find((item) => item.id === view.id)
    if (current && view.id === activeViewIdRef.current && !viewIsFresher(view, current)) return
    const next = normalizeSavedView({
      ...view,
      filters: { ...catalogLockFilters(view.id, [view]), ...view.filters },
    })
    const sourceColumns = next.columns.length
      ? next.columns.filter((key) => retainSavedColumn(key, schema, allColumnKeys))
      : schemaDefaultKeys
    const nextColumns = pinActionColumn(schema, sourceColumns, rowActionColumn)
    const nextQuery = next.query ?? ''
    const nextPageSize = normalizePageSize(next.pageSize)
    const nextGroup = next.groupBy ?? ''
    if (
      next.id === activeViewId &&
      mode === next.mode &&
      sortField === next.sortField &&
      sortDir === next.sortDir &&
      groupBy === nextGroup &&
      groupConfigStateKey(groupConfig) === groupConfigStateKey(next.groupConfig) &&
      showTree === Boolean(next.tree) &&
      wrapCells === !!next.wrap &&
      truncateCells === (next.truncate !== false) &&
      showRowNumbers === Boolean(next.rowNumbers) &&
      freezeTitle === Boolean(next.freezeTitle) &&
      freezeUntil === (next.freezeUntil ?? '') &&
      query === nextQuery &&
      pageSize === nextPageSize &&
      sortsStateKey(sorts) === sortsStateKey(next.sorts) &&
      filterTreeStateKey(filterTree) === filterTreeStateKey(resolveViewFilterTree(next)) &&
      JSON.stringify(filters) === JSON.stringify(next.filters) &&
      JSON.stringify(columnKeys) === JSON.stringify(nextColumns) &&
      JSON.stringify(columnWidths) === JSON.stringify(normalizeColumnWidths(next.columnWidths))
    ) {
      return
    }
    rememberActiveView(next.id)
    applyViewDisplay(next, nextColumns, {
      groupBy: nextGroup,
      query: nextQuery,
      pageSize: nextPageSize,
    })
    setPage(0)
    setViewMenuOpen(false)
  }

  viewsRef.current = views
  activeViewIdRef.current = activeViewId
  adoptViewRef.current = (view: SavedView) => {
    if (sheet) return
    const painted = paintListedViews(collectionPath)
    const current = painted.find((item) => item.id === view.id) ?? viewsRef.current.find((item) => item.id === view.id)
    if (current && !viewIsFresher(view, current)) return
    const incoming = withViewDisplay(collectionPath, view)
    const listed = rankListedViews(
      painted.some((item) => item.id === view.id)
        ? painted.map((item) => (item.id === view.id ? incoming : item))
        : [...painted, incoming],
      viewsRef.current,
    )
    rememberViews(collectionPath, listed)
    viewsRef.current = listed
    setViews(listed)
    if (view.id === activeViewIdRef.current) {
      skipPersistGen.current += 1
      applyView(view)
    }
  }
  syncViewsRef.current = async () => {
    if (sheet) return
    const targetPath = collectionPath
    await pullSavedViews([targetPath], { force: true })
    if (dataPathRef.current !== dataPath) return
    const listed = rankListedViews(paintListedViews(targetPath), viewsRef.current)
    const prev = viewsRef.current
    const activeId = viewSyncRef.current!.resolveSyncedViewId(targetPath, activeViewIdRef.current, routeViewIdRef.current)
    rememberViews(targetPath, listed)
    viewsRef.current = listed
    setViews(listed)
    const nextView =
      pickViewForRoute(listed, targetPath, activeId) ?? listed[0]
    const prevView = activeId ? prev.find((item) => item.id === activeId) : undefined
    if (!nextView) return
    if (prevView && viewStateKey(normalizeSavedView(prevView)) === viewStateKey(normalizeSavedView(nextView))) return
    skipPersistGen.current += 1
    applyView(nextView)
  }

  function selectView(view: SavedView) {
    viewSyncRef.current!.markSelect(collectionPath, view.id, routeViewId, Boolean(onOpenView))
    persistActiveViewRef.current()
    if (view.id !== activeViewIdRef.current) {
      pendingPathQueryRef.current = null
      reloadGen.current += 1
      adoptListCacheForViewRef.current(dataPath, view)
      applyView(view)
      if (hasExternalViews) externalViewsOnChangeRef.current?.(viewsRef.current, view.id)
    } else {
      setViewMenuOpen(false)
    }
    if (!hasExternalViews) rememberInspectorWorkingView(collectionPath, view.id)
    onOpenView?.(view.id)
  }

  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ collection?: string; view?: SavedView }>).detail
      if (String(detail?.collection ?? '') !== collectionPath) return
      if (detail?.view) adoptViewRef.current(detail.view)
    }
    window.addEventListener(SAVED_VIEW_EVENT, onSaved)
    return () => window.removeEventListener(SAVED_VIEW_EVENT, onSaved)
  }, [collectionPath])

  useEffect(() => {
    const id = String(routeViewId ?? '').trim()
    if (!id || !routeViewNeedsFetch(collectionPath, id)) {
      routeViewReadyRef.current = true
      setRouteViewReady(true)
      return
    }
    let live = true
    routeViewReadyRef.current = false
    setRouteViewReady(false)
    void fetchSavedView(collectionPath, id)
      .then((view) => {
        if (!live) return
        const listed = paintListedViews(collectionPath)
        rememberViews(collectionPath, listed)
        viewsRef.current = listed
        setViews((prev) => (sameSavedViews(prev, listed) ? prev : listed))
        const next = view ?? pickViewForRoute(listed, collectionPath, id)
        if (next) {
          skipPersistGen.current += 1
          applyView(next)
        }
        routeViewReadyRef.current = true
        setRouteViewReady(true)
      })
      .catch(() => {
        if (!live) return
        routeViewReadyRef.current = true
        setRouteViewReady(true)
      })
    return () => {
      live = false
    }
  }, [collectionPath, routeViewId])

  useEffect(() => {
    if (sheet || routeRecordId) return
    void syncViewsRef.current()
  }, [collectionPath, sheet, routeRecordId])

  useEffect(() => {
    if (!viewMenuOpen || hasExternalViews) return
    void syncViewsRef.current()
  }, [hasExternalViews, viewMenuOpen])

  const {
    persistViews,
    persistViewOrder,
    addEmptyView,
    copyView,
    patchActiveView,
    commitViewName,
    deleteView,
  } = createBrowserViewCrud({
    sheet,
    collectionPath,
    title,
    routeScope,
    catalogLocks,
    schemaDefaultKeys,
    views,
    viewsRef,
    setViews,
    activeViewId,
    activeView,
    activeViewIdRef,
    viewsWriteGenRef,
    setViewsSaveError,
    setViewMenuOpen,
    pageRef,
    mode,
    sortField,
    sortDir,
    sorts,
    filterTree,
    columnKeys,
    columnWidths,
    groupBy,
    groupConfig,
    showTree,
    wrapCells,
    truncateCells,
    freezeTitle,
    query,
    listedViews,
    paintListedViews,
    rankListedViews,
    selectView,
    onOpenTable,
    externalViews: hasExternalViews
      ? {
          onChange: (nextViews, nextActiveId) => externalViewsOnChangeRef.current?.(nextViews, nextActiveId),
        }
      : undefined,
  })

  function renderVisibleColumnsFlyout() {
    return (
      <Suspense fallback={null}>
        <VisibleColumnsFlyout
          columns={columns}
          allColumns={allColumns}
          labelField={schema?.labelField}
          tagCatalog={sheetPack ? [sheetPack] : tagCatalog}
          onToggle={toggleColumn}
          onToggleMany={toggleManyColumns}
          onReorder={setVisibleColumns}
        />
      </Suspense>
    )
  }

  function setVisibleColumns(next: string[]) {
    const pinned = pinActionColumn(schema, next, rowActionColumn)
    if (!pinned.length) return
    setColumnKeys(pinned)
    if ((sheet && !hasExternalViews) || !activeViewId) return
    patchActiveView({ columns: pinned })
  }

  function toggleColumn(key: string) {
    if (key === schema?.labelField || key === 'actions') return
    const current = columnKeys.length ? columnKeys : columns.map((col) => col.key)
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    if (!next.length) return
    setVisibleColumns(next)
  }

  function toggleManyColumns(keys: string[], show: boolean) {
    const lockedKey = schema?.labelField
    const targets = keys.filter((key) => key !== lockedKey && key !== 'actions')
    if (!targets.length) return
    const current = columnKeys.length ? columnKeys : columns.map((col) => col.key)
    const targetSet = new Set(targets)
    const next = show
      ? [...current, ...targets.filter((key) => !current.includes(key))]
      : current.filter((key) => !targetSet.has(key))
    if (!next.length) return
    setVisibleColumns(next)
  }

  function changePageSize(next: number) {
    const size = normalizePageSize(next)
    if (size === pageSize) return
    if (pendingPathQueryRef.current) pendingPathQueryRef.current = { ...pendingPathQueryRef.current, pageSize: size }
    setPageSize(size)
    setPage(0)
    patchActiveView({ pageSize: size })
  }

  function setWrap(next: boolean) {
    setWrapCells(next)
    patchActiveView({ wrap: next })
  }

  function setTruncate(next: boolean) {
    setTruncateCells(next)
    patchActiveView({ truncate: next })
  }

  function setRowNumbers(next: boolean) {
    setShowRowNumbers(next)
    patchActiveView({ rowNumbers: next })
  }

  function createSandboxView() {
    const item = createTableSandboxItem(sandboxViews, activeView?.name || title)
    const next = [...sandboxViews, item]
    setMode(item.id as ViewMode)
    patchActiveView({ sandboxViews: next, mode: item.id as ViewMode })
  }

  function patchSandboxView(updated: TableSandboxItem) {
    const next = sandboxViews.map((item) => (item.id === updated.id ? updated : item))
    patchActiveView({ sandboxViews: next })
  }

  function setGroupKey(next: string) {
    setGroupBy(next)
    if (next !== groupBy) {
      setGroupConfig(undefined)
      patchActiveView({ groupBy: next, groupConfig: undefined })
    } else {
      patchActiveView({ groupBy: next })
    }
  }

  function setGroupSettings(next: GroupConfig | undefined) {
    const norm = normalizeGroupConfig(next)
    setGroupConfig(norm)
    patchActiveView({ groupConfig: norm })
  }

  function setTree(next: boolean) {
    setShowTree(next)
    patchActiveView({ tree: next })
  }

  function setFreezeTitleCol(next: boolean) {
    const until = next ? (schema?.labelField ?? 'title') : ''
    setFreezeTitle(next)
    setFreezeUntil(until)
    patchActiveView({ freezeTitle: next, freezeUntil: until || undefined })
  }

  function setFreezeUntilCol(colKey: string) {
    const next = colKey.trim()
    setFreezeUntil(next)
    setFreezeTitle(Boolean(next))
    patchActiveView({ freezeUntil: next || undefined, freezeTitle: Boolean(next) })
  }

  async function runAction(row: DbRecord, action: CollectionActionInfo) {
    if (action.id === 'add-child') {
      await createChildRecord(row)
      return
    }
    if (action.id === 'delete' || action.id === 'trash' || action.id === 'remove') {
      if (collectionPath === PLUGINS_COLLECTION_PATH && row.builtin === true) return
      setDlg({ kind: 'delete-record', row })
      return
    }
    if (action.id === 'chat') {
      const sessionId = String(row.sourceId ?? row.id ?? '').trim()
      if (sessionId) {
        window.dispatchEvent(new CustomEvent(OPEN_SESSION_EVENT, { detail: { sessionId } }))
      }
      return
    }
    if (action.id === 'pack' && (row.installed === true || row.installed === 'true')) {
      setDlg({
        kind: 'action',
        row,
        action: {
          ...action,
          label: '再次安装',
          confirm: '已经存在已安装的插件，要再安装一次吗？',
        },
      })
      return
    }
    if (action.confirm) {
      setDlg({ kind: 'action', row, action })
      return
    }
    await executeAction(row, action)
  }

  function mapListedRecords(map: (row: DbRecord) => DbRecord) {
    setItems((prev) => {
      const next = prev.map((item) => map(item) as typeof item)
      const same = recordsFingerprint(prev) === recordsFingerprint(next)
      if (!same) itemsRef.current = next
      return same ? prev : next
    })
    setGroupBuckets((prev) => {
      const next = remapGroupedRecords(prev, map, groupByRef.current, schemaRef.current, tagCatalogRef.current)
      groupBucketsRef.current = next
      return next
    })
  }

  function dropListedRecords(ids: string[], opts?: { keepHistory?: boolean }) {
    const gone = new Set(ids.filter(Boolean).map(String))
    if (!gone.size) return
    for (const id of gone) {
      confirmedCreates.current.delete(id)
      if (!opts?.keepHistory) void tableEditHistoryRef.current.forget(`${collectionPathRef.current}/${id}`)
    }
    const prev = itemsRef.current
    const next = prev.filter((item) => !gone.has(String(item.id)))
    const removed = prev.length - next.length
    if (removed) {
      itemsRef.current = next
      totalRef.current = Math.max(0, totalRef.current - removed)
      setItems(next)
      setTotal(totalRef.current)
    }
    setGroupBuckets((groups) =>
      groups
        .map((group) => {
          const rows = group.rows.filter((row) => !gone.has(String(row.id)))
          const dropped = group.rows.length - rows.length
          if (!dropped) return group
          return {
            ...group,
            rows,
            total: group.total != null ? Math.max(0, group.total - dropped) : undefined,
          }
        })
        .filter((group) => group.rows.length > 0 || (group.total ?? 0) > 0 || group.key === ''),
    )
  }

  function announceListChange(keepCache = false, noticePath = dataPathRef.current) {
    tableHoldRef.current = null
    pendingPathQueryRef.current = null
    if (!keepCache) forgetListCache(dataPath)
    invalidateListReads()
    emitFsdbChange({ scope: 'records', path: noticePath })
  }

  useEffect(() => {
    const onMut = (event: Event) => {
      const detail = (event as CustomEvent<ListedMutation>).detail
      if (!detail || detail.path !== collectionPathRef.current) return
      if (detail.op === 'patch') {
        const existing = itemsRef.current.find((item) => item.id === detail.row.id)
        const merged = existing ? overlayListedRow(existing, detail.row) : detail.row
        if (existing && !matchListFilterRecord(merged, queryFiltersRef.current, schemaRef.current, tagCatalogRef.current)) {
          dropListedRecords([detail.row.id], { keepHistory: true })
        } else {
          mapListedRecords((item) => (item.id === detail.row.id ? overlayListedRow(item, detail.row) : item))
        }
        setDetailRow((prev) => (prev?.id === detail.row.id ? overlayListedRow(prev, detail.row) : prev))
        return
      }
      if (detail.op === 'remove') {
        dropListedRecords(detail.ids)
        return
      }
      const row = detail.row
      if (itemsRef.current.some((item) => item.id === row.id)) {
        mapListedRecords((item) => (item.id === row.id ? overlayListedRow(item, row) : item))
        return
      }
      confirmedCreates.current.add(String(row.id))
      const nextItems = [row, ...itemsRef.current.filter((item) => item.id !== row.id)]
      itemsRef.current = nextItems
      setItems(nextItems)
      totalRef.current += 1
      setTotal(totalRef.current)
      setGroupBuckets((prev) => placeCreatedRow(prev, row, groupByRef.current, schemaRef.current, tagCatalogRef.current))
    }
    window.addEventListener(LISTED_MUTATION_EVENT, onMut)
    return () => window.removeEventListener(LISTED_MUTATION_EVENT, onMut)
  }, [])

  const landCreatedTitleCellRef = useRef<(rowId: string) => void>(() => {})
  const {
    executeAction,
    writePatch,
    createChildRecord,
    groupCreateSeed,
    createInGroup,
    createRecord,
    executeDeleteRecord,
    executeDeleteRecords,
    exportPicked,
    executeBulkEdit,
    executeBulkTag,
    writeOne,
    writeCellValue,
    writeBatchCellValues,
  } = createBrowserMutations({
    collectionPath,
    dataPath,
    dataPathRef,
    title,
    embed,
    isDataOverview,
    canCreate,
    schema,
    schemaRef,
    bodyKey,
    items,
    itemsRef,
    setItems,
    totalRef,
    setTotal,
    detailId,
    detailIdRef,
    detailRowRef,
    setDetailRow,
    setDetailBody,
    setDetailBodyStatus,
    setDetailBodyError,
    activeViewId,
    activeViewIdRef,
    routeViewId,
    groupBy,
    groupByRef,
    grouped,
    setGroupBuckets,
    setGroupPages,
    setCollapsedGroups,
    setCollapsed,
    setTreeKidsByParent,
    catalogLocks,
    filterTree,
    queryFiltersRef,
    tagCatalog,
    tagCatalogRef,
    createScope,
    createTypeTable,
    overviewCreateTables,
    pickedIds,
    setPickedIds,
    actingRef,
    setActing,
    creatingGroupsRef,
    setCreatingGroup,
    confirmedCreates,
    quietUntil,
    contentGen,
    contentVersions,
    contentWriteQueueRef,
    fieldWriteQueueRef,
    pendingFieldTrackerRef,
    tableEditHistory,
    setDlg,
    setError,
    sourceRecordPath,
    sourceDeleteTarget,
    applyPendingDetailPatches,
    mapListedRecords,
    dropListedRecords,
    announceListChange,
    reload,
    loadTreeKids,
    landCreatedTitleCell: (rowId) => landCreatedTitleCellRef.current(rowId),
    onCloseRecord,
  })

  function cellFieldWritable(field: FieldSpec) {
    const kind = resolveFieldType(field)
    return Boolean(field.writable) && kind !== 'file' && kind !== 'action'
  }

  function markCellOn(td: HTMLElement, writable: boolean) {
    const table = td.closest('table')
    table?.querySelectorAll('td.is-cell-on, td.is-cell-range').forEach((node) => {
      if (node === td) return
      node.classList.remove('is-cell-on', 'is-cell-ro', 'is-cell-range')
    })
    td.classList.add('is-cell-on')
    td.classList.remove('is-cell-range')
    td.classList.toggle('is-cell-ro', !writable)
  }

  function paintCellRangeClasses() {
    if (tableHoldRef.current) return
    liveSelectionRef.current!.paint(tableRef.current)
  }

  function applyCellRange(anchor: TableCellCursor, focus: TableCellCursor, commit = true) {
    liveSelectionRef.current!.apply(anchor, focus, tableRef.current)
    if (commit) setCellPickEpoch((n) => n + 1)
  }

  // Loading, grouping, sorting and column changes can happen during an active gesture.
  useLayoutEffect(() => {
    if (tableHoldRef.current) return
    liveSelectionRef.current!.reconcile(tableRef.current)
  }, [selectionModel])

  function tableCellFromPoint(x: number, y: number) {
    const table = tableRef.current
    if (!table) return null
    const stack = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)]
    for (const hit of stack) {
      if (!(hit instanceof Element) || !table.contains(hit)) continue
      const td = hit.closest('td')
      if (!td || !table.contains(td)) continue
      const id = td.closest('tr')?.dataset.recordId
      const key = td.dataset.colKey
      if (!id || !key || key.startsWith('pad:') || key === 'fsdb-col-fill') continue
      const cursor = tableCursorFromCell(td)
      return cursor ? { td, ...cursor } : null
    }
    return null
  }

  function blurPaneCaret() {
    const root = pageRef.current
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (!(active instanceof HTMLElement) || !root?.contains(active)) return
    if (active === tableRef.current) {
      active.blur()
      return
    }
    if (active.closest('input, textarea, select, [contenteditable="true"], .tiptap, .page-editor, .fsdb-detail-title-input')) {
      active.blur()
    }
  }

  function clearTableCellPick() {
    const had = Boolean(cellPickRef.current || cellPop)
    cellPickRef.current = null
    cellRangeRef.current = null
    cellRangeSetRef.current = new Set()
    cellAnchorRef.current = null
    tableRef.current?.querySelectorAll('td.is-cell-on, td.is-cell-range').forEach((node) => {
      node.classList.remove('is-cell-on', 'is-cell-ro', 'is-cell-range')
    })
    blurPaneCaret()
    if (had) {
      setCellPop(null)
      setCellPickEpoch((n) => n + 1)
    }
  }

  useLayoutEffect(() => {
    // A cursor belongs to its table/view, even when the destination reuses row ids.
    tableDragScrollStopRef.current?.()
    tableDragScrollStopRef.current = null
    clearTableCellPick()
    tableAutoLandedRef.current = ''
  }, [collectionPath, dataPath, activeViewId])

  useLayoutEffect(() => {
    tableAutoLandLiveRef.current()
  })

  function claimThisTableCell() {
    if (sheet) return
    claimTableCellPick(embed ? 'inspector' : 'main')
  }

  const labelOf = (row: DbRecord) => crumbRecordLabel(row, schema?.labelField)
  const crumbs = useMemo(() => {
    const dataViewId = crumbFromData ? viaDataViewId() : ''
    const dataView = crumbFromData ? viewForPath(DATA_COLLECTION_PATH, dataViewId) : null
    const dataViews = crumbFromData ? paintCollectionViews(DATA_COLLECTION_PATH, tables) : []
    const stampId = crumbFromData ? originStamp : ''
    return buildCrumbs({
      collection: crumbFromData ? DATA_COLLECTION_PATH : collectionPath,
      collectionLabel: crumbFromData ? '数据' : title,
      tables: tables.map((table) => ({
        path: table.path,
        label: table.view?.title ?? table.label,
        icon: table.view?.icon,
      })),
      viewId: crumbFromData ? dataViewId : (routeViewId ?? activeViewId ?? undefined),
      viewScope: crumbFromData
        ? undefined
        : activeDomain === 'all'
          ? undefined
          : activeDomain,
      viewName: crumbFromData
        ? displayNameForView(
            dataViewId,
            { path: DATA_COLLECTION_PATH, label: '数据', view: { title: '数据' } },
            isBuiltinAllViewId(dataViewId) ? undefined : dataView?.name,
          )
        : activeView?.name,
      views: crumbFromData
        ? dataViews.map((view) => ({ id: view.id, name: view.name, mode: view.mode }))
        : domainViews.map((view) => ({ id: view.id, name: view.name, mode: view.mode })),
      recordId: crumbFromData ? stampId : selected?.id,
      recordLabel: selected ? crumbRecordLabel(selected, schema?.labelField) : undefined,
      records: selected
        ? (crumbFromData ? originNav?.items ?? [] : items).map((row) => ({
            id: row.id,
            label: crumbRecordLabel(row, schema?.labelField),
            emoji: recordPreviewEmoji(row),
            mascot: recordPreviewMascot(row),
          }))
        : undefined,
    })
  }, [activeView?.name, activeViewId, collectionPath, crumbFromData, originNav, originStamp, routeViewId, schema?.labelField, selected, selected ? items : null, tables, title, views])
  const currentTable = tables.find((item) => item.path === collectionPath)
  const recordKind = recordPickKind(currentTable?.view?.moduleId || currentTable?.id)
  const recordPathOf = (row: DbRecord) => recordSourcePath(collectionPath, row.id)
  const recordPick = (row: DbRecord) =>
    pickMode
      ? pickDomAttrs(recordKind, row.id, labelOf(row), { path: recordPathOf(row), title: labelOf(row) })
      : EMPTY_PICK
  const cellValueText = (row: DbRecord, key: string, field: FieldSpec) => {
    if (isViewCatalogField(key)) return selectedViewCatalogOption(collectionPath, row, key)?.name ?? ''
    const raw = parseTagFlatColumnKey(key) ? readTagFlatValue(row, key, tagSourceKey(schema)) : row[key]
    return formatField(field, raw)
  }
  const cellPickOf = (row: DbRecord, key: string, field: FieldSpec) =>
    pickMode
      ? fieldPickAttrs(recordKind, row.id, key, {
          label: field.label ?? key,
          title: labelOf(row),
          path: recordPathOf(row),
          text: cellValueText(row, key, field),
          type: field.type,
        })
      : EMPTY_PICK

  function renderCell(row: DbRecord, key: string, field: FieldSpec, surface: 'table' | 'detail' = 'detail') {
    return renderBrowserCell(
      {
        collectionPath,
        currentTable,
        localData,
        localKnown,
        schema,
        items,
        tables,
        chrome,
        onOpenTable,
        jumpTag,
        runAction,
        writeCellValue,
        writePatch,
      },
      row,
      key,
      field,
      surface,
    )
  }

  function renderCellPop() {
    return (
      <BrowserCellPopOverlay
        cellPop={cellPop}
        schema={schema}
        columns={columns}
        items={items}
        collectionPath={collectionPath}
        anchor={cellAnchorRef.current}
        findPaintedRow={findPaintedRow}
        onClose={() => setCellPop(null)}
        onSubmit={(row, key, field, next) => submitCellPopValue(row, key, field, next)}
      />
    )
  }

  function renderRecordActions(row: DbRecord) {
    const paintSchema = tableHoldRef.current?.schema ?? schema
    return (
      <RecordActions
        row={row}
        paintSchema={paintSchema}
        chrome={chrome}
        useChrome={paintSchema === schema}
        busy={acting}
        nested={nested}
        labelOf={labelOf}
        onRunAction={(target, action) => {
          void runAction(target, action)
        }}
      />
    )
  }

  const flashNotice = (message: string) => {
    if (!message) return
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2400)
  }

  const {
    tableNavRowIds,
    findPaintedCellTd,
    onTablePointerDown,
    onTablePointerMove,
    onTableClick,
    onTableContextMenu,
    findPaintedRow,
    tablePaneOwnsFocus,
    rememberThisPaneRest,
    landPaneSurface,
    landCreatedTitleCell,
    landFirstTableCell,
    sendPickedRowsToChat,
    sendTableSelectionToChat,
    copySelectedTableCells,
    onTablePaste,
    submitCellPopValue,
    onTableKeyDown,
  } = createBrowserTableNav({
    sheet,
    embed,
    collectionPath,
    activeViewId,
    detailId,
    schema,
    schemaRef,
    columns,
    items,
    itemsRef,
    tablePaintNodes,
    treeKidsByParentRef,
    selectionModelRef,
    tableRef,
    tableWrapRef,
    pageRef,
    tablePaintRef,
    cellAnchorRef,
    cellPickRef,
    cellRangeRef,
    cellRangeSetRef,
    cellRepickRef,
    cellPopPtrRef,
    tableDragScrollStopRef,
    actionHoverIndexRef,
    cellPop,
    setCellPop,
    setCellPickEpoch,
    pickedIds,
    setPickedIds,
    canCreate,
    treeOn,
    collapsed,
    setCollapsed,
    recordKind,
    tableEditHistory,
    setError,
    cellFieldWritable,
    markCellOn,
    applyCellRange,
    tableCellFromPoint,
    claimThisTableCell,
    jumpTag,
    cellValueText,
    recordPathOf,
    labelOf,
    openRow,
    openRowSplit,
    createRecord,
    captureTableFoldSnapshot,
    loadTreeKids,
    writeCellValue,
    writeBatchCellValues,
    flashNotice,
  })
  landCreatedTitleCellRef.current = landCreatedTitleCell
  function pickCrumbTarget(target: CrumbTarget) {
    if (target.kind === 'view' && target.collection === collectionPath) {
      const view = views.find((item) => item.id === target.viewId)
      if (view) selectView(view)
      return
    }
    onCrumbTarget?.(target)
  }
  tableNavLiveRef.current = (event) => onTableKeyDown(event)
  tablePasteLiveRef.current = (event) => {
    onTablePaste(event)
  }
  tableCellClaimLiveRef.current = (event) => {
    if (sheet) return
    const owner = tablePaneFromEvent(event)
    if (!owner) return
    if (tablePaneOwnsFocus(owner)) return
    rememberThisPaneRest()
    clearTableCellPick()
  }
  tablePaneFocusInLiveRef.current = (event) => {
    if (sheet) return
    const hit = event.target instanceof Element ? event.target : null
    const page = pageRef.current
    if (!hit || !page?.contains(hit)) return
    if (hit.closest('dialog, [role="dialog"], [role="menu"], [role="listbox"]')) return
    if (
      !hit.closest(
        '.fsdb-detail-title-input, .tiptap, .page-editor, .tasks-table, td.is-cell-on, [data-testid="page-editor"]',
      ) &&
      hit !== tableRef.current
    ) {
      return
    }
    claimThisTableCell()
  }
  crumbBackLiveRef.current = (event) => {
    if (sheet || nested) return
    if (!crumbParentHotkey(event)) return
    if (crumbHotkeyPane(event.target) !== 'main') return
    const parent = parentCrumbTarget(crumbs)
    if (!parent) return
    event.preventDefault()
    event.stopPropagation()
    pickCrumbTarget(parent)
  }
  tablePaneFocusLiveRef.current = (event) => {
    const pane = event ? tablePaneFromEvent(event) : embed ? 'inspector' : 'main'
    if (!tablePaneOwnsFocus(pane)) return
    if (landPaneSurface()) consumePendingTablePane(pane ?? (embed ? 'inspector' : 'main'))
  }
  tableAutoLandLiveRef.current = () => {
    if (sheet || embed || mode !== 'table' || detailId) return
    if (peekPendingTablePane('inspector')) return
    if (tableHoldRef.current || pendingPathQueryRef.current) return
    const pick = cellPickRef.current
    if (pick) {
      if (tableNavRowIds().includes(pick.id) && tableNavKeys(columns).includes(pick.key)) {
        // Virtual rows may be unmounted. Restore paint without setting state or
        // scrolling back to the cursor on every commit (which can loop forever).
        const td = findPaintedCellTd(pick.id, pick.key, pick.rowKey)
        if (td && !td.classList.contains('is-cell-on')) paintCellRangeClasses()
        return
      }
      clearTableCellPick()
      tableAutoLandedRef.current = ''
    }
    const stamp = `${collectionPath}\0${activeViewId ?? ''}\0${dataPath}`
    if (tableAutoLandedRef.current === stamp) return
    const live = typeof document !== 'undefined' ? document.activeElement : null
    if (
      live instanceof HTMLElement &&
      tableKeyFromEditingTarget(live) &&
      !tableRef.current?.contains(live) &&
      !live.closest('.fsdb-cell-pop')
    ) {
      return
    }
    const next = firstTableTitleCell(tableNavRowIds(), tableNavKeys(columns), schema?.labelField, selectionModelRef.current.rowKeys)
    if (!next) return
    if (!landFirstTableCell(false)) return
    if (!findPaintedCellTd(next.id, next.key, next.rowKey)) return
    tableAutoLandedRef.current = stamp
  }
  tablePaneHotkeyLiveRef.current = (event) => {
    if (sheet) return
    if (!tablePaneHotkey(event)) return
    const hit = event.target instanceof Element ? event.target : null
    if (hit?.closest('dialog, [role="dialog"], [role="menu"], [role="listbox"], .fsdb-headless-pop')) return
    const from = crumbHotkeyPane(event.target) === 'inspector' ? 'inspector' : 'main'
    const pane = tablePaneOther(from)
    if (from === (embed ? 'inspector' : 'main')) rememberThisPaneRest()
    event.preventDefault()
    event.stopPropagation()
    requestTablePaneFocus(pane)
    if (tablePaneOwnsFocus(pane) && landPaneSurface()) consumePendingTablePane(pane)
  }

  const columnsByKey = useMemo(() => new Map(tableColumns.map((item) => [item.key, item])), [tableColumns])
  const compositeCellKeys = useMemo(() => {
    const keys = new Set<string>()
    if (chrome?.cells) for (const key of Object.keys(chrome.cells)) keys.add(key)
    return keys
  }, [chrome?.cells])

  const {
    renderGroupHead,
    paintHeadTh,
    describeNativeCell,
    renderPortalCellContent,
    onNativeBoolToggle,
    renderPaintCell,
    renderPaintRow,
    renderPaintNode,
  } = createBrowserTablePaint({
    collectionPath,
    activeViewId,
    routeViewId,
    detailId,
    mode,
    sheet,
    embed,
    schema,
    columns: tableColumns,
    columnsByKey,
    chrome,
    currentTable,
    tableIcons,
    groupBy,
    collapsedGroups,
    setCollapsedGroups,
    collapsed,
    setCollapsed,
    treeOn,
    canCreate,
    creatingGroup,
    freezeTitle,
    pinOffsets,
    queryFields,
    resizingCol,
    columnSummaries,
    columnViews,
    openColMenuKey: colHeaderMenu?.col.key ?? null,
    onOpenColMenu: (target) => {
      setColHeaderMenu((prev) =>
        prev && prev.col.key === target.col.key && prev.mode === target.mode ? null : target,
      )
    },
    onReorderColumns: setVisibleColumns,
    pageSize,
    error,
    setGroupPages,
    changePageSize,
    tableHoldRef,
    cellPickRef,
    cellRangeSetRef,
    colWindowRef,
    tablePaintRef,
    listReadySent,
    captureTableFoldSnapshot,
    groupCreateSeed,
    createInGroup,
    startColResize,
    renderCell,
    cellValueText,
    cellPickOf,
    cellFieldWritable,
    recordPick,
    renderRecordActions,
    openRow,
    openRowSplit,
    writePatch,
    writeCellValue,
    items,
    loadTreeKids,
    flattenRows,
  })

  function applySorts(next: SortRule[]) {
    setSorts(next)
    setSortField(next[0]?.field ?? 'title')
    setSortDir(next[0]?.dir ?? 'asc')
  }

  function applyFilterTree(next: FilterGroup) {
    setFilterTree(next)
    if (!countFilterRules(next)) setFilters({})
    // Persist user edits immediately so a refresh cannot restore the old tree
    // during the general view-save debounce.
    if ((!sheet || hasExternalViews) && activeViewId) patchActiveView({ filterTree: next, filters: {} })
  }

  function persistActiveViewNow() {
    if ((sheet && !hasExternalViews) || !hydrated || !activeViewId) return
    if (!routeViewReadyRef.current) return
    if (hydratePath.current !== `${collectionPath}\0${dataPath}`) return
    const current = viewsRef.current.find((view) => view.id === activeViewId)
    if (!current) return
    const liveTree = !countFilterRules(filterTree) ? undefined : filterTree
    const liveFilters = liveTree ? filters : {}
    const next = normalizeSavedView({
      ...current,
      mode,
      sortField,
      sortDir,
      sorts,
      filters: liveFilters,
      filterTree: liveTree,
      columns: columnKeys.length ? pinActionColumn(schema, columnKeys, rowActionColumn) : current.columns,
      groupBy,
      groupConfig,
      tree: showTree,
      wrap: wrapCells,
      truncate: truncateCells,
      rowNumbers: showRowNumbers,
      freezeTitle,
      freezeUntil: freezeUntil || undefined,
      query,
      pageSize,
      columnWidths,
      columnSummaries,
      columnViews,
    })
    if (viewStateKey(current) === viewStateKey(next)) return
    patchActiveView(next)
  }
  persistActiveViewRef.current = persistActiveViewNow

  viewsRef.current = views

  useEffect(() => {
    if (!schema || !collectionPath) {
      hydratePath.current = ''
      return
    }
    const hydrateKey = `${collectionPath}\0${dataPath}`
    if (hydratePath.current === hydrateKey) {
      const routed = pickViewForRoute(paintListedViews(collectionPath), collectionPath, routeViewId)
      if (routed && routed.id !== activeViewIdRef.current) {
        skipPersistGen.current += 1
        adoptListCacheForViewRef.current(dataPath, routed)
        applyView(routed)
      }
      return
    }
    if (tableHoldRef.current || pendingPathQueryRef.current) return
    hydratePath.current = hydrateKey
    if (hasExternalViews) {
      setHydrated(true)
      return
    }
    const listedViewsNow = paintListedViews(collectionPath)
    rememberViews(collectionPath, listedViewsNow)
    if (!sameSavedViews(viewsRef.current, listedViewsNow)) {
      viewsRef.current = listedViewsNow
      setViews(listedViewsNow)
    }
    const view = pickViewForRoute(viewsRef.current, collectionPath, routeViewId)
    if (view) applyView(view)
    setHydrated(true)
  }, [allColumnKeys, collectionPath, dataPath, routeViewId, schema, schemaDefaultKeys])

  useEffect(() => {
    if ((sheet && !hasExternalViews) || !hydrated || !activeViewId) return
    const persistGen = skipPersistGen.current
    const id = window.setTimeout(() => {
      if (persistGen !== skipPersistGen.current) return
      persistActiveViewRef.current()
    }, 350)
    return () => window.clearTimeout(id)
  }, [
    activeViewId,
    collectionPath,
    columnKeys,
    columnWidths,
    columnSummaries,
    columnViews,
    filters,
    filterTree,
    groupBy,
    groupConfig,
    hasExternalViews,
    hydrated,
    mode,
    query,
    pageSize,
    schema,
    showTree,
    sortDir,
    sortField,
    sorts,
    truncateCells,
    wrapCells,
    freezeTitle,
    freezeUntil,
    sheet,
  ])

  const listChromeLock = [
    Number(sheet),
    Number(searchExpanded),
    query,
    Number(viewMenuOpen),
    Number(modeMenuOpen),
    Number(sortMenuOpen),
    Number(filterOpen),
    Number(groupOpen),
    Number(columnMenuOpen),
    Number(configOpen),
    Number(createScopeOpen),
    createScope,
    Number(createTypeOpen),
    createTypePath,
    Number(isDataOverview),
    overviewCreateTables.map((table) => table.path).join(','),
    Number(hasExternalViews),
    Number(localData),
    Number(canCreate),
    Number(canAskNewPlugin),
    Number(refreshing),
    notice,
    activeViewId ?? '',
    views.map((view) => `${view.id}:${view.name}:${view.builtin ? 1 : 0}`).join('\n'),
    lockedSource,
    lockedKind,
    lockedKindLabel,
    mode,
    extraViews.map((item) => item.id).join(','),
    Number(viewsSaveError),
    extraRows.map((item) => item.id).join(','),
    sandboxViews.map((item) => `${item.id}:${item.name}`).join(','),
    Number(sortCustom),
    sortsStateKey(sorts),
    Number(filterActive),
    JSON.stringify(catalogLocks),
    filterEditorStateKey(filterTree),
    Number(grouping),
    groupBy,
    groupConfigStateKey(groupConfig),
    panelGroups.map((g) => `${g.key}:${g.label}:${g.total ?? g.rows.length}`).join('\0'),
    Number(wrapCells),
    Number(truncateCells),
    Number(showRowNumbers),
    Number(showTree),
    Number(freezeTitle),
    pageSize,
    columns.map((col) => col.key).join(','),
    allColumnKeys.join(','),
    schemaFingerprint(schema),
    tagCatalog.map((pack) => pack.id).join(','),
    viewBanner == null ? '' : JSON.stringify(viewBanner),
    activeView?.name ?? title,
    activeView?.mode ?? '',
    pickedIds.join('\n'),
    Number(bulkMenuOpen),
    `${bulkMenuBox.top},${bulkMenuBox.left}`,
  ].join('\0')
  const listChrome = useMemo(
    () => (
      <BrowserListChrome
        sheet={sheet}
        collectionPath={collectionPath}
        title={title}
        activeViewId={activeViewId}
        activeView={activeView}
        views={domainViews}
        viewBanner={viewBanner}
        setViewBanner={setViewBanner}
        commitViewName={commitViewName}
        bindToolbar={bindToolbar}
        viewRef={viewRef}
        viewMenuOpen={viewMenuOpen}
        setViewMenuOpen={setViewMenuOpen}
        toggleMenu={toggleMenu}
        selectView={selectView}
        copyView={copyView}
        deleteView={deleteView}
        persistViewOrder={persistViewOrder}
        addEmptyView={() => addEmptyView()}
        pickedIds={pickedIds}
        setPickedIds={setPickedIds}
        sendPickedRowsToChat={sendPickedRowsToChat}
        canBulkDelete={canBulkDelete}
        inTrash={inTrash}
        items={items}
        setDlg={setDlg}
        bulkRef={bulkRef}
        bulkMenuRef={bulkMenuRef}
        bulkMenuOpen={bulkMenuOpen}
        setBulkMenuOpen={setBulkMenuOpen}
        bulkMenuBox={bulkMenuBox}
        canTag={canTag}
        setBulkTagIds={setBulkTagIds}
        exportPicked={exportPicked}
        lockedKind={lockedKind}
        lockedKindLabel={lockedKindLabel}
        toolbarRightRef={toolbarRightRef}
        searchExpanded={searchExpanded}
        viewsSaveError={viewsSaveError}
        setViewsSaveError={setViewsSaveError}
        query={query}
        setQuery={setQuery}
        setSearchOpen={setSearchOpen}
        searchRef={searchRef}
        searchInputRef={searchInputRef}
        modeRef={modeRef}
        modeMenuOpen={modeMenuOpen}
        setModeMenuOpen={setModeMenuOpen}
        mode={mode}
        setMode={setMode}
        extraViews={extraViews}
        extraRows={extraRows}
        sandboxViews={sandboxViews}
        onCreateSandboxView={createSandboxView}
        patchActiveView={patchActiveView}
        sortRef={sortRef}
        sortMenuOpen={sortMenuOpen}
        setSortMenuOpen={setSortMenuOpen}
        sortCustom={sortCustom}
        sorts={sorts}
        sortFields={sortFields}
        applySorts={applySorts}
        filterRef={filterRef}
        filterOpen={filterOpen}
        setFilterOpen={setFilterOpen}
        filterActive={filterActive}
        filterTree={filterTree}
        filterFields={filterFields}
        filterValueOptions={filterValueOptions}
        applyFilterTree={applyFilterTree}
        groupRef={groupRef}
        groupOpen={groupOpen}
        setGroupOpen={setGroupOpen}
        grouping={grouping}
        activeGroup={activeGroup}
        groupBy={groupBy}
        groupConfig={groupConfig}
        panelGroups={panelGroups}
        groupFields={groupFields}
        setGroupKey={setGroupKey}
        setGroupSettings={setGroupSettings}
        columnRef={columnRef}
        columnMenuOpen={columnMenuOpen}
        setColumnMenuOpen={setColumnMenuOpen}
        renderVisibleColumnsFlyout={renderVisibleColumnsFlyout}
        configRef={configRef}
        configOpen={configOpen}
        setConfigOpen={setConfigOpen}
        schema={schema}
        parentKey={parentKey}
        wrapCells={wrapCells}
        setWrap={setWrap}
        truncateCells={truncateCells}
        setTruncate={setTruncate}
        showRowNumbers={showRowNumbers}
        setRowNumbers={setRowNumbers}
        freezeTitle={freezeTitle}
        setFreezeTitleCol={setFreezeTitleCol}
        showTree={showTree}
        setTree={setTree}
        pageSize={pageSize}
        changePageSize={changePageSize}
        refreshing={refreshing}
        refreshNow={refreshNow}
        notice={notice}
        canCreate={canCreate}
        canAskNewPlugin={canAskNewPlugin}
        createRecord={createRecord}
        isDataOverview={isDataOverview}
        createTypeOpen={createTypeOpen}
        setCreateTypeOpen={setCreateTypeOpen}
        createTypeTable={createTypeTable}
        createTypePath={createTypePath}
        setCreateTypePath={setCreateTypePath}
        overviewCreateTables={overviewCreateTables}
        createScopeOpen={createScopeOpen}
        setCreateScopeOpen={setCreateScopeOpen}
        createScope={createScope}
        setCreateScope={setCreateScope}
        localData={localData}
        hasExternalViews={hasExternalViews}
      />
    ),
    [listChromeLock],
  )

  const listHeaderLock = [
    Number(nested),
    Number(viewsOpen),
    Number(sidebarGone),
    Number(canCreate),
    Number(canAskNewPlugin),
    Number(viewStarred),
    activeViewId ?? '',
    selected?.id ?? '',
    Number(localData),
    detailId ?? '',
    Number(Boolean(detailRow?.builtin)),
    String(detailRow?.title ?? ''),
    Number(layoutOpen),
    Number(inspectorOpen),
    collectionPath,
    title,
    activeView?.name ?? '',
    crumbs.map((crumb) => `${crumb.kind}:${crumb.id}:${crumb.label}`).join('\n'),
    views.map((view) => view.id).join(','),
  ].join('\0')
  const listHeader = useMemo(
    () =>
      nested ? null : (
        <BrowserHeader
          sidebarGone={sidebarGone}
          crumbs={crumbs}
          canCreate={canCreate}
          collectionPath={collectionPath}
          views={domainViews}
          activeViewId={activeViewId}
          activeView={activeView}
          selected={selected}
          detailId={detailId}
          detailRow={detailRow}
          title={title}
          nested={nested}
          localData={localData}
          schema={schema}
          filterFields={filterFields}
          filterValueOptions={filterValueOptions}
          viewStarred={viewStarred}
          layoutOpen={layoutOpen}
          layoutRef={layoutRef}
          inspectorOpen={inspectorOpen}
          pagePrefs={pagePrefs}
          crumbRef={crumbRef}
          onCreateRecord={() => void createRecord()}
          onAddEmptyView={() => addEmptyView()}
          onSelectView={selectView}
          onCrumbTarget={onCrumbTarget}
          onToggleLayout={() => toggleMenu('layout')}
          onCloseLayout={() => setLayoutOpen(false)}
        />
      ),
    [listHeaderLock],
  )

  const holdingRows = Boolean(tableHoldRef.current) && tableHoldRef.current?.nodes !== EMPTY_HOLD_NODES
  if (!holdingRows) {
    tablePaintRef.current = {
      ...tablePaintRef.current,
      colSpan: tablePaintRef.current.colSpan,
      error: tableHoldRef.current ? '' : error,
      renderNode: renderPaintNode,
      renderCell: renderPaintCell,
      renderRow: renderPaintRow,
      describeNativeCell,
      renderPortalCellContent,
      recordPickAttrs: recordPick,
      onNativeBoolToggle,
      compositeCells: compositeCellKeys,
      columnViewStamp: (colKey) => {
        const active = activeColumnSandboxItem(
          columnViews[colKey],
          resolveColumnSandboxItems(colKey, columnViews[colKey], tagCatalogRef.current),
        )
        const pin = pinOffsets?.get(colKey)
        const pinPart = pin ? `${pin.left}:${pin.isEdge ? 1 : 0}` : ''
        const viewPart = active ? `${active.id}\0${active.code}` : ''
        return pinPart || viewPart ? `${viewPart}\0${pinPart}` : ''
      },
      paintSelection: paintCellRangeClasses,
    }
  }
  if (!tableHoldRef.current) {
    tableChromeRef.current = {
      paintHeadTh: (col) => paintHeadTh(col as (typeof columns)[number]),
      onPointerDown: onTablePointerDown,
      onPointerMove: onTablePointerMove,
      onClick: onTableClick,
      onContextMenu: onTableContextMenu,
      onKeyDown: onTableKeyDown,
      onMouseOver: (event) => {
        const hit = event.target as HTMLElement | null
        const tr = hit?.closest('tr')
        if (!tr || !event.currentTarget.contains(tr)) return
        if (tr.closest('thead')) paintCheckHover('head')
        else paintCheckHover(tr.dataset.recordId ?? null)
      },
    }
    tablePaintSnapshotRef.current = {
      columns: tableColumns,
      columnWidths,
      columnPinCount,
      wrapCells,
      truncateCells,
      freezeTitle,
      nodes: tablePaintNodes,
      resetKey: tableResetKey,
      checkLayoutExtra,
    }
  }
  const held = tableHoldRef.current

  return (
    <div
      ref={pageRef}
      className={`fsdb-page tasks-root${nested ? ' inspector-database-page' : ''}${sheet ? ' is-sheet' : ''}${!sheet && pageWidth === 'full' ? ' is-full-width' : ''}${collectionPath === PLUGINS_COLLECTION_PATH ? ' is-plugins' : ''}`}
      data-testid={embed ? 'inspector-database' : sheet ? 'fsdb-collect-sheet' : undefined}
    >
      {!nested ? (
        <DataSidebarPublisher
          tables={tables}
          collectionPath={collectionPath}
          title={title}
          views={views}
          activeViewId={activeViewId}
          onOpenTable={onOpenTable}
          onApplyView={(view) => {
            selectView(view)
            // selectView already navigates to the destination view. Closing via
            // setDetailId would queue onCloseRecord with the previous route.
            setOpenDetailId(null)
            setDetailRow(null)
            setCellPop(null)
          }}
          onDeleteView={deleteView}
          onAddView={addEmptyView}
          onOpenRecord={(path, view, recordId, row) => {
            if (path === collectionPath) {
              applyView(view)
              setOpenDetailId(recordId)
              if (row) setDetailRow(row)
            }
            queueMicrotask(() => onOpenRecord?.(recordId, view.id, path))
          }}
          expandedViewKey={expandedViewKey}
          onExpandedViewKeyChange={onExpandedViewKeyChange}
          onCollapse={toggleViewsOpen}
        />
      ) : null}
      <div className="fsdb-right">
        {listHeader}
        <div className="fsdb-right-body">
        <div
          key={nested ? 'embed' : detailId ?? 'list'}
          className="app-pane-in"
        >
        <BrowserRecordStage
          detailId={detailId}
          selected={selected}
          schema={schema}
          listChrome={listChrome}
          error={error}
          customView={customView}
          rowView={rowView}
          sandboxView={activeSandboxView}
          onPatchSandboxView={patchSandboxView}
          canCreate={canCreate}
          onCreateRecord={createRecord}
          onOpenRowSplit={openRowSplit}
          onReload={() => {
            void reload({ force: true })
          }}
          dataPath={dataPath}
          items={items}
          columns={tableColumns}
          columnWidths={columnWidths}
          columnPinCount={columnPinCount}
          wrapCells={wrapCells}
          truncateCells={truncateCells}
          resizingCol={resizingCol}
          held={held}
          tablePaintNodes={tablePaintNodes}
          pickMode={pickMode}
          tableResetKey={tableResetKey}
          cellViewStamp={columnViewsStamp}
          pickedCount={pickedIds.length}
          checkLayoutExtra={checkLayoutExtra}
          tablePaintRef={tablePaintRef}
          tableChromeRef={tableChromeRef}
          colWindowRef={colWindowRef}
          tableRef={tableRef}
          tableWrapRef={tableWrapRef}
          tableStageRef={tableStageRef}
          checkStackRef={checkStackRef}
          checkHoverRef={checkHoverRef}
          paintCheckHover={paintCheckHover}
          renderCheckHead={renderCheckHead}
          renderCheckRow={renderCheckRow}
          checkStore={checkStore}
          onVisibleRange={onVisibleRange}
          retainedCell={cellPop ? { id: cellPop.id, key: cellPop.key, rowKey: cellPop.rowKey } : null}
          preserveMountedRows={compositeCellKeys.size > 0 && columns.some((col) => compositeCellKeys.has(col.key))}
          grouping={grouping}
          total={total}
          page={page}
          pageSize={pageSize}
          setPage={setPage}
          changePageSize={changePageSize}
          openRow={openRow}
          isDataOverview={isDataOverview}
          chrome={chrome}
          draft={draft}
          detailBody={detailBody}
          detailBodyStatus={detailBodyStatus}
          detailBodyError={detailBodyError}
          refreshOpenDetail={refreshOpenDetail}
          labelOf={labelOf}
          renderCell={renderCell}
          setDraft={setDraft}
          writeOne={writeOne}
          writePatch={writePatch}
          currentTable={currentTable}
          collectionPath={collectionPath}
          localData={localData}
          rowActionColumn={rowActionColumn}
          renderRecordActions={renderRecordActions}
          nested={nested}
          activeViewId={activeViewId}
          detailRow={detailRow}
          title={title}
          canDelete={canDelete}
          onRequestDeleteRecord={(row) => setDlg({ kind: 'delete-record', row })}
          onOpenRecord={onOpenRecord}
          stepViewRecord={stepViewRecord}
          canStepPrev={canStepPrev}
          canStepNext={canStepNext}
          recordKind={recordKind}
          inspectorPaneId={inspectorPaneId}
          visibleColumns={columnKeys.length ? columnKeys : schemaDefaultKeys}
          setVisibleColumns={setVisibleColumns}
          renderVisibleColumnsFlyout={renderVisibleColumnsFlyout}
        />
        </div>
        </div>
      </div>
      <BrowserDialogs
        dlg={dlg}
        setDlg={setDlg}
        collectionPath={collectionPath}
        labelOf={labelOf}
        bulkFields={bulkFields}
        bulkEditKey={bulkEditKey}
        setBulkEditKey={setBulkEditKey}
        bulkEditRaw={bulkEditRaw}
        setBulkEditRaw={setBulkEditRaw}
        bulkTagIds={bulkTagIds}
        setBulkTagIds={setBulkTagIds}
        onDeleteRecord={(row) => void executeDeleteRecord(row)}
        onDeleteRecords={(ids) => void executeDeleteRecords(ids)}
        onBulkEdit={(ids, key, raw) => void executeBulkEdit(ids, key, raw)}
        onBulkTag={(ids, tags) => void executeBulkTag(ids, tags)}
        onExecuteAction={(row, action) => void executeAction(row, action)}
      />
      {colHeaderMenu ? (
        <ColumnHeaderMenu
          target={colHeaderMenu}
          collectionPath={collectionPath}
          activeViewId={activeViewId}
          activeViewName={activeView?.name}
          tagCatalog={tagCatalog}
          isTitle={colHeaderMenu.col.key === (schema?.labelField ?? 'title')}
          canHide={colHeaderMenu.col.key !== (schema?.labelField ?? 'title') && colHeaderMenu.col.key !== 'actions'}
          canSort={sortFields.some((item) => item.key === colHeaderMenu.col.key)}
          canFilter={filterFields.some((item) => item.key === colHeaderMenu.col.key)}
          canGroup={groupFields.some((item) => item.key === colHeaderMenu.col.key)}
          activeSortDir={sorts.find((rule) => rule.field === colHeaderMenu.col.key)?.dir ?? null}
          activeGrouped={groupBy === colHeaderMenu.col.key}
          isFrozenEdge={effectiveFreezeUntil === colHeaderMenu.col.key}
          summaryOp={columnSummaries[colHeaderMenu.col.key] ?? 'none'}
          columnView={columnViews[colHeaderMenu.col.key]}
          onClose={() => setColHeaderMenu(null)}
          onChangeColumnView={(colKey, nextCfg) => {
            const next = { ...columnViewsRef.current }
            const hasActive = Boolean(nextCfg?.activeId && nextCfg.activeId !== 'default')
            const hasItems = Boolean(nextCfg?.items?.length)
            if (!nextCfg || (!hasActive && !hasItems)) delete next[colKey]
            else next[colKey] = nextCfg
            columnViewsRef.current = next
            setColumnViews(next)
            if ((!sheet || hasExternalViews) && activeViewId) patchActiveView({ columnViews: normalizeColumnViews(next) ?? {} })
          }}
          onFilter={(colKey) => {
            const targetField = filterFields.find((item) => item.key === colKey)
            if (targetField) {
              const hasRule = filterTree.children.some((item) => item.kind === 'rule' && item.field === colKey)
              if (!hasRule) {
                applyFilterTree({
                  ...filterTree,
                  children: [...filterTree.children, { ...emptyFilterRule(colKey), op: defaultOpForKind(targetField.kind) }],
                })
              }
            }
            setFilterOpen(true)
          }}
          onSort={(colKey, dir) => {
            if (!dir) {
              applySorts(sorts.filter((rule) => rule.field !== colKey))
              return
            }
            const rest = sorts.filter((rule) => rule.field !== colKey)
            applySorts([{ ...emptySortRule(colKey), dir }, ...rest])
          }}
          onGroup={(colKey) => {
            setGroupKey(groupBy === colKey ? '' : colKey)
          }}
          onSummary={(colKey, op) => {
            const next = { ...columnSummariesRef.current }
            if (op === 'none') delete next[colKey]
            else next[colKey] = op
            columnSummariesRef.current = next
            setColumnSummaries(next)
            if ((!sheet || hasExternalViews) && activeViewId) patchActiveView({ columnSummaries: normalizeColumnSummaries(next) ?? {} })
          }}
          onToggleFreeze={() =>
            setFreezeUntilCol(effectiveFreezeUntil === colHeaderMenu.col.key ? '' : colHeaderMenu.col.key)
          }
          onHide={(colKey) => toggleColumn(colKey)}
        />
      ) : null}
      {renderCellPop()}
      <DockHoverTip />
    </div>
  )
}
