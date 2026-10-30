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
  PlusIcon,
  TagIcon,
  ArrowDownTrayIcon,
  GlobeAltIcon,
  UserIcon,
  UsersIcon,
  ViewColumnsIcon,
} from '@heroicons/react/16/solid'
import type { CollectionActionInfo, CollectionInfo, CollectionSchema, CollectionSchemaPack, DbRecord, FieldSpec, FieldType } from '@biu/type-file-system'
import { normalizeSchemaValue } from '@biu/type-file-system'
import type { CollectionChrome, CollectionRowViewType, CollectionViewType, DatabaseUi } from '@biu/type-file-system/ui'
import { parseAppPath } from '@biu/web-session-view'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { BoolBox } from '@biu/biu-ui/bool-box'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { HeadlessDismiss, HEADLESS_DISMISS_IGNORE } from '@biu/biu-ui/headless-dismiss'
import { TagChip, TagChips, tagTextColor, tagTone as schemaTagTone } from '@biu/biu-ui/tag-chip'
import { facetChipIcon } from './schema-field.tsx'
import {
  contentFieldKey,
  defaultColumnKeys,
  facetSourceKey,
  flattenFacetColumns,
  facetColumnTitle,
  fieldEntries,
  flattenTree,
  enumDisplayLabel,
  formatField,
  fieldValueOptions,
  groupField,
  groupListKeys,
  groupRecords,
  groupRowBucketKeys,
  groupableFields,
  hasTreeLinks,
  isRecordLinkField,
  listProjectionKeys,
  overlayListed,
  parentFieldKey,
  parseFacetFlatColumnKey,
  isFacetFlatColumnKey,
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
import { FlyoutEmpty, SearchableFlyout, flyoutQueryMatch } from './flyout-search.tsx'
import { buildCrumbs, type CrumbTarget } from './sidebar-nav.ts'
import { CrumbTrail } from './crumb-trail.tsx'
import { fieldPickAttrs, pickDomAttrs, recordPickKind, recordSourcePath } from './pick-dom.ts'
import { normalizeRecordEmoji, recordPreviewEmoji, crumbRecordLabel } from './sidebar-preview.ts'
import { recordPreviewMascot, RecordMark } from './record-mark.tsx'
import { COL_WIDTH_MAX, COL_WIDTH_MIN, colWidthStyle, normalizeColumnWidths, normalizeSavedView, normalizePageSize, rankListedViews, viewIsFresher, viewStateKey, type SavedView } from './saved-view.ts'
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
import { ShareRoleLabel, ShareScopeLabel } from './share-scope-label.tsx'
import { ensureFsdbStyle } from './fsdb-style.ts'
import { workspaceColumnsForLocation } from './workspace-columns.ts'
import { PageBanner } from './page-banner.tsx'
import { UiGlyph, ViewModeGlyph, idleTableIconKind } from './nav-glyphs.tsx'
import { DATA_MODULE, isIndexCollection, isSystemCollection } from './database-path.ts'
import { ViewOrderMenu } from './view-order-menu.tsx'
import { getDatabaseUi } from './database-ui.ts'
import {
  activeViewStorageKey,
  fetchSavedView,
  getStarredViews,
  getStarredViewsVersion,
  isViewStarred,
  loadViews,
  noteLocalSavedViewsWrite,
  pullSavedViews,
  applyListedCrumbMutation,
  rememberRecords,
  rememberViews,
  persistStarredViews,
  persistCollapsedGroups,
  persistViewDisplay,
  loadCollapsedGroups,
  pickViewForRoute,
  pushSavedViews,
  pushSavedViewsPatch,
  stampSavedView,
  diffSavedViews,
  mergeSavedViewsPatch,
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
import { PageContentLoading } from './page-content-status.tsx'
import { ViewPaneMenu } from './pane-more-menu.tsx'
import { HttpError, invalidateListReads, listCollection, readJson } from './db-client.ts'
import { savedViewRecordPath } from '../paths.ts'
import { findViewNeighbor, indexOnPage } from './view-adjacent.ts'
import { TABLE_WINDOW_OVERSCAN, medianPaintedRowPx, rememberedTableWrap, settlePaintedRowPx, tableColumnSlice, tableColumnUnchanged, tableColumnWidth, tableRowFallbackPx, tableWindowSlice, tableWindowUnchanged, tableWrapScroll, type TableColumnSlice } from './table-window.ts'
import { forgetPreviewTotalsForPath, markPaintedListReady, rememberPreviewTotalForView, resetPaintedListReady } from './sidebar-preview.ts'
import { DataSidebarShell } from './data-sidebar-shell.tsx'
import { builtinAllViewId, catalogLockFilters, isReadOnlyViewId, mergeTableViews, parseBuiltinScopeViewId, stubBuiltinBlockKindView, viewsForScope, type DataScope } from '../catalog-views.ts'
import { SAVED_VIEW_EVENT, moveInspectorRecordsToTrash, rememberInspectorWorkingView, showRecordInInspector } from './inspector-db-route.ts'
import { CellPop, cellUsesPop } from './cell-pop.tsx'
import { loadFacets, pullFacets, subscribeFacets } from './facet-catalog.ts'
import {
  collectQueryFields,
  isCustomSorts,
  countFilterRules,
  emptyFilterGroup,
  encodeListFilter,
  filterEditorStateKey,
  filterTreeStateKey,
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
const QueryFlyout = lazy(() => import('./query-menus.tsx').then((m) => ({ default: m.QueryFlyout })))
const FieldValuePop = lazy(() => import('./field-value-pop.tsx').then((m) => ({ default: m.FieldValuePop })))
const CellPopDraft = lazy(() => import('./cell-pop-draft.tsx').then((m) => ({ default: m.CellPopDraft })))
const RecordDetail = lazy(() => import('./record-detail.tsx').then((m) => ({ default: m.RecordDetail })))
const ColumnOrderMenu = lazy(() => import('./column-order-menu.tsx').then((m) => ({ default: m.ColumnOrderMenu })))
const RecordEmojiBoard = lazy(() => import('@biu/biu-ui/emoji-board').then((m) => ({ default: m.RecordEmojiBoard })))
const LazyShareButton = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.ShareButton })))
const LazySharePanel = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.SharePanel })))
const LazyShareRoleDetail = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.ShareRoleDetail })))
const LazyShareScopeDetail = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.ShareScopeDetail })))
const DataSidebar = lazy(() => import('./data-sidebar.tsx').then((m) => ({ default: m.DataSidebar })))
const LayoutPrefsMenu = lazy(() => import('./layout-prefs-menu.tsx').then((m) => ({ default: m.LayoutPrefsMenu })))
const CollectionRowsShell = lazy(() => import('./rows-view.tsx').then((m) => ({ default: m.CollectionRowsShell })))

function IdleDataSidebar(props: ComponentProps<typeof DataSidebar>) {
  return <DataSidebar {...props} />
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
  pick,
  onOpenSplit,
  onOpenRow,
}: {
  row: DbRecord
  kidCount?: number
  toolsLive?: boolean
  pick: object
  onOpenSplit: () => void
  onOpenRow: () => void
}) {
  return (
    <span className="tasks-title-aside">
      {toolsLive ? (
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
      if (!table.offsetHeight) return
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
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }
    measure()
    const ro = new ResizeObserver(schedule)
    ro.observe(table)
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
  'facet',
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
  return key !== 'description' && key !== 'notes' && key !== 'content' && key !== 'emoji' && key !== 'banner' && key !== 'tags'
}

/** Saved view columns stay until we know the field is gone. Facet / share overlay keys are not schema fields. */
function retainSavedColumn(key: string, schema: CollectionSchema | undefined, allColumnKeys: string[]) {
  if (key === 'actions' || key === 'shareScope' || key === 'shareRole') return true
  if (key === 'createdBy' || key === 'updatedBy' || key === 'createdAt' || key === 'updatedAt') return true
  if (parseFacetFlatColumnKey(key) || isFacetFlatColumnKey(key)) return true
  if (!schema) return true
  if (allColumnKeys.includes(key)) return true
  const field = schema.fields[key]
  if (!field) return true
  return isListColumn(key) && resolveFieldType(field) !== 'file'
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

const LIST_CACHE_MAX = 32
type ListCacheSnap = {
  items: Array<DbRecord & { path?: string }>
  total: number
  stat: StatResult | null
  groupBuckets?: GroupBucket[]
  listLimit?: number
}
const listCache = new Map<string, ListCacheSnap>()

function listCacheKey(path: string, viewId?: string | null) {
  return `${path}\0${viewId ?? ''}`
}

function peekListCache(path: string, viewId?: string | null, minLimit?: number) {
  const snap = listCache.get(listCacheKey(path, viewId))
  if (!snap) return
  const loaded = snap.listLimit ?? snap.items.length
  if (minLimit != null && loaded < minLimit && snap.total > loaded) return undefined
  return snap
}

function bucketsReadyToCache(buckets?: GroupBucket[]) {
  if (!buckets?.length) return true
  return buckets.every((bucket) => (bucket.total ?? 0) <= 0 || bucket.rows.length > 0)
}

function rememberListCache(path: string, snap: ListCacheSnap, viewId?: string | null) {
  if (!bucketsReadyToCache(snap.groupBuckets)) return
  const key = listCacheKey(path, viewId)
  if (listCache.has(key)) listCache.delete(key)
  listCache.set(key, snap)
  while (listCache.size > LIST_CACHE_MAX) {
    const first = listCache.keys().next().value
    if (first === undefined) break
    listCache.delete(first)
  }
}

function forgetListCache(path: string) {
  for (const key of [...listCache.keys()]) {
    if (key === path || key.startsWith(`${path}\0`)) listCache.delete(key)
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
  '.fsdb-row-check, .fsdb-col-resizer, .tasks-row-tools, .tasks-title-open, .fsdb-action-btn, .fsdb-action-tag, .fsdb-boolbtn, .fsdb-thumb-btn, .fsdb-thumb, .biu-image, .fsdb-file-tools, .fsdb-ref-chip, .db-datetime, .biu-calendar, .fsdb-scope-detail'

type TablePaintNode =
  | { kind: 'empty'; key: string }
  | { kind: 'group-head'; key: string; groupKey: string; label: string; count: number }
  | { kind: 'row'; key: string; keyPrefix: string; row: DbRecord; depth: number; hasKids: boolean; kidCount: number }
  | { kind: 'group-pager'; key: string; groupKey: string; count: number; pageIndex: number }

const EMPTY_HOLD_NODES: TablePaintNode[] = [{ kind: 'empty', key: 'empty' }]

function collectionFromAppUrl(url: string): { collection: string; viewId: string } | null {
  let pathname = url
  try {
    pathname = url.startsWith('http') ? new URL(url).pathname : url
  } catch {
    return null
  }
  const parsed = parseAppPath(pathname, [DATA_MODULE])
  if (parsed.kind !== 'collection-view' && parsed.kind !== 'record') return null
  return {
    collection: parsed.collection,
    viewId: parsed.viewId || builtinAllViewId(parsed.collection),
  }
}

const SHARE_SCOPE_ORDER = ['私人', '空间', '共享']

function createdRowGroupKey(
  row: DbRecord,
  groupBy: string,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  if (!groupBy) return ''
  return groupRowBucketKeys(row, groupBy, schema, packs)[0] ?? ''
}

function placeCreatedRow(
  groups: GroupBucket[],
  row: DbRecord,
  groupBy: string,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  if (!groups.length) return groups
  if (groups.some((group) => group.rows.some((item) => item.id === row.id))) return groups
  const key = createdRowGroupKey(row, groupBy, schema, packs)
  const index = groups.findIndex((group) => group.key === key || group.label === key)
  if (index >= 0) {
    return groups.map((group, i) =>
      i !== index
        ? group
        : {
            ...group,
            rows: [row, ...group.rows],
            total: group.total != null ? group.total + 1 : group.rows.length + 1,
          },
    )
  }
  if (!groupBy) return groups
  const bucket: GroupBucket = { key, label: key || '未填', rows: [row], total: 1 }
  if (groupBy === 'shareScope') {
    const order = SHARE_SCOPE_ORDER.indexOf(key)
    const insertAt = order < 0 ? groups.length : groups.findIndex((group) => SHARE_SCOPE_ORDER.indexOf(group.key) > order)
    const at = insertAt < 0 ? groups.length : insertAt
    return [...groups.slice(0, at), bucket, ...groups.slice(at)]
  }
  return [bucket, ...groups]
}

/** 分组字段改了就把行挪到新桶，不要等整表 reload。 */
function remapGroupedRecords(
  groups: GroupBucket[],
  map: (row: DbRecord) => DbRecord,
  groupBy: string,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  if (!groups.length) return groups
  if (!groupBy) {
    return groups.map((group) => ({ ...group, rows: group.rows.map(map) }))
  }
  const relocated: DbRecord[] = []
  const seen = new Set<string>()
  const next = groups.map((group) => {
    let dropped = 0
    const rows: DbRecord[] = []
    for (const row of group.rows) {
      const mapped = map(row)
      const keys = groupRowBucketKeys(mapped, groupBy, schema, packs)
      const stays = keys.includes(group.key) || keys.includes(group.label)
      if (stays) {
        rows.push(mapped)
        continue
      }
      dropped += 1
      const id = String(mapped.id)
      if (!seen.has(id)) {
        seen.add(id)
        relocated.push(mapped)
      }
    }
    if (!dropped) {
      return rows.every((row, index) => row === group.rows[index]) ? group : { ...group, rows }
    }
    return {
      ...group,
      rows,
      total: group.total != null ? Math.max(0, group.total - dropped) : undefined,
    }
  })
  let buckets = next.filter((group) => group.rows.length > 0 || (group.total ?? 0) > 0)
  for (const row of relocated) buckets = placeCreatedRow(buckets, row, groupBy, schema, packs)
  return buckets
}

const LISTED_MUTATION_EVENT = 'fsdb:list-mutation'

type ListedMutation =
  | { path: string; op: 'patch'; row: DbRecord; groupBy?: string }
  | { path: string; op: 'create'; row: DbRecord; groupBy?: string; viewId?: string | null; total?: number }
  | { path: string; op: 'remove'; ids: string[]; viewId?: string | null; total?: number }

function overlayListedRow(row: DbRecord, next: DbRecord): DbRecord {
  return { ...row, ...next, banner: next.banner ?? row.banner ?? null }
}

function patchListCacheRecords(path: string, map: (row: DbRecord) => DbRecord, groupBy?: string) {
  for (const key of [...listCache.keys()]) {
    if (key !== path && !key.startsWith(`${path}\0`)) continue
    const snap = listCache.get(key)
    if (!snap) continue
    listCache.set(key, {
      ...snap,
      items: snap.items.map((row) => map(row) as (typeof snap.items)[number]),
      groupBuckets: snap.groupBuckets
        ? groupBy
          ? remapGroupedRecords(snap.groupBuckets, map, groupBy)
          : snap.groupBuckets.map((group) => ({
              ...group,
              rows: group.rows.map(map),
            }))
        : snap.groupBuckets,
    })
  }
}

function dropListCacheRecords(path: string, ids: string[]) {
  const gone = new Set(ids.filter(Boolean).map(String))
  if (!gone.size) return
  for (const key of [...listCache.keys()]) {
    if (key !== path && !key.startsWith(`${path}\0`)) continue
    const snap = listCache.get(key)
    if (!snap) continue
    const items = snap.items.filter((row) => !gone.has(String(row.id)))
    const removed = snap.items.length - items.length
    const groupBuckets = snap.groupBuckets
      ?.map((group) => {
        const rows = group.rows.filter((row) => !gone.has(String(row.id)))
        const dropped = group.rows.length - rows.length
        if (!dropped) return group
        return {
          ...group,
          rows,
          total: group.total != null ? Math.max(0, group.total - dropped) : undefined,
        }
      })
      .filter((group) => group.rows.length > 0 || (group.total ?? 0) > 0)
    listCache.set(key, {
      ...snap,
      items,
      total: Math.max(0, snap.total - removed),
      groupBuckets,
    })
  }
}

function seedListCacheSnap(row: DbRecord, groupBy?: string): ListCacheSnap {
  const key = createdRowGroupKey(row, groupBy ?? '')
  return {
    items: [row],
    total: 1,
    stat: null,
    groupBuckets: groupBy ? [{ key, label: key || '未填', rows: [row], total: 1 }] : [],
  }
}

function upsertListCacheRecord(path: string, row: DbRecord, groupBy?: string, viewId?: string | null) {
  const snap = peekListCache(path, viewId)
  if (!snap) {
    rememberListCache(path, seedListCacheSnap(row, groupBy), viewId)
    return
  }
  if (snap.items.some((item) => item.id === row.id)) {
    patchListCacheRecords(path, (item) => (item.id === row.id ? overlayListedRow(item, row) : item))
    return
  }
  const groupBuckets = placeCreatedRow(snap.groupBuckets ?? [], row, groupBy ?? '')
  rememberListCache(
    path,
    {
      ...snap,
      items: [row, ...snap.items],
      total: snap.total + 1,
      groupBuckets: groupBuckets.length ? groupBuckets : seedListCacheSnap(row, groupBy).groupBuckets,
    },
    viewId,
  )
}

function trashRecordId(collectionPath: string, recordId: string) {
  return `${String(collectionPath).replace(/^\//, '')}::${recordId}`
}

function toTrashListRow(collectionPath: string, row: DbRecord, tableLabel: string): DbRecord {
  const id = String(row.id)
  return {
    id: trashRecordId(collectionPath, id),
    title: crumbRecordLabel(row),
    table: tableLabel,
    tablePath: collectionPath,
    sourceId: id,
    sourcePath: `${collectionPath}/${id}`,
    deletedAt: Date.now(),
    shareScope: row.shareScope,
  }
}

function publishDeletedRowsToTrash(collectionPath: string, rows: DbRecord[], tableLabel: string) {
  if (collectionPath === '/trash') return
  const viewId = builtinAllViewId('/trash')
  for (const row of rows) {
    if (!row?.id) continue
    publishListedMutation({
      path: '/trash',
      op: 'create',
      row: toTrashListRow(collectionPath, row, tableLabel),
      viewId,
      groupBy: 'shareScope',
    })
  }
  moveInspectorRecordsToTrash(
    collectionPath,
    rows.map((row) => String(row?.id ?? '')).filter(Boolean),
  )
}

function applyPreviewTotalMutation(mutation: ListedMutation) {
  if (mutation.op === 'patch') return
  if (mutation.total != null) {
    rememberPreviewTotalForView(mutation.path, mutation.viewId, mutation.total)
    const keepPrefix = mutation.viewId ? `${mutation.path}\0${mutation.viewId}\0` : undefined
    forgetPreviewTotalsForPath(mutation.path, keepPrefix)
  }
}

function listedCrumbRow(row: DbRecord) {
  return {
    id: String(row.id),
    label: crumbRecordLabel(row),
    emoji: recordPreviewEmoji(row),
    mascot: recordPreviewMascot(row),
  }
}

function publishListedMutation(mutation: ListedMutation) {
  if (mutation.op === 'patch') {
    patchListCacheRecords(
      mutation.path,
      (row) => (row.id === mutation.row.id ? overlayListedRow(row, mutation.row) : row),
      mutation.groupBy,
    )
    applyListedCrumbMutation(mutation.path, { op: 'patch', row: listedCrumbRow(mutation.row) })
  } else if (mutation.op === 'remove') {
    dropListCacheRecords(mutation.path, mutation.ids)
    applyListedCrumbMutation(mutation.path, { op: 'remove', ids: mutation.ids })
  } else {
    upsertListCacheRecord(mutation.path, mutation.row, mutation.groupBy, mutation.viewId)
    applyListedCrumbMutation(mutation.path, {
      op: 'create',
      row: listedCrumbRow(mutation.row),
      viewId: mutation.viewId,
    })
  }
  applyPreviewTotalMutation(mutation)
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(LISTED_MUTATION_EVENT, { detail: mutation }))
}

function listHoldResetKey(view: SavedView | null, path: string) {
  return `${view?.id ?? ''}\0${path}\0${view?.groupBy ?? ''}\0${0}\0${normalizePageSize(view?.pageSize)}\0${view?.query ?? ''}`
}

function emptyListHold(prev: TableHoldSnap | null, view: SavedView | null, path: string): TableHoldSnap {
  return {
    columns: prev?.columns ?? [{ key: 'title' }],
    columnWidths: prev?.columnWidths ?? {},
    columnPinCount: prev?.columnPinCount ?? 1,
    wrapCells: !!view?.wrap,
    truncateCells: view ? view.truncate !== false : true,
    nodes: EMPTY_HOLD_NODES,
    resetKey: listHoldResetKey(view, path),
    checkLayoutExtra: '',
  }
}

function listHoldFromCache(cached: ListCacheSnap, view: SavedView | null, path: string): TableHoldSnap {
  const schema = cached.stat?.schema
  const keys = pinActionColumn(schema, view?.columns ?? [], placedActions(schema, 'row').length > 0)
  const pageSize = normalizePageSize(view?.pageSize)
  const groupBy = view?.groupBy ?? ''
  const buckets = (cached.groupBuckets ?? []).filter((item) => (item.total ?? item.rows.length) > 0)
  let nodes: TablePaintNode[]
  if (groupBy && buckets.length) {
    nodes = []
    for (const group of buckets) {
      const groupKey = group.key || 'unset'
      const count = group.total ?? group.rows.length
      nodes.push({ kind: 'group-head', key: `gh:${groupKey}`, groupKey, label: group.label, count })
      const rows = group.total != null ? group.rows : group.rows.slice(0, pageSize)
      for (const row of rows) {
        nodes.push({
          kind: 'row',
          key: `${groupKey}:${row.id}`,
          keyPrefix: `${group.key}:`,
          row,
          depth: 0,
          hasKids: false,
          kidCount: 0,
        })
      }
      nodes.push({ kind: 'group-pager', key: `gp:${groupKey}`, groupKey, count, pageIndex: 0 })
    }
  } else if (groupBy) {
    // 有 groupBy 但缓存还没有组桶时，不能先画成平铺行，否则 shareScope 会先平铺再收成「共享」。
    nodes = EMPTY_HOLD_NODES
  } else if (cached.items.length) {
    nodes = cached.items.slice(0, pageSize).map((row) => ({
      kind: 'row' as const,
      key: String(row.id),
      keyPrefix: '',
      row,
      depth: 0,
      hasKids: false,
      kidCount: 0,
    }))
  } else {
    nodes = EMPTY_HOLD_NODES
  }
  const label = schema?.labelField ?? 'title'
  return {
    columns: keys.map((key) => {
      if (key === 'actions') return { key, kind: 'action' as const, field: { type: 'action' as const, label: '动作' } }
      const field = schema?.fields?.[key]
      return {
        key,
        kind: field ? resolveFieldType(field) : 'text',
        field: field ?? { type: 'text' as const, label: key === label ? '标题' : key },
      }
    }),
    columnWidths: normalizeColumnWidths(view?.columnWidths),
    columnPinCount: keys[0] === label ? 1 : 0,
    wrapCells: !!view?.wrap,
    truncateCells: view ? view.truncate !== false : true,
    nodes,
    resetKey: listHoldResetKey(view, path),
    checkLayoutExtra: '',
    schema,
  }
}

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
        <td colSpan={span} style={{ height: px }}>
          <div style={{ height: px }} />
        </td>
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

type TableHoldSnap = {
  columns: { key: string; kind?: string; field?: FieldSpec }[]
  columnWidths: Record<string, number>
  columnPinCount: number
  wrapCells: boolean
  truncateCells: boolean
  nodes: TablePaintNode[]
  resetKey: string
  checkLayoutExtra: string
  schema?: CollectionSchema
}

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
  listColumns: string[] | undefined
  activeViewId: string
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
  frozen?: boolean
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
  frozen = false,
}: WindowedTableProps) {
  const [tableScroll, setTableScroll] = useState(() => ({
    top: 0,
    left: 0,
    ...rememberedTableWrap(),
  }))
  const paintCountRef = useRef(0)
  const frozenRef = useRef(frozen)
  frozenRef.current = frozen
  const [rowPx, setRowPx] = useState(() => tableRowFallbackPx(wrapCells))
  const rowPxRef = useRef(rowPx)
  rowPxRef.current = rowPx
  const columnMetaRef = useRef({ count: 0, pin: 0, widths: [] as number[] })
  const columnPx = useMemo(
    () => columns.map((col, index) => tableColumnWidth(col.key, columnWidths[col.key], index < columnPinCount)),
    [columnPinCount, columnWidths, columns],
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
    () => tableWindowSlice(nodes.length, tableScroll.top, tableScroll.height, rowPx),
    [nodes.length, rowPx, tableScroll.height, tableScroll.top],
  )
  paintCountRef.current = nodes.length
  paintRef.current.colSpan = tableColSpan

  useLayoutEffect(() => {
    const next = tableRowFallbackPx(wrapCells)
    if (next === rowPxRef.current) return
    rowPxRef.current = next
    setRowPx(next)
  }, [wrapCells])

  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return
    const heights: number[] = []
    for (const tr of Array.from(table.tBodies[0]?.rows ?? [])) {
      if (tr.classList.contains('fsdb-table-pad')) continue
      if (tr.classList.contains('fsdb-group-row') || tr.classList.contains('fsdb-group-pager')) continue
      const h = tr.offsetHeight
      if (h > 0) heights.push(h)
    }
    // 不能依赖 tableWindow.start/end：setRowPx 会改窗口，窗口再测高再 setState，滚动时会打穿 React #185。
    const next = settlePaintedRowPx(medianPaintedRowPx(heights, rowPxRef.current), rowPxRef.current)
    if (next === rowPxRef.current) return
    rowPxRef.current = next
    setRowPx(next)
  }, [nodes.length, tableRef, tableScroll.height, tableScroll.top, wrapCells])

  useEffect(() => {
    onVisibleRange?.(tableWindow.start, tableWindow.end)
  }, [onVisibleRange, tableWindow.end, tableWindow.start])

  const applyWrapScroll = (wrap: HTMLElement, top?: number) => {
    if (frozenRef.current && top == null) return
    const next = tableWrapScroll(wrap, top)
    const rowPx = rowPxRef.current
    const count = paintCountRef.current
    const cols = columnMetaRef.current
    setTableScroll((prev) => {
      const rowSame = tableWindowUnchanged(count, prev, next, rowPx)
      const colSame = tableColumnUnchanged(cols.count, cols.pin, prev, next, cols.widths)
      return rowSame && colSame ? prev : next
    })
  }

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    if (wrap.scrollTop) wrap.scrollTop = 0
    applyWrapScroll(wrap, 0)
  }, [resetKey, wrapRef])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        applyWrapScroll(wrap)
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
  const paintListedViews = (path: string) => {
    const remembered = loadViews(path)
    return rankListedViews(
      listedViews(path, remembered).map((view) => withViewDisplay(path, view)),
      remembered,
    )
  }
  const dataPath = collectionPath
  const [stat, setStat] = useState<StatResult | null>(() => peekListCache(dataPath, routeViewId)?.stat ?? null)
  const [items, setItems] = useState<Array<DbRecord & { path?: string }>>(() => peekListCache(dataPath, routeViewId)?.items ?? [])
  const [error, setError] = useState('')
  const [openDetailId, setOpenDetailId] = useState<string | null>(routeRecordId)
  const [detailRow, setDetailRow] = useState<DbRecord | null>(null)
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
  const [total, setTotal] = useState(() => peekListCache(dataPath, routeViewId)?.total ?? 0)
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    loadCollapsedGroups(collectionPath, initialView?.id ?? routeViewId ?? '', initialView?.groupBy ?? ''),
  )
  useEffect(() => {
    setCollapsedGroups(loadCollapsedGroups(collectionPath, activeViewId ?? routeViewId ?? '', groupBy))
  }, [activeViewId, collectionPath, groupBy, routeViewId])
  const [groupPages, setGroupPages] = useState<Record<string, number>>({})
  const [groupFillKeys, setGroupFillKeys] = useState<string[]>([])
  const [groupBuckets, setGroupBuckets] = useState<GroupBucket[]>(() => peekListCache(dataPath, routeViewId)?.groupBuckets ?? [])
  const [paintedPath, setPaintedPath] = useState(dataPath)
  const tablePaintSnapshotRef = useRef<TableHoldSnap | null>(null)
  const tableHoldRef = useRef<TableHoldSnap | null>(null)
  const releaseHoldOnPaintRef = useRef(false)
  const [, setHoldNav] = useState(0)
  const collectionPathRef = useRef(collectionPath)
  collectionPathRef.current = collectionPath
  const pendingPathQueryRef = useRef<PendingPathQuery | null>(null)
  const adoptListCacheForViewRef = useRef<(path: string, view: SavedView | null | undefined) => void>(() => undefined)
  adoptListCacheForViewRef.current = (path, view) => {
    const cached = view ? peekListCache(path, view.id, normalizePageSize(view.pageSize)) : undefined
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
    const cached = peekListCache(path, view?.id, normalizePageSize(view?.pageSize))
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
    const cached = peekListCache(dataPath, next?.id, normalizePageSize(next?.pageSize))
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
      setError('')
      setPage(0)
      adoptView(next, cached.stat?.schema)
    } else {
      // 上一张表的 shareScope 组（私人/空间）不能顶到新表 URL 上，否则看起来像同一张表在重分组。
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
  const groupByRef = useRef(groupBy)
  groupByRef.current = groupBy
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
    const seedColumns = LIST_SEED_COLUMNS
    const requested = [
      ...(columnKeys.length ? columnKeys : currentSchema ? defaultColumnKeys(currentSchema, [...allowed]) : seedColumns),
      ...cellKeys,
    ]
    const visible = requested.filter(
      (key) =>
        !currentSchema ||
        allowed.has(key) ||
        Boolean(parseFacetFlatColumnKey(key)) ||
        key === 'shareScope' ||
        key === 'shareRole' ||
        cellKeys.includes(key),
    )
    const columns = visible.length ? visible : [...(columnKeys.length ? columnKeys : ['title']), ...cellKeys]
    if (!columns.length) return undefined
    const queryKeys = [...collectQueryFields(sorts, filterTree, currentSchema?.labelField ?? 'title')]
    return listProjectionKeys({ schema: currentSchema, columns: [...columns, ...queryKeys], groupBy })
  }, [chrome, columnKeys, customView, facetCatalog, filterTree, groupBy, sorts, stat])
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
  const filterValueOptions = useCallback((item: { kind: FieldType; key: string; field: FieldSpec }) => {
    const rows = itemsRef.current
    if (item.kind === 'boolean') {
      return [
        { value: 'true', label: '是' },
        { value: 'false', label: '否' },
      ]
    }
    if (item.kind === 'facet') {
      return uniqueValues(rows, item.key, item.field).map((option) => ({
        value: option,
        label: loadFacets().find((tag) => tag.id === option)?.label ?? option,
      }))
    }
    return fieldValueOptions(rows, item.key, item.field)
  }, [])
  const totalRef = useRef(total)
  totalRef.current = total
  const listIdentityKey = `${dataPath}\0${pageSize}\0${fetchQuery}\0${sortField}\0${sortDir}\0${sortsStateKey(sorts)}\0${JSON.stringify(queryFilters)}\0${activeViewId ?? ''}\0${customView ? 'full' : 'proj'}\0${groupBy}`
  const reloadKey = `${listIdentityKey}\0${groupBy ? JSON.stringify(groupPages) : page}\0${groupFillKeys.join('\0')}`
  if (releaseHoldOnPaintRef.current && paintedPath === dataPath && tableHoldRef.current?.nodes !== EMPTY_HOLD_NODES) {
    releaseHoldOnPaintRef.current = false
    tableHoldRef.current = null
  }
  const reload = useCallback(async (opts?: { force?: boolean }) => {
    if (!opts?.force && !routeViewReadyRef.current) return true
    if (!opts?.force && Date.now() < quietUntil.current) return true
    const hit = reloadInflightRef.current
    if (!opts?.force && hit?.key === reloadKey) return hit.promise
    const gen = ++reloadGen.current
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
      const extraGroupValues = (schema?: CollectionSchema) => {
        if (switching) return []
        const group = groupField(schema, reqGroupBy, facetCatalog)
        if (!group || group.field.enum?.length) return []
        const kind = resolveFieldType(group.field)
        if (kind === 'datetime' || kind === 'number' || kind === 'boolean') return []
        return uniqueValues(itemsRef.current, group.key, group.field)
      }
      const loadGroups = (schema?: CollectionSchema) =>
        listGroupedCollection({
          ...listOpts,
          groupBy: reqGroupBy,
          schema,
          packs: facetCatalog,
          extraValues: extraGroupValues(schema),
          pageSize: reqPageSize,
          groupPages: switching || opts?.force ? {} : groupPagesRef.current,
          wrap: reqWrap,
          fillKeys: switching || opts?.force ? [] : groupFillKeys,
          previous:
            !opts?.force && !switching && loadedIdentityRef.current === listIdentityKey
              ? groupBucketsRef.current
              : undefined,
          previousPages: switching || opts?.force ? {} : loadedPagesRef.current,
          list: (input) => listCollection({ ...input, fresh: Boolean(opts?.force) }),
        })
      let nextStat: StatResult
      let listed: { items: Array<DbRecord & { path?: string }>; total: number; schema?: CollectionSchema }
      let buckets: GroupBucket[] = []
      const loadUngrouped = () => listCollection({ ...listOpts, limit: reqPageSize, offset: switching ? 0 : page * reqPageSize })
      if (reqGroupBy) {
        const cachedSchema = switching ? undefined : schemaRef.current
        const cachedKeys = groupListKeys(cachedSchema, reqGroupBy, extraGroupValues(cachedSchema), facetCatalog)
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
        setShowTree(view.tree !== false)
        setWrapCells(pendingView.wrapCells)
        setTruncateCells(view.truncate !== false)
        setQuery(pendingView.fetchQuery)
        setFetchQuery(pendingView.fetchQuery)
        setPageSize(pendingView.pageSize)
        setPage(0)
        setGroupPages({})
        setGroupFillKeys([])
        setCollapsed({})
        setCollapsedGroups(loadCollapsedGroups(dataPath, pendingView.activeViewId, pendingView.groupBy))
      }
      setStat((prev) =>
        prev?.schema && schemaFingerprint(prev.schema) === schemaFingerprint(nextSchema) ? prev : { ...nextStat, schema: nextSchema },
      )
      setGroupBuckets((prev) => (JSON.stringify(prev) === JSON.stringify(buckets) ? prev : buckets))
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
        if (hit) setDetailRow((prev) => (prev?.id === openId ? overlayListed(prev, hit, listColumns) : prev))
      }
      rememberListCache(
        dataPath,
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
      if (gen !== reloadGen.current) return false
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
    }
  }, [activeViewId, collectionPath, customView, dataPath, facetCatalog, fetchQuery, groupBy, groupFillKeys, listColumns, listIdentityKey, queryFilters, page, pageSize, reloadKey, sortDir, sortField, sorts, wrapCells])
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
      setDetailBodyStatus('ready')
      setDetailBodyError('')
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
      adoptRoutedView()
      return
    }
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
    const destCached = peekListCache(dataPath, routeViewId, pageSize)
    if (!holdingRows && !destCached) {
      listReadySent.current = false
      pageRef.current?.removeAttribute('data-list-ready')
      resetPaintedListReady()
      setHydrated((prev) => (prev ? false : prev))
    }
    if (pathHandled) return
    setCollapsed((prev) => (Object.keys(prev).length ? {} : prev))
    const cached = peekListCache(dataPath, routeViewId, pageSize)
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
      const detail = (event as CustomEvent<{ views?: boolean; facets?: boolean }>).detail
      if (detail?.views) pendingViews = true
      else if (detail?.facets) return
      else pendingData = true
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => {
        const viewsTouched = pendingViews
        const dataTouched = pendingData
        pendingViews = false
        pendingData = false
        if (dataTouched) {
          void pullFacets()
          // 页面记录打开时不要把整张表（私人/空间/共享三包）再拉一遍。
          // 装全部页面插件会连续 bump /plugins，每个 change 都 force list 会把 Chrome 打到 ERR_INSUFFICIENT_RESOURCES。
          if (detailIdRef.current) {
            pullDetailBody()
            pullDetailRecord()
          } else {
            void reloadRef.current({ force: true })
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
    void pullFacets()
  }, [collectionPath, routeRecordId])

  useEffect(() => {
    if (nested) return
    const origPush = history.pushState
    const origReplace = history.replaceState
    const intercept = (orig: typeof history.pushState): History['pushState'] =>
      (data, unused, url) => {
        orig.call(history, data, unused, url)
        const next = collectionFromAppUrl(url != null ? String(url) : window.location.pathname)
        if (!next) return
        const before = tableHoldRef.current
        holdNavRef.current(next.collection, next.viewId)
        if (tableHoldRef.current !== before) setHoldNav((n) => n + 1)
      }
    history.pushState = intercept(origPush)
    history.replaceState = intercept(origReplace)
    return () => {
      history.pushState = origPush
      history.replaceState = origReplace
    }
  }, [nested])

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
    if (!routeViewReadyRef.current) return
    void reloadRef.current({ force: needsLoad })
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
  const inTrash = collectionPath === '/trash'
  const canBulkDelete = (canDelete || inTrash) && !subsetLocked
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
  const columns = useMemo(() => {
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
        if (key === 'shareScope') return { key, kind: 'select' as const, field: { type: 'select' as const, label: '分享' } }
        if (key === 'shareRole') return { key, kind: 'select' as const, field: { type: 'select' as const, label: '权限' } }
        const facet = parseFacetFlatColumnKey(key)
        if (facet) {
          return { key, kind: 'select' as const, field: { type: 'select' as const, label: facet.fieldKey }, packId: facet.packId }
        }
        return null
      })
      .filter(Boolean) as typeof allColumns
  }, [allColumnKeys, allColumns, columnKeys, rowActionColumn, schema, schemaDefaultKeys])

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
      if (snapshot[col.key] == null) snapshot[col.key] = tableColumnWidth(col.key, columnWidths[col.key], col.key === schema?.labelField)
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
  const groupFields = useMemo(() => groupableFields(schema, facetCatalog), [facetCatalog, schema])
  const activeGroup = groupField(schema, groupBy, facetCatalog)
  const grouping = Boolean(activeGroup)
  const filterFields = useMemo(
    () =>
      [
        ...entries,
        ...flattenFacetColumns(facetCatalog).map((item) => ({
          key: item.key,
          kind: item.kind,
          field: { ...item.field, label: facetColumnTitle(item) },
        })),
      ].filter(
        (item) =>
          item.key !== bodyKey &&
          resolveFieldType(item.field) !== 'file' &&
          item.key !== 'shareScope' &&
          !lockedFilterKeys.includes(item.key),
      ),
    [bodyKey, entries, facetCatalog, lockedFilterKeys],
  )
  const sortFields = useMemo(
    () => filterFields.filter((item) => item.field.sortable !== false),
    [filterFields],
  )

  useEffect(() => {
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
    if (!grouping) return groupRecords(visible, schema, groupBy, facetCatalog)
    if (groupBuckets.length) return groupBuckets.filter((item) => (item.total ?? item.rows.length) > 0)
    // 分享列是计算属性。用行上的 shareScope 再分组，会把「分享出去的私人记录」先画进共享，等 $scope 组桶到了再跳。
    if (groupBy === 'shareScope') return []
    return groupRecords(visible, schema, groupBy, facetCatalog).filter((item) => item.rows.length)
  }, [facetCatalog, groupBuckets, groupBy, grouping, schema, visible])
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
    if (tableHoldRef.current) return
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
    return listedSelected ?? { id: detailId }
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

  useEffect(() => {
    if (dlg?.kind !== 'rename') return
    setDlgError('')
  }, [dlg])

  function adoptPersistedViews(path: string, listed: SavedView[]) {
    const stored = listed.filter((view) => !view.builtin)
    rememberViews(path, listed)
    noteLocalSavedViewsWrite(path)
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

  async function persistViewsFor(
    path: string,
    next: SavedView[],
    extra?: { baseline?: SavedView[]; upsert?: SavedView[]; remove?: string[] },
  ) {
    if (sheet) return true
    const forced = extra?.upsert ?? []
    const incoming = [
      ...next.filter((view) => !forced.some((item) => item.id === view.id)),
      ...forced,
    ]
    const listed = rankListedViews(
      listedViews(path, incoming).map((view) => {
        const painted = withViewDisplay(path, view)
        return Number.isFinite(Number(view.rank)) ? { ...painted, rank: Math.round(Number(view.rank)) } : painted
      }),
      incoming,
    )
    for (const view of listed) {
      if (view.builtin) persistViewDisplay(path, view.id, { rank: view.rank })
    }
    const stored = listed.filter((view) => !view.builtin)
    const previous = extra?.baseline ?? loadViews(path)
    // 只推差异：别的窗口（会话 / 右检查器）新建的视图不会被这份快照整份冲掉。
    // extra.upsert/remove 是调用方点名的条目，不依赖 baseline 里有没有这个 id。
    const patch = mergeSavedViewsPatch(diffSavedViews(previous, stored), {
      upsert: forced.map((view) => stampSavedView(view)),
      remove: extra?.remove,
    })
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
    adoptPersistedViews(path, adopted)
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
    setActiveViewId(id)
    if (nested) return
    try {
      localStorage.setItem(activeViewStorageKey(collectionPath), id)
    } catch {
      /* ignore */
    }
  }

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
    await pullSavedViews([collectionPath])
    const listed = rankListedViews(paintListedViews(collectionPath), viewsRef.current)
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
    persistActiveViewRef.current()
    if (view.id !== activeViewIdRef.current) {
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
      tree: true,
      wrap: false,
      truncate: true,
      query: '',
      rank: listed.length,
    }
    void persistViewsFor(target, [...listed.filter((item) => item.id !== view.id), view], {
      upsert: [view],
    }).then((ok) => {
      if (!ok) return
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
    void persistViews(views.map((item) => (item.id === dlg.view.id ? { ...item, name: next } : item))).then((ok) => {
      if (!ok) return
      setDlg(null)
    })
  }

  function applyDeleteView() {
    if (!dlg || dlg.kind !== 'delete') return
    if (dlg.view.builtin) {
      setDlg(null)
      return
    }
    const removedId = dlg.view.id
    // 删除要立刻发出去：这条可能刚建、本地列表里还没有，
    // 只靠 diffSavedViews 会漏掉它，删除就丢了。
    const remaining = views.filter((item) => item.id !== removedId)
    setDlg(null)
    void persistViewsWith(collectionPath, remaining, { remove: [removedId] }).then((ok) => {
      if (!ok) return
      if (activeViewId === removedId) {
        const next = viewsRef.current[0]
        if (next) selectView(next)
      }
    })
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
      const same = recordsFingerprint(prev) === recordsFingerprint(next)
      if (!same) itemsRef.current = next
      return same ? prev : next
    })
    setGroupBuckets((prev) => {
      const next = remapGroupedRecords(prev, map, groupByRef.current, schemaRef.current, facetCatalog)
      groupBucketsRef.current = next
      return next
    })
  }

  function dropListedRecords(ids: string[]) {
    const gone = new Set(ids.filter(Boolean).map(String))
    if (!gone.size) return
    for (const id of gone) confirmedCreates.current.delete(id)
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
        .filter((group) => group.rows.length > 0 || (group.total ?? 0) > 0),
    )
  }

  function announceListChange(keepCache = false) {
    tableHoldRef.current = null
    pendingPathQueryRef.current = null
    if (!keepCache) forgetListCache(dataPath)
    invalidateListReads()
    window.dispatchEvent(new Event('fsdb:change'))
  }

  useEffect(() => {
    const onMut = (event: Event) => {
      const detail = (event as CustomEvent<ListedMutation>).detail
      if (!detail || detail.path !== collectionPathRef.current) return
      if (detail.op === 'patch') {
        mapListedRecords((item) => (item.id === detail.row.id ? overlayListedRow(item, detail.row) : item))
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
      setItems((prev) => [row, ...prev.filter((item) => item.id !== row.id)])
      setTotal((count) => count + 1)
      setGroupBuckets((prev) => placeCreatedRow(prev, row, detail.groupBy || groupByRef.current))
    }
    window.addEventListener(LISTED_MUTATION_EVENT, onMut)
    return () => window.removeEventListener(LISTED_MUTATION_EVENT, onMut)
  }, [])

  async function executeAction(row: DbRecord, action: CollectionActionInfo) {
    if (actingRef.current) return
    actingRef.current = true
    setActing(true)
    try {
      await readJson('/api/db/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `${dataPath}/${row.id}`, action: action.id }),
      })
      if (action.id === 'start') {
        window.dispatchEvent(new CustomEvent('biu:enable-page-block-plugin', { detail: { plugin: String(row.id) } }))
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
        const path = `${dataPath}/${row.id}`
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
          announceListChange()
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
      const data = await readJson<{ value?: DbRecord }>('/api/db/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `${dataPath}/${row.id}`, content }),
      })
      const next = data.value
      if (next) {
        const merge = (item: DbRecord) => (item.id === next.id ? overlayListedRow(item, next) : item)
        mapListedRecords(merge)
        setDetailRow((prev) => (prev?.id === next.id ? overlayListedRow(prev, next) : prev))
        publishListedMutation({ path: dataPath, op: 'patch', row: next, groupBy })
        announceListChange(true)
        quietUntil.current = Date.now() + 800
        return
      }
      quietUntil.current = 0
      await reload({ force: true })
    } catch (err) {
      quietUntil.current = 0
      const denied =
        (err instanceof HttpError && err.status === 403) ||
        /\bpermission denied\b/i.test(String(err instanceof Error ? err.message : err))
      const contentOnly = Boolean(bodyKey && keys.length === 1 && keys[0] === bodyKey)
      if (denied && contentOnly) return
      setError(String(err))
    }
  }

  async function createRecord() {
    if (!canCreate) return
    try {
      const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: dataPath,
          records: [seedRecordFromViewFilters(catalogLocks, filterTree, schema)],
          scope: createScope,
        }),
      })
      const value = data.items?.[0]?.value
      const id = value?.id
      if (!id) {
        setError('没有写入')
        return
      }
      confirmedCreates.current.add(id)
      setItems((prev) => {
        const next = [value, ...prev.filter((item) => item.id !== id)]
        itemsRef.current = next
        return next
      })
      totalRef.current += 1
      setTotal(totalRef.current)
      setGroupBuckets((prev) => placeCreatedRow(prev, value, groupBy))
      publishListedMutation({
        path: dataPath,
        op: 'create',
        row: value,
        groupBy,
        viewId: activeViewIdRef.current,
        total: totalRef.current,
      })
      announceListChange()
      quietUntil.current = 0
      if (activeViewId) rememberInspectorWorkingView(collectionPath, activeViewId)
      window.setTimeout(() => showRecordInInspector(collectionPath, id, activeViewId), 0)
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
      if (!embed) onCloseRecord?.()
      dropListedRecords([String(row.id)])
      publishListedMutation({
        path: dataPath,
        op: 'remove',
        ids: [String(row.id)],
        viewId: activeViewIdRef.current,
        total: totalRef.current,
      })
      publishDeletedRowsToTrash(dataPath, [row], title)
      announceListChange()
      quietUntil.current = 0
      await reload({ force: true })
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeDeleteRecords(ids: string[]) {
    try {
      if (dataPath === '/trash') {
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
        await readJson('/api/db/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: dataPath, ids }),
        })
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
      if (dataPath !== '/trash') publishDeletedRowsToTrash(dataPath, deletedRows, title)
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
      const raw = String(row[key] ?? (localData ? '私人' : ''))
      const label = localData && raw === '空间' ? '私人' : raw
      return (
        <ShareScopeDetail
          collection={collectionPath}
          recordId={row.id}
          label={label}
          tableLabel={currentTable?.label}
          builtin={collectionPath === '/plugins' && row.builtin === true}
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
          builtin={collectionPath === '/plugins' && row.builtin === true}
          localOnly={localKnown ? localData : null}
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
        return (
          <TagChips>
            {parsed.tags.map((id) => (
              <TagChip key={id} id={id} label={tags.find((tag) => tag.id === id)?.label ?? id} icon={facetChipIcon(id)} />
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
            value={readFacetFlatValue(row, key, facetSourceKey(schema))}
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
    const paintSchema = tableHoldRef.current?.schema ?? schema
    const Actions = paintSchema === schema ? chrome?.Actions : undefined
    const Action = paintSchema === schema ? chrome?.Action : undefined
    const busy = acting
    const placed = placedActions(paintSchema, 'row').filter(
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
    const rowShown = visibleActions(paintSchema, row, 'row')
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
          onClick={() => setCollapsedGroups((prev) => {
            const next = { ...prev, [groupKey]: !prev[groupKey] }
            persistCollapsedGroups(collectionPath, activeViewId ?? routeViewId ?? '', groupBy, next)
            return next
          })}
        >
          <span className="sidebar-rail-icon sidebar-group-fold" aria-hidden>
            <span className="sidebar-group-fold-face">
              {groupBy === 'shareScope' ? (
                <UiGlyph
                  icon={label === '共享' ? 'globe' : label === '空间' ? 'users' : 'user'}
                  className={label === '共享' ? 'tasks-queue-gshare' : undefined}
                />
              ) : (
                <UiGlyph icon="stack" />
              )}
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
          <span className="tasks-th-ico">
            <FieldGlyph kind={col.kind} />
          </span>
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

  function paintTableCell(row: DbRecord, key: string, field: FieldSpec) {
    if (key === 'shareScope' || key === 'shareRole') {
      return renderCell(row, key, field, 'table')
    }
    const kind = resolveFieldType(field)
    if (
      kind === 'boolean' ||
      kind === 'action' ||
      kind === 'facet' ||
      kind === 'select' ||
      kind === 'multi-select' ||
      kind === 'person' ||
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

  function tableLiveRow(row: DbRecord, depth: number, hasKids: boolean, kidCount: number, rowKey: string, toolsArmed = true) {
    const cellPick = cellPickRef.current
    const colWindow = colWindowRef.current
    const held = tableHoldRef.current
    const paintSchema = held?.schema ?? schema
    const paintColumns = (
      held && held.nodes !== EMPTY_HOLD_NODES && held.columns.length ? held.columns : columns
    ) as typeof columns
    const paintLiveTd = (col: (typeof columns)[number]) => (
      <td
        key={col.key}
        data-col-key={col.key}
        {...cellPickOf(row, col.key, col.field)}
        className={[
          col.key === paintSchema?.labelField ? 'is-pin-col' : '',
          cellPick?.id === row.id && cellPick.key === col.key
            ? col.field && cellFieldWritable(col.field)
              ? 'is-cell-on'
              : 'is-cell-on is-cell-ro'
            : '',
        ].filter(Boolean).join(' ') || undefined}
      >
        {col.key === paintSchema?.labelField ? (
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
            pick={recordPick(row)}
            onOpenSplit={() => showRecordInInspector(collectionPath, row.id, activeViewId, nested ? { newTab: true } : undefined)}
            onOpenRow={() => openRow(row)}
            onWriteEmoji={(next) => void writePatch(row, { emoji: next })}
            toolsArmed={toolsArmed}
          />
        ) : col.key === 'actions' ? (
          <RecordActions row={row} />
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
        {paintColumns.slice(0, colWindow.pin).map(paintLiveTd)}
        {paintColPad(colWindow.padLeft, 'left')}
        {paintColumns.slice(colWindow.start, colWindow.end).map(paintLiveTd)}
        {paintColPad(colWindow.padRight, 'right')}
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
  }

  function persistActiveViewNow() {
    if (sheet || !hydrated || !activeViewId) return
    if (!routeViewReadyRef.current) return
    if (hydratePath.current !== `${collectionPath}\0${dataPath}`) return
    const current = viewsRef.current.find((view) => view.id === activeViewId)
    if (!current) return
    const liveTree = current.builtin || !countFilterRules(filterTree) ? undefined : filterTree
    const liveFilters = current.builtin ? current.filters : liveTree ? filters : {}
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
  }
  persistActiveViewRef.current = persistActiveViewNow

  viewsRef.current = views

  useEffect(() => {
    if (!schema || !collectionPath) {
      hydratePath.current = ''
      return
    }
    if (tableHoldRef.current || pendingPathQueryRef.current) return
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
    Number(viewsSaveError),
    extraRows.map((item) => item.id).join(','),
    Number(sortCustom),
    sortsStateKey(sorts),
    Number(filterActive),
    filterEditorStateKey(filterTree),
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
            const prev = viewBanner
            void readJson<{ value?: { banner?: unknown } }>('/api/db/update', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path, content: { banner: next } }),
            }).then((data) => {
              setViewBanner(data.value?.banner ?? next)
            }).catch(() => {
              setViewBanner(prev)
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
                <HeadlessDismiss
                  onDismiss={() => setViewMenuOpen(false)}
                  insideRef={viewRef}
                  ignoreSelector={`${HEADLESS_DISMISS_IGNORE}, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`}
                >
                <ViewOrderMenu
                  views={views}
                  activeViewId={activeViewId}
                  onSelect={selectView}
                  onCopy={copyView}
                  onRename={renameView}
                  onDelete={deleteView}
                  onReorder={persistViewOrder}
                  onAdd={() => addEmptyView()}
                />
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
                <SearchableFlyout className="tasks-sort-menu">
                  {(q) => {
                    const none = flyoutQueryMatch('不分组', q)
                    const hits = groupFields.filter((item) => flyoutQueryMatch(item.field.label ?? item.key, q))
                    return (
                      <>
                  {none ? (
                  <CheckRow
                    icon={<Bars3BottomLeftIcon aria-hidden className="size-[14px]" />}
                    label="不分组"
                    on={!groupBy}
                    onToggle={() => {
                      setGroupKey('')
                      setGroupOpen(false)
                    }}
                  />
                  ) : null}
                  {hits.map((item) => (
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
                    ))}
                  {!q.trim() && !groupFields.length ? (
                    <div className="tasks-viewdd-empty">没有可分组字段</div>
                  ) : null}
                  {q.trim() && !none && !hits.length ? <FlyoutEmpty /> : null}
                      </>
                    )
                  }}
                </SearchableFlyout>
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
                  ignoreSelector={`${HEADLESS_DISMISS_IGNORE}, [data-fsdb-col-flyout], [data-fsdb-col-facet-trigger], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`}
                  inside={(node) =>
                    node instanceof Element &&
                    Boolean(
                      node.closest(
                        '[data-fsdb-col-flyout], [data-fsdb-col-facet-trigger], .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]',
                      ),
                    )
                  }
                >
                <SearchableFlyout className="tasks-sort-menu fsdb-col-menu">
                  {(q) => (
                  <div className="fsdb-col-menu-list">
                  <Suspense fallback={null}>
                    <ColumnOrderMenu
                      columns={columns}
                      allColumns={allColumns}
                      labelField={schema?.labelField}
                      facetCatalog={facetCatalog}
                      query={q}
                      onToggle={toggleColumn}
                      onReorder={setVisibleColumns}
                    />
                  </Suspense>
                  </div>
                  )}
                </SearchableFlyout>
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
                  {tree ? (
                    <CheckRow
                      icon={<ChevronRightIcon aria-hidden className="size-[14px]" />}
                      label="树形展示"
                      on={showTree}
                      onToggle={() => setTree(!showTree)}
                    />
                  ) : null}
                  {q.trim() && !wrap && !trunc && !tree ? <FlyoutEmpty /> : null}
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

  const holdingRows = Boolean(tableHoldRef.current) && tableHoldRef.current?.nodes !== EMPTY_HOLD_NODES
  if (!holdingRows) {
    tablePaintRef.current = {
      colSpan: tablePaintRef.current.colSpan,
      error: tableHoldRef.current ? '' : error,
      renderNode: renderPaintNode,
    }
  }
  if (!tableHoldRef.current) {
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
    tablePaintSnapshotRef.current = {
      columns,
      columnWidths,
      columnPinCount,
      wrapCells,
      truncateCells,
      nodes: tablePaintNodes,
      resetKey: tableResetKey,
      checkLayoutExtra,
    }
  }
  const held = tableHoldRef.current

  return (
    <div
      ref={pageRef}
      className={`fsdb-page tasks-root${nested ? ' inspector-database-page' : ''}${sheet ? ' is-sheet' : ''}${!sheet && pageWidth === 'full' ? ' is-full-width' : ''}${collectionPath === '/plugins' ? ' is-plugins' : ''}`}
      data-testid={embed ? 'inspector-database' : sheet ? 'fsdb-collect-sheet' : undefined}
    >
      {!nested ? (
        <Suspense fallback={<DataSidebarShell tables={tables} collectionPath={collectionPath} title={title} />}>
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
                    {canBulkDelete && pickedIds.some((id) => !(collectionPath === '/plugins' && items.find((row) => row.id === id)?.builtin === true)) ? (
                      <button
                        type="button"
                        className="tasks-icon-btn is-danger"
                        data-testid="fsdb-bulk-delete"
                        aria-label={inTrash ? '彻底删除选中' : '删除选中'}
                        title={`${inTrash ? '彻底删除' : '删除'}选中的 ${pickedIds.length} 条`}
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
                          <div className="fsdb-tool-flyout fsdb-bulk-menu" role="menu">
                            {canFacet ? (
                              <button
                                type="button"
                                className="tasks-sort-item fsdb-tool-row"
                                data-testid="fsdb-bulk-facet"
                                onClick={() => {
                                  setBulkFacetIds([])
                                  setDlg({ kind: 'bulk-facet', ids: pickedIds })
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
                        </HeadlessDismiss>
                      ) : null}
                    </div>
                  </div>
                  </div>
                ) : null}
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
                  onVisibleRange={onVisibleRange}
                  frozen={Boolean(held)}
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
          chrome={chrome}
          draft={draft}
          detailBody={detailBody}
          detailBodyStatus={detailBodyStatus}
          detailBodyError={detailBodyError}
          onRetryBody={pullDetailBody}
          labelOf={labelOf}
          renderCell={renderCell}
          setDraft={setDraft}
          writeOne={writeOne}
          writePatch={writePatch}
          tableIcon={currentTable?.view?.icon}
          readOnly={
            (collectionPath === '/plugins' && selected.builtin === true && selected.canManagePackage !== true) ||
            (selected.shareRole === '阅读' && !localData && selected.canManagePackage !== true)
          }
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
          body={
            <p>
              {collectionPath === '/trash'
                ? `确定彻底删除选中的 ${dlg.ids.length} 条？不可恢复。`
                : `确定删除选中的 ${dlg.ids.length} 条记录？会放进回收站，可随时恢复。`}
            </p>
          }
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
          title={`标签 · ${dlg.ids.length} 条`}
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
                      icon={<TagIcon aria-hidden className="size-[14px]" />}
                      on={on}
                      onToggle={() =>
                        setBulkFacetIds((prev) => (on ? prev.filter((id) => id !== pack.id) : [...prev, pack.id]))
                      }
                    />
                  )
                })}
              </div>
            ) : (
              <p>还没有标签。先到标签库里建一个，再回来贴。</p>
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
