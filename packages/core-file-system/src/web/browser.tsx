import { createContext, lazy, memo, Suspense, type ComponentProps, type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
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
  PencilSquareIcon,
  PlusIcon,
  RectangleStackIcon,
  ArrowDownTrayIcon,
  Square2StackIcon,
  GlobeAltIcon,
  UserIcon,
  UsersIcon,
  ViewColumnsIcon,
} from '@heroicons/react/16/solid'
import type { CollectionActionInfo, CollectionInfo, CollectionSchema, CollectionSchemaPack, DbRecord, FieldSpec, FieldType } from '@biu/type-file-system'
import { normalizeSchemaValue } from '@biu/type-file-system'
import type { CollectionChrome, CollectionRowViewType, CollectionViewType, DatabaseUi } from '@biu/type-file-system/ui'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { BoolBox } from '@biu/public-ui/bool-box'
import { ChatCount } from '@biu/public-ui/chat-count'
import { HeadlessDismiss, HEADLESS_DISMISS_IGNORE } from '@biu/public-ui/headless-dismiss'
import { tagTextColor, tagTone as schemaTagTone } from '@biu/public-ui/tag-chip'
import {
  contentFieldKey,
  defaultColumnKeys,
  facetSourceKey,
  flattenFacetColumns,
  facetColumnTitle,
  fieldEntries,
  flattenTree,
  formatField,
  fieldValueOptions,
  groupField,
  groupListKeys,
  groupRecords,
  groupableFields,
  hasTreeLinks,
  isRecordLinkField,
  listProjectionKeys,
  overlayListed,
  previewActionRecord,
  parentFieldKey,
  parseFacetFlatColumnKey,
  patchFacetFlatValue,
  pinActionColumn,
  readFacetFlatValue,
  resolveFieldType,
  uniqueValues,
  type GroupBucket,
  type ViewMode,
} from './fields.ts'
import { listGroupedCollection } from './group-list.ts'
import { AppDialog, CheckRow } from './controls.tsx'
import { buildCrumbs, type CrumbTarget } from './sidebar-nav.ts'
import { CrumbTrail } from './crumb-trail.tsx'
import { fieldPickAttrs, pickDomAttrs, recordPickKind, recordSourcePath } from './pick-dom.ts'
import { normalizeRecordEmoji, recordPreviewEmoji, crumbRecordLabel } from './sidebar-preview.ts'
import { recordPreviewMascot, RecordMark } from './record-mark.tsx'
import { COL_WIDTH_MAX, COL_WIDTH_MIN, colWidthStyle, normalizeColumnWidths, normalizeSavedView, normalizePageSize, viewStateKey, type SavedView } from './saved-view.ts'
import { PagerSizeControl } from './pager-size.tsx'
import {
  actionIcon,
  ActionCell,
  BoolCell,
  DefaultCell,
  draftFromRecord,
  fieldActionId,
  FieldGlyph,
  FilePreview,
  ModeGlyph,
  parseFieldValue,
  VIEW_MODES,
  visibleActions,
  placedActions,
} from './fsdb-cells.tsx'
import { ShareScopeLabel } from './share-scope-label.tsx'
import { ensureFsdbStyle } from './fsdb-style.ts'
import { workspaceColumnsForLocation } from './workspace-columns.ts'
import { PageBanner } from './page-banner.tsx'
import { UiGlyph, ViewModeGlyph, idleTableIconKind } from './nav-glyphs.tsx'
import { isIndexCollection, isSystemCollection } from './database-path.ts'
import { countFittingViewTabs, splitVisibleViews } from './view-tabs.ts'
import { getDatabaseUi } from './database-ui.ts'
import {
  activeViewStorageKey,
  fetchSavedView,
  getStarredViews,
  getStarredViewsVersion,
  isViewStarred,
  loadViews,
  pullSavedViews,
  rememberRecords,
  rememberViews,
  persistStarredViews,
  persistViewDisplay,
  pickViewForRoute,
  pushSavedViews,
  routeViewNeedsFetch,
  subscribeStarredViews,
  toggleStarredView,
  viewForPath,
  viewsKey,
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
import { HttpError, listCollection, readJson } from './db-client.ts'
import { savedViewRecordPath } from '../paths.ts'
import { findViewNeighbor, indexOnPage } from './view-adjacent.ts'
import { TABLE_ROW_PX, TABLE_WRAP_ROW_PX, TABLE_WINDOW_OVERSCAN, TABLE_WINDOW_VIEWPORT_FALLBACK, TABLE_COL_VIEWPORT_FALLBACK, tableColumnEstimate, tableColumnFit, tableColumnSlice, tableColumnUnchanged, tableWindowSlice, tableWindowUnchanged, type TableColumnSlice } from './table-window.ts'
import {
  IDLE_CELL_TEXT_MAX,
  idleBoolInnerHtml,
  idleEmptyUsageInnerHtml,
  idleSelectInnerHtml,
  idleTableRowHtml,
  idleTextInnerHtml,
  idleTitleInnerHtml,
  type IdleTableTd,
} from './table-idle-html.ts'
import { isPaintedListReady, markPaintedListReady, rememberPreviewTotal, resetPaintedListReady, viewTotalKey, whenListIdle } from './sidebar-preview.ts'
import { catalogLockFilters, isReadOnlyViewId, mergeTableViews, parseBuiltinScopeViewId, stubBuiltinBlockKindView, viewsForScope, type DataScope } from '../catalog-views.ts'
import { SAVED_VIEW_EVENT, rememberInspectorWorkingView, showRecordInInspector } from './inspector-db-route.ts'
import { CellPop, cellUsesPop } from './cell-pop.tsx'
import { loadFacets, pullFacets, subscribeFacets } from './facet-catalog.ts'
import {
  collectQueryFields,
  isCustomSorts,
  countFilterRules,
  emptyFilterGroup,
  encodeListFilter,
  filterTreeStateKey,
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
const FieldValuePop = lazy(() => import('./field-value-pop.tsx').then((m) => ({ default: m.FieldValuePop })))
const CellPopDraft = lazy(() => import('./cell-pop-draft.tsx').then((m) => ({ default: m.CellPopDraft })))
const RecordDetail = lazy(() => import('./record-detail.tsx').then((m) => ({ default: m.RecordDetail })))
const ColumnOrderMenu = lazy(() => import('./column-order-menu.tsx').then((m) => ({ default: m.ColumnOrderMenu })))
const RecordEmojiBoard = lazy(() => import('@biu/public-ui/emoji-board').then((m) => ({ default: m.RecordEmojiBoard })))
const LazyShareButton = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.ShareButton })))
const LazySharePanel = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.SharePanel })))
const LazyShareRoleDetail = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.ShareRoleDetail })))
const LazyShareScopeDetail = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.ShareScopeDetail })))
const ScopeOverview = lazy(() => import('./scope-overview.tsx').then((m) => ({ default: m.ScopeOverview })))
const DataSidebar = lazy(() => import('./data-sidebar.tsx').then((m) => ({ default: m.DataSidebar })))
const LayoutPrefsMenu = lazy(() => import('./layout-prefs-menu.tsx').then((m) => ({ default: m.LayoutPrefsMenu })))
const CollectionRowsShell = lazy(() => import('./rows-view.tsx').then((m) => ({ default: m.CollectionRowsShell })))

function IdleDataSidebar(props: ComponentProps<typeof DataSidebar>) {
  const [sidebarPaint, setSidebarPaint] = useState(false)
  useEffect(() => {
    if (sidebarPaint) return
    let cancelled = false
    let idleId = 0
    let timer = 0
    const show = () => {
      if (!cancelled) setSidebarPaint(true)
    }
    const arm = () => {
      const ric = window.requestIdleCallback
      if (typeof ric === 'function') idleId = ric(show, { timeout: 240 })
      else timer = window.setTimeout(show, 240)
    }
    if (isPaintedListReady()) arm()
    else window.addEventListener('fsdb:list-ready', arm)
    return () => {
      cancelled = true
      window.removeEventListener('fsdb:list-ready', arm)
      if (idleId) window.cancelIdleCallback(idleId)
      if (timer) window.clearTimeout(timer)
    }
  }, [sidebarPaint])
  if (!sidebarPaint) return null
  return <DataSidebar {...props} />
}

function ShareButton(props: ComponentProps<typeof LazyShareButton>) {
  return <Suspense fallback={null}><LazyShareButton {...props} /></Suspense>
}
function SharePanel(props: ComponentProps<typeof LazySharePanel>) {
  return <Suspense fallback={null}><LazySharePanel {...props} /></Suspense>
}
function ShareRoleDetail(props: ComponentProps<typeof LazyShareRoleDetail>) {
  return <Suspense fallback={null}><LazyShareRoleDetail {...props} /></Suspense>
}
function ShareScopeDetail(props: ComponentProps<typeof LazyShareScopeDetail>) {
  return <Suspense fallback={null}><LazyShareScopeDetail {...props} /></Suspense>
}

const EMPTY_VIEWS: CollectionViewType[] = []
const EMPTY_ROW_VIEWS: CollectionRowViewType[] = []
const EMPTY_PICK = {}

function HoverMount({ children }: { children: ReactNode }) {
  const [live, setLive] = useState(false)
  return (
    <span className="tasks-hover-mount" onMouseEnter={() => { if (!live) setLive(true) }}>
      {live ? children : null}
    </span>
  )
}

function TableIdleRow({
  recordId,
  className,
  pick,
  html,
  renderLive,
}: {
  recordId: string
  className?: string
  pick: object
  html: string
  renderLive: () => ReactNode
}) {
  const [live, setLive] = useState(false)
  const liveRef = useRef(renderLive)
  liveRef.current = renderLive
  if (live) return liveRef.current()
  return (
    <tr
      data-record-id={recordId}
      data-table-idle=""
      className={className}
      {...pick}
      onMouseEnter={() => setLive(true)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function TableRecordIcon({
  row,
  label,
  tableIcon,
  Icon,
  onWriteEmoji,
}: {
  row: DbRecord
  label: string
  tableIcon?: string
  Icon?: CollectionChrome['Icon']
  onWriteEmoji: (next: string) => void
}) {
  const emoji = recordPreviewEmoji(row)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <span className="fsdb-table-record-icon">
      <button
        type="button"
        className="fsdb-table-emoji-btn"
        title={emoji ? '更换图标' : '设置图标'}
        aria-label={emoji ? `更换 ${label} 的图标` : `设置 ${label} 的图标`}
        onClick={(event) => {
          event.stopPropagation()
          const btn = event.currentTarget
          setOpen((prev) => {
            if (prev) {
              setAnchor(null)
              return false
            }
            setAnchor(btn)
            return true
          })
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <RecordMark record={row} tableIcon={tableIcon} Icon={Icon} />
      </button>
      {open && anchor ? (
        <Suspense fallback={null}>
          <RecordEmojiBoard
            anchor={anchor}
            onPick={(next) => {
              onWriteEmoji(normalizeRecordEmoji(next))
              setOpen(false)
              setAnchor(null)
            }}
            onClear={() => {
              onWriteEmoji('')
              setOpen(false)
              setAnchor(null)
            }}
            onClose={() => {
              setOpen(false)
              setAnchor(null)
            }}
          />
        </Suspense>
      ) : null}
    </span>
  )
}

function RecordOpenControls({
  row,
  kidCount = 0,
  toolsLive = true,
  nested,
  pick,
  onOpenSplit,
  onOpenRow,
}: {
  row: DbRecord
  kidCount?: number
  toolsLive?: boolean
  nested: boolean
  pick: object
  onOpenSplit: () => void
  onOpenRow: () => void
}) {
  return (
    <span className="tasks-title-aside">
      {toolsLive && !nested ? (
        <button
          type="button"
          className="tasks-icon-btn tasks-title-open"
          data-testid="record-title-split"
          aria-label="在右侧打开"
          title="在右侧打开"
          onClick={(event) => {
            event.stopPropagation()
            onOpenSplit()
          }}
        >
          <ViewColumnsIcon aria-hidden className="size-[14px]" />
        </button>
      ) : null}
      <span className="tasks-title-zoom">
        {kidCount > 0 ? <ChatCount count={kidCount} className="tasks-tree-count" title={`${kidCount} 项`} /> : null}
        {toolsLive ? (
          <button
            type="button"
            className="tasks-icon-btn tasks-title-open"
            data-testid="record-title-open"
            {...pick}
            data-biu-action="open"
            aria-label="查看详情"
            title="查看详情"
            onClick={(event) => {
              event.stopPropagation()
              onOpenRow()
            }}
          >
            <ArrowsPointingOutIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
      </span>
    </span>
  )
}

function RecordTitle({
  row,
  label,
  Title,
  openDetail = true,
  depth = 0,
  hasKids = false,
  kidCount = 0,
  treeOn,
  collapsed,
  onToggleCollapsed,
  tableIcon,
  Icon,
  nested,
  pick,
  onOpenSplit,
  onOpenRow,
  onWriteEmoji,
  toolsArmed = false,
}: {
  row: DbRecord
  label: string
  Title?: CollectionChrome['Title']
  openDetail?: boolean
  depth?: number
  hasKids?: boolean
  kidCount?: number
  treeOn: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  tableIcon?: string
  Icon?: CollectionChrome['Icon']
  nested: boolean
  pick: object
  onOpenSplit: () => void
  onOpenRow: () => void
  onWriteEmoji: (next: string) => void
  toolsArmed?: boolean
}) {
  const [toolsLive, setToolsLive] = useState(toolsArmed)
  const armTools = () => {
    if (!toolsLive) setToolsLive(true)
  }
  const tree = openDetail && treeOn
  if (!toolsLive && !tree) {
    const emoji = recordPreviewEmoji(row)
    return (
      <span className="fsdb-title-host" onMouseEnter={armTools}>
        {emoji ? (
          <span className="fsdb-record-emoji">{emoji}</span>
        ) : (
          <span className="fsdb-record-mark is-sm" data-icon={idleTableIconKind(tableIcon)} aria-hidden />
        )}
        <span className="fsdb-title-text">{label}</span>
      </span>
    )
  }
  return (
    <>
      <span className="fsdb-title-host" style={tree ? { paddingLeft: depth * 16 } : undefined} onMouseEnter={armTools}>
        {tree ? (
          hasKids ? (
            <button
              type="button"
              className="tasks-tree-toggle"
              aria-label={collapsed ? '展开子记录' : '收起子记录'}
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapsed()
              }}
            >
              {collapsed ? (
                <ChevronRightIcon aria-hidden className="size-[14px]" />
              ) : (
                <ChevronDownIcon aria-hidden className="size-[14px]" />
              )}
            </button>
          ) : (
            <span className="tasks-tree-toggle is-empty" aria-hidden />
          )
        ) : null}
        {openDetail && toolsLive ? (
          <TableRecordIcon row={row} label={label} tableIcon={tableIcon} Icon={Icon} onWriteEmoji={onWriteEmoji} />
        ) : (
          <RecordMark record={row} tableIcon={tableIcon} />
        )}
        <span className="fsdb-title-text">{toolsLive && Title ? <Title record={row} label={label} /> : label}</span>
      </span>
      {toolsLive || (tree && kidCount > 0) ? (
        <span className="tasks-row-tools-slot">
          <RecordOpenControls
            row={row}
            kidCount={tree ? kidCount : 0}
            toolsLive={toolsLive}
            nested={nested}
            pick={pick}
            onOpenSplit={onOpenSplit}
            onOpenRow={onOpenRow}
          />
        </span>
      ) : null}
    </>
  )
}

function PluginSurface({
  plugin,
  label,
  children,
}: {
  plugin?: string
  label?: string
  children: ReactNode
}) {
  if (!plugin) return children
  return (
    <div
      className="fsdb-plugin-surface"
      data-biu-plugin={plugin}
      data-biu-kind="plugin"
      data-biu-id={plugin}
      data-biu-label={label || plugin}
    >
      {children}
    </div>
  )
}

function askNewPresentation(opts: { path: string; title?: string }) {
  const path = opts.path.trim()
  const name = opts.title?.trim() || path
  const draft = `请为「${name}」添加一种新的呈现方式。先听我描述要看板、日历还是别的样子，再写无头插件：databaseUi.registerRowView("${path}", { id, label, plugin: 本插件id, Row }) 只换每一行；或 databaseUi.registerView("${path}", { id, label, plugin: 本插件id, View }) 整页自己画。plugin 必须能被 pick 抓到。不要改 packages/。用 sandbox + pack 安装。装好后会出现在查看模式菜单里。`
  void import('@biu/core-pick/web').then((mod) => {
    mod.getPick()?.attach(
      path
        ? [
            {
              kind: 'collection',
              id: `view:${path}`,
              action: 'view',
              path,
              label: '呈现方式',
              title: name,
              route: typeof window === 'undefined' ? '' : window.location.pathname,
            },
          ]
        : [],
      { text: draft },
    )
  })
}

type CheckSlot = { kind: 'head' | 'gap' | 'row'; id?: string; top: number; h: number }

function TableCheckRail({
  tableRef,
  stackRef,
  stageRef,
  hoverRef,
  layoutKey,
  forceLive,
  paintCheckHover,
  renderHead,
  renderRow,
}: {
  tableRef: RefObject<HTMLTableElement | null>
  stackRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  hoverRef: RefObject<string | 'head' | null>
  layoutKey: string
  forceLive: boolean
  paintCheckHover: (next: string | 'head' | null, force?: boolean) => void
  renderHead: () => ReactNode
  renderRow: (id: string) => ReactNode
}) {
  const [live, setLive] = useState(false)
  const [checkSlots, setCheckSlots] = useState<CheckSlot[]>([])
  const active = live || forceLive

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || live) return
    const arm = () => setLive(true)
    stage.addEventListener('mouseenter', arm)
    return () => stage.removeEventListener('mouseenter', arm)
  }, [live, stageRef])

  useEffect(() => {
    if (!active) {
      setCheckSlots((prev) => (prev.length ? [] : prev))
      return
    }
    const table = tableRef.current
    if (!table) {
      setCheckSlots((prev) => (prev.length ? [] : prev))
      return
    }
    let raf = 0
    const measure = () => {
      if (!table.offsetHeight) {
        raf = requestAnimationFrame(measure)
        return
      }
      const next: CheckSlot[] = []
      const head = table.tHead?.rows[0]
      if (head) next.push({ kind: 'head', top: head.offsetTop, h: head.offsetHeight })
      for (const tr of Array.from(table.tBodies[0]?.rows ?? [])) {
        const top = tr.offsetTop
        const h = tr.offsetHeight
        if (tr.classList.contains('fsdb-group-row') || !tr.dataset.recordId) next.push({ kind: 'gap', top, h })
        else next.push({ kind: 'row', id: tr.dataset.recordId, top, h })
      }
      setCheckSlots((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (slot, i) =>
              slot.kind === next[i]!.kind &&
              slot.id === next[i]!.id &&
              slot.top === next[i]!.top &&
              slot.h === next[i]!.h,
          )
        ) {
          return prev
        }
        return next
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(table)
    for (const img of Array.from(table.querySelectorAll('img'))) ro.observe(img)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [active, layoutKey, tableRef])

  useLayoutEffect(() => {
    paintCheckHover(hoverRef.current, true)
  }, [checkSlots, hoverRef, paintCheckHover])

  return (
    <div className="fsdb-check-rail" data-testid="fsdb-check-rail">
      <div className="fsdb-check-stack" ref={stackRef}>
        {checkSlots.map((slot, index) => (
          <div
            key={slot.kind === 'row' ? `${slot.id}-${index}` : `${slot.kind}-${index}`}
            className={`fsdb-check-slot${slot.kind === 'head' ? ' is-head' : ''}`}
            data-check={slot.kind === 'head' ? 'head' : slot.id}
            style={slot.kind === 'head' ? { height: slot.h } : { top: slot.top, height: slot.h }}
            onMouseEnter={() => {
              if (slot.kind === 'head') paintCheckHover('head')
              else if (slot.id) paintCheckHover(slot.id)
            }}
          >
            {slot.kind === 'head' ? renderHead() : null}
            {slot.kind === 'row' && slot.id ? renderRow(slot.id) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

type StatResult = { schema?: CollectionSchema }

let cachedLocalData: boolean | null = null

const LIST_SEED_COLUMNS = [
  'title',
  'status',
  'priority',
  'difficulty',
  'usage',
  'createdBy',
  'assignee',
  'project',
  'tags',
  'dueAt',
  'shareScope',
  'shareRole',
  'pinned',
  'eventCount',
  'updatedAt',
  'name',
  'label',
  'fileList',
]

function isListColumn(key: string) {
  return key !== 'description' && key !== 'notes' && key !== 'content' && key !== 'emoji' && key !== 'banner'
}

const QUERY_NEST_IGNORE = `${HEADLESS_DISMISS_IGNORE}, .db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`

function recordsFingerprint(rows: Array<DbRecord & { path?: string }>) {
  return JSON.stringify(rows)
}

function schemaFingerprint(schema?: CollectionSchema) {
  if (!schema) return ''
  const fields = schema.fields ?? {}
  let out = `${schema.labelField ?? ''}\0${(schema.columns ?? []).join(',')}`
  for (const key of Object.keys(fields)) {
    const field = fields[key]
    out += `\0${key}:${field?.type ?? ''}:${field?.writable ? 1 : 0}`
  }
  return out
}

const LIST_CACHE_MAX = 8
type ListCacheSnap = {
  items: Array<DbRecord & { path?: string }>
  total: number
  stat: StatResult | null
  groupBuckets?: GroupBucket[]
}
const listCache = new Map<string, ListCacheSnap>()

function rememberListCache(path: string, snap: ListCacheSnap) {
  if (listCache.has(path)) listCache.delete(path)
  listCache.set(path, snap)
  while (listCache.size > LIST_CACHE_MAX) {
    const first = listCache.keys().next().value
    if (first === undefined) break
    listCache.delete(first)
  }
}

function sameSavedViews(a: SavedView[], b: SavedView[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.id !== b[i]!.id || viewStateKey(a[i]!) !== viewStateKey(b[i]!)) return false
  }
  return true
}

const EMPTY_FILTERS: Record<string, string> = {}
/** 与选区拖选同一阈值：位移超过这个距离只当拖，不当点击。 */
const CELL_POP_DRAG_PX = 6
const CELL_POP_IGNORE =
  '.fsdb-row-check, .fsdb-col-resizer, .tasks-row-tools, .tasks-title-open, .fsdb-action-btn, .fsdb-action-tag, .fsdb-boolbtn, .fsdb-thumb-btn, .fsdb-thumb, .ant-image, .fsdb-file-tools, .fsdb-ref-chip, .db-datetime, .ant-picker, .fsdb-scope-detail'

type TablePaintNode =
  | { kind: 'empty'; key: string }
  | { kind: 'group-head'; key: string; groupKey: string; label: string; count: number }
  | { kind: 'row'; key: string; keyPrefix: string; row: DbRecord; depth: number; hasKids: boolean; kidCount: number }
  | { kind: 'group-pager'; key: string; groupKey: string; count: number; pageIndex: number }

type TablePaintBag = {
  colSpan: number
  error: string
  renderNode: (node: TablePaintNode) => ReactNode
}

const TABLE_PAINT_REF: RefObject<TablePaintBag> = {
  current: { colSpan: 1, error: '', renderNode: () => null },
}

const TablePaintCtx = createContext<RefObject<TablePaintBag>>(TABLE_PAINT_REF)

type TableBodyProps = {
  nodes: TablePaintNode[]
  start: number
  end: number
  padTop: number
  padBottom: number
  colSpan: number
  colKeys: string
  error: string
  pickMode: boolean
  activeRowId: string | null
}

const TableBody = memo(function TableBody({
  nodes,
  start,
  end,
  padTop,
  padBottom,
  colSpan,
}: TableBodyProps) {
  const bag = useContext(TablePaintCtx).current
  const span = colSpan || bag.colSpan
  const padRow = (px: number, side: 'top' | 'bottom') =>
    px <= 0 ? null : (
      <tr key={`pad-${side}`} className="fsdb-table-pad" aria-hidden>
        <td colSpan={span} style={{ height: px, padding: 0, border: 0 }} />
      </tr>
    )
  return (
    <tbody>
      {padRow(padTop, 'top')}
      {nodes.slice(start, end).map((node) => bag.renderNode(node))}
      {padRow(padBottom, 'bottom')}
    </tbody>
  )
})

function windowedColumnsOf<T>(columns: T[], colWindow: TableColumnSlice) {
  const next = columns.slice(0, colWindow.pin)
  for (let i = colWindow.start; i < colWindow.end; i += 1) next.push(columns[i]!)
  return next
}

function padColBox(px: number) {
  const v = `${Math.max(0, Math.round(px))}px`
  return { width: v, minWidth: v, maxWidth: v }
}

const EMPTY_COL_WINDOW: TableColumnSlice = { pin: 0, start: 0, end: 0, padLeft: 0, padRight: 0 }

type TableChromeBag = {
  paintHeadTh: (col: { key: string }) => ReactNode
  onPointerDown: ComponentProps<'table'>['onPointerDown']
  onPointerMove: ComponentProps<'table'>['onPointerMove']
  onClick: (event: { target: EventTarget | null; currentTarget: EventTarget; clientX: number; clientY: number }) => void
  onMouseOver: ComponentProps<'table'>['onMouseOver']
}

type WindowedTableProps = {
  columns: { key: string }[]
  columnWidths: Record<string, number>
  columnPinCount: number
  wrapCells: boolean
  truncateCells: boolean
  resizingCol: string | null
  nodes: TablePaintNode[]
  error: string
  pickMode: boolean
  resetKey: string
  forceLiveChecks: boolean
  checkLayoutExtra: string
  paintRef: RefObject<TablePaintBag>
  chromeRef: RefObject<TableChromeBag>
  colWindowRef: RefObject<TableColumnSlice>
  tableRef: RefObject<HTMLTableElement | null>
  wrapRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  checkStackRef: RefObject<HTMLDivElement | null>
  checkHoverRef: RefObject<string | 'head' | null>
  paintCheckHover: (next: string | 'head' | null, force?: boolean) => void
  renderCheckHead: () => ReactNode
  renderCheckRow: (id: string) => ReactNode
  onVisibleRange?: (start: number, end: number) => void
  activeRowId: string | null
}

const WindowedTable = memo(function WindowedTable({
  columns,
  columnWidths,
  columnPinCount,
  wrapCells,
  truncateCells,
  resizingCol,
  nodes,
  error,
  pickMode,
  resetKey,
  forceLiveChecks,
  checkLayoutExtra,
  paintRef,
  chromeRef,
  colWindowRef,
  tableRef,
  wrapRef,
  stageRef,
  checkStackRef,
  checkHoverRef,
  paintCheckHover,
  renderCheckHead,
  renderCheckRow,
  onVisibleRange,
  activeRowId,
}: WindowedTableProps) {
  const [tableScroll, setTableScroll] = useState({
    top: 0,
    height: TABLE_WINDOW_VIEWPORT_FALLBACK,
    left: 0,
    width: TABLE_COL_VIEWPORT_FALLBACK,
  })
  const paintCountRef = useRef(0)
  const wrapCellsRef = useRef(false)
  const columnMetaRef = useRef({ count: 0, pin: 0, widths: [] as number[] })
  const columnPx = useMemo(
    () =>
      tableColumnFit(
        columns.map((col, index) => tableColumnEstimate(col.key, columnWidths[col.key], index < columnPinCount)),
        tableScroll.width,
      ),
    [columnPinCount, columnWidths, columns, tableScroll.width],
  )
  const colWindow = useMemo(
    () => tableColumnSlice(columns.length, columnPinCount, tableScroll.left, tableScroll.width, columnPx),
    [columnPinCount, columnPx, columns.length, tableScroll.left, tableScroll.width],
  )
  columnMetaRef.current = { count: columns.length, pin: columnPinCount, widths: columnPx }
  colWindowRef.current = colWindow
  const windowedColumns = useMemo(() => windowedColumnsOf(columns, colWindow), [colWindow, columns])
  const tableColSpan = Math.max(
    windowedColumns.length + (colWindow.padLeft > 0 ? 1 : 0) + (colWindow.padRight > 0 ? 1 : 0),
    1,
  )
  const paintedTablePx = useMemo(() => {
    let sum = Math.max(0, colWindow.padLeft) + Math.max(0, colWindow.padRight)
    for (let i = 0; i < colWindow.pin; i += 1) sum += columnPx[i] || 0
    for (let i = colWindow.start; i < colWindow.end; i += 1) sum += columnPx[i] || 0
    return Math.max(sum, 1)
  }, [colWindow.end, colWindow.padLeft, colWindow.padRight, colWindow.pin, colWindow.start, columnPx])
  const tableWindow = useMemo(
    () =>
      tableWindowSlice(
        nodes.length,
        tableScroll.top,
        tableScroll.height,
        wrapCells ? TABLE_WRAP_ROW_PX : TABLE_ROW_PX,
      ),
    [nodes.length, tableScroll.height, tableScroll.top, wrapCells],
  )
  paintCountRef.current = nodes.length
  wrapCellsRef.current = wrapCells
  paintRef.current.colSpan = tableColSpan

  useEffect(() => {
    onVisibleRange?.(tableWindow.start, tableWindow.end)
  }, [onVisibleRange, tableWindow.end, tableWindow.start])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let raf = 0
    const sync = () => {
      const top = wrap.scrollTop
      const height = wrap.clientHeight
      const left = wrap.scrollLeft
      const width = wrap.clientWidth
      const rowPx = wrapCellsRef.current ? TABLE_WRAP_ROW_PX : TABLE_ROW_PX
      const count = paintCountRef.current
      const cols = columnMetaRef.current
      setTableScroll((prev) => {
        const next = {
          top,
          height: height || prev.height,
          left,
          width: width || prev.width,
        }
        const rowSame = tableWindowUnchanged(count, prev, next, rowPx)
        const colSame = tableColumnUnchanged(cols.count, cols.pin, prev, next, cols.widths)
        return rowSame && colSame ? prev : next
      })
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        sync()
      })
    }
    wrap.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(wrap)
    return () => {
      cancelAnimationFrame(raf)
      wrap.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [wrapRef])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    if (wrap.scrollTop) wrap.scrollTop = 0
    setTableScroll((prev) => (prev.top === 0 ? prev : { ...prev, top: 0 }))
  }, [resetKey, wrapRef])

  const checkLayoutKey = [
    tableWindow.start, tableWindow.end, tableWindow.padTop, tableWindow.padBottom,
    colWindow.start, colWindow.end, colWindow.padLeft, colWindow.padRight,
    wrapCells ? 1 : 0,
    truncateCells ? 1 : 0,
    columns.length,
    checkLayoutExtra,
  ].join('\0')
  const chrome = chromeRef.current
  const paintedColStyle = (index: number) => colWidthStyle(columnPx[index]) ?? padColBox(columnPx[index] || 72)

  return (
    <div className="tasks-table-stage" ref={stageRef} onMouseLeave={() => paintCheckHover(null)}>
      <TableCheckRail
        tableRef={tableRef}
        stackRef={checkStackRef}
        stageRef={stageRef}
        hoverRef={checkHoverRef}
        layoutKey={checkLayoutKey}
        forceLive={forceLiveChecks}
        paintCheckHover={paintCheckHover}
        renderHead={renderCheckHead}
        renderRow={renderCheckRow}
      />
      <table
        ref={tableRef}
        className={`tasks-table${wrapCells ? ' is-wrap' : ''} is-cols-fixed${truncateCells ? ' is-truncate' : ''}${resizingCol ? ' is-col-resize' : ''}`}
        style={{ width: `${paintedTablePx}px`, minWidth: `${paintedTablePx}px`, maxWidth: `${paintedTablePx}px` }}
        onPointerDown={chrome.onPointerDown}
        onPointerMove={chrome.onPointerMove}
        onClick={chrome.onClick}
        onMouseOver={chrome.onMouseOver}
      >
        <colgroup>
          {columns.slice(0, colWindow.pin).map((col, index) => (
            <col key={col.key} style={paintedColStyle(index)} />
          ))}
          {colWindow.padLeft > 0 ? <col key="pad-left" style={padColBox(colWindow.padLeft)} /> : null}
          {columns.slice(colWindow.start, colWindow.end).map((col, index) => (
            <col key={col.key} style={paintedColStyle(colWindow.start + index)} />
          ))}
          {colWindow.padRight > 0 ? <col key="pad-right" style={padColBox(colWindow.padRight)} /> : null}
        </colgroup>
        <thead>
          <tr>
            {columns.slice(0, colWindow.pin).map((col) => chrome.paintHeadTh(col))}
            {colWindow.padLeft > 0 ? <th key="pad-left" className="fsdb-col-pad" aria-hidden style={padColBox(colWindow.padLeft)} /> : null}
            {columns.slice(colWindow.start, colWindow.end).map((col) => chrome.paintHeadTh(col))}
            {colWindow.padRight > 0 ? <th key="pad-right" className="fsdb-col-pad" aria-hidden style={padColBox(colWindow.padRight)} /> : null}
          </tr>
        </thead>
        <TablePaintCtx.Provider value={paintRef}>
          <TableBody
            nodes={nodes}
            start={tableWindow.start}
            end={tableWindow.end}
            padTop={tableWindow.padTop}
            padBottom={tableWindow.padBottom}
            colSpan={tableColSpan}
            colKeys={`${windowedColumns.map((col) => col.key).join('\0')}\0${colWindow.padLeft}:${colWindow.padRight}`}
            error={error}
            pickMode={pickMode}
            activeRowId={activeRowId}
          />
        </TablePaintCtx.Provider>
      </table>
    </div>
  )
})

function ViewTabFit({
  views,
  toolbarRef,
  toolbarRightRef,
  searchExpanded,
  children,
}: {
  views: SavedView[]
  toolbarRef: RefObject<HTMLDivElement | null>
  toolbarRightRef: RefObject<HTMLDivElement | null>
  searchExpanded: boolean
  children: (fit: number) => ReactNode
}) {
  const viewMeasureRef = useRef<HTMLDivElement>(null)
  const [viewTabFit, setViewTabFit] = useState(99)
  const [measureOn, setMeasureOn] = useState(false)
  useEffect(() => {
    setMeasureOn(true)
  }, [])
  useEffect(() => {
    if (!measureOn) return
    function measure() {
      const toolbar = toolbarRef.current
      const right = toolbarRightRef.current
      const row = viewMeasureRef.current
      if (!toolbar || !right || !row) return
      const tabs = Array.from(row.querySelectorAll('[data-view-measure]')) as HTMLElement[]
      const available = Math.max(0, toolbar.clientWidth - right.offsetWidth - 12)
      const next = countFittingViewTabs(tabs.map((el) => el.offsetWidth), available, 2)
      setViewTabFit((prev) => (prev === next ? prev : next))
    }
    const ro = new ResizeObserver(measure)
    if (toolbarRef.current) ro.observe(toolbarRef.current)
    if (toolbarRightRef.current) ro.observe(toolbarRightRef.current)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measureOn, searchExpanded, toolbarRef, toolbarRightRef, views])
  return (
    <>
      {measureOn ? (
      <div className="tasks-viewtabs-measure" ref={viewMeasureRef} aria-hidden>
        {views.map((view) => (
          <button key={view.id} type="button" className="tasks-viewdd-btn tasks-viewtab" tabIndex={-1} data-view-measure={view.id}>
            <ViewModeGlyph mode={view.mode} />
            <span className="tasks-viewdd-name">{view.name}</span>
          </button>
        ))}
      </div>
      ) : null}
      {children(viewTabFit)}
    </>
  )
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
  scopeHome,
  onOpenScopeHome,
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
  scopeHome?: boolean
  onOpenScopeHome?: () => void
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
    const listed = resolveViews
      ? resolveViews(path, user)
      : mergeTableViews(
          tables.find((item) => item.path === path) ?? {
            path,
            label: path === collectionPath ? title : path.replace(/^\//, ''),
          },
          user,
        )
    return listed
  }
  const paintListedViews = (path: string) =>
    listedViews(path, loadViews(path)).map((view) => withViewDisplay(path, view))
  const dataPath = collectionPath
  const [stat, setStat] = useState<StatResult | null>(null)
  const [items, setItems] = useState<Array<DbRecord & { path?: string }>>([])
  const [error, setError] = useState('')
  const [openDetailId, setOpenDetailId] = useState<string | null>(routeRecordId)
  const [detailRow, setDetailRow] = useState<DbRecord | null>(null)
  const [detailBody, setDetailBody] = useState<unknown>(null)
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
  const [createScopeOpen, setCreateScopeOpen] = useState(false)
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
  const [total, setTotal] = useState(0)
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
  const [columnKeys, setColumnKeys] = useState<string[]>(initialView?.columns ?? [])
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => normalizeColumnWidths(initialView?.columnWidths))
  const [resizingCol, setResizingCol] = useState<string | null>(null)
  const [cellPop, setCellPop] = useState<{ id: string; key: string } | null>(null)
  const cellPickRef = useRef<{ id: string; key: string } | null>(null)
  const cellAnchorRef = useRef<HTMLElement | null>(null)
  const cellPopPtrRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null)
  const [facetCatalog, setFacetCatalog] = useState(() => loadFacets())
  const tablePathsKey = tables
    .map((table) => table.path)
    .slice()
    .sort()
    .join('\n')
  const [views, setViews] = useState<SavedView[]>(() => paintListedViews(collectionPath))
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
    setOpenDetailId(id)
    if (id && row) setDetailRow(row)
    if (!id) setDetailRow(null)
    queueMicrotask(() => {
      if (id) onOpenRecord?.(id, activeViewId, dataPath)
      else onCloseRecord?.()
    })
  }
  const openRow = (row: DbRecord) => {
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
  const [hydrated, setHydrated] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(() => {
    try {
      return localStorage.getItem('cordis.sidebar.collapsed') !== '1'
    } catch {
      return true
    }
  })
  const [inspectorOpen, setInspectorOpen] = useState(() => {
    try {
      return localStorage.getItem('cordis.inspector.open') === '1'
    } catch {
      return false
    }
  })
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [wrapCells, setWrapCells] = useState(!!initialView?.wrap)
  const [truncateCells, setTruncateCells] = useState(initialView?.truncate !== false)
  const [groupBy, setGroupBy] = useState(initialView?.groupBy ?? '')
  const [showTree, setShowTree] = useState(initialView?.tree !== false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [groupPages, setGroupPages] = useState<Record<string, number>>({})
  const [groupFillKeys, setGroupFillKeys] = useState<string[]>([])
  const [groupBuckets, setGroupBuckets] = useState<GroupBucket[]>([])
  const groupPagesRef = useRef(groupPages)
  groupPagesRef.current = groupPages
  const groupBucketsRef = useRef(groupBuckets)
  groupBucketsRef.current = groupBuckets
  const loadedIdentityRef = useRef('')
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
    const facetKeys = flattenFacetColumns(facetCatalog).map((item) => item.key)
    const allowed = new Set([...fieldKeys, ...facetKeys, ...cellKeys])
    const seedColumns =
      cachedLocalData === true ? LIST_SEED_COLUMNS.filter((key) => key !== 'shareRole') : LIST_SEED_COLUMNS
    const requested = [
      ...(columnKeys.length ? columnKeys : currentSchema ? defaultColumnKeys(currentSchema, [...allowed]) : seedColumns),
      ...cellKeys,
    ]
    const visible = currentSchema
      ? requested.filter((key) => allowed.has(key) || Boolean(parseFacetFlatColumnKey(key)) || cellKeys.includes(key))
      : requested
    const columns = visible.length ? visible : [...(columnKeys.length ? columnKeys : ['title']), ...cellKeys]
    if (!columns.length) return undefined
    return listProjectionKeys({ schema: currentSchema, columns, groupBy })
  }, [chrome, columnKeys, customView, facetCatalog, groupBy, stat])
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
  const activeViewIdRef = useRef<string | null>(null)
  const syncViewsRef = useRef<() => Promise<void>>(async () => {})
  const adoptViewRef = useRef<(view: SavedView) => void>(() => undefined)
  const hydratedDetail = useRef('')
  const [dlg, setDlg] = useState<
    | { kind: 'rename'; view: SavedView }
    | { kind: 'delete'; view: SavedView }
    | { kind: 'action'; row: DbRecord; action: CollectionActionInfo }
    | { kind: 'alert'; title: string; body: string }
    | { kind: 'delete-record'; row: DbRecord }
    | { kind: 'delete-records'; ids: string[] }
    | { kind: 'bulk-edit'; ids: string[] }
    | { kind: 'bulk-facet'; ids: string[] }
    | null
  >(null)
  const [bulkEditKey, setBulkEditKey] = useState('')
  const [bulkEditRaw, setBulkEditRaw] = useState('')
  const [bulkFacetIds, setBulkFacetIds] = useState<string[]>([])
  const [dlgError, setDlgError] = useState('')
  const crumbRef = useRef<HTMLElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const toolbarRightRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const bulkRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchExpanded = searchOpen || query.length > 0

  function toggleViewsOpen() {
    if (typeof document !== 'undefined' && document.getElementById('shell-module-sidebar')) {
      window.dispatchEvent(new Event('biu:toggle-shell-sidebar'))
      return
    }
    setViewsOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem(`fsdb.viewsOpen:${moduleId || collectionPath}`, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  useEffect(() => {
    if (nested) return
    function applyLayout(left: number, inspector: number) {
      setViewsOpen(left > 0)
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
    }
    function onOpen() {
      setInspectorOpen(true)
    }
    function onClose() {
      setInspectorOpen(false)
    }
    window.addEventListener('biu:shell-layout', onLayout)
    window.addEventListener('biu:shell-sidebar-width', onWidth)
    window.addEventListener('biu:inspector-open', onOpen)
    window.addEventListener('biu:inspector-close', onClose)
    const shell = document.querySelector('[data-testid="app-shell"]')
    if (shell instanceof HTMLElement) {
      const styles = getComputedStyle(shell)
      const left = Number.parseFloat(styles.getPropertyValue('--sidebar-col'))
      const inspector = Number.parseFloat(styles.getPropertyValue('--inspector-width'))
      if (Number.isFinite(left) && Number.isFinite(inspector)) applyLayout(left, inspector)
    }
    return () => {
      window.removeEventListener('biu:shell-layout', onLayout)
      window.removeEventListener('biu:shell-sidebar-width', onWidth)
      window.removeEventListener('biu:inspector-open', onOpen)
      window.removeEventListener('biu:inspector-close', onClose)
    }
  }, [nested])

  useEffect(() => {
    if (nested) return
    function onToggle(event: Event) {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id
      if (!id || (moduleId && id !== moduleId)) return
      toggleViewsOpen()
    }
    window.addEventListener('biu:toggle-module-sidebar', onToggle)
    return () => window.removeEventListener('biu:toggle-module-sidebar', onToggle)
  }, [collectionPath, nested, moduleId])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
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
  const listIdentityKey = `${dataPath}\0${pageSize}\0${fetchQuery}\0${sortField}\0${sortDir}\0${sortsStateKey(sorts)}\0${JSON.stringify(queryFilters)}\0${activeViewId ?? ''}\0${customView ? 'full' : 'proj'}\0${groupBy}\0${wrapCells ? 1 : 0}`
  const reloadKey = `${listIdentityKey}\0${groupBy ? JSON.stringify(groupPages) : page}\0${groupFillKeys.join('\0')}`
  const reload = useCallback(async () => {
    if (!routeViewReadyRef.current) return true
    if (Date.now() < quietUntil.current) return true
    const hit = reloadInflightRef.current
    if (hit?.key === reloadKey) return hit.promise
    const gen = ++reloadGen.current
    const promise = (async () => {
    const listOpts = {
      path: dataPath,
      query: fetchQuery,
      sortField,
      sortDir,
      sorts,
      filters: queryFilters,
      columns: listColumns,
    }
    try {
      const heldStat = statHoldRef.current
      const nextStatPromise = heldStat?.schema
        ? Promise.resolve(heldStat)
        : readJson<StatResult>(`/api/db/stat?path=${encodeURIComponent(dataPath)}`)
      const extraGroupValues = (schema?: CollectionSchema) => {
        const group = groupField(schema, groupBy)
        if (!group || group.field.enum?.length) return []
        return uniqueValues(itemsRef.current, group.key, group.field)
      }
      const loadGroups = (schema?: CollectionSchema) =>
        listGroupedCollection({
          ...listOpts,
          groupBy,
          schema,
          extraValues: extraGroupValues(schema),
          pageSize,
          groupPages: groupPagesRef.current,
          wrap: wrapCells,
          fillKeys: groupFillKeys,
          previous: loadedIdentityRef.current === listIdentityKey ? groupBucketsRef.current : undefined,
          previousPages: loadedPagesRef.current,
          list: listCollection,
        })
      let nextStat: StatResult
      let listed: { items: Array<DbRecord & { path?: string }>; total: number; schema?: CollectionSchema }
      let buckets: GroupBucket[] = []
      const loadUngrouped = () => listCollection({ ...listOpts, limit: pageSize, offset: page * pageSize })
      if (groupBy) {
        const cachedSchema = schemaRef.current
        const cachedKeys = cachedSchema ? groupListKeys(cachedSchema, groupBy, extraGroupValues(cachedSchema)) : []
        if (cachedKeys.length) {
          const [statResult, grouped] = await Promise.all([nextStatPromise, loadGroups(cachedSchema)])
          nextStat = statResult
          if (gen !== reloadGen.current) return true
          if (grouped) {
            listed = grouped
            buckets = grouped.buckets
          } else {
            listed = await loadUngrouped()
          }
        } else {
          nextStat = await nextStatPromise
          if (gen !== reloadGen.current) return true
          const grouped = await loadGroups(nextStat.schema)
          if (gen !== reloadGen.current) return true
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
      if (gen !== reloadGen.current) return true
      const nextSchema = listed.schema ?? nextStat.schema
      setStat((prev) =>
        prev?.schema && schemaFingerprint(prev.schema) === schemaFingerprint(nextSchema) ? prev : { ...nextStat, schema: nextSchema },
      )
      setGroupBuckets((prev) => (JSON.stringify(prev) === JSON.stringify(buckets) ? prev : buckets))
      setItems((prev) => {
        const kept = prev.filter((item) => confirmedCreates.current.has(String(item.id)) && !listed.items.some((row) => row.id === item.id))
        for (const row of listed.items) confirmedCreates.current.delete(String(row.id))
        const next = kept.length ? [...kept, ...listed.items] : listed.items
        setTotal(listed.total + kept.length)
        return recordsFingerprint(prev) === recordsFingerprint(next) ? prev : next
      })
      const openId = detailIdRef.current
      if (openId) {
        const hit = listed.items.find((item) => item.id === openId)
        if (hit) setDetailRow((prev) => (prev?.id === openId ? overlayListed(prev, hit, listColumns) : prev))
      }
      rememberListCache(dataPath, {
        items: listed.items,
        total: listed.total,
        stat: { ...nextStat, schema: nextSchema },
        groupBuckets: buckets,
      })
      if (activeViewId) {
        rememberPreviewTotal(
          viewTotalKey(collectionPath, {
            id: activeViewId,
            sortField,
            sortDir,
            filters: queryFilters as SavedView['filters'],
            query: fetchQuery,
          }),
          listed.total,
        )
      }
      setError('')
      loadedIdentityRef.current = listIdentityKey
      loadedPagesRef.current = { ...groupPagesRef.current }
      if (!listReadySent.current) listReadySent.current = true
      return true
    } catch (err) {
      if (gen !== reloadGen.current) return false
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
    }
  }, [activeViewId, collectionPath, customView, dataPath, fetchQuery, groupBy, groupFillKeys, listColumns, listIdentityKey, queryFilters, page, pageSize, reloadKey, sortDir, sortField, sorts, wrapCells])
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  const detailIdRef = useRef<string | null>(null)
  detailIdRef.current = detailId
  const contentGen = useRef(0)
  const contentVersions = useRef(new Map<string, number>())
  const contentWriteGens = useRef(new Map<string, number>())
  const contentWriteQueues = useRef(new Map<string, Promise<void>>())
  const contentWritePending = useRef(new Map<string, number>())
  const recordGen = useRef(0)
  const pullDetailBody = useCallback(() => {
    const id = detailIdRef.current
    if (!id) {
      setDetailBody(null)
      return
    }
    const path = `${dataPath}/${id}`
    const gen = ++contentGen.current
    void readJson<{ value?: unknown; version?: number }>(`/api/db/content?path=${encodeURIComponent(path)}`)
      .then((data) => {
        if (gen !== contentGen.current || (contentWritePending.current.get(path) ?? 0) > 0) return
        if (Number.isInteger(data.version)) contentVersions.current.set(path, data.version!)
        else contentVersions.current.delete(path)
        setDetailBody(data.value ?? null)
      })
      .catch(() => {
        if (gen !== contentGen.current) return
        setDetailBody(null)
      })
  }, [dataPath])
  const pullDetailRecord = useCallback(() => {
    const id = detailIdRef.current
    if (!id) return
    const gen = ++recordGen.current
    void readJson<{ value?: DbRecord }>(`/api/db/read?path=${encodeURIComponent(`${dataPath}/${id}`)}`)
      .then((data) => {
        const row = data.value
        if (gen !== recordGen.current || !row?.id) return
        setDetailRow((prev) => {
          if (prev?.id && prev.id !== row.id) return prev
          return { ...prev, ...row, banner: row.banner ?? null }
        })
      })
      .catch(() => undefined)
  }, [dataPath])
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
  }, [fetchQuery, queryFiltersKey, sortField, sortDir, pageSize, groupBy, collectionPath, dataPath])

  async function refreshNow() {
    if (refreshing) return
    setRefreshing(true)
    const started = Date.now()
    const ok = await reloadRef.current()
    const wait = Math.max(0, 480 - (Date.now() - started))
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
    setRefreshing(false)
    if (!ok) return
    setNotice('刷新成功')
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 1800)
  }

  useLayoutEffect(() => {
    setHydrated(false)
    hydratePath.current = ''
    listReadySent.current = false
    pageRef.current?.removeAttribute('data-list-ready')
    loadedIdentityRef.current = ''
    loadedPagesRef.current = {}
    resetPaintedListReady()
    skipColumnReload.current = false
    setCollapsed({})
    hydratedDetail.current = ''
    const cached = listCache.get(dataPath)
    setItems(cached?.items ?? [])
    setStat(cached?.stat ?? null)
    setTotal(cached?.total ?? 0)
    setGroupBuckets(cached?.groupBuckets ?? [])
    setGroupPages({})
    setGroupFillKeys([])
    setCollapsedGroups({})
    setError('')
    setPage(0)
    const pendingRouteView = routeViewNeedsFetch(collectionPath, routeViewId)
    routeViewReadyRef.current = !pendingRouteView
    if (pendingRouteView) reloadGen.current += 1
    setRouteViewReady(!pendingRouteView)
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
    window.dispatchEvent(new Event('fsdb:list-ready'))
  })

  useEffect(() => {
    let debounce = 0
    let pendingViews = false
    let pendingData = false
    const onChange = (event: Event) => {
      if ((event as CustomEvent<{ views?: boolean }>).detail?.views) pendingViews = true
      else pendingData = true
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => {
        const viewsTouched = pendingViews
        const dataTouched = pendingData
        pendingViews = false
        pendingData = false
        if (dataTouched) {
          void reloadRef.current()
          if (detailIdRef.current) {
            pullDetailBody()
            pullDetailRecord()
          }
        }
        if (viewsTouched) void syncViewsRef.current()
      }, 120)
    }
    window.addEventListener('fsdb:change', onChange)
    window.addEventListener('fsdb:shares-change', onChange)
    const timer = nested
      ? 0
      : window.setInterval(() => {
          if (detailIdRef.current) return
          void reloadRef.current()
        }, 20000)
    return () => {
      window.clearTimeout(debounce)
      window.clearInterval(timer)
      window.removeEventListener('fsdb:change', onChange)
      window.removeEventListener('fsdb:shares-change', onChange)
    }
  }, [collectionPath, dataPath, nested, pullDetailBody, pullDetailRecord])

  useEffect(() => {
    if (routeRecordId) return
    return whenListIdle(() => {
      void pullFacets()
    })
  }, [collectionPath, routeRecordId])

  useEffect(() => subscribeFacets(undefined, () => setFacetCatalog(loadFacets())), [])

  useEffect(() => {
    const onMode = (event: Event) => {
      setPickMode(Boolean((event as CustomEvent<{ picking?: boolean }>).detail?.picking))
    }
    window.addEventListener('biu:pick-mode', onMode)
    return () => window.removeEventListener('biu:pick-mode', onMode)
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
    if (skipColumnReload.current) {
      skipColumnReload.current = false
      return
    }
    if (routeRecordId) return
    if (!routeViewReadyRef.current) return
    void reloadRef.current()
  }, [reloadKey, routeRecordId, routeViewReady])

  useLayoutEffect(() => {
    setOpenDetailId(routeRecordId)
    if (!routeRecordId) setDetailRow(null)
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
        setDetailRow(row)
      })
      .catch((error) => {
        if (cancelled || !(error instanceof HttpError) || error.status !== 404) return
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
  const canCreate = Boolean(schema?.records?.create) && !subsetLocked
  const canDelete = Boolean(schema?.records?.delete) && !subsetLocked
  const canFacet = Boolean(schema?.fields.facet?.writable) && !subsetLocked
  const bulkFields = useMemo(
    () =>
      fieldEntries(schema).filter(({ key, field }) => {
        if (!field.writable || field.computed) return false
        if (key === 'id' || key === 'createdAt' || key === 'updatedAt' || key === 'createdBy' || key === 'updatedBy') return false
        const kind = resolveFieldType(field)
        return kind !== 'file' && kind !== 'action' && kind !== 'image' && kind !== 'attachment' && kind !== 'facet'
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
      ...flattenFacetColumns(facetCatalog),
    ], localData),
    [bodyKey, entries, facetCatalog, localData, rowActionColumn],
  )
  const allColumnKeys = useMemo(() => allColumns.map((item) => item.key), [allColumns])
  const schemaDefaultKeys = useMemo(
    () => pinActionColumn(schema, defaultColumnKeys(schema, allColumnKeys.filter((key) => key !== 'actions')), rowActionColumn),
    [allColumnKeys, rowActionColumn, schema],
  )
  const schemaDefaultSig = schemaDefaultKeys.join('\0')
  const prevSchemaDefaultSig = useRef('')
  const columns = useMemo(() => {
    const requested = columnKeys.length ? columnKeys : schemaDefaultKeys
    const order = pinActionColumn(
      schema,
      requested.filter((key) => key === 'actions' || allColumns.some((item) => item.key === key)),
      rowActionColumn,
    )
    return order
      .map((key) => allColumns.find((item) => item.key === key))
      .filter(Boolean) as typeof allColumns
  }, [allColumns, columnKeys, rowActionColumn, schema, schemaDefaultKeys])

  const colWindowRef = useRef<TableColumnSlice>(EMPTY_COL_WINDOW)
  const tableChromeRef = useRef<TableChromeBag>({
    paintHeadTh: () => null,
    onPointerDown: undefined,
    onPointerMove: undefined,
    onClick: undefined,
    onMouseOver: undefined,
  })

  function startColResize(event: ReactPointerEvent<HTMLSpanElement>, colKey: string) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    const table = handle.closest('table')
    if (!table) return
    const heads = Array.from(table.querySelectorAll('thead th:not(.fsdb-col-pad)'))
    const startX = event.clientX
    const snapshot: Record<string, number> = {}
    const windowed = windowedColumnsOf(columns, colWindowRef.current)
    for (let i = 0; i < windowed.length; i += 1) {
      const key = windowed[i]!.key
      const measured = heads[i]?.getBoundingClientRect().width ?? 120
      snapshot[key] = columnWidths[key] ?? Math.round(measured)
    }
    for (const col of columns) {
      if (snapshot[col.key] == null) snapshot[col.key] = tableColumnEstimate(col.key, columnWidths[col.key], col.key === schema?.labelField)
    }
    const origin = snapshot[colKey] ?? COL_WIDTH_MIN
    handle.setPointerCapture(event.pointerId)
    setResizingCol(colKey)
    setColumnWidths(snapshot)
    const onMove = (ev: PointerEvent) => {
      const next = { ...snapshot, [colKey]: Math.round(Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, origin + ev.clientX - startX))) }
      setColumnWidths(next)
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      setResizingCol(null)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }
  const groupFields = useMemo(() => groupableFields(schema), [schema])
  const activeGroup = groupField(schema, groupBy)
  const grouping = Boolean(activeGroup)
  const filterFields = useMemo(
    () =>
      entries.filter(
        (item) =>
          item.key !== bodyKey &&
          resolveFieldType(item.field) !== 'file' &&
          item.key !== 'shareScope' &&
          !lockedFilterKeys.includes(item.key),
      ),
    [bodyKey, entries, lockedFilterKeys],
  )
  const sortFields = useMemo(
    () => filterFields.filter((item) => item.field.sortable !== false),
    [filterFields],
  )

  useEffect(() => {
    if (!schemaDefaultKeys.length) return
    const prevDefaults = prevSchemaDefaultSig.current ? prevSchemaDefaultSig.current.split('\0').filter(Boolean) : []
    prevSchemaDefaultSig.current = schemaDefaultSig
    setColumnKeys((prev) => {
      const allowed = new Set(allColumnKeys)
      const grown = prevDefaults.length ? schemaDefaultKeys.filter((key) => !prevDefaults.includes(key)) : []
      const kept = pinActionColumn(
        schema,
        [...prev.filter((key) => allowed.has(key)), ...grown.filter((key) => allowed.has(key) && !prev.includes(key))],
        rowActionColumn,
      )
      if (!prev.length || !kept.length) {
        skipColumnReload.current = true
        return schemaDefaultKeys
      }
      if (kept.length === prev.length && kept.every((key, index) => key === prev[index])) return prev
      if (kept.every((key) => prev.includes(key))) skipColumnReload.current = true
      return kept
    })
  }, [allColumnKeys, rowActionColumn, schema, schemaDefaultKeys, schemaDefaultSig])

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

  const grouped = useMemo(() => {
    if (!grouping) return groupRecords(visible, schema, groupBy)
    if (groupBuckets.length) return groupBuckets.filter((item) => (item.total ?? item.rows.length) > 0)
    return groupRecords(visible, schema, groupBy).filter((item) => item.rows.length)
  }, [groupBuckets, groupBy, grouping, schema, visible])
  const parentKey = useMemo(() => parentFieldKey(schema, items), [items, schema])
  const treeable = useMemo(() => hasTreeLinks(items, parentKey), [items, parentKey])
  const treeOn = treeable && showTree
  const flattenRows = useCallback(
    (rows: DbRecord[]) => {
      if (!parentKey || !treeOn) return rows.map((row) => ({ row, depth: 0, hasKids: false, kidCount: 0 }))
      return flattenTree(rows, parentKey, collapsed)
    },
    [collapsed, parentKey, treeOn],
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
        nodes.push({
          kind: 'group-head',
          key: `gh:${groupKey}`,
          groupKey,
          label: group.label,
          count,
        })
        if (collapsedGroups[groupKey]) continue
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
      })
    }
    return nodes
  }, [collapsedGroups, flattenRows, groupPages, grouped, grouping, pageSize, visible])
  const tablePaintRef = useRef<TablePaintBag>({ colSpan: 1, error: '', renderNode: () => null })
  const tableRef = useRef<HTMLTableElement>(null)
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const tableStageRef = useRef<HTMLDivElement>(null)
  const checkStackRef = useRef<HTMLDivElement>(null)
  const checkHoverRef = useRef<string | 'head' | null>(null)
  const columnPinCount = columns[0]?.key === schema?.labelField ? 1 : 0
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

  const renderCheckHead = useCallback(() => <RowCheck ids={pickableIds} />, [pickableIds, pickedIds])
  const renderCheckRow = useCallback((id: string) => <RowCheck id={id} />, [pickedIds])

  const listedSelected = detailId ? items.find((item) => item.id === detailId) : undefined
  const selected = useMemo(() => {
    if (!detailId) return null
    if (detailRow?.id === detailId) return listedSelected ? overlayListed(detailRow, listedSelected, listColumns) : detailRow
    return listedSelected ?? null
  }, [detailId, detailRow, listColumns, listedSelected])
  const viewIndex = selected ? indexOnPage(selected.id, items, page, pageSize) : null
  const stepViewRecord = async (delta: -1 | 1) => {
    if (!selected || steppingView.current) return
    steppingView.current = true
    try {
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
    window.dispatchEvent(new Event('fsdb:crumb-labels'))
  }, [activeViewId, collectionPath, items, routeViewId, schema?.labelField, selected])
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
    if (sheet || !activeViewId || isReadOnlyViewId(activeViewId)) {
      setViewBanner(null)
      return
    }
    const path = savedViewRecordPath(collectionPath, activeViewId)
    if (!path) {
      setViewBanner(null)
      return
    }
    let cancelled = false
    void readJson<{ value?: { banner?: unknown } }>(`/api/db/read?path=${encodeURIComponent(path)}`)
      .then((data) => {
        if (!cancelled) setViewBanner(data.value?.banner ?? null)
      })
      .catch(() => {
        if (!cancelled) setViewBanner(null)
      })
    return () => {
      cancelled = true
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
    const next = draftFromRecord(schema, detailRow, bodyKey, detailBody)
    setDraft((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    hydratedDetail.current = detailId
  }, [bodyKey, detailBody, detailId, detailRow, schema])

  useEffect(() => {
    if (!bodyKey || !detailId || !schema) return
    const formatted = draftFromRecord(schema, { id: detailId }, bodyKey, detailBody)[bodyKey] ?? ''
    setDraft((prev) => (prev[bodyKey] === formatted ? prev : { ...prev, [bodyKey]: formatted }))
  }, [bodyKey, detailBody, detailId, schema])

  useEffect(() => {
    if (!detailId || detailRow?.id !== detailId) {
      contentGen.current += 1
      setDetailBody(null)
      return
    }
    pullDetailBody()
  }, [collectionPath, dataPath, detailId, detailRow, pullDetailBody])

  useEffect(() => {
    if (dlg?.kind !== 'rename') return
    setDlgError('')
  }, [dlg])

  function persistViewsFor(path: string, next: SavedView[]) {
    if (sheet) return
    const listed = listedViews(path, next).map((view) => withViewDisplay(path, view))
    const stored = listed.filter((view) => !view.builtin)
    rememberViews(path, listed)
    pushSavedViews(path, stored)
    if (!nested) {
      localStorage.setItem(viewsKey(path), JSON.stringify(stored))
    }
    if (path === collectionPath) {
      viewsRef.current = listed
      setViews(listed)
    }
    window.dispatchEvent(new Event('fsdb:change'))
    window.dispatchEvent(new Event('fsdb:crumb-labels'))
  }

  function persistViews(next: SavedView[]) {
    persistViewsFor(collectionPath, next)
  }

  function rememberActiveView(id: string) {
    setActiveViewId(id)
    if (nested) return
    try {
      localStorage.setItem(activeViewStorageKey(collectionPath), id)
    } catch {
      /* ignore */
    }
  }

  function applyView(view: SavedView) {
    const next = normalizeSavedView({
      ...view,
      filters: { ...catalogLockFilters(view.id, [view]), ...view.filters },
    })
    const sourceColumns = next.columns.length
      ? allColumnKeys.length
        ? next.columns.filter((key) => allColumnKeys.includes(key))
        : next.columns
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
      showTree === (next.tree !== false) &&
      wrapCells === !!next.wrap &&
      truncateCells === (next.truncate !== false) &&
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
    setShowTree(next.tree !== false)
    setWrapCells(!!next.wrap)
    setTruncateCells(next.truncate !== false)
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
    const listed = listedViews(collectionPath, loadViews(collectionPath)).map((item) =>
      withViewDisplay(collectionPath, item),
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
    await pullSavedViews([collectionPath])
    const listed = listedViews(collectionPath, loadViews(collectionPath)).map((view) =>
      withViewDisplay(collectionPath, view),
    )
    const prev = viewsRef.current
    const activeId = activeViewIdRef.current
    rememberViews(collectionPath, listed)
    viewsRef.current = listed
    setViews(listed)
    const nextView =
      pickViewForRoute(listed, collectionPath, routeViewId ?? activeId ?? undefined) ?? listed[0]
    const prevView = activeId ? prev.find((item) => item.id === activeId) : undefined
    if (!nextView) return
    if (prevView && viewStateKey(normalizeSavedView(prevView)) === viewStateKey(normalizeSavedView(nextView))) return
    skipPersistGen.current += 1
    applyView(nextView)
  }

  function selectView(view: SavedView) {
    applyView(view)
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
    if (!viewMenuOpen) return
    void syncViewsRef.current()
  }, [viewMenuOpen])

  function commitView(view: SavedView) {
    persistViews([...views, view])
    selectView(view)
  }

  function uniqueViewName(base: string, listed: SavedView[] = views) {
    const names = new Set(listed.map((item) => item.name))
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
      ? views
      : effectiveScope
        ? viewsForScope(allListed, effectiveScope)
        : allListed
    const view: SavedView = {
      id: `${Date.now()}`,
      name: uniqueViewName('新视图', listed),
      mode: 'table',
      sortField: 'title',
      sortDir: 'asc',
      filters: { ...catalogLocks, ...(effectiveScope ? { $scope: effectiveScope } : {}) },
      columns: target === collectionPath ? [...schemaDefaultKeys] : [],
      groupBy: '',
      tree: true,
      wrap: false,
      truncate: true,
      query: '',
    }
    persistViewsFor(target, [...stored.filter((item) => !item.builtin), view])
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
  }

  function copyView(source?: SavedView) {
    commitView(
      source
        ? { ...source, id: `${Date.now()}`, name: uniqueViewName(`${source.name} 副本`), builtin: false }
        : {
            id: `${Date.now()}`,
            name: uniqueViewName(`${activeView?.name ?? title} 副本`),
            mode,
            sortField,
            sortDir,
            sorts,
            filters: { ...catalogLocks },
            filterTree,
            columns: columnKeys,
            groupBy,
            tree: showTree,
            wrap: wrapCells,
            truncate: truncateCells,
            query,
            columnWidths,
          },
    )
  }

  function patchActiveView(patch: Partial<SavedView>) {
    if (!activeViewId) return
    const current = views.find((view) => view.id === activeViewId)
    if (!current) return
    if (current.builtin) {
      persistViewDisplay(collectionPath, current.id, patch)
      persistViews(views)
      return
    }
    persistViews(views.map((view) => (view.id === activeViewId ? { ...view, ...patch } : view)))
  }

  function renameView(view: SavedView) {
    setViewMenuOpen(false)
    setDlg({ kind: 'rename', view })
  }

  function deleteView(view: SavedView) {
    setViewMenuOpen(false)
    setDlg({ kind: 'delete', view })
  }

  function applyRename(name?: string) {
    if (!dlg || dlg.kind !== 'rename') return
    if (dlg.view.builtin) {
      setDlg(null)
      return
    }
    const next = (name ?? '').trim()
    if (!next) {
      setDlgError('请填写名称')
      return
    }
    if (views.some((item) => item.id !== dlg.view.id && item.name === next)) {
      setDlgError('已有同名视图')
      return
    }
    persistViews(views.map((item) => (item.id === dlg.view.id ? { ...item, name: next } : item)))
    setDlg(null)
  }

  function applyDeleteView() {
    if (!dlg || dlg.kind !== 'delete') return
    if (dlg.view.builtin) {
      setDlg(null)
      return
    }
    const removedId = dlg.view.id
    const remaining = views.filter((item) => item.id !== removedId)
    setDlg(null)
    persistViews(remaining)
    if (activeViewId === removedId) {
      const next = viewsRef.current[0]
      if (next) selectView(next)
    }
  }

  function setVisibleColumns(next: string[]) {
    const pinned = pinActionColumn(schema, next, rowActionColumn)
    if (!pinned.length) return
    setColumnKeys(pinned)
    if (!activeViewId) return
    const current = views.find((view) => view.id === activeViewId)
    if (!current) return
    if (current.builtin) {
      persistViewDisplay(collectionPath, current.id, { columns: pinned })
      persistViews(views)
      return
    }
    persistViews(views.map((view) => (view.id === activeViewId ? { ...view, columns: pinned } : view)))
  }

  function toggleColumn(key: string) {
    if (key === schema?.labelField || key === 'actions') return
    const current = columnKeys.length ? columnKeys : columns.map((col) => col.key)
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    if (!next.length) return
    setVisibleColumns(next)
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
    patchActiveView({ groupBy: next })
  }

  function setTree(next: boolean) {
    setShowTree(next)
    patchActiveView({ tree: next })
  }

  async function runAction(row: DbRecord, action: CollectionActionInfo) {
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
      return recordsFingerprint(prev) === recordsFingerprint(next) ? prev : next
    })
    setGroupBuckets((prev) =>
      prev.map((group) => ({
        ...group,
        rows: group.rows.map((row) => map(row)),
      })),
    )
  }

  async function executeAction(row: DbRecord, action: CollectionActionInfo) {
    if (actingRef.current) return
    const preview = previewActionRecord(row, action)
    actingRef.current = true
    setActing(true)
    if (preview !== row) {
      mapListedRecords((item) => (item.id === row.id ? overlayListed(item, preview, listColumns) : item))
      setDetailRow((prev) => (prev?.id === row.id ? overlayListed(prev, preview, listColumns) : prev))
    }
    try {
      await readJson('/api/db/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `${dataPath}/${row.id}`, action: action.id }),
      })
      quietUntil.current = Date.now() + 800
      window.setTimeout(() => {
        quietUntil.current = 0
        void reloadRef.current()
      }, 800)
    } catch (err) {
      mapListedRecords((item) => (item.id === row.id ? row : item))
      setDetailRow((prev) => (prev?.id === row.id ? row : prev))
      setDlg({ kind: 'alert', title: `${action.label}失败`, body: String(err) })
      quietUntil.current = 0
      await reload()
    } finally {
      actingRef.current = false
      setActing(false)
    }
  }

  async function writePatch(row: DbRecord, content: Record<string, unknown>) {
    try {
      const keys = Object.keys(content)
      quietUntil.current = Date.now() + 800
      if (bodyKey && keys.length === 1 && keys[0] === bodyKey && schema?.fields[bodyKey]?.type === 'file') {
        const path = `${dataPath}/${row.id}`
        const value = content[bodyKey]
        const gen = (contentWriteGens.current.get(path) ?? 0) + 1
        contentWriteGens.current.set(path, gen)
        contentGen.current += 1
        contentWritePending.current.set(path, (contentWritePending.current.get(path) ?? 0) + 1)
        setDetailBody(value)
        const previous = contentWriteQueues.current.get(path) ?? Promise.resolve()
        const run = previous.catch(() => undefined).then(async () => {
          const data = await readJson<{ value?: unknown; version?: number }>('/api/db/content', {
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
          }
          window.dispatchEvent(new Event('fsdb:change'))
        }).catch(async (error) => {
          if (!(error instanceof HttpError) || error.status !== 409) throw error
          const latest = await readJson<{ value?: unknown; version?: number }>(`/api/db/content?path=${encodeURIComponent(path)}`)
          if (Number.isInteger(latest.version)) contentVersions.current.set(path, latest.version!)
          if (detailIdRef.current === row.id) setDetailBody(latest.value ?? null)
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
      const data = await readJson<{ value?: DbRecord }>('/api/db/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `${dataPath}/${row.id}`, content }),
      })
      const next = data.value
      if (next) {
        const merge = (item: DbRecord) => (item.id === next.id ? { ...item, ...next, banner: next.banner ?? null } : item)
        mapListedRecords(merge)
        setDetailRow((prev) => (prev?.id === next.id ? { ...prev, ...next, banner: next.banner ?? null } : prev))
        window.dispatchEvent(new Event('fsdb:change'))
        return
      }
      quietUntil.current = 0
      await reload()
    } catch (err) {
      quietUntil.current = 0
      setError(String(err))
    }
  }

  async function createRecord() {
    if (!canCreate) return
    try {
      const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: dataPath, records: [{}], scope: createScope }),
      })
      const value = data.items?.[0]?.value
      const id = value?.id
      if (!id) {
        setError('没有写入')
        return
      }
      confirmedCreates.current.add(id)
      setItems((prev) => [value, ...prev.filter((item) => item.id !== id)])
      setTotal((count) => count + 1)
      quietUntil.current = 0
      void reloadRef.current()
      window.setTimeout(() => showRecordInInspector(collectionPath, id), 0)
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeDeleteRecord(row: DbRecord) {
    try {
      await readJson('/api/db/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: dataPath, ids: [row.id] }),
      })
      onCloseRecord?.()
      quietUntil.current = 0
      await reload()
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeDeleteRecords(ids: string[]) {
    try {
      await readJson('/api/db/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: dataPath, ids }),
      })
      if (detailId && ids.includes(detailId)) onCloseRecord?.()
      setPickedIds([])
      quietUntil.current = 0
      await reload()
    } catch (err) {
      setError(String(err))
      quietUntil.current = 0
      await reload()
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

  async function executeBulkFacet(ids: string[], addTags: string[]) {
    if (!addTags.length) return
    const rows = items.filter((row) => ids.includes(row.id))
    try {
      for (const row of rows) {
        const current = normalizeSchemaValue(row.facet)
        const tags = [...current.tags]
        for (const id of addTags) if (!tags.includes(id)) tags.push(id)
        await writePatch(row, { facet: { tags, values: current.values } })
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
    table?.querySelectorAll('td.is-cell-on').forEach((node) => {
      if (node === td) return
      node.classList.remove('is-cell-on', 'is-cell-ro')
    })
    td.classList.add('is-cell-on')
    td.classList.toggle('is-cell-ro', !writable)
  }

  async function writeOne(row: DbRecord, key: string, field: FieldSpec, raw: string) {
    await writePatch(row, { [key]: parseFieldValue(field, raw) })
  }

  function writeCellValue(row: DbRecord, key: string, field: FieldSpec, next: unknown) {
    const flat = parseFacetFlatColumnKey(key)
    if (flat && schema) {
      const source = facetSourceKey(schema)
      void writePatch(row, { [source]: patchFacetFlatValue(row, key, next, source) })
      return
    }
    void writePatch(row, { [key]: next })
  }

  const labelOf = (row: DbRecord) => crumbRecordLabel(row, schema?.labelField)
  const crumbs = useMemo(
    () =>
      buildCrumbs({
        collection: collectionPath,
        collectionLabel: title,
        tables: tables.map((table) => ({
          path: table.path,
          label: table.view?.title ?? table.label,
          icon: table.view?.icon,
        })),
        viewId: routeViewId ?? activeViewId ?? undefined,
        viewName: activeView?.name,
        views: views.map((view) => ({ id: view.id, name: view.name, mode: view.mode })),
        recordId: selected?.id,
        recordLabel: selected ? crumbRecordLabel(selected, schema?.labelField) : undefined,
        records: selected
          ? items.map((row) => ({
              id: row.id,
              label: crumbRecordLabel(row, schema?.labelField),
              emoji: recordPreviewEmoji(row),
              mascot: recordPreviewMascot(row),
            }))
          : undefined,
      }),
    [activeView?.name, activeViewId, collectionPath, routeViewId, schema?.labelField, selected, selected ? items : null, tables, title, views],
  )
  const currentTable = tables.find((item) => item.path === collectionPath)
  const recordKind = recordPickKind(currentTable?.view?.moduleId || currentTable?.id)
  const recordPathOf = (row: DbRecord) => recordSourcePath(collectionPath, row.id)
  const recordPick = (row: DbRecord) =>
    pickMode
      ? pickDomAttrs(recordKind, row.id, labelOf(row), { path: recordPathOf(row), title: labelOf(row) })
      : EMPTY_PICK
  const cellValueText = (row: DbRecord, key: string, field: FieldSpec) => {
    const raw = parseFacetFlatColumnKey(key) ? readFacetFlatValue(row, key, facetSourceKey(schema)) : row[key]
    return formatField(field, raw)
  }
  const cellPickOf = (row: DbRecord, key: string, field: FieldSpec) =>
    pickMode
      ? fieldPickAttrs(recordKind, row.id, key, {
          label: field.label ?? key,
          title: labelOf(row),
          path: recordPathOf(row),
          text: cellValueText(row, key, field),
        })
      : EMPTY_PICK

  function renderCell(row: DbRecord, key: string, field: FieldSpec, surface: 'table' | 'detail' = 'detail') {
    if (key === 'shareScope') {
      const label = String(row[key] ?? (localData ? '私人' : ''))
      if (surface === 'table') return <ShareScopeLabel label={label} />
      return (
        <ShareScopeDetail
          collection={collectionPath}
          recordId={row.id}
          label={label}
          tableLabel={currentTable?.label}
          localOnly={localKnown ? localData : null}
        />
      )
    }
    if (key === 'shareRole') {
      if (localData) return <span>{String(row[key] ?? '')}</span>
      return (
        <ShareRoleDetail
          collection={collectionPath}
          recordId={row.id}
          label={String(row[key] ?? '')}
          tableLabel={currentTable?.label}
          builtin={collectionPath === '/plugins' && row.builtin === true}
        />
      )
    }
    const kind = resolveFieldType(field)
    const flat = parseFacetFlatColumnKey(key)
    if (surface === 'table') {
      if (kind === 'boolean') {
        const raw = flat ? readFacetFlatValue(row, key, facetSourceKey(schema)) : row[key]
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
      if (kind === 'facet') {
        const tags = loadFacets()
        const parsed = normalizeSchemaValue(row[key])
        if (!parsed.tags.length) return null
        const labels = parsed.tags.map((id) => tags.find((tag) => tag.id === id)?.label ?? id)
        return <span className="fsdb-select-text">{labels.join('、')}</span>
      }
      if (flat) {
        return (
          <DefaultCell
            field={field}
            fieldKey={key}
            records={isRecordLinkField(field, key) ? items : undefined}
            collectionPath={collectionPath}
            labelField={schema?.labelField}
            value={readFacetFlatValue(row, key, facetSourceKey(schema))}
            plain
            onChange={
              field.writable && (kind === 'attachment' || kind === 'datetime')
                ? (next) => writeCellValue(row, key, field, next)
                : undefined
            }
          />
        )
      }
      const Custom = chrome?.cells?.[key]
      if (Custom) return <Custom field={key} spec={field} value={row[key]} record={row} fallback={formatField(field, row[key])} />
      return (
        <DefaultCell
          field={field}
          fieldKey={key}
          records={isRecordLinkField(field, key) ? items : undefined}
          collectionPath={collectionPath}
          labelField={schema?.labelField}
          value={row[key]}
          plain
          onChange={
            field.writable && (kind === 'attachment' || kind === 'datetime')
              ? (next) => writeCellValue(row, key, field, next)
              : undefined
          }
        />
      )
    }
    if (flat) {
      const source = facetSourceKey(schema)
      const value = readFacetFlatValue(row, key, source)
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
                items.map((item) => ({ ...item, [key]: readFacetFlatValue(item, key, source) })),
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
    if (kind === 'facet') {
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
    const row = items.find((item) => item.id === cellPop.id)
    const col = columns.find((item) => item.key === cellPop.key)
    if (!row || !col) return null
    const key = col.key
    const field = col.field
    const flat = parseFacetFlatColumnKey(key)
    const initial = flat ? readFacetFlatValue(row, key, facetSourceKey(schema)) : row[key]
    const options = flat
      ? uniqueValues(
          items.map((item) => ({ ...item, [key]: readFacetFlatValue(item, key, facetSourceKey(schema)) })),
          key,
          field,
        )
      : uniqueValues(items, key, field)
    return (
      <CellPop
        key={`${cellPop.id}:${cellPop.key}`}
        open
        className={`is-${resolveFieldType(field)}${isRecordLinkField(field, key) ? ' is-record-link' : ''}`}
        anchor={cellAnchorRef.current}
        onClose={() => setCellPop(null)}
      >
        <Suspense fallback={null}>
        <CellPopDraft
          record={row}
          fieldKey={key}
          field={field}
          initial={initial}
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

  function RecordActions({ row }: { row: DbRecord }) {
    const Actions = chrome?.Actions
    const Action = chrome?.Action
    const busy = acting
    const placed = placedActions(schema, 'row').filter(
      (action) => !nested || (action.id !== 'open-split' && action.id !== 'open-page'),
    )
    const finish = (action: CollectionActionInfo) => {
      void runAction(row, action)
    }
    const wrap = (body: ReactNode) => (
      <div className="tasks-row-actions" data-biu-ignore onClick={(event) => event.stopPropagation()}>
        {body}
      </div>
    )
    if (Actions) {
      if (!placed.length) return null
      return wrap(<Actions actions={placed} record={row} busy={busy} place="row" run={finish} />)
    }
    const rowShown = visibleActions(schema, row, 'row')
      .filter((action) => !nested || (action.id !== 'open-split' && action.id !== 'open-page'))
      .filter((action) => Action || actionIcon(action.id) || action.id === 'open-split' || action.id === 'open-page')
    if (!rowShown.length) return null
    return wrap(
      rowShown.map((action) => {
        const run = () => finish(action)
        if (Action) return <Action key={action.id} action={action} record={row} busy={busy} run={run} />
        const glyph = actionIcon(action.id)
        return (
          <button
            key={action.id}
            type="button"
            className={`fsdb-action-tag${action.tone === 'danger' ? ' is-danger' : ''}`}
            aria-label={`${action.label} ${labelOf(row)}`}
            disabled={busy}
            onClick={run}
          >
            {glyph}
            <span>{action.label}</span>
          </button>
        )
      }),
    )
  }

  function GroupHead({ groupKey, label, count }: { groupKey: string; label: string; count: number }) {
    const folded = Boolean(collapsedGroups[groupKey])
    return (
      <header className="tasks-queue-ghead">
        <button
          type="button"
          className="tasks-group-fold"
          aria-expanded={!folded}
          aria-label={folded ? '展开分组' : '收起分组'}
          title={folded ? '展开分组' : '收起分组'}
          onClick={() => setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))}
        >
          <span className="sidebar-rail-icon sidebar-group-fold" aria-hidden>
            <span className="sidebar-group-fold-face">
              <UiGlyph icon="stack" />
            </span>
            <span className="sidebar-group-fold-chevron">
              <UiGlyph icon={folded ? 'chevron-right' : 'chevron-down'} />
            </span>
          </span>
        </button>
        <span className="tasks-queue-glabel">{label}</span>
        <span className="tasks-queue-count">{count}</span>
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

  function RowCheck({ id, ids }: { id?: string; ids?: string[] }) {
    const list = id ? [id] : (ids ?? [])
    const some = list.some((item) => pickedIds.includes(item))
    const on = list.length > 0 && list.every((item) => pickedIds.includes(item))
    const marked = id ? on : some
    const header = !id
    return (
      <button
        type="button"
        data-testid="fsdb-row-check"
        className={`fsdb-boolbtn fsdb-row-check${marked ? ' is-on' : ''}`}
        aria-pressed={marked}
        aria-label={id ? (on ? '取消选择记录' : '选择记录') : some ? '取消选择' : '全选'}
        title={id ? (on ? '取消选择' : '选择') : some ? '取消选择' : '全选'}
        onClick={(event) => {
          event.stopPropagation()
          togglePicked(list, header ? !some : !on)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <BoolBox on={marked}>{marked ? <CheckIcon aria-hidden className="size-3" /> : null}</BoolBox>
      </button>
    )
  }

  function tableCellFromEvent(event: { target: EventTarget | null; currentTarget: EventTarget }) {
    const hit = event.target as HTMLElement | null
    if (hit?.closest(CELL_POP_IGNORE)) return null
    const table = event.currentTarget as HTMLElement
    const td = hit?.closest('td')
    if (!td || !table.contains(td)) return null
    const id = td.closest('tr')?.dataset.recordId
    const key = td.dataset.colKey
    if (!id || !key) return null
    return { td, id, key }
  }

  function onTablePointerDown(event: ReactPointerEvent<HTMLTableElement>) {
    if (event.button !== 0) return
    const cell = tableCellFromEvent(event)
    if (!cell) return
    const col = columns.find((item) => item.key === cell.key)
    cellAnchorRef.current = cell.td
    cellPickRef.current = { id: cell.id, key: cell.key }
    markCellOn(cell.td, col ? cellFieldWritable(col.field) : false)
    cellPopPtrRef.current = { x: event.clientX, y: event.clientY, dragged: false }
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
    setCellPop(cellUsesPop(kind, col.field.writable) ? { id: cell.id, key: cell.key } : null)
  }

  function paintColPad(px: number, side: 'left' | 'right') {
    if (px <= 0) return null
    return <td key={`pad-${side}`} className="fsdb-col-pad" aria-hidden style={padColBox(px)} />
  }

  function paintHeadTh(col: (typeof columns)[number]) {
    const flat = parseFacetFlatColumnKey(col.key)
    const tone = flat ? schemaTagTone(flat.packId) : undefined
    return (
      <th
        key={col.key}
        className={[col.key === schema?.labelField ? 'is-pin-col' : '', tone ? 'is-facet-col' : ''].filter(Boolean).join(' ') || undefined}
        style={tone ? { ['--biu-tag' as string]: tone } : undefined}
      >
        <span className={`tasks-th${queryFields.has(col.key) ? ' is-on' : ''}`}>
          <FieldGlyph kind={col.kind} />
          {facetColumnTitle(col)}
        </span>
        <span
          className={`fsdb-col-resizer${resizingCol === col.key ? ' is-active' : ''}`}
          data-testid="fsdb-col-resizer"
          onPointerDown={(event) => startColResize(event, col.key)}
        />
      </th>
    )
  }

  function idlePaintedCells(row: DbRecord) {
    const cells: IdleTableTd[] = []
    const colWindow = colWindowRef.current
    const pushCol = (col: (typeof columns)[number]) => {
      const pick = cellPickOf(row, col.key, col.field)
      const attrs = Object.keys(pick).length ? (pick as Record<string, string | number | boolean | undefined>) : undefined
      cells.push({
        key: col.key,
        inner: idleTableCellInner(row, col.key, col.field),
        className: col.key === schema?.labelField ? 'is-pin-col' : undefined,
        attrs,
      })
    }
    const pushPad = (side: 'left' | 'right', px: number) => {
      if (px <= 0) return
      cells.push({ key: '', inner: '', className: 'fsdb-col-pad', style: padColBox(px) })
    }
    for (let i = 0; i < colWindow.pin; i += 1) pushCol(columns[i]!)
    pushPad('left', colWindow.padLeft)
    for (let i = colWindow.start; i < colWindow.end; i += 1) pushCol(columns[i]!)
    pushPad('right', colWindow.padRight)
    return cells
  }

  function paintTableCell(row: DbRecord, key: string, field: FieldSpec) {
    if (key === 'shareScope' || key === 'shareRole') {
      const text = cellValueText(row, key, field) || String(row[key] ?? '')
      return text ? <span>{text}</span> : null
    }
    const kind = resolveFieldType(field)
    if (
      kind === 'boolean' ||
      kind === 'action' ||
      kind === 'facet' ||
      kind === 'url' ||
      kind === 'image' ||
      kind === 'attachment' ||
      kind === 'file'
    ) {
      return renderCell(row, key, field, 'table')
    }
    if (parseFacetFlatColumnKey(key) || isRecordLinkField(field, key) || chrome?.cells?.[key]) {
      if (key === 'usage' && !(Number(row[key]) > 0)) return <span className="traj-usage-empty">—</span>
      return renderCell(row, key, field, 'table')
    }
    const text = cellValueText(row, key, field)
    return text ? <span>{text}</span> : null
  }

  function idleTableCellInner(row: DbRecord, key: string, field: FieldSpec) {
    if (key === 'actions') return ''
    if (key === schema?.labelField) {
      return idleTitleInnerHtml(labelOf(row), idleTableIconKind(currentTable?.view?.icon), recordPreviewEmoji(row))
    }
    if (key === 'shareScope' || key === 'shareRole') {
      return idleTextInnerHtml(cellValueText(row, key, field) || String(row[key] ?? ''))
    }
    const kind = resolveFieldType(field)
    if (kind === 'boolean') {
      const raw = parseFacetFlatColumnKey(key) ? readFacetFlatValue(row, key, facetSourceKey(schema)) : row[key]
      return idleBoolInnerHtml(raw === true || raw === 'true')
    }
    if (kind === 'facet') {
      const tags = loadFacets()
      const parsed = normalizeSchemaValue(row[key])
      const labels = parsed.tags.map((id) => tags.find((tag) => tag.id === id)?.label ?? id)
      return idleSelectInnerHtml(labels.join('、'))
    }
    if (key === 'usage' && !(Number(row[key]) > 0)) return idleEmptyUsageInnerHtml()
    const raw = parseFacetFlatColumnKey(key) ? readFacetFlatValue(row, key, facetSourceKey(schema)) : row[key]
    if (typeof raw === 'string' && raw.length > IDLE_CELL_TEXT_MAX && kind !== 'datetime' && kind !== 'select' && kind !== 'multi-select') {
      return idleTextInnerHtml(raw)
    }
    return idleTextInnerHtml(cellValueText(row, key, field))
  }

  function tableLiveRow(row: DbRecord, depth: number, hasKids: boolean, kidCount: number, rowKey: string, toolsArmed = false) {
    const cellPick = cellPickRef.current
    const colWindow = colWindowRef.current
    const paintLiveTd = (col: (typeof columns)[number]) => (
      <td
        key={col.key}
        data-col-key={col.key}
        {...cellPickOf(row, col.key, col.field)}
        className={[
          col.key === schema?.labelField ? 'is-pin-col' : '',
          cellPick?.id === row.id && cellPick.key === col.key
            ? cellFieldWritable(col.field)
              ? 'is-cell-on'
              : 'is-cell-on is-cell-ro'
            : '',
        ].filter(Boolean).join(' ') || undefined}
      >
        {col.key === schema?.labelField ? (
          <RecordTitle
            row={row}
            label={labelOf(row)}
            Title={chrome?.Title}
            depth={depth}
            hasKids={hasKids}
            kidCount={kidCount}
            treeOn={treeOn}
            collapsed={Boolean(collapsed[row.id])}
            onToggleCollapsed={() => setCollapsed((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
            tableIcon={currentTable?.view?.icon}
            Icon={chrome?.Icon}
            nested={nested}
            pick={recordPick(row)}
            onOpenSplit={() => showRecordInInspector(collectionPath, row.id)}
            onOpenRow={() => openRow(row)}
            onWriteEmoji={(next) => void writePatch(row, { emoji: next })}
            toolsArmed={toolsArmed}
          />
        ) : col.key === 'actions' ? (
          <HoverMount>
            <RecordActions row={row} />
          </HoverMount>
        ) : (
          <span className="fsdb-cell">{paintTableCell(row, col.key, col.field)}</span>
        )}
      </td>
    )
    return (
      <tr
        key={rowKey}
        data-record-id={row.id}
        className={row.id === detailId ? 'is-active' : undefined}
        {...recordPick(row)}
      >
        {columns.slice(0, colWindow.pin).map(paintLiveTd)}
        {paintColPad(colWindow.padLeft, 'left')}
        {columns.slice(colWindow.start, colWindow.end).map(paintLiveTd)}
        {paintColPad(colWindow.padRight, 'right')}
      </tr>
    )
  }

  function tableRecordRow(row: DbRecord, depth: number, hasKids: boolean, kidCount: number, rowKey: string) {
    if (treeOn) return tableLiveRow(row, depth, hasKids, kidCount, rowKey)
    return (
      <TableIdleRow
        key={rowKey}
        recordId={row.id}
        className={row.id === detailId ? 'is-active' : undefined}
        pick={recordPick(row)}
        html={idleTableRowHtml(idlePaintedCells(row))}
        renderLive={() => tableLiveRow(row, depth, hasKids, kidCount, rowKey, true)}
      />
    )
  }

  function tableBodyRows(rows: DbRecord[], keyPrefix = '') {
    const listed = flattenRows(rows)
    if (!listed.length) {
      return (
        <tr key="empty">
          <td colSpan={tablePaintRef.current.colSpan} className="fsdb-empty">
            {error ? '加载失败' : '暂无记录'}
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
        <tr key={node.key} className="fsdb-group-row">
          <td colSpan={tablePaintRef.current.colSpan}>
            <GroupHead groupKey={node.groupKey} label={node.label} count={node.count} />
          </td>
        </tr>
      )
    }
    const pages = Math.max(1, Math.ceil(node.count / pageSize))
    const pageIndex = Math.min(node.pageIndex, pages - 1)
    return (
      <tr key={node.key} className="fsdb-group-pager">
        <td colSpan={tablePaintRef.current.colSpan}>
          <div className="fsdb-pager">
            <span className="fsdb-pager-meta">{node.count}</span>
            <div className="fsdb-pager-nav">
              <PagerSizeControl pageSize={pageSize} onChange={setPageSize} />
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

  viewsRef.current = views

  useEffect(() => {
    if (!schema || !collectionPath) {
      hydratePath.current = ''
      return
    }
    const hydrateKey = `${collectionPath}\0${dataPath}`
    if (hydratePath.current === hydrateKey) return
    hydratePath.current = hydrateKey
    const listedViewsNow = paintListedViews(collectionPath)
    rememberViews(collectionPath, listedViewsNow)
    if (!sameSavedViews(viewsRef.current, listedViewsNow)) {
      viewsRef.current = listedViewsNow
      setViews(listedViewsNow)
    }
    const view = pickViewForRoute(viewsRef.current, collectionPath, routeViewId)
    if (view && view.id !== activeViewIdRef.current) applyView(view)
    setHydrated(true)
  }, [allColumnKeys, collectionPath, dataPath, routeViewId, schema, schemaDefaultKeys])

  useEffect(() => {
    if (sheet || !hydrated || !activeViewId) return
    const persistGen = skipPersistGen.current
    const id = window.setTimeout(() => {
      if (persistGen !== skipPersistGen.current) return
      if (hydratePath.current !== `${collectionPath}\0${dataPath}`) return
      const current = viewsRef.current.find((view) => view.id === activeViewId)
      if (!current) return
      const next = normalizeSavedView({
        ...current,
        mode,
        sortField,
        sortDir,
        sorts,
        filters: current.builtin ? current.filters : filters,
        filterTree: current.builtin ? undefined : filterTree,
        columns: pinActionColumn(schema, columnKeys, rowActionColumn),
        groupBy,
        tree: showTree,
        wrap: wrapCells,
        truncate: truncateCells,
        query,
        pageSize,
        columnWidths,
      })
      if (viewStateKey(current) === viewStateKey(next)) return
      if (current.builtin) {
        persistViewDisplay(collectionPath, current.id, next)
        persistViews(viewsRef.current)
        return
      }
      persistViews(viewsRef.current.map((view) => (view.id === activeViewId ? next : view)))
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
    Number(localData),
    Number(canCreate),
    Number(refreshing),
    notice,
    activeViewId ?? '',
    views.map((view) => `${view.id}:${view.name}:${view.builtin ? 1 : 0}`).join('\n'),
    lockedSource,
    lockedKind,
    lockedKindLabel,
    mode,
    extraViews.map((item) => item.id).join(','),
    extraRows.map((item) => item.id).join(','),
    Number(sortCustom),
    sortsStateKey(sorts),
    Number(filterActive),
    filterTreeStateKey(filterTree),
    Number(grouping),
    groupBy,
    Number(wrapCells),
    Number(truncateCells),
    Number(treeable),
    Number(showTree),
    columns.map((col) => col.key).join(','),
    allColumnKeys.join(','),
    schemaFingerprint(schema),
    facetCatalog.map((pack) => pack.id).join(','),
    filterOpen ? recordsFingerprint(items) : '',
    viewBanner == null ? '' : JSON.stringify(viewBanner),
    activeView?.name ?? title,
    idleTableIconKind(currentTable?.view?.icon),
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
            setViewBanner(next)
            void readJson<{ value?: { banner?: unknown } }>('/api/db/update', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path, content: { banner: next } }),
            }).then((data) => {
              setViewBanner(data.value?.banner ?? next)
            }).catch(() => {
              setViewBanner(next)
            })
          }}
        />
        <div className="fsdb-detail-icon-slot">
          <span className="fsdb-detail-title-icon" aria-hidden>
            <span className="fsdb-record-mark is-lg" data-icon={idleTableIconKind(currentTable?.view?.icon)} />
          </span>
        </div>
        <div className="fsdb-detail-title-row">
          <div className="fsdb-detail-title-block">
          <h1 className="fsdb-detail-title">{activeView?.name ?? title}</h1>
          </div>
        </div>
        </>
        )}

        <div className="tasks-toolbar" ref={toolbarRef} data-biu-ignore>
          <div className="tasks-toolbar-left">
            {sheet ? null : (
            <div className="tasks-viewdd-wrap" ref={viewRef}>
              <ViewTabFit views={views} toolbarRef={toolbarRef} toolbarRightRef={toolbarRightRef} searchExpanded={searchExpanded}>
                {(viewTabFit) => (
              <div className="tasks-viewtabs">
                {(views.length ? splitVisibleViews(views, viewTabFit, activeViewId ?? undefined).shown : []).map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    className={`tasks-viewdd-btn tasks-viewtab${view.id === activeViewId ? ' is-active' : ''}${view.id === activeViewId && viewMenuOpen ? ' is-menu' : ''}`}
                    data-testid="fsdb-view-tab"
                    aria-pressed={view.id === activeViewId}
                    aria-haspopup={view.id === activeViewId ? 'menu' : undefined}
                    aria-expanded={view.id === activeViewId ? viewMenuOpen : undefined}
                    onClick={() => {
                      if (view.id === activeViewId) toggleMenu('view')
                      else selectView(view)
                    }}
                  >
                    <ViewModeGlyph mode={view.mode} />
                    <span className="tasks-viewdd-name">{view.name}</span>
                  </button>
                ))}
                {!views.length ? (
                  <button
                    type="button"
                    className={`tasks-viewdd-btn tasks-viewtab is-active${viewMenuOpen ? ' is-menu' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={viewMenuOpen}
                    data-testid="fsdb-view-tab"
                    onClick={() => toggleMenu('view')}
                  >
                    <UiGlyph icon="squares" />
                    <span className="tasks-viewdd-name">未保存</span>
                  </button>
                ) : null}
              </div>
                )}
              </ViewTabFit>
              {viewMenuOpen ? (
                <HeadlessDismiss onDismiss={() => setViewMenuOpen(false)} insideRef={viewRef}>
                <div className="tasks-viewdd-menu" role="menu">
                  <div className="tasks-viewdd-head">视图</div>
                  {views.length === 0 ? <div className="tasks-viewdd-empty">还没有已保存的视图</div> : null}
                  {views.map((view) => (
                    <div key={view.id} className={`tasks-viewdd-item${view.id === activeViewId ? ' is-active' : ''}`}>
                      <button type="button" className="tasks-viewdd-item-main" onClick={() => selectView(view)}>
                        <span className="tasks-viewdd-item-name">{view.name}</span>
                      </button>
                      <span className="tasks-viewdd-item-actions">
                        <span className="tasks-viewdd-check" aria-hidden>
                          {view.id === activeViewId ? <CheckCircleIcon aria-hidden className="size-[14px]" /> : null}
                        </span>
                        {view.builtin ? null : (
                          <>
                            <button type="button" className="tasks-viewdd-act" title="重命名" onClick={() => renameView(view)}>
                              <PencilSquareIcon aria-hidden className="size-[14px]" />
                            </button>
                            <button type="button" className="tasks-viewdd-act is-danger" title="删除" onClick={() => deleteView(view)}>
                              <TrashGlyph aria-hidden className="size-[14px]" />
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="tasks-viewdd-foot">
                    <button type="button" className="tasks-viewdd-saveas" onClick={() => addEmptyView()}>
                      <PlusIcon aria-hidden className="size-[14px]" />
                      添加视图
                    </button>
                    <button type="button" className="tasks-viewdd-saveas" onClick={() => copyView()}>
                      <Square2StackIcon aria-hidden className="size-[14px]" />
                      拷贝视图
                    </button>
                  </div>
                </div>
                </HeadlessDismiss>
              ) : null}
            </div>
            )}
            {lockedSource ? (
              <span className="fsdb-locked-filter" title="按当前数据类型筛选，不可更改">
                {tables.find((item) => item.path === lockedSource)?.view?.title ??
                  tables.find((item) => item.path === lockedSource)?.label ??
                  lockedSource}
              </span>
            ) : null}
            {lockedKind ? (
              <span className="fsdb-locked-filter" data-testid="fsdb-locked-kind" title="按组件类型筛选，不可更改">
                {lockedKindLabel}
              </span>
            ) : null}
          </div>
          <div className="tasks-toolbar-right" ref={toolbarRightRef}>
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
                    searchInputRef.current?.focus()
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
                <div className="tasks-sort-menu" role="menu">
                  <div className="tasks-sort-head">查看模式</div>
                  {VIEW_MODES.map((opt) => (
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
                  {extraViews.map((opt) => (
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
                  {extraRows.map((opt) => (
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
                </div>
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
                <HeadlessDismiss
                  onDismiss={() => setSortMenuOpen(false)}
                  insideRef={sortRef}
                  ignoreSelector={QUERY_NEST_IGNORE}
                  inside={(node) => node instanceof Element && Boolean(node.closest('.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))}
                >
                <Suspense fallback={null}>
                <SortQueryMenu sorts={sorts} fields={sortFields} onChange={applySorts} />
                </Suspense>
                </HeadlessDismiss>
              ) : null}
            </div>
            {activeView?.builtin ? null : (
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
                <HeadlessDismiss
                  onDismiss={() => setFilterOpen(false)}
                  insideRef={filterRef}
                  ignoreSelector={QUERY_NEST_IGNORE}
                  inside={(node) => node instanceof Element && Boolean(node.closest('.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))}
                >
                <Suspense fallback={null}>
                <FilterQueryMenu
                  tree={filterTree}
                  fields={filterFields}
                  valueOptions={(item) =>
                    item.kind === 'boolean'
                      ? [
                          { value: 'true', label: '是' },
                          { value: 'false', label: '否' },
                        ]
                      : item.kind === 'facet'
                        ? uniqueValues(items, item.key, item.field).map((option) => ({
                            value: option,
                            label: loadFacets().find((tag) => tag.id === option)?.label ?? option,
                          }))
                        : fieldValueOptions(items, item.key, item.field)
                  }
                  onChange={setFilterTree}
                />
                </Suspense>
                </HeadlessDismiss>
              ) : null}
            </div>
            )}
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
                <HeadlessDismiss onDismiss={() => setGroupOpen(false)} insideRef={groupRef}>
                <div className="tasks-sort-menu" role="menu">
                  <div className="tasks-sort-head">分组依据</div>
                  <CheckRow
                    icon={<Bars3BottomLeftIcon aria-hidden className="size-[14px]" />}
                    label="不分组"
                    on={!groupBy}
                    onToggle={() => {
                      setGroupKey('')
                      setGroupOpen(false)
                    }}
                  />
                  {groupFields.length ? (
                    groupFields.map((item) => (
                      <CheckRow
                        key={item.key}
                        icon={<FieldGlyph kind={item.kind} />}
                        label={item.field.label ?? item.key}
                        on={groupBy === item.key}
                        onToggle={() => {
                          setGroupKey(item.key)
                          setGroupOpen(false)
                        }}
                      />
                    ))
                  ) : (
                    <div className="tasks-viewdd-empty">没有单选或多选字段</div>
                  )}
                </div>
                </HeadlessDismiss>
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
                  ignoreSelector={`${HEADLESS_DISMISS_IGNORE}, [data-fsdb-col-flyout], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`}
                  inside={(node) =>
                    node instanceof Element &&
                    Boolean(node.closest('[data-fsdb-col-flyout], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'))
                  }
                >
                <div className="tasks-sort-menu fsdb-col-menu" role="menu">
                  <div className="tasks-sort-head">可见列</div>
                  <div className="fsdb-col-menu-list">
                  <Suspense fallback={null}>
                    <ColumnOrderMenu
                      columns={columns}
                      allColumns={allColumns}
                      labelField={schema?.labelField}
                      facetCatalog={facetCatalog}
                      onToggle={toggleColumn}
                      onReorder={setVisibleColumns}
                    />
                  </Suspense>
                  </div>
                </div>
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
                <div className="tasks-filter-menu" role="menu">
                  <div className="tasks-sort-head">表格显示</div>
                  <CheckRow
                    icon={<Bars3BottomLeftIcon aria-hidden className="size-[14px]" />}
                    label="单元格换行"
                    on={wrapCells}
                    onToggle={() => setWrap(!wrapCells)}
                  />
                  <CheckRow
                    icon={<EllipsisHorizontalIcon aria-hidden className="size-[14px]" />}
                    label="文本缩略"
                    on={truncateCells}
                    onToggle={() => setTruncate(!truncateCells)}
                  />
                  {treeable ? (
                    <CheckRow
                      icon={<ChevronRightIcon aria-hidden className="size-[14px]" />}
                      label="树形展示"
                      on={showTree}
                      onToggle={() => setTree(!showTree)}
                    />
                  ) : null}
                </div>
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
            {canCreate ? (
              <div className="fsdb-create-group">
                <button
                  type="button"
                  className="fsdb-create-btn"
                  aria-label="新建记录"
                  title="新建"
                  onClick={() => void createRecord()}
                >
                  新建
                </button>
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
                    <UiGlyph icon="chevron-down" />
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
              </div>
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
    Number(canCreate),
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
            {!viewsOpen ? (
              <button
                type="button"
                className="chat-view-header-expand"
                title="展开左侧边栏"
                aria-label="展开左侧边栏"
                data-testid="header-sidebar-expand"
                onClick={() => window.dispatchEvent(new Event('biu:expand-shell-sidebar'))}
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
                className={`chat-view-header-expand${viewStarred ? ' is-active' : ''}`}
                title={viewStarred ? '取消收藏视图' : '收藏视图'}
                aria-label={viewStarred ? '取消收藏视图' : '收藏视图'}
                aria-pressed={viewStarred}
                onClick={() => persistStarredViews(toggleStarredView(getStarredViews(), collectionPath, activeViewId))}
              >
                <UiGlyph icon="star" className={viewStarred ? 'text-[#f5b700]' : undefined} />
              </button>
            ) : null}
            {isSystemCollection(collectionPath) || isIndexCollection(collectionPath) || (collectionPath === '/plugins' && detailRow?.builtin === true) ? null : (
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
              onClick={() => window.dispatchEvent(new Event('biu:inspector-toggle'))}
            >
              <UiGlyph icon={inspectorOpen ? 'chevron-double-right' : 'chevron-double-left'} />
            </button>
          </div>
        </header>
      ),
    [listHeaderLock],
  )

  tablePaintRef.current = {
    colSpan: tablePaintRef.current.colSpan,
    error,
    renderNode: renderPaintNode,
  }
  tableChromeRef.current = {
    paintHeadTh: (col) => paintHeadTh(col as (typeof columns)[number]),
    onPointerDown: onTablePointerDown,
    onPointerMove: onTablePointerMove,
    onClick: onTableClick,
    onMouseOver: (event) => {
      const hit = event.target as HTMLElement | null
      const tr = hit?.closest('tr')
      if (!tr || !event.currentTarget.contains(tr)) return
      if (tr.closest('thead')) paintCheckHover('head')
      else paintCheckHover(tr.dataset.recordId ?? null)
    },
  }

  return (
    <div
      ref={pageRef}
      className={`fsdb-page tasks-root${nested ? ' inspector-database-page' : ''}${sheet ? ' is-sheet' : ''}${!sheet && pageWidth === 'full' ? ' is-full-width' : ''}${collectionPath === '/plugins' ? ' is-plugins' : ''}`}
      data-testid={embed ? 'inspector-database' : sheet ? 'fsdb-collect-sheet' : undefined}
    >
      {!nested ? (
        <Suspense fallback={null}>
        <IdleDataSidebar
          tables={tables}
          collectionPath={collectionPath}
          title={title}
          views={views}
          activeViewId={activeViewId}
          onOpenTable={onOpenTable}
          onApplyView={(view) => {
            selectView(view)
            setDetailId(null)
          }}
          onRenameView={renameView}
          onDeleteView={deleteView}
          onAddView={addEmptyView}
          onOpenScopeHome={onOpenScopeHome}
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
        </Suspense>
      ) : null}
      {scopeHome && !nested ? (
        <Suspense fallback={null}>
          <ScopeOverview
            tables={tables}
            onOpenTable={(path, viewId) => onOpenTable?.(path, viewId)}
            onOpenRecord={(path, viewId, recordId) => onOpenRecord?.(recordId, viewId, path)}
          />
        </Suspense>
      ) : (
      <div className="fsdb-right">
        {listHeader}
        <div className="fsdb-right-body">
        <div
          key={nested ? 'embed' : `${collectionPath}:${detailId ?? ''}`}
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
                {pickedIds.length ? (
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
                    {canDelete && pickedIds.some((id) => !(collectionPath === '/plugins' && items.find((row) => row.id === id)?.builtin === true)) ? (
                      <button
                        type="button"
                        className="tasks-icon-btn is-danger"
                        data-testid="fsdb-bulk-delete"
                        aria-label="删除选中"
                        title={`删除选中的 ${pickedIds.length} 条`}
                        onClick={() => setDlg({
                          kind: 'delete-records',
                          ids: pickedIds.filter((id) => !(collectionPath === '/plugins' && items.find((row) => row.id === id)?.builtin === true)),
                        })}
                      >
                        <TrashGlyph aria-hidden className="size-[14px]" />
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
                      {bulkMenuOpen ? (
                        <HeadlessDismiss onDismiss={() => setBulkMenuOpen(false)} insideRef={bulkRef}>
                          <div className="fsdb-bulk-menu" role="menu">
                            {canFacet ? (
                              <button
                                type="button"
                                className="tasks-sort-item"
                                data-testid="fsdb-bulk-facet"
                                onClick={() => {
                                  setBulkFacetIds([])
                                  setDlg({ kind: 'bulk-facet', ids: pickedIds })
                                  setBulkMenuOpen(false)
                                }}
                              >
                                <span className="tasks-sort-item-label">
                                  <RectangleStackIcon aria-hidden className="size-[14px]" />
                                  合集
                                </span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="tasks-sort-item"
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
                        </HeadlessDismiss>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <WindowedTable
                  columns={columns}
                  columnWidths={columnWidths}
                  columnPinCount={columnPinCount}
                  wrapCells={wrapCells}
                  truncateCells={truncateCells}
                  resizingCol={resizingCol}
                  nodes={tablePaintNodes}
                  error={error}
                  pickMode={pickMode}
                  resetKey={tableResetKey}
                  forceLiveChecks={pickedIds.length > 0}
                  checkLayoutExtra={checkLayoutExtra}
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
                  onVisibleRange={onVisibleRange}
                  activeRowId={detailId}
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
              <PagerSizeControl pageSize={pageSize} onChange={setPageSize} />
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
                disabled={total <= 0 || (page + 1) * pageSize >= total || (items.length > 0 && items.length < pageSize)}
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
        <Suspense fallback={null}>
        <RecordDetail
          selected={selected}
          schema={schema}
          chrome={chrome}
          draft={draft}
          detailBody={detailBody}
          labelOf={labelOf}
          renderCell={renderCell}
          setDraft={setDraft}
          writeOne={writeOne}
          writePatch={writePatch}
          tableIcon={currentTable?.view?.icon}
          readOnly={selected.shareRole === '阅读' && (!localData || selected.builtin === true)}
          actionProperty={rowActionColumn ? <RecordActions row={selected} /> : null}
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
          onDelete={canDelete && !(collectionPath === '/plugins' && selected.builtin === true) ? () => setDlg({ kind: 'delete-record', row: selected }) : undefined}
          onOpenRecord={(recordId, collection) => onOpenRecord?.(recordId, activeViewId, collection)}
          onPrev={total > 1 ? () => void stepViewRecord(-1) : undefined}
          onNext={total > 1 ? () => void stepViewRecord(1) : undefined}
          canPrev={viewIndex == null ? total > 1 : viewIndex > 0}
          canNext={viewIndex == null ? total > 1 : viewIndex < total - 1}
          collectionPath={collectionPath}
          recordKind={recordKind}
          inspectorPaneId={inspectorPaneId}
        />
        </Suspense>
      ) : null}
        </div>
        </div>
      </div>
      )}
      {dlg?.kind === 'rename' ? (
        <AppDialog
          key={dlg.view.id}
          title="重命名视图"
          confirm="保存"
          onCancel={() => setDlg(null)}
          onConfirm={applyRename}
          input={{ defaultValue: dlg.view.name, placeholder: '视图名称', maxLength: 80 }}
          error={dlgError}
          onClearError={() => setDlgError('')}
        />
      ) : null}
      {dlg?.kind === 'delete' ? (
        <AppDialog
          title="删除视图"
          confirm="删除"
          danger
          onCancel={() => setDlg(null)}
          onConfirm={applyDeleteView}
          body={<p>确定删除视图「{dlg.view.name}」？会放进回收站，可随时恢复。</p>}
        />
      ) : null}
      {dlg?.kind === 'delete-record' ? (
        <AppDialog
          title="删除记录"
          confirm="删除"
          danger
          onCancel={() => setDlg(null)}
          onConfirm={() => {
            const { row } = dlg
            setDlg(null)
            void executeDeleteRecord(row)
          }}
          body={<p>确定删除「{labelOf(dlg.row)}」？会放进回收站，可随时恢复。</p>}
        />
      ) : null}
      {dlg?.kind === 'delete-records' ? (
        <AppDialog
          title="删除记录"
          confirm="删除"
          danger
          onCancel={() => setDlg(null)}
          onConfirm={() => {
            const { ids } = dlg
            setDlg(null)
            void executeDeleteRecords(ids)
          }}
          body={<p>确定删除选中的 {dlg.ids.length} 条记录？会放进回收站，可随时恢复。</p>}
        />
      ) : null}
      {dlg?.kind === 'bulk-edit' ? (
        <AppDialog
          title={`编辑 ${dlg.ids.length} 条`}
          confirm="写入"
          disabled={!bulkEditKey}
          onCancel={() => setDlg(null)}
          onConfirm={() => {
            const { ids } = dlg
            const key = bulkEditKey
            const raw = bulkEditRaw
            setDlg(null)
            void executeBulkEdit(ids, key, raw)
          }}
          body={
            <div className="fsdb-bulk-form">
              <label className="fsdb-bulk-label">
                字段
                <select className="fsdb-dlg-input" value={bulkEditKey} onChange={(event) => setBulkEditKey(event.target.value)}>
                  {bulkFields.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.field.label || item.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fsdb-bulk-label">
                值
                <input
                  className="fsdb-dlg-input"
                  value={bulkEditRaw}
                  placeholder="写入到选中记录"
                  onChange={(event) => setBulkEditRaw(event.target.value)}
                />
              </label>
            </div>
          }
        />
      ) : null}
      {dlg?.kind === 'bulk-facet' ? (
        <AppDialog
          title={`合集 · ${dlg.ids.length} 条`}
          confirm="贴上"
          disabled={!bulkFacetIds.length}
          onCancel={() => setDlg(null)}
          onConfirm={() => {
            const { ids } = dlg
            const tags = bulkFacetIds
            setDlg(null)
            void executeBulkFacet(ids, tags)
          }}
          body={
            loadFacets().length ? (
              <div className="fsdb-bulk-form">
                {loadFacets().map((pack) => {
                  const on = bulkFacetIds.includes(pack.id)
                  return (
                    <CheckRow
                      key={pack.id}
                      label={pack.label || pack.id}
                      icon={<RectangleStackIcon aria-hidden className="size-[14px]" />}
                      on={on}
                      onToggle={() =>
                        setBulkFacetIds((prev) => (on ? prev.filter((id) => id !== pack.id) : [...prev, pack.id]))
                      }
                    />
                  )
                })}
              </div>
            ) : (
              <p>还没有合集。先到合集库里建一个，再回来贴。</p>
            )
          }
        />
      ) : null}
      {dlg?.kind === 'action' ? (
        <AppDialog
          title={dlg.action.label}
          confirm={dlg.action.label}
          danger={dlg.action.tone === 'danger'}
          onCancel={() => setDlg(null)}
          onConfirm={() => {
            const { row, action } = dlg
            setDlg(null)
            void executeAction(row, action)
          }}
          body={<p>{dlg.action.confirm}</p>}
        />
      ) : null}
      {dlg?.kind === 'alert' ? (
        <AppDialog
          title={dlg.title}
          confirm="知道了"
          hideCancel
          onCancel={() => setDlg(null)}
          onConfirm={() => setDlg(null)}
          body={<p>{dlg.body}</p>}
        />
      ) : null}
      {renderCellPop()}
    </div>
  )
}
