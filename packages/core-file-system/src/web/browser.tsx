import { lazy, memo, Suspense, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TOOLTIP_OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import { computeFloatingPosition } from '@biu/biu-ui/floating-position'
import {
  ArrowsPointingOutIcon,
  Bars3BottomLeftIcon,
  BoltIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  HashtagIcon,
  LockClosedIcon,
  PlusIcon,
  TagIcon,
  ArrowDownTrayIcon,
  ChatBubbleLeftRightIcon,
  GlobeAltIcon,
  UserIcon,
  UsersIcon,
  ViewColumnsIcon,
  TrashIcon,
} from '@heroicons/react/16/solid'
import type { CollectionActionInfo, CollectionInfo, CollectionSchema, CollectionSchemaPack, DbRecord, FieldSpec, FieldType } from '@biu/type-file-system'
import { emitFsdbChange, fsdbRecordChangeReloadsList, normalizeSchemaValue, parseFsdbChange } from '@biu/type-file-system'
import { inspectorPaneAcceptsKeys } from './inspector-pane-cost.ts'
import { subscribeHistoryNavigation } from './history-nav.ts'
import type { CollectionChrome, CollectionRowViewType, CollectionViewType, DatabaseUi } from '@biu/type-file-system/ui'
import { getSidebarPersist, parseAppPath, setSidebarPersist, SIDEBAR_PERSIST } from '@biu/web-session-view'
import { BoolBox } from '@biu/biu-ui/bool-box'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { HeadlessDismiss, HEADLESS_DISMISS_IGNORE } from '@biu/biu-ui/headless-dismiss'
import { TagChip, TagChips, tagTextColor, tagTone as schemaTagTone } from '@biu/biu-ui/tag-chip'
import { tagChipIcon, tagChipLabel, TagFieldChips } from './schema-field.tsx'
import {
  contentFieldKey,
  defaultColumnKeys,
  tagSourceKey,
  flattenTagColumns,
  tagColumnHeadLabel,
  tagColumnTagTip,
  tagColumnTitle,
  fieldEntries,
  flattenTree,
  enumDisplayLabel,
  formatField,
  filterFieldValueOptions,
  groupField,
  groupListKeys,
  mergeListFilters,
  groupRecords,
  groupRowBucketKeys,
  groupableFields,
  isRecordLinkField,
  listProjectionKeys,
  overlayListed,
  parentFieldKey,
  parseTagFlatColumnKey,
  tagFlatColumnKey,
  isTagFlatColumnKey,
  patchTagFlatValue,
  pinActionColumn,
  readTagFlatValue,
  resolveFieldType,
  uniqueValues,
  type GroupBucket,
  type ViewMode,
} from './fields.ts'
import { createdRowGroupKey, placeCreatedRow } from './group-insert.ts'
import { seedGroupRecord } from './group-create.ts'
import { TableEditHistory, tableEditHistoryKey, tableEditHistoryOwned, tableNativeUndoModifier } from './table-edit-history.ts'
import { collectionListCachePath } from './list-cache-scope.ts'
import { listAttributeGroups, listGroupedCollection } from './group-list.ts'
import { TREE_HAS_KIDS, listTreeChildren, listTreeCollection, treeRootFilter } from './tree-list.ts'
import { AppDialog, CheckRow, LocalText } from './controls.tsx'
import { FlyoutEmpty, SearchableFlyout, flyoutQueryMatch } from './flyout-search.tsx'
import { buildCrumbs, crumbHotkeyPane, crumbParentHotkey, parentCrumbTarget, type CrumbTarget } from './sidebar-nav.ts'
import { CrumbTrail } from './crumb-trail.tsx'
import { fieldPickAttrs, fieldPickId, pickDomAttrs, recordPickKind, recordSourcePath } from './pick-dom.ts'
import { normalizeRecordEmoji, recordPreviewEmoji, crumbRecordLabel } from './sidebar-preview.ts'
import { recordPreviewMascot, RecordMark } from './record-mark.tsx'
import { COL_WIDTH_MAX, COL_WIDTH_MIN, applyGroupConfig, canRemoveCollectionView, groupConfigStateKey, normalizeColumnWidths, normalizeGroupConfig, normalizePageSize, normalizeSavedView, rankListedViews, viewIsFresher, viewStateKey, type GroupConfig, type SavedView } from './saved-view.ts'
import { LiveTableCellSelection, tableCursorFromCell, type TableSelectionModel } from './table-cell-selection.ts'
import { startTableColumnResize } from './table-col-resize.ts'
import {
  WindowedTable,
  padColBox,
  windowedColumnsOf,
  type TableCheckStore,
  type TableChromeBag,
  type TablePaintBag,
  type TablePaintNode,
} from './windowed-table.tsx'
import {
  COLLECT_SHEET_COLUMNS,
  COLLECT_SHEET_FETCH_COLUMNS,
  EMPTY_HOLD_NODES,
  LIST_CACHE_MAX,
  LIST_SEED_COLUMNS,
  LISTED_MUTATION_EVENT,
  appendTreeKids,
  bucketsReadyToCache,
  collectSheetColumns,
  collectionFromAppUrl,
  dropListCacheRecords,
  emptyListHold,
  forgetListCache,
  isListColumn,
  listCache,
  listCacheKey,
  listHoldFromCache,
  listHoldResetKey,
  overviewStampOf,
   overlayListedRow,
  patchListCacheRecords,
  peekListCache,
  publishDeletedRowsToTrash,
  publishListedMutation,
  recordsFingerprint,
  remapGroupedRecords,
  rememberListCache,
  retainSavedColumn,
  rowsWithTreeKids,
  sameSavedViews,
  schemaFingerprint,
  seedListCacheSnap,
  toTrashListRow,
  trashRecordId,
  upsertListCacheRecord,
  type ListCacheSnap,
  type ListedMutation,
  type StatResult,
  type TableHoldSnap,
} from './browser-list-cache.ts'
import {
  DockHoverTip,
  PluginSurface,
  RecordOpenControls,
  RecordTitle,
  TableRecordIcon,
  askNewPlugin,
  askNewPresentation,
} from './browser-row-title.tsx'
import { RecordActions, RowCheck } from './browser-row-controls.tsx'
import { BrowserDialogs, type BrowserDialogState } from './browser-dialogs.tsx'
export { WindowedTable } from './windowed-table.tsx'
import { useStickyToolbar } from './sticky-toolbar.ts'
import { useToolbarOverflow } from './toolbar-overflow.ts'
import { PagerSizeControl } from './pager-size.tsx'
import {
  actionIcon,
  ActionCell,
  BoolCell,
  DefaultCell,
  draftFromRecord,
  sameStringDraft,
  fieldActionId,
  FieldGlyph,
  FilePreview,
  ModeGlyph,
  parseFieldValue,
  VIEW_MODES,
  visibleActions,
  placedActions,
} from './fsdb-cells.tsx'
import { ShareRoleLabel, ShareScopeLabel } from './share-scope-label.tsx'
import { ensureFsdbStyle } from './fsdb-style.ts'
import { workspaceColumnsForLocation } from './workspace-columns.ts'
import { PageBanner } from './page-banner.tsx'
import { TableGlyph, UiGlyph, ViewModeGlyph, idleTableIconKind } from './nav-glyphs.tsx'
import { SourceTableCell } from './source-table-cell.tsx'
import {
  DATA_COLLECTION_PATH,
  DATA_MODULE,
  PAGES_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  isIndexCollection,
  isOverviewCreatableCollection,
  isSystemCollection,
} from './database-path.ts'
import {
  ENABLE_PAGE_BLOCK_PLUGIN_EVENT,
  EXPAND_SHELL_SIDEBAR_EVENT,
  FSDB_CHANGE_EVENT,
  FSDB_CRUMB_LABELS_EVENT,
  FSDB_DETAIL_REFRESH_EVENT,
  FSDB_LIST_READY_EVENT,
  FSDB_SHARES_CHANGE_EVENT,
  INSPECTOR_CLOSE_EVENT,
  INSPECTOR_OPEN_EVENT,
  INSPECTOR_TOGGLE_EVENT,
  OPEN_SESSION_EVENT,
  PICK_MODE_EVENT,
  SHELL_LAYOUT_EVENT,
  SHELL_SIDEBAR_WIDTH_EVENT,
  TOGGLE_SHELL_SIDEBAR_EVENT,
} from './fsdb-events.ts'
import { ViewOrderMenu } from './view-order-menu.tsx'
import { getDatabaseUi } from './database-ui.ts'
import {
  activeViewStorageKey,
  fetchSavedView,
  getStarredViews,
  getStarredViewsVersion,
  isViewStarred,
  loadOmittedViewIds,
  loadViews,
  mergeSavedViewLists,
  noteLocalSavedViewsWrite,
  omitSavedViewIds,
  pullSavedViews,
  applyListedCrumbMutation,
  rememberRecords,
  rememberViews,
  removeStarredViews,
  reviveSavedViewIds,
  persistStarredViews,
  persistCollapsedGroups,
  persistViewDisplay,
  loadCollapsedGroups,
  pickViewForRoute,
  defaultViewId,
  pushSavedViews,
  pushSavedViewsPatch,
  stampSavedView,
  diffSavedViews,
  mergeSavedViewsPatch,
  routeViewNeedsFetch,
  subscribeStarredViews,
  toggleStarredView,
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
import { PageContentLoading } from './page-content-status.tsx'
import { ViewPaneMenu } from './pane-more-menu.tsx'
import { HttpError, invalidateListReads, listCollection, readJson } from './db-client.ts'
import { savedViewRecordPath } from '../paths.ts'
import { findViewNeighbor, indexOnPage, locateViewRecord, pageOfIndex, type ViewNeighborQuery } from './view-adjacent.ts'
import { setViaDataCrumbs, viaDataViewId } from './data-chrome.ts'
import { paintCollectionViews } from './collection-nav.ts'
import { TABLE_WINDOW_OVERSCAN, tableColumnWidth, tablePinColClass, tablePinCount, type TableColumnSlice } from './table-window.ts'
import { bindTableDragScroll, tableVertScroller } from './table-drag-scroll.ts'
import { forgetPreviewTotalsForPath, markPaintedListReady, rememberPreviewTotalForView, resetPaintedListReady } from './sidebar-preview.ts'
import { publishDataSidebar, releaseDataSidebar, type DataSidebarLive } from './data-sidebar-host.ts'
import { builtinAllViewId, catalogLockFilters, collectionNoun, displayNameForView, isBuiltinAllViewId, isReadOnlyViewId, mergeTableViews, parseBuiltinScopeViewId, stampRecordId, stampRowOpenTarget, stubBuiltinBlockKindView, viewsForScope, type DataScope } from '../catalog-views.ts'
import { SAVED_VIEW_EVENT, moveInspectorRecordsToTrash, rememberInspectorWorkingView, showRecordInInspector } from './inspector-db-route.ts'
import { CellPop, cellUsesPop } from './cell-pop.tsx'
import { CLEAR_SHELL_TABLE_CELL, FOCUS_SHELL_TABLE, claimTableCellPick, consumePendingTablePane, firstTableTitleCell, formatTableCellsForClipboard, peekPendingTablePane, moveTableCell, readTablePaneRest, rememberTablePaneRest, requestTablePaneFocus, tableActionArrowLeave, tableActionButtons, tableActionButtonStep, tableCellRange, tableCellRangeKey, tableCellRangeRowIds, tableClearKey, tableClearedValue, tableCopyHotkey, tableCreateKey, tableKeyDir, tableKeyFromEditingTarget, tableNavKeys, tablePaneFromEvent, tablePaneHotkey, tablePaneOther, tableSendChatHotkey, tableTitleOpenWhere, tableTreeArrowAction, tableTypeToEditChar, writeClipboardText, type TableCellCursor } from './table-keys.ts'
import { focusRecordTitleNear } from './title-content-nav.ts'
import { isViewCatalogField, selectedViewCatalogOption } from './view-catalog.ts'
import { jumpTag, loadTags, pullTags, subscribeTags } from './tag-catalog.ts'
import {
  collectQueryFields,
  isCustomSorts,
  countFilterRules,
  emptyFilterGroup,
  encodeListFilter,
  filterEditorStateKey,
  filterTreeStateKey,
  matchListFilterRecord,
  seedRecordFromViewFilters,
  moveList,
  normalizeSorts,
  resolveViewFilterTree,
  sortsStateKey,
  type FilterGroup,
  type SortRule,
} from '../query-logic.ts'

const SchemaFieldEditor = lazy(() => import('./schema-field.tsx').then((m) => ({ default: m.SchemaFieldEditor })))
const SortQueryMenu = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.SortQueryMenu })))
const FilterQueryMenu = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.FilterQueryMenu })))
const GroupQueryMenu = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.GroupQueryMenu })))
const QueryFlyout = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.QueryFlyout })))
const FieldValuePop = lazy(() => import('./field-value-pop.tsx').then((m) => ({ default: m.FieldValuePop })))
const CellPopDraft = lazy(() => import('./cell-pop-draft.tsx').then((m) => ({ default: m.CellPopDraft })))
const RecordDetail = lazy(() => import('./record-detail.tsx').then((m) => ({ default: m.RecordDetail })))
const VisibleColumnsFlyout = lazy(() => import('./column-order-menu.tsx').then((m) => ({ default: m.VisibleColumnsFlyout })))
const RecordEmojiBoard = lazy(() => import('@biu/biu-ui/emoji-board').then((m) => ({ default: m.RecordEmojiBoard })))
const LazyShareButton = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.ShareButton })))
const LazySharePanel = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.SharePanel })))
const LazyShareRoleDetail = lazy(() => import('./share-chain-detail.tsx').then((m) => ({ default: m.ShareRoleDetail })))
const LazyShareScopeDetail = lazy(() => import('./share-chain-detail.tsx').then((m) => ({ default: m.ShareScopeDetail })))
const LayoutPrefsMenu = lazy(() => import('./layout-prefs-menu.tsx').then((m) => ({ default: m.LayoutPrefsMenu })))
const CollectionRowsShell = lazy(() => import('./rows-view.tsx').then((m) => ({ default: m.CollectionRowsShell })))

function DataSidebarPublisher(props: DataSidebarLive) {
  useLayoutEffect(() => {
    publishDataSidebar(props)
  })
  useLayoutEffect(() => () => releaseDataSidebar(), [])
  return null
}

function ShareButton(props: ComponentProps<typeof LazyShareButton>) {
  return <Suspense fallback={null}><LazyShareButton {...props} /></Suspense>
}
function SharePanel(props: ComponentProps<typeof LazySharePanel>) {
  return <Suspense fallback={null}><LazySharePanel {...props} /></Suspense>
}
function ShareRoleDetail(props: ComponentProps<typeof LazyShareRoleDetail>) {
  return (
    <Suspense fallback={<ShareRoleLabel label={props.label} />}>
      <LazyShareRoleDetail {...props} />
    </Suspense>
  )
}
function ShareScopeDetail(props: ComponentProps<typeof LazyShareScopeDetail>) {
  return (
    <Suspense fallback={<ShareScopeLabel label={props.label} />}>
      <LazyShareScopeDetail {...props} />
    </Suspense>
  )
}

const EMPTY_VIEWS: CollectionViewType[] = []
const EMPTY_ROW_VIEWS: CollectionRowViewType[] = []
const EMPTY_PICK = {}

let cachedLocalData: boolean | null = null

const QUERY_NEST_IGNORE = `${HEADLESS_DISMISS_IGNORE}, .db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`

const EMPTY_FILTERS: Record<string, string> = {}
/** 与选区拖选同一阈值：位移超过这个距离只当拖，不当点击。 */
const CELL_POP_DRAG_PX = 6
const CELL_POP_IGNORE =
  '.fsdb-row-check, .fsdb-col-resizer, .tasks-row-tools, .tasks-title-open, .fsdb-action-btn, .tasks-row-actions, .fsdb-boolbtn, .fsdb-thumb-btn, .fsdb-thumb, .biu-image, .fsdb-file-tools, .fsdb-ref-chip, .biu-tag-wrap, .db-datetime, .biu-calendar, .fsdb-scope-detail, .fsdb-source-table'
const CELL_RANGE_IGNORE =
  '.fsdb-row-check, .fsdb-col-resizer, .tasks-row-tools, .tasks-title-open, .fsdb-action-btn, .tasks-row-actions, .fsdb-file-tools, .fsdb-scope-detail'

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
  /** 返回 true 则自己处理这一行，不打开本表详情。 */
  onOpenRow?: (row: DbRecord) => boolean
  resolveViews?: (path: string, user: SavedView[]) => SavedView[]
}) {
  ensureFsdbStyle()
  const nested = embed || sheet
  const routeScope: DataScope | null = (() => {
    const builtin = routeViewId ? parseBuiltinScopeViewId(routeViewId) : null
    if (builtin) return builtin.scope
    const stored = routeViewId ? loadViews(collectionPath).find((view) => view.id === routeViewId && !view.builtin) : null
    const scope = stored?.filters?.$scope
    return scope === 'workspace' ? 'workspace' : stored ? 'personal' : null
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
  const [openDetailId, setOpenDetailId] = useState<string | null>(routeRecordId)
  const [detailRow, setDetailRow] = useState<DbRecord | null>(null)
  const [originNav, setOriginNav] = useState<OriginViewNav | null>(null)
  const [detailBody, setDetailBody] = useState<unknown>(null)
  const [detailBodyStatus, setDetailBodyStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [detailBodyError, setDetailBodyError] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [acting, setActing] = useState(false)
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
  const [createScopeOpen, setCreateScopeOpen] = useState(false)
  const [createTypePath, setCreateTypePath] = useState(PAGES_COLLECTION_PATH)
  const [createTypeOpen, setCreateTypeOpen] = useState(false)
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
  const [pageSize, setPageSize] = useState(() => normalizePageSize(initialView?.pageSize))
  const [total, setTotal] = useState(() => peekBrowserCache(dataPath, routeViewId)?.total ?? 0)
  const [fetchQuery, setFetchQuery] = useState(initialView?.query ?? '')
  const [mode, setMode] = useState<ViewMode>(initialView?.mode ?? 'table')
  const customView = extraViews.find((view) => view.id === mode)
  const rowView = customView ? undefined : extraRows.find((view) => view.id === mode)
  const [sortField, setSortField] = useState(initialView?.sortField ?? 'title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialView?.sortDir ?? 'asc')
  const [sorts, setSorts] = useState<SortRule[]>(() =>
    normalizeSorts(initialView?.sorts, initialView?.sortField ?? 'title', initialView?.sortDir ?? 'asc'),
  )
  const [filters, setFilters] = useState<Record<string, string>>(initialView?.filters ?? {})
  const [filterTree, setFilterTree] = useState<FilterGroup>(() => resolveViewFilterTree(initialView ?? { filters: {} }))
  const [columnKeys, setColumnKeys] = useState<string[]>(
    sheet
      ? collectSheetColumns(loadTags().find((pack) => pack.id === String(lockedFilters.tagId ?? '').trim()))
      : initialView?.columns ?? [],
  )
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => normalizeColumnWidths(initialView?.columnWidths))
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
  useEffect(() => {
    const keysLive = () => inspectorPaneAcceptsKeys(embed, pageRef.current)
    const onTableNavKey = (event: KeyboardEvent) => {
      if (!keysLive()) return
      tableNavLiveRef.current(event)
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
    window.addEventListener('keydown', onPaneHotkey, true)
    window.addEventListener('keydown', onCrumbBack, true)
    window.addEventListener(FOCUS_SHELL_TABLE, onFocusTable)
    window.addEventListener(CLEAR_SHELL_TABLE_CELL, onCellClaim)
    window.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onTableNavKey)
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
  const [views, setViews] = useState<SavedView[]>(() => paintListedViews(collectionPath))
  const [viewsSaveError, setViewsSaveError] = useState(false)
  const [activeViewId, setActiveViewId] = useState<string | null>(initialView?.id ?? null)
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
      onOpenRecord?.(jump.recordId, activeViewId, jump.collection)
      return
    }
    if (onOpenRow?.(row)) return
    setDetailId(row.id, row)
  }
  const openRowSplit = (row: DbRecord) => {
    const jump = chrome?.openRow?.(row)
    const fromData = isDataOverview || crumbFromData
    if (fromData) setViaDataCrumbs(true, isDataOverview ? activeViewId : viaDataViewId())
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
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  useLayoutEffect(() => {
    if (!bulkMenuOpen) return
    const place = () => {
      const el = bulkRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setBulkMenuBox({ top: rect.bottom + 6, left: rect.left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [bulkMenuOpen])
  const [wrapCells, setWrapCells] = useState(!!initialView?.wrap)
  const [truncateCells, setTruncateCells] = useState(initialView?.truncate !== false)
  const [freezeTitle, setFreezeTitle] = useState(Boolean(initialView?.freezeTitle))
  const [groupBy, setGroupBy] = useState(initialView?.groupBy ?? '')
  const [groupConfig, setGroupConfig] = useState<GroupConfig | undefined>(() => normalizeGroupConfig(initialView?.groupConfig))
  const [showTree, setShowTree] = useState(Boolean(initialView?.tree))
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
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    const tbody = tableRef.current?.tBodies[0]
    if (!tbody) return
    const snap = new Map<string, number>()
    for (const tr of tbody.rows) {
      const key = tr.dataset.rowKey ?? (tr.dataset.groupKey ? `gh:${tr.dataset.groupKey}` : tr.dataset.groupPager ? `gp:${tr.dataset.groupPager}` : '')
      if (key) snap.set(key, tr.getBoundingClientRect().top)
    }
    if (snap.size) tableFoldFlipRef.current = snap
  }
  useLayoutEffect(() => {
    const prev = tableFoldFlipRef.current
    if (!prev) return
    tableFoldFlipRef.current = null
    const tbody = tableRef.current?.tBodies[0]
    if (!tbody) return
    const easing = 'cubic-bezier(0.22, 1, 0.36, 1)'
    for (const tr of tbody.rows) {
      if (typeof tr.animate !== 'function') break
      const key = tr.dataset.rowKey ?? (tr.dataset.groupKey ? `gh:${tr.dataset.groupKey}` : tr.dataset.groupPager ? `gp:${tr.dataset.groupPager}` : '')
      if (!key) continue
      const oldTop = prev.get(key)
      if (oldTop != null) {
        const deltaY = oldTop - tr.getBoundingClientRect().top
        if (Math.abs(deltaY) >= 1 && Math.abs(deltaY) < 2400) {
          tr.animate(
            [{ transform: `translate3d(0, ${deltaY}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
            { duration: 180, easing },
          )
        }
      } else {
        tr.animate(
          [
            { opacity: 0, transform: 'translate3d(0, -6px, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          ],
          { duration: 180, easing },
        )
      }
    }
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
      const snap = listHoldFromCache(cached, view, path)
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
    tableHoldRef.current = tablePaintSnapshotRef.current ?? emptyListHold(tablePaintSnapshotRef.current, view, path)
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
    const next = stored || listed[0] ? pickViewForRoute(listed, collectionPath, routeViewId) || stored || listed[0] : null
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
      setMode(view.mode)
      setSortField(view.sortField)
      setSortDir(view.sortDir)
      setSorts(normalizeSorts(view.sorts, view.sortField, view.sortDir))
      setFilters(view.filters)
      setFilterTree(resolveViewFilterTree(view))
      setColumnKeys(
        pinActionColumn(schema, view.columns, placedActions(schema, 'row').length > 0),
      )
      setColumnWidths(normalizeColumnWidths(view.columnWidths))
      setGroupBy(view.groupBy ?? '')
      setGroupConfig(normalizeGroupConfig(view.groupConfig))
      setShowTree(view.tree !== false)
      setWrapCells(!!view.wrap)
      setTruncateCells(view.truncate !== false)
      setQuery(view.query ?? '')
      setFetchQuery(view.query ?? '')
      setPageSize(normalizePageSize(view.pageSize))
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
      setCollapsedGroups(loadCollapsedGroups(dataPath, next.id, next.groupBy ?? ''))
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
  const loadedPagesRef = useRef<Record<string, number>>({})
  const sheetPackId = String(catalogLocks.tagId ?? '').trim()
  const sheetPack = useMemo(
    () => (sheet && sheetPackId ? tagCatalog.find((pack) => pack.id === sheetPackId) : undefined),
    [sheet, sheetPackId, tagCatalog],
  )
  const listColumns = useMemo(() => {
    if (sheet) {
      return listProjectionKeys({
        schema: stat?.schema,
        columns: [...COLLECT_SHEET_FETCH_COLUMNS, ...collectSheetColumns(sheetPack).filter((key) => key !== 'title' && key !== 'table')],
        groupBy,
      })
    }
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const noticeTimer = useRef<number>(0)
  const quietUntil = useRef(0)
  const reloadGen = useRef(0)
  const reloadInflightRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null)
  const listReadySent = useRef(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const [pickMode, setPickMode] = useState(false)
  const confirmedCreates = useRef(new Set<string>())
  const hydratePath = useRef('')
  const viewsRef = useRef<SavedView[]>([])
  const skipPersistGen = useRef(0)
  const viewsWriteGenRef = useRef(0)
  const persistActiveViewRef = useRef<() => void>(() => {})
  const activeViewIdRef = useRef<string | null>(null)
  const routeViewIdRef = useRef<string | undefined>(routeViewId)
  routeViewIdRef.current = routeViewId
  const pendingSelectViewRef = useRef<{ path: string; id: string } | null>(null)
  const syncViewsRef = useRef<() => Promise<void>>(async () => {})
  const adoptViewRef = useRef<(view: SavedView) => void>(() => undefined)
  const hydratedDetail = useRef('')
  const [dlg, setDlg] = useState<BrowserDialogState>(null)
  const [bulkEditKey, setBulkEditKey] = useState('')
  const [bulkEditRaw, setBulkEditRaw] = useState('')
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([])
  const crumbRef = useRef<HTMLElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const bindToolbar = useToolbarOverflow(toolbarRef)
  const toolbarRightRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const bulkRef = useRef<HTMLDivElement>(null)
  const bulkMenuRef = useRef<HTMLDivElement>(null)
  const [bulkMenuBox, setBulkMenuBox] = useState({ top: 0, left: 0 })
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
  }, [pickedIds.length])

  function toggleMenu(which: 'view' | 'mode' | 'sort' | 'columns' | 'filter' | 'config' | 'group' | 'layout') {
    setViewMenuOpen(which === 'view' && !viewMenuOpen)
    setModeMenuOpen(which === 'mode' && !modeMenuOpen)
    setSortMenuOpen(which === 'sort' && !sortMenuOpen)
    setColumnMenuOpen(which === 'columns' && !columnMenuOpen)
    setFilterOpen(which === 'filter' && !filterOpen)
    setConfigOpen(which === 'config' && !configOpen)
    setGroupOpen(which === 'group' && !groupOpen)
    setLayoutOpen(which === 'layout' && !layoutOpen)
    setBulkMenuOpen(false)
  }

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
  const reloadKey = `${listIdentityKey}\0${groupBy ? JSON.stringify(groupPages) : page}\0${groupFillKeys.join('\0')}`
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
        setMode(view.mode)
        setSortField(view.sortField)
        setSortDir(view.sortDir)
        setSorts(pendingView.sorts)
        setFilters(view.filters)
        setFilterTree(resolveViewFilterTree(view))
        setColumnKeys(
          pinActionColumn(nextSchema, view.columns, placedActions(nextSchema, 'row').length > 0),
        )
        setColumnWidths(normalizeColumnWidths(view.columnWidths))
        setGroupBy(pendingView.groupBy)
        setGroupConfig(normalizeGroupConfig(view.groupConfig))
        setShowTree(Boolean(view.tree))
        setWrapCells(pendingView.wrapCells)
        setTruncateCells(view.truncate !== false)
        setFreezeTitle(Boolean(view.freezeTitle))
        setQuery(pendingView.fetchQuery)
        setFetchQuery(pendingView.fetchQuery)
        setPageSize(pendingView.pageSize)
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
      setGroupBuckets((prev) => (JSON.stringify(prev) === JSON.stringify(nextBuckets) ? prev : nextBuckets))
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
  const pendingFieldWritesRef = useRef(new Map<string, Map<string, { value: unknown; count: number }>>())
  const applyPendingDetailPatches = useCallback((row: DbRecord): DbRecord => {
    const bag = pendingFieldWritesRef.current.get(row.id)
    if (!bag || bag.size === 0) return row
    const patch: Record<string, unknown> = {}
    for (const [key, entry] of bag) patch[key] = entry.value
    return overlayListedRow(row, { ...row, ...patch })
  }, [])
  const contentGen = useRef(0)
  const contentVersions = useRef(new Map<string, number>())
  const contentWriteGens = useRef(new Map<string, number>())
  const contentWriteQueues = useRef(new Map<string, Promise<void>>())
  const fieldWriteQueues = useRef(new Map<string, Promise<void>>())
  const contentWritePending = useRef(new Map<string, number>())
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
        if (gen !== contentGen.current || (contentWritePending.current.get(path) ?? 0) > 0) return
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
      .catch(() => undefined)
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
      const pendingSelect = pendingSelectViewRef.current
      if (pendingSelect && pendingSelect.path === collectionPath) {
        if (routeViewId === pendingSelect.id) {
          pendingSelectViewRef.current = null
        } else {
          return
        }
      }
      adoptRoutedView()
      return
    }
    pendingSelectViewRef.current = null
    hydratePath.current = ''
    loadedIdentityRef.current = ''
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
    const stored = viewForPath(collectionPath, routeViewId)
    const listed = paintListedViews(collectionPath)
    rememberViews(collectionPath, listed)
    if (stored || listed[0]) {
      const next = pickViewForRoute(listed, collectionPath, routeViewId) || stored || listed[0]
      setViews((prev) => (sameSavedViews(prev, listed) ? prev : listed))
      if (next) {
        setActiveViewId(next.id)
        setMode(next.mode)
        setSortField(next.sortField)
        setSortDir(next.sortDir)
        setSorts(normalizeSorts(next.sorts, next.sortField, next.sortDir))
        setFilters(next.filters)
        setFilterTree(resolveViewFilterTree(next))
        setColumnKeys(
          pinActionColumn(
            cached?.stat?.schema,
            next.columns,
            placedActions(cached?.stat?.schema, 'row').length > 0,
          ),
        )
        setColumnWidths(normalizeColumnWidths(next.columnWidths))
        setGroupBy(next.groupBy ?? '')
        setGroupConfig(normalizeGroupConfig(next.groupConfig))
        setShowTree(next.tree !== false)
        setWrapCells(!!next.wrap)
        setTruncateCells(next.truncate !== false)
        setQuery(next.query ?? '')
        setFetchQuery(next.query ?? '')
        setPageSize(normalizePageSize(next.pageSize))
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
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [dataPath, routeRecordId])

  useEffect(() => {
    if (routeRecordId) void import('./record-detail.tsx')
  }, [routeRecordId])

  useEffect(() => {
    const needsLoad =
      loadedIdentityRef.current !== listIdentityKey ||
      Boolean(tableHoldRef.current) ||
      Boolean(pendingPathQueryRef.current) ||
      !listReadySent.current
    if (skipColumnReload.current) {
      skipColumnReload.current = false
      if (!needsLoad) return
    }
    if (routeRecordId) return
    if (!routeViewReadyRef.current && !pendingPathQueryRef.current && !tableHoldRef.current) return
    void reloadRef.current({ force: needsLoad, reuseGroups: !needsLoad })
  }, [listIdentityKey, reloadKey, routeRecordId, routeViewReady])

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
  const subsetLocked = lockedFilterKeys.length > 0
  const isDataOverview = dataPath === DATA_COLLECTION_PATH
  const overviewCreateTables = useMemo(
    () => tables.filter((table) => isOverviewCreatableCollection(table.path)),
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
    () => workspaceColumnsForLocation([
      ...entries.filter((item) => isListColumn(item.key) && item.key !== bodyKey && resolveFieldType(item.field) !== 'file'),
      ...(rowActionColumn
        ? [{ key: 'actions', kind: 'action' as const, field: { type: 'action' as const, label: '动作' } }]
        : []),
      ...flattenTagColumns(tagCatalog),
    ], localData),
    [bodyKey, entries, tagCatalog, localData, rowActionColumn],
  )
  const allColumnKeys = useMemo(() => allColumns.map((item) => item.key), [allColumns])
  const schemaDefaultKeys = useMemo(
    () => pinActionColumn(schema, defaultColumnKeys(schema, allColumnKeys.filter((key) => key !== 'actions')), rowActionColumn),
    [allColumnKeys, rowActionColumn, schema],
  )
  const schemaDefaultSig = schemaDefaultKeys.join('\0')
  const columns = useMemo(() => {
    if (sheet) {
      const requested = columnKeys.length ? columnKeys : collectSheetColumns(sheetPack)
      const packCols = flattenTagColumns(sheetPack ? [sheetPack] : [])
      return requested
        .map((key) => {
          if (key === 'title') return { key, kind: 'string' as const, field: { type: 'string' as const, label: '记录' } }
          if (key === 'table') return { key, kind: 'string' as const, field: { type: 'string' as const, label: '来源表' } }
          const hit = packCols.find((item) => item.key === key)
          if (hit) return { key: hit.key, kind: hit.kind, field: { ...hit.field, label: hit.field.label ?? hit.key }, packId: hit.packId }
          return null
        })
        .filter(Boolean) as typeof allColumns
    }
    const requested = columnKeys.length ? columnKeys : schemaDefaultKeys
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
        const tag = parseTagFlatColumnKey(key)
        if (tag) {
          const pack = tagCatalog.find((entry) => entry.id === tag.packId)
          return { key, kind: 'select' as const, field: { type: 'select' as const, label: tag.fieldKey }, packId: tag.packId, packLabel: pack?.label }
        }
        return null
      })
      .filter(Boolean) as typeof allColumns
  }, [allColumnKeys, allColumns, columnKeys, rowActionColumn, schema, schemaDefaultKeys, sheet, sheetPack, tagCatalog])

  const colWindowRef = useRef<TableColumnSlice>(EMPTY_COL_WINDOW)
  const tableChromeRef = useRef<TableChromeBag>({
    paintHeadTh: () => null,
    onPointerDown: undefined,
    onPointerMove: undefined,
    onClick: undefined,
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
    const heads = Array.from((sourceTable ?? mainTable).querySelectorAll('thead th:not(.fsdb-col-pad)'))
    const startX = event.clientX
    const snapshot: Record<string, number> = {}
    const windowed = windowedColumnsOf(columns, colWindowRef.current)
    for (let i = 0; i < windowed.length; i += 1) {
      const key = windowed[i]!.key
      const measured = heads[i]?.getBoundingClientRect().width ?? 120
      snapshot[key] = Math.round(measured)
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
    if (!sheet) return
    const defaults = collectSheetColumns(sheetPack)
    setColumnKeys((prev) => {
      const packKeys = defaults.filter((key) => key !== 'title' && key !== 'table')
      const kept = prev.filter((key) => key === 'title' || key === 'table' || packKeys.includes(key))
      const added = packKeys.filter((key) => !kept.includes(key))
      const next = kept.length ? [...kept, ...added] : defaults
      if (next.length === prev.length && next.every((key, index) => key === prev[index])) return prev
      return next
    })
  }, [sheet, sheetPack])
  useEffect(() => {
    if (sheet) return
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
        for (const item of listed) {
          nodes.push({
            kind: 'row',
            key: `${groupKey}:${item.row.id}`,
            keyPrefix: `${group.key}:`,
            row: item.row,
            depth: item.depth,
            hasKids: item.hasKids,
            kidCount: item.kidCount,
            fold: collapsed[item.row.id] !== false,
            treeOn,
          })
        }
        nodes.push({
          kind: 'group-pager',
          key: `gp:${groupKey}`,
          groupKey,
          count,
          pageIndex,
        })
      }
      return nodes
    }
    const listed = flattenRows(visible)
    if (!listed.length) {
      nodes.push({ kind: 'empty', key: 'empty' })
      return nodes
    }
    for (const item of listed) {
      nodes.push({
        kind: 'row',
        key: item.row.id,
        keyPrefix: '',
        row: item.row,
        depth: item.depth,
        hasKids: item.hasKids,
        kidCount: item.kidCount,
        fold: collapsed[item.row.id] !== false,
        treeOn,
      })
    }
    return nodes
  }, [collapsed, collapsedGroups, flattenRows, groupPages, grouped, grouping, pageSize, treeOn, visible])
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
  const columnPinCount = tablePinCount(columns.map((col) => col.key), schema?.labelField, freezeTitle)
  const tableResetKey = `${activeViewId ?? ''}\0${collectionPath}\0${groupBy}\0${page}\0${pageSize}\0${query}`
  const checkLayoutExtra = [
    grouping ? 1 : 0,
    page,
    pageSize,
    detailId ?? '',
    pickedIds.join(','),
    items.map((row) => row.id).join(','),
    grouped.map((group) => `${group.key}:${group.rows.length}`).join(','),
    JSON.stringify(collapsed),
    JSON.stringify(collapsedGroups),
    JSON.stringify(columnWidths),
  ].join('\0')

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

  const checkDrawRef = useRef({
    renderHead: () => <RowCheck ids={pickableIds} pickedIds={pickedIds} onTogglePicked={togglePicked} />,
    renderRow: (id: string) => <RowCheck id={id} pickedIds={pickedIds} onTogglePicked={togglePicked} />,
    hasPicked: () => pickedIds.length > 0,
  })
  checkDrawRef.current.renderHead = () => <RowCheck ids={pickableIds} pickedIds={pickedIds} onTogglePicked={togglePicked} />
  checkDrawRef.current.renderRow = (id: string) => <RowCheck id={id} pickedIds={pickedIds} onTogglePicked={togglePicked} />
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
  const activeView = views.find((view) => view.id === activeViewId)
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

  function adoptPersistedViews(path: string, listed: SavedView[], removed?: string[]) {
    const merged = rankListedViews(
      listedViews(path, mergeSavedViewLists(loadViews(path), listed, removed)).map((view) => withViewDisplay(path, view)),
      listed,
    )
    rememberViews(path, merged)
    noteLocalSavedViewsWrite(path)
    if (path === collectionPath) {
      viewsRef.current = merged
      setViews(merged)
    }
    emitFsdbChange({ scope: 'views' })
    window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
  }

  async function persistViewsFor(
    path: string,
    next: SavedView[],
    extra?: { baseline?: SavedView[]; upsert?: SavedView[]; remove?: string[] },
  ) {
    if (sheet) return true
    const forced = extra?.upsert ?? []
    if (extra?.remove?.length) omitSavedViewIds(path, extra.remove)
    if (forced.length) reviveSavedViewIds(path, forced.map((view) => view.id))
    const incoming = [
      ...next.filter((view) => !forced.some((item) => item.id === view.id)),
      ...forced,
    ]
    for (const view of incoming) persistViewDisplay(path, view.id, view)
    const listed = rankListedViews(
      listedViews(path, incoming).map((view) => {
        const painted = withViewDisplay(path, view)
        return Number.isFinite(Number(view.rank)) ? { ...painted, rank: Math.round(Number(view.rank)) } : painted
      }),
      incoming,
    )
    const stored = listed
    const previous = extra?.baseline ?? loadViews(path)
    // 只推这次改过的条目。快照里少了的视图不能当成删除——侧栏新加的视图经常不在中间栏那份 viewsRef 里。
    const patch = mergeSavedViewsPatch(
      { upsert: diffSavedViews(previous, stored).upsert, remove: [] },
      {
        upsert: forced.map((view) => stampSavedView(view)),
        remove: extra?.remove,
      },
    )
    const stamped = (patch.upsert ?? []).map((view) => stampSavedView(view))
    const stampById = new Map(stamped.map((view) => [view.id, view]))
    const adopted = listed.map((view) => stampById.get(view.id) ?? view)
    const gen = ++viewsWriteGenRef.current
    const result = await pushSavedViewsPatch(path, { ...patch, upsert: stamped })
    const intended = Boolean(forced.length || extra?.remove?.length)
    if (result === 'failed' || (result === 'skipped' && intended)) {
      if (gen === viewsWriteGenRef.current) setViewsSaveError(true)
      return false
    }
    if (gen !== viewsWriteGenRef.current) return false
    if (result === 'skipped') return true
    if (extra?.remove?.length) removeStarredViews(path, extra.remove)
    noteLocalSavedViewsWrite(path)
    const pulled = await pullSavedViews([path], { force: true })
    if (gen !== viewsWriteGenRef.current) return false
    if (pulled === false) adoptPersistedViews(path, adopted, extra?.remove)
    else {
      const listedNow = rankListedViews(
        listedViews(
          path,
          mergeSavedViewLists(loadViews(path), adopted, extra?.remove),
        ).map((view) => {
          const painted = withViewDisplay(path, view)
          const forcedView = stampById.get(view.id)
          return forcedView ? { ...painted, name: forcedView.name, updatedAt: forcedView.updatedAt } : painted
        }),
        adopted,
      )
      rememberViews(path, listedNow)
      if (path === collectionPath) {
        viewsRef.current = listedNow
        setViews(listedNow)
      }
      emitFsdbChange({ scope: 'views' })
      window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
    }
    setViewsSaveError(false)
    return true
  }

  function persistViews(next: SavedView[]) {
    return persistViewsFor(collectionPath, next)
  }

  function persistViewOrder(ids: string[]) {
    const current = viewsRef.current
    // persistViewsFor 用 loadViews 当 baseline 算差异。先 rememberViews 的话
    // baseline 已经是新顺序，patch 会 skipped，库里的 rank 永远不更新。
    const baseline = loadViews(collectionPath)
    const byId = new Map(current.map((view) => [view.id, view]))
    const ranked: SavedView[] = []
    ids.forEach((id, rank) => {
      const view = byId.get(id)
      if (!view) return
      ranked.push({ ...view, rank })
      byId.delete(id)
    })
    for (const view of current) {
      if (byId.has(view.id)) ranked.push(view)
    }
    const next = rankListedViews(ranked, ranked)
    for (const view of next) persistViewDisplay(collectionPath, view.id, { rank: view.rank })
    viewsRef.current = next
    setViews(next)
    rememberViews(collectionPath, next)
    noteLocalSavedViewsWrite(collectionPath)
    void persistViewsFor(collectionPath, next, { baseline }).then((ok) => {
      if (ok || viewsRef.current !== next) return
      for (const view of current) persistViewDisplay(collectionPath, view.id, { rank: view.rank })
      viewsRef.current = current
      setViews(current)
      rememberViews(collectionPath, current)
    })
  }

  function persistViewsWith(
    path: string,
    next: SavedView[],
    extra?: { baseline?: SavedView[]; upsert?: SavedView[]; remove?: string[] },
  ) {
    return persistViewsFor(path, next, extra)
  }

  function rememberActiveView(id: string) {
    activeViewIdRef.current = id
    setActiveViewId(id)
    if (nested) return
    try {
      localStorage.setItem(activeViewStorageKey(collectionPath), id)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (nested || sheet || !collectionPath || !activeViewId) return
    try {
      localStorage.setItem(activeViewStorageKey(collectionPath), activeViewId)
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
      freezeTitle === Boolean(next.freezeTitle) &&
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
    setMode(next.mode)
    setSortField(next.sortField)
    setSortDir(next.sortDir)
    setSorts(normalizeSorts(next.sorts, next.sortField, next.sortDir))
    setFilters(next.filters)
    setFilterTree(resolveViewFilterTree(next))
    setColumnKeys(nextColumns)
    setColumnWidths(normalizeColumnWidths(next.columnWidths))
    setGroupBy(nextGroup)
    setGroupConfig(normalizeGroupConfig(next.groupConfig))
    setShowTree(Boolean(next.tree))
    setWrapCells(!!next.wrap)
    setTruncateCells(next.truncate !== false)
    setFreezeTitle(Boolean(next.freezeTitle))
    setQuery(nextQuery)
    setFetchQuery(nextQuery)
    setPageSize(nextPageSize)
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
    const pendingSelect = pendingSelectViewRef.current
    const activeId = (pendingSelect?.path === targetPath ? pendingSelect.id : null) ?? activeViewIdRef.current
    rememberViews(targetPath, listed)
    viewsRef.current = listed
    setViews(listed)
    const nextView =
      pickViewForRoute(listed, targetPath, activeId ?? routeViewIdRef.current ?? undefined) ?? listed[0]
    const prevView = activeId ? prev.find((item) => item.id === activeId) : undefined
    if (!nextView) return
    if (prevView && viewStateKey(normalizeSavedView(prevView)) === viewStateKey(normalizeSavedView(nextView))) return
    skipPersistGen.current += 1
    applyView(nextView)
  }

  function selectView(view: SavedView) {
    pendingSelectViewRef.current = onOpenView && routeViewId !== view.id ? { path: collectionPath, id: view.id } : null
    persistActiveViewRef.current()
    if (view.id !== activeViewIdRef.current) {
      pendingPathQueryRef.current = null
      reloadGen.current += 1
      adoptListCacheForViewRef.current(dataPath, view)
      applyView(view)
    } else {
      setViewMenuOpen(false)
    }
    rememberInspectorWorkingView(collectionPath, view.id)
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
    if (!viewMenuOpen) return
    void syncViewsRef.current()
  }, [viewMenuOpen])

  function newSavedViewId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  async function commitView(view: SavedView) {
    const painted = paintListedViews(collectionPath)
    const next = { ...view, rank: Number.isFinite(Number(view.rank)) ? view.rank : painted.length }
    const ok = await persistViewsWith(
      collectionPath,
      [...painted.filter((item) => item.id !== next.id), next],
      { upsert: [next] },
    )
    if (!ok) return
    selectView(next)
  }

  function uniqueViewName(base: string, listed: SavedView[] = paintListedViews(collectionPath)) {
    const names = new Set(listed.map((item) => item.name))
    if (base === '新视图') return base
    if (!names.has(base)) return base
    let n = 2
    while (names.has(`${base} ${n}`)) n += 1
    return `${base} ${n}`
  }

  function addEmptyView(path = collectionPath, scope?: DataScope) {
    const target = path || collectionPath
    const effectiveScope = scope ?? (target === collectionPath ? routeScope ?? undefined : undefined)
    const stored = loadViews(target)
    const allListed = listedViews(target, stored)
    const listed = target === collectionPath
      ? paintListedViews(target)
      : effectiveScope
        ? viewsForScope(allListed, effectiveScope)
        : allListed
    const view: SavedView = {
      id: newSavedViewId(),
      name: uniqueViewName('新视图', listed),
      mode: 'table',
      sortField: 'title',
      sortDir: 'asc',
      filters: { ...catalogLocks, ...(effectiveScope ? { $scope: effectiveScope } : {}) },
      columns: target === collectionPath ? [...schemaDefaultKeys] : [],
      groupBy: '',
      tree: false,
      freezeTitle: false,
      wrap: false,
      truncate: true,
      query: '',
      rank: listed.length,
    }
    const nextStored = mergeSavedViewLists(stored, [view])
    rememberViews(target, nextStored)
    if (target === collectionPath) {
      const painted = paintListedViews(target)
      viewsRef.current = painted
      setViews(painted)
    }
    emitFsdbChange({ scope: 'views' })
    void persistViewsFor(target, [...listed.filter((item) => item.id !== view.id), view], {
      upsert: [view],
      baseline: stored,
    }).then((ok) => {
      if (!ok) {
        rememberViews(target, stored)
        if (target === collectionPath) {
          const painted = paintListedViews(target)
          viewsRef.current = painted
          setViews(painted)
        }
        emitFsdbChange({ scope: 'views' })
        return
      }
      if (target === collectionPath) {
        selectView(view)
        return
      }
      try {
        localStorage.setItem(activeViewStorageKey(target), view.id)
      } catch {
        /* ignore */
      }
      onOpenTable?.(target, view.id)
    })
  }

  function copyView(source?: SavedView) {
    commitView(
      source
        ? { ...source, id: newSavedViewId(), name: uniqueViewName(`${source.name} 副本`), builtin: false }
        : {
            id: newSavedViewId(),
            name: uniqueViewName(`${activeView?.name ?? title} 副本`),
            mode,
            sortField,
            sortDir,
            sorts,
            filters: { ...catalogLocks },
            filterTree,
            columns: columnKeys,
            groupBy,
            groupConfig,
            tree: showTree,
            wrap: wrapCells,
            truncate: truncateCells,
            freezeTitle,
            query,
            columnWidths,
          },
    )
  }

  function patchActiveView(patch: Partial<SavedView>) {
    if (!activeViewId) return
    const current = views.find((view) => view.id === activeViewId)
    if (!current) return
    persistViews(views.map((view) => (view.id === activeViewId ? { ...view, ...patch } : view)))
  }

  function commitViewName(viewId: string, raw: string) {
    const nextName = raw.trim()
    if (!nextName) return
    const current = viewsRef.current
    const target = current.find((item) => item.id === viewId)
    if (!target || target.name === nextName) return
    if (current.some((item) => item.id !== viewId && item.name === nextName)) return
    const updated = stampSavedView({ ...target, name: nextName })
    const listed = current.map((item) => (item.id === viewId ? updated : item))
    viewsRef.current = listed
    setViews(listed)
    rememberViews(collectionPath, listed)
    persistViewDisplay(collectionPath, viewId, { name: nextName })
    const stars = getStarredViews()
    if (isViewStarred(stars, collectionPath, viewId)) {
      persistStarredViews(stars.map((item) => (item.path === collectionPath && item.viewId === viewId ? { ...item, name: nextName } : item)))
    }
    emitFsdbChange({ scope: 'views' })
    window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
    if (isReadOnlyViewId(viewId)) return
    void persistViewsWith(collectionPath, listed, { upsert: [updated], baseline: current }).then((ok) => {
      if (ok) return
      const live = viewsRef.current
      const liveTarget = live.find((item) => item.id === viewId)
      if (liveTarget && liveTarget.name === nextName && live !== listed) return
      viewsRef.current = current
      setViews(current)
      rememberViews(collectionPath, current)
    })
  }

  function renameView(view: SavedView) {
    setViewMenuOpen(false)
    if (view.id !== activeViewId) selectView(view)
    window.requestAnimationFrame(() => {
      const el = pageRef.current?.querySelector<HTMLTextAreaElement>('.fsdb-main > .fsdb-detail-title-row .fsdb-detail-title-input')
      el?.focus()
      el?.select()
    })
  }

  function deleteView(view: SavedView, path = collectionPath) {
    setViewMenuOpen(false)
    if (isReadOnlyViewId(view.id)) return
    const current = path === collectionPath ? viewsRef.current : loadViews(path)
    if (!canRemoveCollectionView(current)) return
    const removedId = view.id
    // 删除要立刻发出去：这条可能刚建、本地列表里还没有，
    // 只靠 diffSavedViews 会漏掉它，删除就丢了。
    const remaining = current.filter((item) => item.id !== removedId)
    void persistViewsWith(path, remaining, { remove: [removedId] }).then((ok) => {
      if (!ok) return
      if (path === collectionPath && activeViewIdRef.current === removedId) {
        const next = viewsRef.current[0]
        if (next) selectView(next)
      }
    })
  }

  function renderVisibleColumnsFlyout() {
    return (
      <Suspense fallback={null}>
        <VisibleColumnsFlyout
          columns={columns}
          allColumns={allColumns}
          labelField={schema?.labelField}
                    tagCatalog={sheetPack ? [sheetPack] : tagCatalog}
          onToggle={toggleColumn}
          onReorder={setVisibleColumns}
        />
      </Suspense>
    )
  }

  function setVisibleColumns(next: string[]) {
    const pinned = pinActionColumn(schema, next, rowActionColumn)
    if (!pinned.length) return
    setColumnKeys(pinned)
    if (sheet || !activeViewId) return
    const current = views.find((view) => view.id === activeViewId)
    if (!current) return
    persistViews(views.map((view) => (view.id === activeViewId ? { ...view, columns: pinned } : view)))
  }

  function toggleColumn(key: string) {
    if (key === schema?.labelField || key === 'actions') return
    const current = columnKeys.length ? columnKeys : columns.map((col) => col.key)
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
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
    setFreezeTitle(next)
    patchActiveView({ freezeTitle: next })
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

  async function executeAction(row: DbRecord, action: CollectionActionInfo) {
    if (actingRef.current) return
    actingRef.current = true
    setActing(true)
    const sourceId = String(row.sourceId ?? '').trim()
    const actionPath = sourceRecordPath(row, row.id)
    try {
      const cornerSessionId =
        typeof document === 'undefined'
          ? ''
          : String(document.querySelector('[data-testid="brand-corner-mascot"]')?.getAttribute('data-session-id') ?? '').trim()
      await readJson('/api/db/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: actionPath,
          action: action.id,
          ...(action.id === 'deliver' && cornerSessionId ? { args: { sessionId: cornerSessionId, wait: false } } : {}),
        }),
      })
      if (action.id === 'start') {
        window.dispatchEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN_EVENT, { detail: { plugin: sourceId || String(row.id) } }))
      }
      announceListChange()
      quietUntil.current = 0
      await reload({ force: true })
    } catch (err) {
      setDlg({ kind: 'alert', title: `${action.label}失败`, body: String(err) })
      quietUntil.current = 0
      await reload({ force: true })
    } finally {
      actingRef.current = false
      setActing(false)
    }
  }

  async function writePatch(row: DbRecord, content: Record<string, unknown>) {
    const keys = Object.keys(content)
    try {
      quietUntil.current = Date.now() + 800
      if (bodyKey && keys.length === 1 && keys[0] === bodyKey && schema?.fields[bodyKey]?.type === 'file') {
        const path = sourceRecordPath(row, row.id)
        const value = content[bodyKey]
        const gen = (contentWriteGens.current.get(path) ?? 0) + 1
        contentWriteGens.current.set(path, gen)
        contentGen.current += 1
        contentWritePending.current.set(path, (contentWritePending.current.get(path) ?? 0) + 1)
        const previous = contentWriteQueues.current.get(path) ?? Promise.resolve()
        const run = previous.catch(() => undefined).then(async () => {
          const data = await readJson<{ value?: unknown; version?: number; updatedAt?: number }>('/api/db/content', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              path,
              value,
              version: contentVersions.current.get(path),
            }),
          })
          if (Number.isInteger(data.version)) contentVersions.current.set(path, data.version!)
          if (detailIdRef.current === row.id && gen === contentWriteGens.current.get(path)) {
            setDetailBody(data.value ?? value)
            setDetailBodyStatus('ready')
            setDetailBodyError('')
          }
          const touched = Number(data.updatedAt)
          const stamp = Number.isFinite(touched) && touched > 0 ? touched : Date.now()
          const mergeTime = (item: DbRecord) => (item.id === row.id ? { ...item, updatedAt: stamp } : item)
          mapListedRecords(mergeTime)
          setDetailRow((prev) => (prev?.id === row.id ? mergeTime(prev) : prev))
          publishListedMutation({ path: dataPath, op: 'patch', row: { id: row.id, updatedAt: stamp }, groupBy })
          announceListChange(true, path)
        }).catch(async (error) => {
          if (!(error instanceof HttpError) || error.status !== 409) throw error
          const latest = await readJson<{ value?: unknown; version?: number }>(`/api/db/content?path=${encodeURIComponent(path)}`)
          if (Number.isInteger(latest.version)) contentVersions.current.set(path, latest.version!)
          if (detailIdRef.current === row.id) {
            setDetailBody(latest.value ?? null)
            setDetailBodyStatus('ready')
            setDetailBodyError('')
          }
        }).finally(() => {
          const pending = Math.max(0, (contentWritePending.current.get(path) ?? 1) - 1)
          if (pending) contentWritePending.current.set(path, pending)
          else contentWritePending.current.delete(path)
          if (contentWriteQueues.current.get(path) === run) contentWriteQueues.current.delete(path)
        })
        contentWriteQueues.current.set(path, run)
        await run
        const field = schema?.fields[bodyKey]
        if (field && field.type !== 'file') {
          const stored = value && typeof value === 'object' ? JSON.stringify(value) : value
          const merge = (item: DbRecord) => (item.id === row.id ? { ...item, [bodyKey]: stored } : item)
          mapListedRecords(merge)
          setDetailRow((prev) => (prev?.id === row.id ? merge(prev) : prev))
        }
        return
      }
      const path = `${dataPath}/${row.id}`
      const beforeRow =
        itemsRef.current.find((item) => item.id === row.id) ??
        (detailRowRef.current?.id === row.id ? detailRowRef.current : null) ??
        row
      const recordBag =
        pendingFieldWritesRef.current.get(row.id) ??
        (() => {
          const map = new Map<string, { value: unknown; count: number }>()
          pendingFieldWritesRef.current.set(row.id, map)
          return map
        })()
      for (const [key, value] of Object.entries(content)) {
        const prevEntry = recordBag.get(key)
        recordBag.set(key, { value, count: (prevEntry?.count ?? 0) + 1 })
      }
      if (dataPathRef.current === dataPath) {
        setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, { ...prev, ...content }) : prev))
      }
      let released = false
      const releasePending = () => {
        if (released) return
        released = true
        const bag = pendingFieldWritesRef.current.get(row.id)
        if (!bag) return
        for (const key of Object.keys(content)) {
          const entry = bag.get(key)
          if (!entry) continue
          if (entry.count <= 1) bag.delete(key)
          else bag.set(key, { ...entry, count: entry.count - 1 })
        }
        if (bag.size === 0) pendingFieldWritesRef.current.delete(row.id)
      }
      try {
      const prevFieldRun = fieldWriteQueues.current.get(path) ?? Promise.resolve()
      const fieldRun = prevFieldRun.catch(() => undefined).then(async () => {
      await tableEditHistory.edit(path, content, async () => {
        const listed = itemsRef.current.find((item) => item.id === row.id)
        return listed ?? beforeRow
      }, async (patch) => {
        if (dataPathRef.current === dataPath) {
          setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, { ...prev, ...patch }) : prev))
        }
        const data = await readJson<{ value?: DbRecord }>('/api/db/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path, content: patch }),
        })
        const next = data.value
        if (!next) throw new Error('保存失败：服务端没有返回记录')
        // A pending save may finish after navigation. Keep its response out of the new table.
        if (dataPathRef.current === dataPath) {
          const displayed = next.id === row.id ? next : overlayListedRow(row, { ...next, id: row.id })
          const merge = (item: DbRecord) => (item.id === row.id ? overlayListedRow(item, displayed) : item)
          const merged = overlayListedRow(itemsRef.current.find((item) => item.id === row.id) ?? row, displayed)
          const stillMatches = matchListFilterRecord(merged, queryFiltersRef.current, schemaRef.current, tagCatalogRef.current)
          if (stillMatches) {
            mapListedRecords(merge)
          } else {
            dropListedRecords([row.id], { keepHistory: true })
          }
          releasePending()
          const protectedDisplay = applyPendingDetailPatches(displayed)
          setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, protectedDisplay) : prev))
          publishListedMutation({ path: dataPath, op: 'patch', row: displayed, groupBy: groupByRef.current })
          announceListChange(stillMatches, path)
          quietUntil.current = Date.now() + 800
        } else {
          forgetListCache(dataPath)
          invalidateListReads()
        }
        return next
      })
      }).finally(() => {
        if (fieldWriteQueues.current.get(path) === fieldRun) fieldWriteQueues.current.delete(path)
      })
      fieldWriteQueues.current.set(path, fieldRun)
      await fieldRun
      } finally {
        releasePending()
      }
    } catch (err) {
      if (dataPathRef.current !== dataPath) return
      quietUntil.current = 0
      const denied =
        (err instanceof HttpError && err.status === 403) ||
        /\bpermission denied\b/i.test(String(err instanceof Error ? err.message : err))
      const contentOnly = Boolean(bodyKey && keys.length === 1 && keys[0] === bodyKey)
      if (denied && contentOnly) return
      setError(String(err))
    }
  }

  async function createChildRecord(parent: DbRecord) {
    if (!canCreate) return
    const parentId = String(parent.sourceId ?? parent.id ?? '').trim()
    if (!parentId) return
    const targetPath = isDataOverview
      ? String(parent.tablePath ?? createTypeTable?.path ?? PAGES_COLLECTION_PATH)
      : dataPath
    const targetTable = isDataOverview
      ? overviewCreateTables.find((table) => table.path === targetPath) ?? {
          path: targetPath,
          label: targetPath.replace(/^\//, ''),
        }
      : undefined
    const field = parentFieldKey(schema) || 'parentId'
    const fields: Record<string, unknown> = { [field]: parentId }
    const groupedBy = String(groupBy ?? '').trim()
    const groupedField = groupedBy ? schema?.fields?.[groupedBy] : undefined
    if (
      groupedBy &&
      groupedField?.writable &&
      !groupedField.computed &&
      parent[groupedBy] != null &&
      parent[groupedBy] !== ''
    ) {
      fields[groupedBy] = parent[groupedBy]
    }
    await insertCreatedRecord(targetPath, fields, targetTable)
  }

  function groupCreateSeed(groupKey: string) {
    const bucket = grouped.find(item => (item.key || 'unset') === groupKey)
    if (!bucket) return null
    const base = seedRecordFromViewFilters(catalogLocks, filterTree, schema)
    if (groupBy === 'shareScope' && ['私人', '空间', '共享'].includes(bucket.key)) return base
    if (isDataOverview && (groupBy === 'table' || groupBy === 'tablePath')) {
      return overviewCreateTables.some(table => groupBy === 'tablePath' ? table.path === bucket.key
        : (table.view?.title ?? table.label) === bucket.key) ? base : null
    }
    return seedGroupRecord(base,
      groupBy, bucket.key, schema, tagCatalog, bucket.rows[0])
  }

  async function createInGroup(groupKey: string) {
    if (!canCreate || creatingGroupsRef.current.size) return
    const fields = groupCreateSeed(groupKey)
    if (!fields) return
    creatingGroupsRef.current.add(groupKey)
    setCreatingGroup(groupKey)
    try {
      const bucket = grouped.find(item => (item.key || 'unset') === groupKey)
      const targetTable = isDataOverview && (groupBy === 'table' || groupBy === 'tablePath')
        ? overviewCreateTables.find(table => groupBy === 'tablePath' ? table.path === bucket?.key
          : (table.view?.title ?? table.label) === bucket?.key)
        : isDataOverview ? createTypeTable : undefined
      const targetPath = targetTable?.path ?? dataPath
      const scope = groupBy === 'shareScope'
        ? ({ 私人: 'personal', 空间: 'workspace', 共享: 'shared' } as const)[bucket?.key as '私人' | '空间' | '共享']
        : undefined
      const created = await insertCreatedRecord(targetPath, fields, targetTable, scope)
      if (!created) return
      setCollapsedGroups(prev => {
        const next = { ...prev, [groupKey]: false }
        persistCollapsedGroups(collectionPath, activeViewId ?? routeViewId ?? '', groupBy, next)
        return next
      })
      setGroupPages(prev => ({ ...prev, [groupKey]: 0 }))
    } finally {
      creatingGroupsRef.current.delete(groupKey)
      setCreatingGroup(null)
    }
  }

  async function createRecord() {
    if (!canCreate) return
    const targetPath = isDataOverview ? createTypeTable?.path || PAGES_COLLECTION_PATH : dataPath
    const targetTable = isDataOverview
      ? createTypeTable ?? { path: targetPath, label: targetPath.replace(/^\//, '') }
      : undefined
    await insertCreatedRecord(targetPath, seedRecordFromViewFilters(catalogLocks, filterTree, schema), targetTable)
  }

  async function insertCreatedRecord(
    targetPath: string,
    fields: Record<string, unknown>,
    targetTable?: { path: string; label?: string; view?: { title?: string; icon?: string } },
    scope: typeof createScope = createScope,
  ) {
    try {
      const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: targetPath,
          records: [fields],
          scope,
        }),
      })
      const created = data.items?.[0]?.value
      const sourceId = created?.id
      if (!created || !sourceId) {
        setError('没有写入')
        return
      }
      const parentField = parentFieldKey(schemaRef.current)
      const parentId = parentField ? String(fields[parentField] ?? created[parentField] ?? '').trim() : ''
      const stamped = targetTable
        ? {
            ...created,
            id: `${String(targetTable.path).replace(/^\//, '')}::${sourceId}`,
            title: String(created.title ?? sourceId),
            table: targetTable.view?.title ?? targetTable.label ?? targetTable.path.replace(/^\//, ''),
            tablePath: targetTable.path,
            tableIcon: targetTable.view?.icon,
            sourceId,
          }
        : created
      const value =
        parentField && parentId && (stamped[parentField] == null || stamped[parentField] === '')
          ? { ...stamped, [parentField]: parentId }
          : stamped
      const id = value.id
      confirmedCreates.current.add(id)
      // The synchronous mutation event below must see this row immediately.
      const nextItems = [value, ...itemsRef.current.filter((item) => item.id !== id)]
      itemsRef.current = nextItems
      setItems(nextItems)
      totalRef.current += 1
      setTotal(totalRef.current)
      setGroupBuckets((prev) => placeCreatedRow(prev, value, groupBy, schemaRef.current, tagCatalog, parentId))
      if (parentId) {
        setCollapsed((prev) => ({ ...prev, [parentId]: false }))
        setTreeKidsByParent((prev) => ({
          ...prev,
          [parentId]: [value, ...(prev[parentId] ?? []).filter((row) => row.id !== id)],
        }))
        void loadTreeKids(parentId, true)
      }
      publishListedMutation({
        path: dataPath,
        op: 'create',
        row: value,
        groupBy,
        viewId: activeViewIdRef.current,
        total: totalRef.current,
      })
      announceListChange()
      quietUntil.current = Date.now() + 2000
      if (isDataOverview) setViaDataCrumbs(true, activeViewId)
      if (activeViewId && !isDataOverview) rememberInspectorWorkingView(targetPath, activeViewId)
      window.setTimeout(() => {
        showRecordInInspector(targetPath, sourceId, isDataOverview ? undefined : activeViewId)
        landCreatedTitleCell(String(id))
      }, 0)
      return value
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeDeleteRecord(row: DbRecord) {
    try {
      const target = sourceDeleteTarget(row)
      await readJson('/api/db/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: target.path, ids: [target.id] }),
      })
      if (!embed) onCloseRecord?.()
      dropListedRecords([String(row.id)])
      publishListedMutation({
        path: dataPath,
        op: 'remove',
        ids: [String(row.id)],
        viewId: activeViewIdRef.current,
        total: totalRef.current,
      })
      publishDeletedRowsToTrash(target.path, [{ ...row, id: target.id }], title)
      announceListChange()
      quietUntil.current = 0
      await reload({ force: true })
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeDeleteRecords(ids: string[]) {
    try {
      if (dataPath === TRASH_COLLECTION_PATH) {
        await Promise.all(
          ids.map((id) =>
            readJson('/api/db/action', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path: `${dataPath}/${id}`, action: 'delete' }),
            }),
          ),
        )
      } else {
        const grouped = new Map<string, string[]>()
        for (const id of ids) {
          const row = itemsRef.current.find((item) => String(item.id) === String(id))
          const target = sourceDeleteTarget(row ?? { id })
          const bucket = grouped.get(target.path) ?? []
          bucket.push(target.id)
          grouped.set(target.path, bucket)
        }
        await Promise.all(
          [...grouped].map(([path, sourceIds]) =>
            readJson('/api/db/delete', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path, ids: sourceIds }),
            }),
          ),
        )
      }
      if (!embed && detailId && ids.includes(detailId)) onCloseRecord?.()
      const gone = new Set(ids.map(String))
      const deletedRows = itemsRef.current.filter((row) => gone.has(String(row.id)))
      setPickedIds([])
      dropListedRecords(ids)
      publishListedMutation({
        path: dataPath,
        op: 'remove',
        ids: ids.map(String),
        viewId: activeViewIdRef.current,
        total: totalRef.current,
      })
      if (dataPath !== TRASH_COLLECTION_PATH) {
        const byTable = new Map<string, DbRecord[]>()
        for (const row of deletedRows) {
          const target = sourceDeleteTarget(row)
          const bucket = byTable.get(target.path) ?? []
          bucket.push({ ...row, id: target.id })
          byTable.set(target.path, bucket)
        }
        for (const [path, rows] of byTable) publishDeletedRowsToTrash(path, rows, title)
      }
      announceListChange()
      quietUntil.current = 0
      await reload({ force: true })
    } catch (err) {
      setError(String(err))
      quietUntil.current = 0
      await reload({ force: true })
    }
  }

  async function exportPicked() {
    const ids = pickedIds.filter(Boolean)
    if (!ids.length) return
    try {
      const { zipMarkdownPack, contentToMarkdown, markdownFileName, recordToMarkdown } = await import('./export-markdown.ts')
      const files: Array<{ name: string; text: string }> = []
      for (const id of ids) {
        const listed = items.find((row) => row.id === id)
        const path = `${dataPath}/${id}`
        const rec = await readJson<{ value?: Record<string, unknown> }>(`/api/db/read?path=${encodeURIComponent(path)}`).catch(() => ({ value: listed }))
        const content = await readJson<{ value?: unknown }>(`/api/db/content?path=${encodeURIComponent(path)}`).catch(() => ({
          value: listed && bodyKey ? listed[bodyKey] : '',
        }))
        const row = { ...(listed ?? { id }), ...(rec.value ?? {}), id }
        files.push({
          name: markdownFileName(row),
          text: recordToMarkdown(row, contentToMarkdown(content.value), bodyKey),
        })
      }
      const blob = zipMarkdownPack(files)
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = `${title || 'records'}.zip`
      link.click()
      URL.revokeObjectURL(href)
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeBulkEdit(ids: string[], key: string, raw: string) {
    const field = schema?.fields[key]
    if (!field) return
    const rows = items.filter((row) => ids.includes(row.id))
    try {
      for (const row of rows) await writePatch(row, { [key]: parseFieldValue(field, raw) })
      setPickedIds([])
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeBulkTag(ids: string[], addTags: string[]) {
    if (!addTags.length) return
    const rows = items.filter((row) => ids.includes(row.id))
    try {
      for (const row of rows) {
        const current = normalizeSchemaValue(row.tag)
        const tags = [...current.tags]
        for (const id of addTags) if (!tags.includes(id)) tags.push(id)
        await writePatch(row, { tag: { tags, values: current.values } })
      }
      setPickedIds([])
    } catch (err) {
      setError(String(err))
    }
  }

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

  async function writeOne(row: DbRecord, key: string, field: FieldSpec, raw: string) {
    await writePatch(row, { [key]: parseFieldValue(field, raw) })
  }

  function writeCellValue(row: DbRecord, key: string, field: FieldSpec, next: unknown) {
    const flat = parseTagFlatColumnKey(key)
    if (flat && schema) {
      const source = tagSourceKey(schema)
      void writePatch(row, { [source]: patchTagFlatValue(row, key, next, source) })
      return
    }
    void writePatch(row, { [key]: next })
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
      viewName: crumbFromData
        ? displayNameForView(
            dataViewId,
            { path: DATA_COLLECTION_PATH, label: '数据', view: { title: '数据' } },
            isBuiltinAllViewId(dataViewId) ? undefined : dataView?.name,
          )
        : activeView?.name,
      views: crumbFromData
        ? dataViews.map((view) => ({ id: view.id, name: view.name, mode: view.mode }))
        : views.map((view) => ({ id: view.id, name: view.name, mode: view.mode })),
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
    if (key === 'shareScope') {
      const raw = String(row[key] ?? (localData ? '私人' : ''))
      const label = localData && raw === '空间' ? '私人' : raw
      return (
        <ShareScopeDetail
          collection={collectionPath}
          recordId={row.id}
          label={label}
          tableLabel={currentTable?.label}
          builtin={collectionPath === PLUGINS_COLLECTION_PATH && row.builtin === true}
          localOnly={localKnown ? localData : null}
        />
      )
    }
    if (key === 'shareRole') {
      return (
        <ShareRoleDetail
          collection={collectionPath}
          recordId={row.id}
          label={String(row[key] ?? '')}
          tableLabel={currentTable?.label}
          builtin={collectionPath === PLUGINS_COLLECTION_PATH && row.builtin === true}
          localOnly={localKnown ? localData : null}
        />
      )
    }
    const kind = resolveFieldType(field)
    const flat = parseTagFlatColumnKey(key)
    if (surface === 'table') {
      if (kind === 'boolean') {
        const raw = flat ? readTagFlatValue(row, key, tagSourceKey(schema)) : row[key]
        const on = raw === true || raw === 'true'
        if (field.writable) {
          return <BoolCell on={on} writable onToggle={() => writeCellValue(row, key, field, !on)} />
        }
        return <BoolCell on={on} />
      }
      if (kind === 'action') {
        const actionId = fieldActionId(key, field)
        const action = (schema?.actions ?? []).find((item) => item.id === actionId)
        return <ActionCell field={field} fieldKey={key} onRun={action ? () => void runAction(row, action) : undefined} />
      }
      if (kind === 'tag') {
        const tags = loadTags()
        const parsed = normalizeSchemaValue(row[key])
        if (!parsed.tags.length) return null
        return (
          <TagChips>
            {parsed.tags.map((id) => (
              <TagChip
                key={id}
                id={id}
                label={tagChipLabel(tags.find((tag) => tag.id === id), id)}
                icon={tagChipIcon(id)}
                onClick={() => jumpTag(id)}
              />
            ))}
          </TagChips>
        )
      }
      if (flat) {
        return (
          <DefaultCell
            field={field}
            fieldKey={key}
            records={isRecordLinkField(field, key) ? items : undefined}
            collectionPath={collectionPath}
            labelField={schema?.labelField}
            value={readTagFlatValue(row, key, tagSourceKey(schema))}
            onChange={
              field.writable && (kind === 'attachment' || kind === 'document' || kind === 'datetime')
                ? (next) => writeCellValue(row, key, field, next)
                : undefined
            }
          />
        )
      }
      const Custom = chrome?.cells?.[key]
      if (Custom) return <Custom field={key} spec={field} value={row[key]} record={row} fallback={formatField(field, row[key])} />
      if (key === 'table') {
        return <SourceTableCell record={row} tables={tables} onOpenTable={onOpenTable} />
      }
      return (
        <DefaultCell
          field={field}
          fieldKey={key}
          record={row}
          records={isRecordLinkField(field, key) ? items : undefined}
          collectionPath={collectionPath}
          labelField={schema?.labelField}
          value={row[key]}
          onChange={
            field.writable && (kind === 'attachment' || kind === 'document' || kind === 'datetime')
              ? (next) => writeCellValue(row, key, field, next)
              : undefined
          }
        />
      )
    }
    if (flat) {
      const source = tagSourceKey(schema)
      const value = readTagFlatValue(row, key, source)
      if (field.writable && kind !== 'file') {
        return (
          <Suspense fallback={<DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={value} />}>
          <FieldValuePop
            record={row}
            fieldKey={key}
            field={field}
            value={value}
            collectionPath={collectionPath}
            getOptions={() =>
              uniqueValues(
                items.map((item) => ({ ...item, [key]: readTagFlatValue(item, key, source) })),
                key,
                field,
              )
            }
            records={items}
            labelField={schema?.labelField}
            onSubmit={(next) => writeCellValue(row, key, field, next)}
          />
          </Suspense>
        )
      }
      return <DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={value} />
    }
    if (kind === 'tag') {
      if (field.writable) {
        return (
          <Suspense fallback={<DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={row[key]} />}>
          <SchemaFieldEditor
            collectionPath={collectionPath}
            record={row}
            value={row[key]}
            writable
            onChange={(next) => void writePatch(row, { [key]: next })}
          />
          </Suspense>
        )
      }
      return (
        <Suspense fallback={<DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={row[key]} />}>
        <FieldValuePop
          record={row}
          fieldKey={key}
          field={field}
          value={row[key]}
          collectionPath={collectionPath}
          onSubmit={() => {}}
        />
        </Suspense>
      )
    }
    if (kind === 'action') {
      const actionId = fieldActionId(key, field)
      const action = (schema?.actions ?? []).find((item) => item.id === actionId)
      return (
        <ActionCell
          field={field}
          fieldKey={key}
          onRun={action ? () => void runAction(row, action) : undefined}
        />
      )
    }
    const Custom = chrome?.cells?.[key]
    const fallback = formatField(field, row[key])
    if (Custom) return <Custom field={key} spec={field} value={row[key]} record={row} fallback={fallback} />
    if (key === 'table') {
      return <SourceTableCell record={row} tables={tables} onOpenTable={onOpenTable} />
    }
    if (kind !== 'file') {
      return (
        <Suspense fallback={<DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={row[key]} />}>
        <FieldValuePop
          record={row}
          fieldKey={key}
          field={field}
          value={row[key]}
          collectionPath={collectionPath}
          getOptions={() => uniqueValues(items, key, field)}
          records={items}
          labelField={schema?.labelField}
          onSubmit={field.writable ? (next) => writeCellValue(row, key, field, next) : () => {}}
        />
        </Suspense>
      )
    }
    return <DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={row[key]} />
  }

  function renderCellPop() {
    if (!cellPop || !schema) return null
    const row = findPaintedRow(cellPop.id)
    const col = columns.find((item) => item.key === cellPop.key)
    if (!row || !col) return null
    const key = col.key
    const field = col.field
    const flat = parseTagFlatColumnKey(key)
    const initial = flat ? readTagFlatValue(row, key, tagSourceKey(schema)) : row[key]
    const options = flat
      ? uniqueValues(
          items.map((item) => ({ ...item, [key]: readTagFlatValue(item, key, tagSourceKey(schema)) })),
          key,
          field,
        )
      : uniqueValues(items, key, field)
    return (
      <CellPop
        key={`${cellPop.id}:${cellPop.key}`}
        open
        className={`is-${resolveFieldType(field)}${key === 'fields' && collectionPath === TAGS_COLLECTION_PATH ? ' is-json' : ''}${isRecordLinkField(field, key) ? ' is-record-link' : ''}`}
        anchor={cellAnchorRef.current}
        onClose={() => setCellPop(null)}
      >
        <Suspense fallback={null}>
        <CellPopDraft
          record={row}
          fieldKey={key}
          field={field}
          initial={initial}
          typeChar={cellPop.seed}
          options={options}
          collectionPath={collectionPath}
          seed={items}
          labelField={schema?.labelField}
          onClose={() => setCellPop(null)}
          onSubmit={(raw) => writeCellValue(row, key, field, raw)}
        />
        </Suspense>
      </CellPop>
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

  function renderGroupHead(groupKey: string, label: string) {
    const folded = Boolean(collapsedGroups[groupKey])
    return (
      <header className="tasks-queue-ghead">
        <button
          type="button"
          className="tasks-group-fold"
          aria-expanded={!folded}
          aria-label={folded ? '展开分组' : '收起分组'}
          title={folded ? '展开分组' : '收起分组'}
          onClick={() => {
            captureTableFoldSnapshot()
            setCollapsedGroups((prev) => {
              const next = { ...prev, [groupKey]: !prev[groupKey] }
              persistCollapsedGroups(collectionPath, activeViewId ?? routeViewId ?? '', groupBy, next)
              return next
            })
          }}
        >
          <span className="sidebar-rail-icon sidebar-group-fold" aria-hidden>
            <span className="sidebar-group-fold-face">
              {groupBy === 'shareScope' ? (
                <UiGlyph
                  icon={label === '共享' ? 'globe' : label === '空间' ? 'users' : 'user'}
                  className={label === '共享' ? 'tasks-queue-gshare' : undefined}
                />
              ) : groupBy === 'table' || groupBy === 'tablePath' ? (
                <TableGlyph
                  icon={
                    tables.find((table) =>
                      groupBy === 'tablePath'
                        ? table.path === groupKey
                        : (table.view?.title ?? table.label) === groupKey || table.path === groupKey,
                    )?.view?.icon
                  }
                  className="size-4"
                />
              ) : (
                <UiGlyph icon="stack" />
              )}
            </span>
            <span className="sidebar-group-fold-chevron">
              <UiGlyph icon="chevron-right" className={`sidebar-chevron${folded ? '' : ' is-open'}`} />
            </span>
          </span>
        </button>
        <span className="tasks-queue-glabel">{label}</span>
        {canCreate && !sheet ? (
          <button
            type="button"
            className="tasks-icon-btn tasks-group-create"
            aria-label={`在「${label}」分组中新增`}
            title={groupCreateSeed(groupKey) ? `在「${label}」分组中新增` : '当前分组属性无法在新建时指定'}
            disabled={Boolean(creatingGroup) || !groupCreateSeed(groupKey)}
            onClick={() => void createInGroup(groupKey)}
          >
            <PlusIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
      </header>
    )
  }

  function togglePicked(ids: string[], on: boolean) {
    setPickedIds((prev) => {
      if (on) {
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        return [...next]
      }
      return prev.filter((id) => !ids.includes(id))
    })
  }

  function tableCellFromEvent(
    event: { target: EventTarget | null; currentTarget: EventTarget },
    ignore = CELL_POP_IGNORE,
  ) {
    const hit = event.target as HTMLElement | null
    if (hit?.closest(ignore)) return null
    const table = event.currentTarget as HTMLElement
    const td = hit?.closest('td')
    if (!td || !table.contains(td)) return null
    const id = td.closest('tr')?.dataset.recordId
    const key = td.dataset.colKey
    if (!id || !key) return null
    const cursor = tableCursorFromCell(td)
    return cursor ? { td, ...cursor } : null
  }

  function onTablePointerDown(event: ReactPointerEvent<HTMLTableElement>) {
    if (event.button !== 0) return
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('pick-mode')) return
    const cell = tableCellFromEvent(event, CELL_RANGE_IGNORE)
    if (!cell) return
    const focus = { id: cell.id, key: cell.key, rowKey: cell.rowKey }
    const shifting = event.shiftKey && Boolean(cellRangeRef.current || cellPickRef.current)
    const anchor = shifting ? (cellRangeRef.current?.anchor ?? cellPickRef.current ?? focus) : focus
    cellAnchorRef.current = cell.td
    cellRepickRef.current = !shifting && cellPickRef.current?.id === cell.id && cellPickRef.current?.key === cell.key && cellPickRef.current?.rowKey === cell.rowKey
    applyCellRange(anchor, focus)
    claimThisTableCell()
    tableRef.current?.focus({ preventScroll: true })
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* 捕获失败时仍用 window pointermove */
    }
    cellPopPtrRef.current = { x: event.clientX, y: event.clientY, dragged: false }
    tableRef.current?.classList.remove('is-cell-drag')
    tableDragScrollStopRef.current?.()
    tableDragScrollStopRef.current = bindTableDragScroll({
      scroller: () => tableVertScroller(tableWrapRef.current),
      headBottom: () => (tableVertScroller(tableWrapRef.current)?.querySelector<HTMLElement>('.fsdb-pinned-head-viewport') ?? tableRef.current?.tHead)?.getBoundingClientRect().bottom,
      overlayTop: () => {
        const overlay = document.querySelector('[data-testid="chat-overlay-panel"]')
        return overlay instanceof HTMLElement ? overlay.getBoundingClientRect().top : undefined
      },
      origin: { x: event.clientX, y: event.clientY },
      dragPx: CELL_POP_DRAG_PX,
      selectText: false,
      onArmed: () => {
        if (cellPopPtrRef.current) cellPopPtrRef.current.dragged = true
        tableRef.current?.classList.add('is-cell-drag')
        setCellPop(null)
      },
      onDrag: (ptr) => {
        const hit = tableCellFromPoint(ptr.x, ptr.y)
        if (!hit) return
        const cur = cellRangeRef.current
        if (cur?.focus.id === hit.id && cur.focus.key === hit.key && cur.focus.rowKey === hit.rowKey) return
        applyCellRange(cur?.anchor ?? focus, { id: hit.id, key: hit.key, rowKey: hit.rowKey }, false)
      },
      onEnd: () => {
        tableRef.current?.classList.remove('is-cell-drag')
        const cur = cellRangeRef.current
        if (cur) applyCellRange(cur.anchor, cur.focus)
      },
    })
  }

  function onTablePointerMove(event: ReactPointerEvent<HTMLTableElement>) {
    const start = cellPopPtrRef.current
    if (!start || start.dragged) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < CELL_POP_DRAG_PX) return
    start.dragged = true
    setCellPop(null)
  }

  function onTableClick(event: { target: EventTarget | null; currentTarget: EventTarget; clientX: number; clientY: number }) {
    const cell = tableCellFromEvent(event)
    const start = cellPopPtrRef.current
    cellPopPtrRef.current = null
    if (!cell || start?.dragged) return
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= CELL_POP_DRAG_PX) return
    const col = columns.find((item) => item.key === cell.key)
    if (!col) return
    const kind = resolveFieldType(col.field)
    if (kind === 'tag') {
      const tagId = (event.target as HTMLElement | null)?.closest('[data-tag-id]')?.getAttribute('data-tag-id')?.trim()
      if (tagId) {
        jumpTag(tagId)
        return
      }
    }
    if (!cellRepickRef.current) {
      setCellPop(null)
      return
    }
    setCellPop(cellUsesPop(kind, col.field.writable) ? { id: cell.id, key: cell.key, rowKey: cell.rowKey } : null)
  }

  function onTableContextMenu(event: ReactMouseEvent<HTMLTableElement>) {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('pick-mode')) return
    const range = cellRangeRef.current
    if (!range) return
    const cells = tableCellRange(tableNavRowIds(), tableNavKeys(columns), range.anchor, range.focus, selectionModelRef.current.rowKeys)
    if (cells.length < 2) return
    const ids = tableCellRangeRowIds(cells)
    if (!ids.length) return
    event.preventDefault()
    event.stopPropagation()
    setPickedIds(ids)
    setCellPop(null)
  }

  function tableNavRowIds() {
    return selectionModelRef.current.rowIds
  }

  function findPaintedRow(id: string) {
    const node = tablePaintNodes.find((item) => item.kind === 'row' && item.row.id === id)
    if (node?.kind === 'row') return node.row
    const listed = items.find((item) => item.id === id) ?? itemsRef.current.find((item) => item.id === id)
    if (listed) return listed
    for (const kids of Object.values(treeKidsByParentRef.current)) {
      const hit = kids.find((item) => item.id === id)
      if (hit) return hit
    }
    return undefined
  }

  function findPaintedCellTd(id: string, key: string, rowKey?: string) {
    const table = tableRef.current
    if (!table) return null
    const row = rowKey ? `tr[data-row-key="${CSS.escape(rowKey)}"]` : `tr[data-record-id="${CSS.escape(id)}"]`
    return table.querySelector(`${row} td[data-col-key="${CSS.escape(key)}"]`) as HTMLElement | null
  }

  function hoverActionCell(td: HTMLElement | null, index = 0) {
    const btns = tableActionButtons(td)
    if (!btns.length) return
    const i = Math.max(0, Math.min(index, btns.length - 1))
    actionHoverIndexRef.current = i
    btns[i]?.focus()
  }

  function revealTableCell(next: TableCellCursor, extend = false) {
    if (extend && (cellRangeRef.current || cellPickRef.current)) {
      applyCellRange(cellRangeRef.current?.anchor ?? cellPickRef.current ?? next, next)
    } else {
      applyCellRange(next, next)
    }
    claimThisTableCell()
    tablePaintRef.current.revealRow?.(next.id, next.rowKey ?? cellPickRef.current?.rowKey)
    tablePaintRef.current.revealColumn?.(next.key)
    const immediate = findPaintedCellTd(next.id, next.key, next.rowKey)
    if (immediate) {
      const col = columns.find((item) => item.key === next.key)
      cellAnchorRef.current = immediate
      if (!extend && cellRangeSetRef.current.size <= 1) markCellOn(immediate, col ? cellFieldWritable(col.field) : false)
    }
    let attempts = 0
    const apply = () => {
      if (cellPickRef.current?.id !== next.id || cellPickRef.current.key !== next.key || (next.rowKey && cellPickRef.current.rowKey !== next.rowKey)) return
      const td = findPaintedCellTd(next.id, next.key, next.rowKey)
      if (!td) { if (attempts++ < 12) requestAnimationFrame(apply); return }
      const col = columns.find((item) => item.key === next.key)
      cellAnchorRef.current = td
      if (!extend && cellRangeSetRef.current.size <= 1) markCellOn(td, col ? cellFieldWritable(col.field) : false)
      const wrap = tableWrapRef.current, page = tableVertScroller(wrap)
      if (!wrap || !page) return
      const rect = td.getBoundingClientRect(), bounds = page.getBoundingClientRect()
      const docked = page.querySelector<HTMLElement>('.fsdb-pinned-head-viewport')
      const top = Math.max(bounds.top, (docked ?? tableRef.current?.tHead)?.getBoundingClientRect().bottom ?? bounds.top)
      if (rect.top < top) page.scrollTop += rect.top - top
      else if (rect.bottom > bounds.bottom) page.scrollTop += rect.bottom - bounds.bottom
      if (!td.classList.contains('is-pin-col')) {
        const viewport = wrap.getBoundingClientRect()
        const pinned = Array.from(tableRef.current?.querySelectorAll<HTMLElement>('thead th.is-pin-col') ?? [])
        const left = Math.max(viewport.left, ...pinned.map((head) => head.getBoundingClientRect().right))
        if (rect.left < left) wrap.scrollLeft += rect.left - left
        else if (rect.right > viewport.right) wrap.scrollLeft += rect.right - viewport.right
      }
    }
    if (immediate) apply()
    else requestAnimationFrame(apply)
  }

  function enterTableCell(cursor: TableCellCursor, seed?: string, attempt = 0) {
    const col = columns.find((item) => item.key === cursor.key)
    if (!col) return
    const kind = resolveFieldType(col.field)
    const td = findPaintedCellTd(cursor.id, cursor.key, cursor.rowKey)
    if (!td) {
      if (attempt < 12) {
        tablePaintRef.current.revealRow?.(cursor.id, cursor.rowKey)
        tablePaintRef.current.revealColumn?.(cursor.key)
        requestAnimationFrame(() => {
          if (cellPickRef.current?.id === cursor.id && cellPickRef.current.key === cursor.key && (!cursor.rowKey || cellPickRef.current.rowKey === cursor.rowKey)) enterTableCell(cursor, seed, attempt + 1)
        })
      }
      return
    }
    cellAnchorRef.current = td
    if (kind === 'boolean' && col.field.writable) {
      const btn = td?.querySelector('button') as HTMLElement | null
      btn?.click()
      return
    }
    if (cursor.key === 'actions' || kind === 'action') {
      hoverActionCell(td, 0)
      return
    }
    if (cellUsesPop(kind, col.field.writable)) {
      setCellPop({ id: cursor.id, key: cursor.key, rowKey: cursor.rowKey, ...(seed ? { seed } : {}) })
    }
  }

  function landTableCell(next: TableCellCursor, extend = false) {
    revealTableCell(next, extend)
    if (next.key === 'actions') {
      requestAnimationFrame(() => enterTableCell(next))
      return
    }
    tableRef.current?.focus({ preventScroll: true })
  }

  function tablePaneOwnsFocus(pane: ReturnType<typeof tablePaneFromEvent>) {
    if (sheet || !pane) return false
    if (pane === 'inspector') return Boolean(embed)
    return !embed
  }

  function inspectorTableIsActive() {
    const root = tableRef.current ?? pageRef.current
    if (!root) return false
    const host = root.closest('.session-inspector')
    if (host instanceof HTMLElement && (host.classList.contains('is-closed') || host.hasAttribute('inert'))) return false
    const stage = root.closest('.inspector-stage-pane')
    if (stage instanceof HTMLElement && !stage.classList.contains('is-active')) return false
    return true
  }

  function panePlace() {
    return { path: collectionPath, viewId: activeViewId ?? '', detailId: detailId ?? '' }
  }

  function rememberThisPaneRest() {
    if (sheet) return
    const pane = embed ? 'inspector' : 'main'
    const place = panePlace()
    const pick = cellPickRef.current
    if (pick && !detailId) {
      rememberTablePaneRest(pane, { kind: 'cell', path: place.path, viewId: place.viewId, id: pick.id, key: pick.key })
      return
    }
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
      if (pageRef.current?.contains(active) && active.classList.contains('fsdb-detail-title-input')) {
        rememberTablePaneRest(pane, {
          kind: 'title',
          path: place.path,
          viewId: place.viewId,
          detailId: place.detailId,
          start: active.selectionStart ?? active.value.length,
          end: active.selectionEnd ?? active.value.length,
        })
        return
      }
    }
    if (active instanceof HTMLElement && pageRef.current?.contains(active) && active.closest('.tiptap, .page-editor, [data-testid="page-editor"]')) {
      rememberTablePaneRest(pane, { kind: 'content', path: place.path, viewId: place.viewId, detailId: place.detailId })
    }
  }

  function landPaneSurface() {
    const pane = embed ? 'inspector' : 'main'
    if (!tablePaneOwnsFocus(pane)) return false
    if (embed && !inspectorTableIsActive()) return false
    claimThisTableCell()
    const rest = readTablePaneRest(pane, panePlace())
    if (rest?.kind === 'cell' && !detailId) {
      const keys = tableNavKeys(columns)
      const ids = tableNavRowIds()
      if (ids.includes(rest.id) && keys.includes(rest.key)) {
        landTableCell({ id: rest.id, key: rest.key })
        return true
      }
    }
    if (rest?.kind === 'title' && focusRecordTitleNear(pageRef.current)) {
      const el = pageRef.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>('.fsdb-detail-title-input')
      if (el) {
        const n = el.value.length
        try {
          el.setSelectionRange(Math.min(rest.start, n), Math.min(rest.end, n))
        } catch {
          /* ignore */
        }
      }
      return true
    }
    if (rest?.kind === 'content') {
      const editor = pageRef.current?.querySelector<HTMLElement>('.tiptap, [data-testid="page-editor"]')
      if (editor) {
        editor.focus()
        return true
      }
    }
    if (!detailId && landFirstTableCell(false)) return true
    if (focusRecordTitleNear(pageRef.current)) return true
    const editor = pageRef.current?.querySelector<HTMLElement>('.tiptap, [data-testid="page-editor"]')
    if (editor) {
      editor.focus()
      return true
    }
    if (landFirstTableCell(false)) return true
    pageRef.current?.focus?.({ preventScroll: true } as FocusOptions)
    return Boolean(pageRef.current)
  }

  function landCreatedTitleCell(rowId: string) {
    const keys = tableNavKeys(columns)
    const label = schemaRef.current?.labelField
    const key = label && keys.includes(label) ? label : keys[0]
    if (!key) return
    const cursor = { id: rowId, key }
    cellPickRef.current = cursor
    setCellPickEpoch((n) => n + 1)
    const go = () => {
      landTableCell(cursor)
    }
    requestAnimationFrame(go)
  }

  function landFirstTableCell(editTitle = false) {
    const pane = embed ? 'inspector' : 'main'
    if (!tablePaneOwnsFocus(pane)) return false
    if (embed && !inspectorTableIsActive()) return false
    const keys = tableNavKeys(columns)
    const ids = tableNavRowIds()
    const next = firstTableTitleCell(ids, keys, schema?.labelField, selectionModelRef.current.rowKeys)
    if (!next) {
      tableRef.current?.focus({ preventScroll: true })
      return Boolean(tableRef.current)
    }
    landTableCell(next)
    if (editTitle) requestAnimationFrame(() => enterTableCell(next))
    return true
  }

  function sendSelectedCellToChat() {
    const live = typeof document !== 'undefined' ? document.activeElement : null
    if (
      live instanceof Element &&
      live.closest('.page-editor, .composer, .chat-composer-dock, .app-side-bar, .tasks-search-wrap')
    ) {
      return false
    }
    const range = cellRangeRef.current
    const cursors = range
      ? tableCellRange(tableNavRowIds(), tableNavKeys(columns), range.anchor, range.focus, selectionModelRef.current.rowKeys)
      : cellPop || cellPickRef.current
        ? [cellPop ?? cellPickRef.current!]
        : []
    const picks = cursors.flatMap((cursor) => {
      if (cursor.key === 'actions') return []
      const row = findPaintedRow(cursor.id)
      const col = columns.find((item) => item.key === cursor.key)
      if (!row || !col) return []
      const stored = cellValueText(row, cursor.key, col.field)
      const isFocus = cellPickRef.current?.id === cursor.id && cellPickRef.current.key === cursor.key && (!cursor.rowKey || cellPickRef.current.rowKey === cursor.rowKey)
      const draft =
        isFocus && (live instanceof HTMLInputElement || live instanceof HTMLTextAreaElement)
          ? live.value
          : isFocus && live instanceof HTMLElement && live.isContentEditable
            ? live.innerText
            : ''
      const sel = typeof window !== 'undefined' ? window.getSelection() : null
      const selected = isFocus && sel && !sel.isCollapsed ? sel.toString().trim() : ''
      const inCell = Boolean(
        live instanceof Element && live.closest('.fsdb-cell-pop, td.is-cell-on, .tasks-table'),
      )
      const text = (isFocus && inCell ? draft.trim() : '') || stored
      const path = recordPathOf(row)
      const title = labelOf(row)
      const label = col.field.label ?? cursor.key
      return [
        {
          kind: recordKind,
          id: fieldPickId(row.id, cursor.key),
          label,
          route: typeof window === 'undefined' ? '' : window.location.pathname,
          ...(path ? { path } : {}),
          ...(title ? { title } : {}),
          field: cursor.key,
          type: resolveFieldType(col.field),
          ...(text ? { text } : {}),
          ...(inCell && selected ? { selection: selected } : {}),
        },
      ]
    })
    if (!picks.length) return false
    void import('@biu/core-pick/web').then((mod) => {
      mod.getPick()?.attach(picks)
    })
    return true
  }

  function sendPickedRowsToChat() {
    const picks = pickedIds.flatMap((id) => {
      const row = findPaintedRow(id)
      if (!row) return []
      const path = recordPathOf(row)
      const title = labelOf(row)
      return [
        {
          kind: recordKind,
          id: row.id,
          label: title || recordKind,
          route: typeof window === 'undefined' ? '' : window.location.pathname,
          ...(path ? { path } : {}),
          ...(title ? { title } : {}),
        },
      ]
    })
    if (!picks.length) return false
    void import('@biu/core-pick/web').then((mod) => {
      mod.getPick()?.attach(picks)
    })
    return true
  }

  function sendTableSelectionToChat() {
    if (pickedIds.length) return sendPickedRowsToChat()
    return sendSelectedCellToChat()
  }

  function copySelectedTableCells(target: EventTarget | null) {
    if (detailId || cellPop) return false
    const hit = target instanceof Element ? target : null
    const page = hit?.closest('.fsdb-page') ?? null
    if (page && page !== pageRef.current) return false
    const live = typeof document !== 'undefined' ? document.activeElement : null
    if (
      live instanceof Element &&
      live.closest('.page-editor, .composer, .chat-composer-dock, .app-side-bar, .tasks-search-wrap')
    ) {
      return false
    }
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return false
    const range = cellRangeRef.current
    const cursors = range
      ? tableCellRange(tableNavRowIds(), tableNavKeys(columns), range.anchor, range.focus, selectionModelRef.current.rowKeys)
      : cellPickRef.current
        ? [cellPickRef.current]
        : []
    if (!cursors.length) return false
    const text = formatTableCellsForClipboard(cursors, (cursor) => {
      const row = findPaintedRow(cursor.id)
      const col = columns.find((item) => item.key === cursor.key)
      if (!row || !col) return null
      return cellValueText(row, cursor.key, col.field)
    })
    if (text === null) return false
    writeClipboardText(text)
    return true
  }

  function onTableKeyDown(event: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; defaultPrevented: boolean; target: EventTarget | null; preventDefault: () => void; isComposing?: boolean }) {
    if (event.defaultPrevented) return
    if (tableSendChatHotkey(event)) {
      if (sendTableSelectionToChat()) event.preventDefault()
      return
    }
    const historyAction = tableEditHistoryKey(event)
    if (historyAction) {
      const hit = event.target instanceof Element ? event.target : null
      const page = hit?.closest('.fsdb-page') ?? null
      const field = event.target instanceof HTMLElement ? event.target : null
      const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
      const owned = tableEditHistoryOwned({
        inCellPop: Boolean(hit?.closest('.fsdb-cell-pop')),
        cellPopOpen: Boolean(cellPop),
        inThisTable: Boolean(hit && page === pageRef.current && hit.closest('.tasks-table')),
        foreignPage: Boolean(page && page !== pageRef.current),
        foreignEditor: Boolean(hit?.closest('.page-editor, .composer, .chat-composer-dock, .app-side-bar, .tasks-search-wrap')),
        inDialog: Boolean(hit?.closest('dialog, [role="dialog"], [role="menu"], [role="listbox"]')),
        nativeField: Boolean(field && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA' || field.tagName === 'SELECT' || field.isContentEditable)),
        nativeUndoModifier: tableNativeUndoModifier(event, apple),
        hasCell: Boolean(cellPickRef.current || cellRangeRef.current),
      })
      if (!owned) {
        if (tableKeyFromEditingTarget(event.target)) return
      } else {
        // Claim the key even when the stack is empty, so an outer table cannot consume it.
        event.preventDefault()
        void tableEditHistory[historyAction]().catch((err) => setError(String(err)))
        return
      }
    }
    if (tableKeyFromEditingTarget(event.target)) return
    if (tableCopyHotkey(event)) {
      if (copySelectedTableCells(event.target)) event.preventDefault()
      return
    }
    const titleCursor = cellPickRef.current
    const titleOpen = titleCursor
      ? tableTitleOpenWhere({
          key: event.key,
          shift: event.shiftKey,
          meta: event.metaKey,
          ctrl: event.ctrlKey,
          alt: event.altKey,
          labelKey: schema?.labelField,
          cellKey: titleCursor.key,
        })
      : null
    if (titleOpen && titleCursor) {
      event.preventDefault()
      const row = findPaintedRow(titleCursor.id)
      if (row) {
        if (titleOpen === 'inspector') openRowSplit(row)
        else openRow(row)
      }
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (!cellPickRef.current) return
    const table = tableRef.current
    const hit = event.target instanceof Element ? event.target : null
    if (hit && table && !table.contains(hit) && hit !== table) {
      if (tableKeyFromEditingTarget(hit)) return
      if (hit.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], .composer, .page-editor, .app-side-bar')) return
    }
    const actionBtn = hit instanceof Element ? hit.closest('td[data-col-key="actions"] button, td[data-col-key="actions"] [role="button"]') : null
    if (event.key === 'Escape') {
      if (cellPop) {
        event.preventDefault()
        setCellPop(null)
        table?.focus({ preventScroll: true })
      } else if (actionBtn instanceof HTMLElement) {
        event.preventDefault()
        table?.focus({ preventScroll: true })
      }
      return
    }
    if (tableCreateKey({ key: event.key, shift: event.shiftKey, meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey })) {
      if (!canCreate) return
      event.preventDefault()
      void createRecord()
      return
    }
    if (actionBtn instanceof HTMLElement && table?.contains(actionBtn) && (event.key === 'Enter' || event.key === ' ')) return
    if (cellPop || (hit && tableKeyFromEditingTarget(hit) && hit !== table && !table?.contains(hit))) return
    if (hit && table?.contains(hit) && tableKeyFromEditingTarget(hit)) return
    const dir = tableKeyDir(event.key, event.shiftKey)
    if (
      actionBtn instanceof HTMLElement &&
      table?.contains(actionBtn) &&
      !event.shiftKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      const td = actionBtn.closest('td')
      const btns = tableActionButtons(td)
      const index = btns.indexOf(actionBtn)
      if (!tableActionArrowLeave(btns.length, Math.max(0, index), dir === 'left' ? 'left' : 'right')) {
        event.preventDefault()
        hoverActionCell(td, tableActionButtonStep(btns.length, Math.max(0, index), dir === 'left' ? 'left' : 'right'))
        return
      }
    }
    if (dir) {
      event.preventDefault()
      const cursor = cellPickRef.current
      if (cursor && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        const node = tablePaintNodes.find((item) => item.kind === 'row' && item.row.id === cursor.id)
        const fold = tableTreeArrowAction(dir, {
          shift: true,
          treeOn,
          labelKey: schema?.labelField,
          cellKey: cursor.key,
          hasKids: node?.kind === 'row' ? node.hasKids : false,
          collapsed: collapsed[cursor.id] !== false,
        })
        if (fold === 'expand') {
          captureTableFoldSnapshot()
          setCollapsed((prev) => ({ ...prev, [cursor.id]: false }))
          void loadTreeKids(String(cursor.id))
        } else if (fold === 'collapse') {
          captureTableFoldSnapshot()
          setCollapsed((prev) => ({ ...prev, [cursor.id]: true }))
        }
        table?.focus({ preventScroll: true })
        return
      }
      const keys = tableNavKeys(columns)
      const next = moveTableCell(tableNavRowIds(), keys, cursor, dir, selectionModelRef.current.rowKeys)
      if (next) landTableCell(next, event.shiftKey)
      else table?.focus({ preventScroll: true })
      return
    }
    const cursor = cellPickRef.current
    if (!cursor) return
    if (event.key === 'Enter') {
      event.preventDefault()
      enterTableCell(cursor)
      return
    }
    const col = columns.find((item) => item.key === cursor.key)
    if (!col || !cellFieldWritable(col.field)) return
    if (tableClearKey(event.key)) {
      const kind = resolveFieldType(col.field)
      const empty = tableClearedValue(kind)
      if (empty === undefined || cursor.key === 'actions' || cursor.key === 'shareScope' || cursor.key === 'shareRole') return
      if (isViewCatalogField(cursor.key)) return
      const row = findPaintedRow(cursor.id)
      if (!row) return
      event.preventDefault()
      writeCellValue(row, cursor.key, col.field, empty)
      return
    }
    const typed = tableTypeToEditChar(event.key, resolveFieldType(col.field))
    if (!typed) return
    event.preventDefault()
    enterTableCell(cursor, typed)
  }
  function pickCrumbTarget(target: CrumbTarget) {
    if (target.kind === 'view' && target.collection === collectionPath) {
      const view = views.find((item) => item.id === target.viewId)
      if (view) selectView(view)
      return
    }
    onCrumbTarget?.(target)
  }
  tableNavLiveRef.current = (event) => onTableKeyDown(event)
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

  function paintColPad(px: number, side: 'left' | 'right') {
    if (px <= 0) return null
    return <td key={`pad-${side}`} className="fsdb-col-pad" aria-hidden style={padColBox(px)} />
  }

  function paintHeadTh(col: (typeof columns)[number]) {
    const flat = parseTagFlatColumnKey(col.key)
    const tone = flat ? schemaTagTone(flat.packId) : undefined
    const tagTip = tagColumnTagTip(col)
    return (
      <th
        key={col.key}
        className={[tablePinColClass(col.key, schema?.labelField, tableHoldRef.current?.freezeTitle ?? freezeTitle), tone ? 'is-tag-col' : ''].filter(Boolean).join(' ') || undefined}
        style={tone ? { ['--biu-tag' as string]: tone } : undefined}
      >
        <span
          className={`tasks-th${queryFields.has(col.key) ? ' is-on' : ''}`}
          data-dock-tip={tagTip || undefined}
        >
          <span className="tasks-th-ico">
            <FieldGlyph kind={col.kind} />
          </span>
          {tagColumnHeadLabel(col)}
        </span>
        <span
          className={`fsdb-col-resizer${resizingCol === col.key ? ' is-active' : ''}`}
          data-testid="fsdb-col-resizer"
          onPointerDown={(event) => startColResize(event, col.key)}
        />
      </th>
    )
  }

  function paintTableCell(row: DbRecord, key: string, field: FieldSpec) {
    if (key === 'shareScope' || key === 'shareRole') {
      return renderCell(row, key, field, 'table')
    }
    const kind = resolveFieldType(field)
    if (
      kind === 'boolean' ||
      kind === 'action' ||
      kind === 'tag' ||
      kind === 'select' ||
      kind === 'multi-select' ||
      kind === 'person' ||
      kind === 'url' ||
      kind === 'image' ||
      kind === 'attachment' ||
      kind === 'document' ||
      kind === 'file'
    ) {
      return renderCell(row, key, field, 'table')
    }
    if (
      parseTagFlatColumnKey(key) ||
      isRecordLinkField(field, key) ||
      isViewCatalogField(key) ||
      chrome?.cells?.[key]
    ) {
      if (key === 'usage' && !(Number(row[key]) > 0)) return <span className="traj-usage-empty">—</span>
      return renderCell(row, key, field, 'table')
    }
    if (key === 'fields' && collectionPath === TAGS_COLLECTION_PATH) {
      return <TagFieldChips value={row[key]} />
    }
    const text = cellValueText(row, key, field)
    return text ? <span>{text}</span> : null
  }

  function paintLiveCell(row: DbRecord, col: (typeof columns)[number], depth: number, hasKids: boolean, kidCount: number, rowKey: string, toolsArmed = true) {
    const held = tableHoldRef.current
    const paintSchema = held?.schema ?? schema
    let cellPick = cellPickRef.current
    const rangeSet = held ? null : cellRangeSetRef.current
    if (held && held.nodes !== EMPTY_HOLD_NODES && !sheet && !embed && mode === 'table' && !detailId) {
      const firstRow = held.nodes.find((item): item is Extract<TablePaintNode, { kind: 'row' }> => item.kind === 'row')
      const heldKeys = tableNavKeys(held.columns as typeof columns)
      const labelKey = paintSchema?.labelField
      const targetKey = labelKey && heldKeys.includes(labelKey) ? labelKey : heldKeys[0]
      cellPick = firstRow && targetKey ? { id: String(firstRow.row.id), key: targetKey, rowKey: firstRow.key } : null
    } else if (held) {
      cellPick = null
    }
    return (
      <td
        key={col.key}
        data-col-key={col.key}
        {...cellPickOf(row, col.key, col.field)}
        className={[
          tablePinColClass(col.key, paintSchema?.labelField, held?.freezeTitle ?? freezeTitle),
          Boolean(cellPick && (cellPick.rowKey ? cellPick.rowKey === rowKey : cellPick.id === row.id) && cellPick.key === col.key)
            ? col.field && cellFieldWritable(col.field)
              ? 'is-cell-on'
              : 'is-cell-on is-cell-ro'
            : rangeSet?.has(tableCellRangeKey(row.id, col.key))
              ? 'is-cell-range'
              : '',
        ].filter(Boolean).join(' ') || undefined}
      >
        {col.key === paintSchema?.labelField ? (
          <RecordTitle
            row={row}
            label={String(row[paintSchema?.labelField ?? 'title'] ?? '')}
            Title={chrome?.Title}
            depth={depth}
            hasKids={hasKids}
            kidCount={kidCount}
            treeOn={treeOn}
            collapsed={collapsed[row.id] !== false}
            onToggleCollapsed={() => {
              const expanding = collapsed[row.id] !== false
              captureTableFoldSnapshot()
              setCollapsed((prev) => ({ ...prev, [row.id]: prev[row.id] === false }))
              if (expanding) void loadTreeKids(String(row.id))
            }}
            tableIcon={currentTable?.view?.icon}
            Icon={chrome?.Icon}
            pick={recordPick(row)}
            onOpenSplit={() => openRowSplit(row)}
            onOpenRow={() => openRow(row)}
            onWriteEmoji={(next) => void writePatch(row, { emoji: next })}
            toolsArmed={toolsArmed}
          />
        ) : col.key === 'actions' ? (
          renderRecordActions(row)
        ) : (
          <span className="fsdb-cell">{paintTableCell(row, col.key, col.field)}</span>
        )}
      </td>
    )
  }

  const columnsByKey = useMemo(() => new Map(columns.map((item) => [item.key, item])), [columns])
  const compositeCellKeys = useMemo(() => {
    const keys = new Set<string>()
    if (chrome?.cells) for (const key of Object.keys(chrome.cells)) keys.add(key)
    return keys
  }, [chrome?.cells])

  function renderPaintCell(node: TablePaintNode, colKey: string) {
    if (node.kind !== 'row') return null
    const held = tableHoldRef.current
    const col = held && held.nodes !== EMPTY_HOLD_NODES && held.columns.length
      ? (held.columns as typeof columns).find((item) => item.key === colKey)
      : columnsByKey.get(colKey)
    if (!col) return null
    return paintLiveCell(node.row, col, node.depth, node.hasKids, node.kidCount, node.key)
  }

  function renderPaintRow(node: TablePaintNode, cells: ReactNode) {
    if (node.kind !== 'row') return renderPaintNode(node)
    const row = node.row
    return (
      <tr
        key={node.key}
        data-record-id={row.id}
        data-row-key={node.key}
        className={row.id === detailId ? 'is-active' : undefined}
        {...recordPick(row)}
      >
        {cells}
      </tr>
    )
  }

  function tableLiveRow(row: DbRecord, depth: number, hasKids: boolean, kidCount: number, rowKey: string, toolsArmed = true) {
    const colWindow = colWindowRef.current
    const held = tableHoldRef.current
    const paintColumns = (
      held && held.nodes !== EMPTY_HOLD_NODES && held.columns.length ? held.columns : columns
    ) as typeof columns
    const paintLiveTd = (col: (typeof columns)[number]) => paintLiveCell(row, col, depth, hasKids, kidCount, rowKey, toolsArmed)
    return (
      <tr
        key={rowKey}
        data-record-id={row.id}
        data-row-key={rowKey}
        className={row.id === detailId ? 'is-active' : undefined}
        {...recordPick(row)}
      >
        {paintColumns.slice(0, colWindow.pin).map(paintLiveTd)}
        {paintColPad(colWindow.padLeft, 'left')}
        {paintColumns.slice(colWindow.start, colWindow.end).map(paintLiveTd)}
        {paintColPad(colWindow.padRight, 'right')}
        <td className="fsdb-col-fill" aria-hidden />
      </tr>
    )
  }

  function tableRecordRow(row: DbRecord, depth: number, hasKids: boolean, kidCount: number, rowKey: string) {
    return tableLiveRow(row, depth, hasKids, kidCount, rowKey, true)
  }

  function tableBodyRows(rows: DbRecord[], keyPrefix = '') {
    const listed = flattenRows(rows)
    if (!listed.length) {
      return (
        <tr key="empty">
          <td colSpan={tablePaintRef.current.colSpan} className="fsdb-empty">
            {error ? '加载失败' : tableHoldRef.current?.nodes === EMPTY_HOLD_NODES ? '' : listReadySent.current ? '暂无记录' : ''}
          </td>
        </tr>
      )
    }
    return <>{listed.map((item) => tableRecordRow(item.row, item.depth, item.hasKids, item.kidCount, `${keyPrefix}${item.row.id}`))}</>
  }

  function renderPaintNode(node: TablePaintNode) {
    if (node.kind === 'empty') return tableBodyRows([])
    if (node.kind === 'row') return tableRecordRow(node.row, node.depth, node.hasKids, node.kidCount, node.key)
    if (node.kind === 'group-head') {
      return (
        <tr key={node.key} className="fsdb-group-row" data-group-key={node.groupKey}>
          <td colSpan={tablePaintRef.current.colSpan}>
            {renderGroupHead(node.groupKey, node.label)}
          </td>
        </tr>
      )
    }
    const pages = Math.max(1, Math.ceil(node.count / pageSize))
    const pageIndex = Math.min(node.pageIndex, pages - 1)
    return (
      <tr key={node.key} className="fsdb-group-pager" data-group-pager={node.groupKey}>
        <td colSpan={tablePaintRef.current.colSpan}>
          <div className="fsdb-pager">
            <span className="fsdb-pager-meta">{node.count}</span>
            <div className="fsdb-pager-nav">
              <PagerSizeControl pageSize={pageSize} onChange={changePageSize} />
              <button
                type="button"
                className="tasks-icon-btn"
                aria-label="上一页"
                disabled={pageIndex <= 0}
                onClick={() => setGroupPages((prev) => ({ ...prev, [node.groupKey]: Math.max(0, pageIndex - 1) }))}
              >
                <UiGlyph icon="chevron-left" />
              </button>
              <button
                type="button"
                className="tasks-icon-btn"
                aria-label="下一页"
                disabled={(pageIndex + 1) * pageSize >= node.count}
                onClick={() => setGroupPages((prev) => ({ ...prev, [node.groupKey]: pageIndex + 1 }))}
              >
                <UiGlyph icon="chevron-right" />
              </button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

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
    if (!sheet && activeViewId) patchActiveView({ filterTree: next, filters: {} })
  }

  function persistActiveViewNow() {
    if (sheet || !hydrated || !activeViewId) return
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
      freezeTitle,
      query,
      pageSize,
      columnWidths,
    })
    if (viewStateKey(current) === viewStateKey(next)) return
    persistViewDisplay(collectionPath, next.id, next)
    persistViews(viewsRef.current.map((view) => (view.id === activeViewId ? next : view)))
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
    if (sheet || !hydrated || !activeViewId) return
    const persistGen = skipPersistGen.current
    const id = window.setTimeout(() => {
      if (persistGen !== skipPersistGen.current) return
      persistActiveViewRef.current()
    }, 400)
    return () => window.clearTimeout(id)
  }, [
    activeViewId,
    collectionPath,
    columnKeys,
    columnWidths,
    filters,
    filterTree,
    groupBy,
    groupConfig,
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
    Number(sortCustom),
    sortsStateKey(sorts),
    Number(filterActive),
    filterEditorStateKey(filterTree),
    Number(grouping),
    groupBy,
    groupConfigStateKey(groupConfig),
    panelGroups.map((g) => `${g.key}:${g.label}:${g.total ?? g.rows.length}`).join('\0'),
    Number(wrapCells),
    Number(truncateCells),
    Number(showTree),
    Number(freezeTitle),
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
            }).then((data) => {
              setViewBanner(data.value?.banner ?? next)
              emitFsdbChange({ scope: 'content', path })
            }).catch(() => {
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
                        onClick={() => setDlg({
                          kind: 'delete-records',
                          ids: pickedIds.filter((id) => !(collectionPath === PLUGINS_COLLECTION_PATH && items.find((row) => row.id === id)?.builtin === true)),
                        })}
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
                    const views = extraViews.filter((opt) => flyoutQueryMatch(opt.label, q))
                    const rows = extraRows.filter((opt) => flyoutQueryMatch(opt.label, q))
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
                  {views.map((opt) => (
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
                  {rows.map((opt) => (
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
                  {q.trim() && !modes.length && !views.length && !rows.length ? <FlyoutEmpty /> : null}
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
                  inside={(node) => node instanceof Element && Boolean(node.closest('.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))}
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
                  inside={(node) => node instanceof Element && Boolean(node.closest('.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))}
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
        <header className="chat-view-header" data-biu-ignore>
          <div className="chat-view-header-left">
            {sidebarGone ? (
              <button
                type="button"
                className="chat-view-header-expand"
                title="展开左侧边栏"
                aria-label="展开左侧边栏"
                data-testid="header-sidebar-expand"
                onClick={() => window.dispatchEvent(new Event(EXPAND_SHELL_SIDEBAR_EVENT))}
              >
                <UiGlyph icon="chevron-double-right" />
              </button>
            ) : null}
            <CrumbTrail
              crumbs={crumbs}
              canCreateView
              canCreateRecord={canCreate}
              onCreate={(kind) => {
                if (kind === 'record') void createRecord()
                else addEmptyView()
              }}
              onPick={(target) => {
                if (target.kind === 'view' && target.collection === collectionPath) {
                  const view = views.find((item) => item.id === target.viewId)
                  if (view) selectView(view)
                  return
                }
                onCrumbTarget?.(target)
              }}
              navRef={crumbRef}
            />
          </div>
          <div className="chat-view-header-right">
            {activeViewId && !selected ? (
              <button
                type="button"
                className={`chat-view-header-expand${viewStarred ? ' is-starred' : ''}`}
                title={viewStarred ? '取消收藏视图' : '收藏视图'}
                aria-label={viewStarred ? '取消收藏视图' : '收藏视图'}
                aria-pressed={viewStarred}
                onClick={() => persistStarredViews(toggleStarredView(getStarredViews(), collectionPath, activeViewId, activeView?.name))}
              >
                <UiGlyph icon="star" />
              </button>
            ) : null}
            {isSystemCollection(collectionPath) || isIndexCollection(collectionPath) || (collectionPath === PLUGINS_COLLECTION_PATH && detailRow?.builtin === true) ? null : (
            <ShareButton
              localOnly={localData}
              target={
                detailId
                  ? {
                      kind: 'record' as const,
                      collection: collectionPath,
                      viewId: activeViewId ?? undefined,
                      recordId: detailId,
                      title: String(detailRow?.title ?? title),
                    }
                  : !nested && activeViewId
                    ? {
                        kind: 'view' as const,
                        collection: collectionPath,
                        viewId: activeViewId,
                        title: activeView?.name ?? title,
                      }
                    : null
              }
            />
            )}
            <div className="fsdb-layout-wrap" ref={layoutRef}>
              <button
                type="button"
                className={`chat-view-header-expand${layoutOpen ? ' is-active' : ''}`}
                title="配置"
                aria-label="配置"
                aria-haspopup="menu"
                aria-expanded={layoutOpen}
                data-testid="fsdb-layout-toggle"
                onClick={() => toggleMenu('layout')}
              >
                <UiGlyph icon="sliders" />
              </button>
              {layoutOpen ? (
                <HeadlessDismiss onDismiss={() => setLayoutOpen(false)} insideRef={layoutRef}>
                  <Suspense fallback={null}>
                    <LayoutPrefsMenu prefs={pagePrefs} />
                  </Suspense>
                </HeadlessDismiss>
              ) : null}
            </div>
            <button
              type="button"
              className={`chat-view-header-expand${inspectorOpen ? ' is-active' : ''}`}
              title={inspectorOpen ? '收起检查器' : '打开检查器'}
              aria-label={inspectorOpen ? '收起检查器' : '打开检查器'}
              aria-pressed={inspectorOpen}
              data-testid="fsdb-inspector-toggle"
              onClick={() => window.dispatchEvent(new Event(INSPECTOR_TOGGLE_EVENT))}
            >
              <UiGlyph icon={inspectorOpen ? 'chevron-double-right' : 'chevron-double-left'} />
            </button>
          </div>
        </header>
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
      compositeCells: compositeCellKeys,
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
      columns,
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
        {!detailId ? (
        <div className="tasks-main fsdb-main">
        {listChrome}
        {error ? <p className="tasks-error">{error}</p> : null}

        <div className="fsdb-workspace">
          <div className="fsdb-stage">
            {customView ? (
              <PluginSurface plugin={customView.plugin} label={customView.label}>
                <customView.View path={dataPath} rows={items} schema={schema} onOpen={openRow} />
              </PluginSurface>
            ) : null}
            {rowView ? (
              <PluginSurface plugin={rowView.plugin} label={rowView.label}>
                <Suspense fallback={null}>
                <CollectionRowsShell
                  rows={items}
                  schema={schema}
                  columns={columns.map((item) => item.key)}
                  onOpen={openRow}
                  Row={rowView.Row}
                />
                </Suspense>
              </PluginSurface>
            ) : null}
            {!customView && !rowView ? (
              <div className="tasks-table-wrap" ref={tableWrapRef}>
                <WindowedTable
                  columns={held?.columns ?? columns}
                  columnWidths={held?.columnWidths ?? columnWidths}
                  columnPinCount={held?.columnPinCount ?? columnPinCount}
                  wrapCells={held?.wrapCells ?? wrapCells}
                  truncateCells={held?.truncateCells ?? truncateCells}
                  resizingCol={held ? null : resizingCol}
                  nodes={held?.nodes ?? tablePaintNodes}
                  error={held ? '' : error}
                  pickMode={pickMode}
                  resetKey={held?.resetKey ?? tableResetKey}
                  forceLiveChecks={!held && pickedIds.length > 0}
                  checkLayoutExtra={held?.checkLayoutExtra ?? checkLayoutExtra}
                  paintRef={tablePaintRef}
                  chromeRef={tableChromeRef}
                  colWindowRef={colWindowRef}
                  tableRef={tableRef}
                  wrapRef={tableWrapRef}
                  stageRef={tableStageRef}
                  checkStackRef={checkStackRef}
                  checkHoverRef={checkHoverRef}
                  paintCheckHover={paintCheckHover}
                  renderCheckHead={renderCheckHead}
                  renderCheckRow={renderCheckRow}
                  checkStore={checkStore}
                  onVisibleRange={onVisibleRange}
                  frozen={Boolean(held)}
                  activeRowId={detailId}
                  retainedRowId={cellPop?.id}
                  retainedRowKey={cellPop?.rowKey}
                  retainedColumnKey={cellPop?.key}
                  preserveMountedRows={columns.some((col) => Boolean(chrome?.cells?.[col.key]))}
                />
        </div>
            ) : null}
          </div>
          {grouping ? null : (
          <div className="fsdb-pager" data-biu-ignore>
            <span className="fsdb-pager-meta" title={total ? `共 ${total} 条` : '暂无记录'}>
              <HashtagIcon aria-hidden className="size-[14px]" />
              <span>{total}</span>
            </span>
            <div className="fsdb-pager-nav">
              <PagerSizeControl pageSize={pageSize} onChange={changePageSize} />
              <button
                type="button"
                className="tasks-icon-btn"
                aria-label="上一页"
                disabled={page <= 0}
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              >
                <UiGlyph icon="chevron-left" />
              </button>
              <button
                type="button"
                className="tasks-icon-btn"
                aria-label="下一页"
                disabled={total <= 0 || (page + 1) * pageSize >= total}
                onClick={() => setPage((prev) => prev + 1)}
              >
                <UiGlyph icon="chevron-right" />
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
        ) : selected && schema ? (
        <Suspense fallback={<PageContentLoading />}>
        <RecordDetail
          selected={selected}
          schema={schema}
          chrome={
            isDataOverview
              ? {
                  ...chrome,
                  ...getDatabaseUi()?.chrome(String(selected.tablePath ?? '')),
                  openRow: chrome.openRow,
                  listViews: chrome.listViews,
                  cells: chrome.cells,
                  Actions: chrome.Actions,
                }
              : chrome
          }
          draft={draft}
          detailBody={detailBody}
          detailBodyStatus={detailBodyStatus}
          detailBodyError={detailBodyError}
          onRetryBody={refreshOpenDetail}
          labelOf={labelOf}
          renderCell={renderCell}
          setDraft={setDraft}
          writeOne={writeOne}
          writePatch={writePatch}
          tableIcon={currentTable?.view?.icon}
          readOnly={
            (collectionPath === PLUGINS_COLLECTION_PATH && selected.builtin === true && selected.canManagePackage !== true) ||
            (selected.shareRole === '阅读' && !localData && selected.canManagePackage !== true)
          }
          actionProperty={rowActionColumn ? renderRecordActions(selected) : null}
          share={
            nested && detailId ? (
              <SharePanel
                embedded
                localOnly={localData}
                target={{
                  kind: 'record',
                  collection: collectionPath,
                  viewId: activeViewId ?? undefined,
                  recordId: detailId,
                  title: String(detailRow?.title ?? title),
                }}
              />
            ) : undefined
          }
          onDelete={canDelete && !(collectionPath === PLUGINS_COLLECTION_PATH && selected.builtin === true) ? () => setDlg({ kind: 'delete-record', row: selected }) : undefined}
          onOpenRecord={(recordId, collection) => onOpenRecord?.(recordId, activeViewId, collection)}
          onPrev={() => void stepViewRecord(-1)}
          onNext={() => void stepViewRecord(1)}
          canPrev={canStepPrev}
          canNext={canStepNext}
          collectionPath={collectionPath}
          recordKind={recordKind}
          inspectorPaneId={inspectorPaneId}
          visibleColumns={columnKeys.length ? columnKeys : schemaDefaultKeys}
          onVisibleColumns={setVisibleColumns}
          columnMenu={renderVisibleColumnsFlyout()}
        />
        </Suspense>
      ) : null}
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
      {renderCellPop()}
      <DockHoverTip />
    </div>
  )
}
