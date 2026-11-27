import { writeStorageString } from '@biu/biu-ui/client-storage'
import { onAppEvent, onAppEvents } from '@biu/biu-ui/app-events'
import { invalidateViewerIdentityCache, loadViewerIdentity } from './authz-api.ts'
import { apiFetch } from '@biu/biu-ui/api-client'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { lazy, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { SidebarFold } from '@biu/biu-ui/sidebar-fold'
import {
  ChevronDoubleLeftIcon,
  ChevronRightIcon,
  LockClosedIcon,
  PlusIcon,
  RectangleStackIcon,
  StarIcon,
  UserGroupIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { SidebarRow, SidebarRowMain } from '@biu/web-session-view/sidebar-row'
import { FSDB_CHANGE_EVENT, parseFsdbChange, type CollectionInfo, type CollectionSchema, type DbRecord } from '@biu/type-file-system'
import { BoundedMap } from './bounded-map.ts'
import { registerWorkspaceCache } from './workspace-client-store.ts'
import { groupField, groupRecords, parentFieldKey, treeChildren } from './fields.ts'
import type { DataScope } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH, TRASH_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH, normalizeCollectionPath } from '../paths.ts'
import { dataSidebarKind, isRecordTreeCollection, sortDataCollections } from './database-path.ts'
import { rememberInspectorWorkingView } from './inspector-db-route.ts'
import { readJson } from './db-client.ts'
import { paintCollectionViews } from './collection-nav.ts'
import { canDeleteSavedView, canRemoveCollectionView, normalizeSavedView, type SavedView } from './saved-view.ts'
import { useMemberDirectory } from './person-cell.tsx'
import {
  fetchViewPreview,
  getPreviewTotal,
  getPreviewTotalsVersion,
  nextPreviewLimit,
  previewCacheKey,
  whenListIdle,
  recordPreviewEmoji,
  recordPreviewLabel,
  rememberPreviewTotal,
  SIDEBAR_PREVIEW_MAX,
  subscribePreviewTotals,
  writeRecordEmoji,
} from './sidebar-preview.ts'
import {
  activeViewStorageKey,
  getStarredRecords,
  getStarredRecordsVersion,
  getStarredViews,
  getStarredViewsVersion,
  getViewOrderVersion,
  hasPulledSavedViews,
  isRecordStarred,
  isViewStarred,
  getCrumbsVersion,
  loadActiveViewId,
  loadRecords,
  loadViews,
  peekRecord,
  subscribeCrumbs,
  persistStarredRecords,
  persistStarredViews,
  pullSavedViews,
  subscribeViewOrder,
  subscribeViews,
  rememberRecords,
  starredRecordEmoji,
  starredRecordLabel,
  subscribeStarredRecords,
  subscribeStarredViews,
  toggleStarredRecord,
  toggleStarredView,
} from './view-storage.ts'
import { pickDomAttrs, recordPickKind, viewPickId } from './pick-dom.ts'
import { toggleExpandedViewKey } from './sidebar-nav.ts'
import { TableGlyph, ViewModeGlyph } from './nav-glyphs.tsx'
import { getDatabaseUi } from './database-ui.ts'
import { RecordMark, recordMarkStub } from './record-mark.tsx'
import { SidebarBrandLockup } from '@biu/public-mascot'
import { useSidebarCollapseStore } from '@biu/web-session-view'

const RecordEmojiBoard = lazy(() => import('@biu/biu-ui/emoji-board').then((m) => ({ default: m.RecordEmojiBoard })))

const DATA_SECTION_FAV = 'fsdb.section.fav'
const DATA_SECTION_USER = 'fsdb.section.user'
const DATA_SECTION_PUBLIC = 'fsdb.section.public'

function SectionHead({
  label,
  count,
  open,
  onToggle,
  title,
  testId,
}: {
  label: string
  count: number
  open?: boolean
  onToggle?: () => void
  title?: string
  testId?: string
}) {
  return (
    <div className="sidebar-section-head min-w-0">
      <div className="flex min-h-8 min-w-0 flex-1 items-center">
        {onToggle ? (
          <button
            type="button"
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
            aria-expanded={open}
            title={title}
            data-testid={testId}
            onClick={onToggle}
          >
            <span className="min-w-0 flex-1 truncate tracking-normal">{label}</span>
          </button>
        ) : (
          <span
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
            title={title}
          >
            <span className="min-w-0 flex-1 truncate tracking-normal">{label}</span>
          </span>
        )}
      </div>
      <ChatCount count={count} />
    </div>
  )
}

export function DataIconRail({
  tables,
  collectionPath,
  onOpenTable,
}: {
  tables: CollectionInfo[]
  collectionPath: string
  onOpenTable?: (path: string, viewId?: string) => void
}) {
  const visible = useMemo(() => {
    const shown = tables.filter((table) => table.view?.sidebar !== false)
    const { user, public: publicTables, system } = sortDataCollections(shown)
    return [...user, ...publicTables, ...system]
  }, [tables])
  return (
    <nav className="fsdb-icon-rail" aria-label="数据" data-testid="data-icon-rail">
      {visible.map((table) => {
        const name = table.view?.title ?? table.label
        const active = table.path === collectionPath
        return (
          <button
            key={table.path}
            type="button"
            className={`fsdb-icon-rail-btn${active ? ' is-active' : ''}`}
            title={name}
            aria-label={name}
            data-dock-tip={name}
            data-dock-tip-at="e"
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              const listed = paintCollectionViews(table.path, tables)
              onOpenTable?.(table.path, loadActiveViewId(table.path, listed) ?? listed[0]?.id)
            }}
          >
            <TableGlyph icon={table.view?.icon} />
          </button>
        )
      })}
    </nav>
  )
}

/** 高亮行的留白、计数和图标使用标题按钮的操作；独立按钮仍处理自己的点击。 */
function onSidebarRowClick(event: MouseEvent<HTMLElement>) {
  const hit = event.target
  if (event.defaultPrevented || !(hit instanceof Element) || !event.currentTarget.contains(hit)) return
  if (hit.closest('button, a, input, textarea, select, [contenteditable], [role="button"], [role="menuitem"]')) return
  event.currentTarget.querySelector<HTMLButtonElement>('button.min-w-0.flex-1')?.click()
}

function useCloudCreatorContext() {
  const [ctx, setCtx] = useState<{
    isCloud: boolean
    myAccountId: string
    myName: string
    myAvatar: string
    workspaceAvatar: string
    isExternal: boolean
  }>({
    isCloud: false,
    myAccountId: '',
    myName: '',
    myAvatar: '',
    workspaceAvatar: '',
    isExternal: false,
  })

  useEffect(() => {
    let cancelled = false
    const load = (fresh = false) => {
      void Promise.all([
        loadViewerIdentity({ fresh }),
        apiFetch('/api/account/active').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        apiFetch('/api/account/workspaces').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([viewer, active, listed]) => {
        if (cancelled) return
        const activeId = String((active as { workspaceId?: string } | null)?.workspaceId ?? '').trim()
        const workspaces = Array.isArray((listed as { workspaces?: unknown[] } | null)?.workspaces)
          ? ((listed as { workspaces: Array<{ id?: string; avatar?: string; location?: string; memberKind?: string }> }).workspaces)
          : []
        const current = workspaces.find((w) => w.id === activeId)
        const isCloud = viewer.hostOnline || current?.location === 'cloud'
        const isExternal = current?.memberKind === 'external' || current?.memberKind === 'guest'
        const workspaceAvatar = String(current?.avatar ?? '').trim()
        setCtx({
          isCloud,
          myAccountId: viewer.accountId,
          myName: viewer.name,
          myAvatar: viewer.avatar,
          workspaceAvatar,
          isExternal,
        })
      })
    }
    load(false)
    const offAccount = onAppEvents(['biu:account-token', 'biu:workspace-profile'], () => {
      invalidateViewerIdentityCache()
      load(true)
    })
    const offWorkspaceMeta = onAppEvent('biu:workspace-meta', (detail) => {
      if (detail?.avatar === undefined) return
      const nextAvatar = String(detail.avatar ?? '').trim()
      setCtx((prev) => (prev.workspaceAvatar === nextAvatar ? prev : { ...prev, workspaceAvatar: nextAvatar }))
    })
    return () => {
      cancelled = true
      offAccount()
      offWorkspaceMeta()
    }
  }, [])

  return ctx
}

type PreviewState = {
  items: DbRecord[]
  total: number
  schema?: CollectionSchema
  loading: boolean
  error: string
}

type PreviewCache = { items: DbRecord[]; total: number; schema?: CollectionSchema }

const previewCache = new BoundedMap<string, PreviewCache>(120)
registerWorkspaceCache('data-sidebar-preview', () => {
  previewCache.clear()
})

function crumbsToPreviewItems(path: string, viewId: string): DbRecord[] {
  return loadRecords(path, viewId).map((row) => ({
    id: row.id,
    title: row.label,
    emoji: row.emoji ?? '',
    ...(row.mascot != null ? { mascot: row.mascot } : {}),
  }))
}

function cachedDirectKidCount(path: string, recordId: string) {
  for (const [key, cache] of previewCache) {
    if (!key.startsWith(`${path}\0`)) continue
    const parentKey = parentFieldKey(cache.schema, cache.items) ?? 'parentId'
    return treeChildren(cache.items, parentKey, recordId).length
  }
  return 0
}

function ViewRecordPreview({
  path,
  view,
  open,
  recordKind,
  tableIcon,
  rootId,
  skipFetch,
  onOpenRecord,
}: {
  path: string
  view: SavedView
  open: boolean
  recordKind: string
  tableIcon?: string
  rootId?: string
  skipFetch?: boolean
  onOpenRecord?: (recordId: string, row?: DbRecord) => void
}) {
  const key = previewCacheKey(path, view)
  const cached = previewCache.get(key)
  const seedKey = skipFetch ? loadRecords(path, view.id).map((row) => row.id).join('\n') : ''
  const [state, setState] = useState<PreviewState>(() => {
    if (cached) {
      return { items: cached.items, total: cached.total, schema: cached.schema, loading: false, error: '' }
    }
    if (skipFetch) {
      const items = crumbsToPreviewItems(path, view.id)
      return {
        items,
        total: getPreviewTotal(key) ?? items.length,
        loading: false,
        error: '',
      }
    }
    return { items: [], total: 0, loading: true, error: '' }
  })
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [openKids, setOpenKids] = useState<Record<string, boolean>>({})
  const [pickerId, setPickerId] = useState<string | null>(null)
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null)
  const chromeIcon = getDatabaseUi()?.chrome(path).Icon
  const nested = isRecordTreeCollection(path)
  const totalsVersion = useSyncExternalStore(subscribePreviewTotals, getPreviewTotalsVersion, () => 0)
  const crumbsVersion = useSyncExternalStore(subscribeCrumbs, getCrumbsVersion, () => 0)
  const crumbTick = skipFetch ? crumbsVersion : 0
  useSyncExternalStore(subscribeStarredRecords, getStarredRecordsVersion, () => 0)
  const starredRecords = getStarredRecords()

  useEffect(() => {
    if (!open) return
    if (skipFetch) {
      const items = crumbsToPreviewItems(path, view.id)
      setState({
        items,
        total: getPreviewTotal(key) ?? items.length,
        schema: previewCache.get(key)?.schema,
        loading: false,
        error: '',
      })
      return
    }
    const hit = previewCache.get(key)
    if (hit) {
      setState({ items: hit.items, total: hit.total, schema: hit.schema, loading: false, error: '' })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    const stop = whenListIdle(() => {
      if (cancelled) return
      void fetchViewPreview(path, view, 0).then(
        (page) => {
          if (cancelled) return
          previewCache.set(key, { items: page.items, total: page.total, schema: page.schema })
          rememberPreviewTotal(key, page.total)
          setState({ items: page.items, total: page.total, schema: page.schema, loading: false, error: '' })
        },
        (err: unknown) => {
          if (cancelled) return
          setState((prev) => ({ ...prev, loading: false, error: String(err) }))
        },
      )
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [crumbTick, key, open, path, seedKey, skipFetch, totalsVersion, view.id, view.query, view.sortField, view.sortDir, view.filters, view.groupBy])

  async function loadMore() {
    const more = nextPreviewLimit(state.items.length, state.total)
    if (!more || state.loading) return
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const page = await fetchViewPreview(path, view, state.items.length, more)
      const items = [...state.items, ...page.items]
      const total = page.total
      const schema = page.schema ?? state.schema
      previewCache.set(key, { items, total, schema })
      rememberPreviewTotal(key, total)
      setState({ items, total, schema, loading: false, error: '' })
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: String(err) }))
    }
  }

  async function saveEmoji(row: DbRecord, next: string) {
    try {
      const emoji = await writeRecordEmoji(path, row.id, next)
      const items = state.items.map((item) => (item.id === row.id ? { ...item, emoji } : item))
      previewCache.set(key, { items, total: state.total, schema: state.schema })
      setState((prev) => ({ ...prev, items }))
      setPickerId(null)
      setPickerAnchor(null)
      window.dispatchEvent(new Event(FSDB_CHANGE_EVENT))
    } catch (err) {
      setState((prev) => ({ ...prev, error: String(err) }))
    }
  }

  const remaining = Math.max(0, state.total - state.items.length)
  const capped = state.items.length >= SIDEBAR_PREVIEW_MAX && remaining > 0
  const grouping = Boolean(groupField(state.schema, view.groupBy))
  const buckets = useMemo(() => {
    if (!grouping) return null
    return groupRecords(state.items, state.schema, view.groupBy).filter((bucket) => bucket.rows.length)
  }, [grouping, state.items, state.schema, view.groupBy])
  const parentKey = nested ? parentFieldKey(state.schema, state.items) ?? 'parentId' : null

  function toggleKid(id: string) {
    setOpenKids((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleRecordStar(row: DbRecord) {
    const label = recordPreviewLabel(row)
    const emoji = recordPreviewEmoji(row)
    rememberRecords(path, [{ id: row.id, label, emoji }])
    persistStarredRecords(toggleStarredRecord(getStarredRecords(), path, row.id, { label, emoji }))
  }

  async function createChild(row: DbRecord) {
    if (!parentKey) return
    try {
      const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, records: [{ [parentKey]: row.id }] }),
      })
      const created = data.items?.[0]?.value
      const items = created ? [...state.items, created] : state.items
      const total = state.total + (created ? 1 : 0)
      previewCache.set(key, { items, total, schema: state.schema })
      rememberPreviewTotal(key, total)
      setState((prev) => ({ ...prev, items, total }))
      setOpenKids((prev) => ({ ...prev, [row.id]: true }))
      window.dispatchEvent(new Event(FSDB_CHANGE_EVENT))
      if (created?.id) onOpenRecord?.(created.id, created)
    } catch (err) {
      setState((prev) => ({ ...prev, error: String(err) }))
    }
  }

  function recordFace(row: DbRecord) {
    const emoji = recordPreviewEmoji(row)
    return emoji ? <span className="fsdb-record-emoji">{emoji}</span> : <RecordMark record={row} tableIcon={tableIcon} Icon={chromeIcon} />
  }

  function emojiBoard(row: DbRecord) {
    if (pickerId !== row.id || !pickerAnchor) return null
    return (
      <Suspense fallback={null}>
        <RecordEmojiBoard
          anchor={pickerAnchor}
          onPick={(next) => void saveEmoji(row, next)}
          onClear={() => void saveEmoji(row, '')}
          onClose={() => {
            setPickerId(null)
            setPickerAnchor(null)
          }}
        />
      </Suspense>
    )
  }

  function openEmojiPicker(event: MouseEvent<HTMLElement>, row: DbRecord) {
    event.preventDefault()
    event.stopPropagation()
    const btn = event.currentTarget
    setPickerId((prev) => {
      if (prev === row.id) {
        setPickerAnchor(null)
        return null
      }
      setPickerAnchor(btn)
      return row.id
    })
  }

  function renderRecords(scope: DbRecord[], parentId = '', trail: ReadonlySet<string> = new Set()) {
    const rows = parentKey ? treeChildren(scope, parentKey, parentId) : parentId ? [] : scope
    return rows.map((row) => {
      if (trail.has(row.id)) return null
      const nextTrail = new Set(trail)
      nextTrail.add(row.id)
      const label = recordPreviewLabel(row)
      const kids = parentKey ? treeChildren(scope, parentKey, row.id) : []
      const kidCount = kids.length
      const expanded = Boolean(openKids[row.id])
      const starred = isRecordStarred(starredRecords, path, row.id)
      if (!nested) {
        return (
          <div
            key={row.id}
            className="chat-session-row"
            onClick={onSidebarRowClick}
            role="listitem"
            {...pickDomAttrs(recordKind, row.id, label)}
          >
            <SidebarRowMain>
              <span className="fsdb-record-icon relative grid size-6 shrink-0 place-items-center">
                <button
                  type="button"
                  className="grid size-6 place-items-center border-0 bg-transparent p-0 text-[16px] leading-none text-inherit"
                  title={recordPreviewEmoji(row) ? '更换图标' : '设置图标'}
                  aria-label={recordPreviewEmoji(row) ? `更换 ${label} 的图标` : `设置 ${label} 的图标`}
                  onClick={(event) => openEmojiPicker(event, row)}
                >
                  {recordFace(row)}
                </button>
                {emojiBoard(row)}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                title={label}
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenRecord?.(row.id, row)
                }}
              >
                {label}
              </button>
            </SidebarRowMain>
          </div>
        )
      }
      return (
        <div key={row.id} className="min-w-0" role="listitem">
          <SidebarRow
            pinned={starred}
            onClick={onSidebarRowClick}
            attrs={pickDomAttrs(recordKind, row.id, label)}
            main={
              <SidebarRowMain>
                <button
                  type="button"
                  className="relative grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                  title={expanded ? '收起子记录' : '展开子记录'}
                  aria-expanded={expanded}
                  onClick={() => toggleKid(row.id)}
                  onContextMenu={(event) => openEmojiPicker(event, row)}
                >
                  <span className="sidebar-rail-icon sidebar-group-fold">
                    <span className="sidebar-group-fold-face">{recordFace(row)}</span>
                    <span className="sidebar-group-fold-chevron">
                      <ChevronRightIcon className={`size-4 shrink-0 opacity-80 sidebar-chevron${expanded ? ' is-open' : ''}`} />
                    </span>
                  </span>
                  {emojiBoard(row)}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                  title={label}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenRecord?.(row.id, row)
                  }}
                >
                  {label}
                </button>
              </SidebarRowMain>
            }
            trail={
              <>
                <ChatCount count={kidCount} title={`${kidCount} 个子记录`} />
                <button
                  type="button"
                  className="sidebar-add"
                  title={`在 ${label} 下添加子记录`}
                  aria-label={`在 ${label} 下添加子记录`}
                  onClick={(event) => {
                    event.stopPropagation()
                    void createChild(row)
                  }}
                >
                  <PlusIcon className="size-4 shrink-0" />
                </button>
              </>
            }
            onStar={() => toggleRecordStar(row)}
            starOn={starred}
            starLabel={starred ? `取消收藏 ${label}` : `收藏 ${label}`}
            starIcon={<StarIcon className="size-4 shrink-0" />}
          />
          <SidebarFold open={expanded}>
            <div className="fsdb-record-kids">{renderRecords(scope, row.id, nextTrail)}</div>
          </SidebarFold>
        </div>
      )
    })
  }

  const treeRoot = rootId || ''
  const listed = treeRoot
    ? renderRecords(state.items, treeRoot)
    : buckets?.length
      ? null
      : renderRecords(state.items)

  return (
    <div className="fsdb-view-preview" role="list">
      {listed}
      {!treeRoot && buckets?.length ? (
        buckets.map((bucket, index) => {
          const groupKey = bucket.key || 'unset'
          const expanded = openGroups[groupKey] ?? index === 0
          return (
            <div key={groupKey} className="min-w-0" data-testid="sidebar-view-group">
              <div className="chat-session-row fsdb-view-preview-group" onClick={onSidebarRowClick}>
                <SidebarRowMain>
                  <button
                    type="button"
                    className="grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                    title={expanded ? '收起分组' : '展开分组'}
                    aria-expanded={expanded}
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [groupKey]: !expanded }))}
                  >
                    <span className="sidebar-rail-icon sidebar-group-fold">
                      <span className="sidebar-group-fold-face">
                        <RectangleStackIcon aria-hidden className="size-[14px] shrink-0" />
                      </span>
                      <span className="sidebar-group-fold-chevron">
                        <ChevronRightIcon className={`size-4 shrink-0 opacity-80 sidebar-chevron${expanded ? ' is-open' : ''}`} />
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                    title={bucket.label}
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [groupKey]: !expanded }))}
                  >
                    {bucket.label}
                  </button>
                </SidebarRowMain>
                <ChatCount count={bucket.rows.length} />
              </div>
              <SidebarFold open={expanded}>
                <div className="fsdb-view-preview-records">{renderRecords(bucket.rows)}</div>
              </SidebarFold>
            </div>
          )
        })
      ) : null}
      {state.loading && !state.items.length ? (
        <div className="fsdb-view-preview-hint">加载中…</div>
      ) : null}
      {state.error ? <div className="fsdb-view-preview-hint">{state.error}</div> : null}
      {!treeRoot && !state.loading && !state.error && !state.items.length ? (
        <div className="fsdb-view-preview-hint">没有数据</div>
      ) : null}
      {!treeRoot && remaining > 0 && !capped ? (
        <button type="button" className="fsdb-view-preview-more" disabled={state.loading} onClick={() => void loadMore()}>
          {state.loading ? '加载中…' : `还有 ${remaining} 条 · 加载更多`}
        </button>
      ) : null}
      {!treeRoot && capped ? <div className="fsdb-view-preview-hint">侧栏最多预览 {SIDEBAR_PREVIEW_MAX} 条，完整数据在主区</div> : null}
    </div>
  )
}

export const DataSidebar = memo(function DataSidebar({
  tables,
  collectionPath,
  title,
  views,
  activeViewId,
  onOpenTable,
  onApplyView,
  onDeleteView,
  onAddView,
  onOpenRecord,
  expandedViewKey: expandedViewKeyProp,
  onExpandedViewKeyChange,
  onCollapse,
  framed,
}: {
  tables: CollectionInfo[]
  collectionPath: string
  title: string
  views: SavedView[]
  activeViewId: string | null
  onOpenTable?: (path: string, viewId?: string) => void
  onApplyView: (view: SavedView) => void
  onDeleteView: (view: SavedView, path?: string) => void
  onAddView: (path?: string, scope?: DataScope) => void
  onOpenRecord?: (path: string, view: SavedView, recordId: string, row?: DbRecord) => void
  expandedViewKey?: string | null
  onExpandedViewKeyChange?: (key: string | null) => void
  onCollapse?: () => void
  framed?: boolean
}) {
  const listedTables = useMemo(() => {
    const visible = tables.filter((table) => table.view?.sidebar !== false)
    const raw = visible.length ? visible : ([{ path: collectionPath, label: title, view: { title } }] as CollectionInfo[])
    const { user, public: publicTables, system } = sortDataCollections(raw)
    return [...user, ...publicTables, ...system]
  }, [collectionPath, tables, title])
  const { user: userTables, system: systemTables, public: publicTables } = useMemo(() => sortDataCollections(listedTables), [listedTables])
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({})
  const toggleTableOpen = (tableStateKey: string) => {
    setOpenTables((prev) => ({ ...prev, [tableStateKey]: !prev[tableStateKey] }))
  }
  const [pendingPick, setPendingPick] = useState<{ path: string; viewId: string } | null>(null)
  useEffect(() => {
    if (!pendingPick) return
    if (pendingPick.path === collectionPath && pendingPick.viewId === activeViewId) setPendingPick(null)
  }, [activeViewId, collectionPath, pendingPick])
  const litPath = pendingPick?.path ?? collectionPath
  const litViewId = pendingPick?.viewId ?? activeViewId
  useSyncExternalStore(subscribeStarredViews, getStarredViewsVersion, () => 0)
  useSyncExternalStore(subscribeStarredRecords, getStarredRecordsVersion, () => 0)
  const viewOrderVersion = useSyncExternalStore(subscribeViewOrder, getViewOrderVersion, () => 0)
  const starredViews = getStarredViews()
  const starredRecords = getStarredRecords()
  const collapsedSections = useSidebarCollapseStore((state) => state.collapsed)
  const toggleSection = useSidebarCollapseStore((state) => state.toggle)
  const favOpen = collapsedSections[DATA_SECTION_FAV] !== true
  const userOpen = collapsedSections[DATA_SECTION_USER] !== true
  const publicOpen = collapsedSections[DATA_SECTION_PUBLIC] !== true
  const [expandedViewKeyLocal, setExpandedViewKeyLocal] = useState<string | null>(null)
  const expandedViewKey = expandedViewKeyProp !== undefined ? expandedViewKeyProp : expandedViewKeyLocal
  const setExpandedViewKey = onExpandedViewKeyChange ?? setExpandedViewKeyLocal
  const [viewsTick, setViewsTick] = useState(0)
  const tablePathsKey = listedTables.map((table) => table.path).join('\0')
  const starredPathsKey = starredViews.map((item) => `${item.path}\0${item.viewId}`).join('\n')
  useEffect(() => {
    const paths = tablePathsKey.split('\0').filter(Boolean)
    const starredPaths = [...new Set(starredViews.map((item) => item.path).filter(Boolean))]
    let live = true
    const bump = () => {
      if (live) setViewsTick((n) => n + 1)
    }
    if (starredPaths.length) {
      void pullSavedViews(starredPaths, { force: true }).then(bump, bump)
    }
    if (paths.length) {
      void pullSavedViews(paths, { idle: true }).then((changed) => {
        if (live && changed) bump()
      }, bump)
    }
    return () => {
      live = false
    }
  }, [starredPathsKey, tablePathsKey])
  useEffect(() => subscribeViews(() => setViewsTick((n) => n + 1)), [])
  useEffect(() => {
    const onChange = (event: Event) => {
      const change = parseFsdbChange(event)
      if (change.scope === 'tags') return
      if (change.scope === 'views') {
        const changedPath = 'path' in change ? (change.path ?? '') : ''
        if (changedPath) {
          void pullSavedViews([changedPath], { force: true }).then(
            () => setViewsTick((n) => n + 1),
            () => setViewsTick((n) => n + 1),
          )
        } else {
          setViewsTick((n) => n + 1)
        }
        return
      }
      const changedPath = 'path' in change ? (change.path ?? '') : ''
      if (!changedPath) {
        previewCache.clear()
      } else {
        for (const key of [...previewCache.keys()]) {
          const tablePath = key.split('\0')[0] ?? ''
          if (
            !tablePath ||
            changedPath === tablePath ||
            changedPath.startsWith(`${tablePath}/`) ||
            (tablePath === DATA_COLLECTION_PATH && !changedPath.startsWith(TRASH_COLLECTION_PATH))
          ) {
            previewCache.delete(key)
          }
        }
      }
    }
    window.addEventListener(FSDB_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(FSDB_CHANGE_EVENT, onChange)
  }, [])

  const viewsByPath = useMemo(() => {
    void viewsTick
    void viewOrderVersion
    const map = new Map<string, SavedView[]>()
    for (const table of listedTables) {
      const path = table.path
      const stored = loadViews(path)
      const user = stored.length ? stored : path === collectionPath ? views : stored
      map.set(path, paintCollectionViews(path, tables, user))
    }
    return map
  }, [collectionPath, listedTables, tables, viewOrderVersion, views, viewsTick])

  function viewsFor(path: string) {
    const hit = viewsByPath.get(path)
    if (hit) return hit
    const stored = loadViews(path)
    const user = stored.length ? stored : path === collectionPath ? views : stored
    return paintCollectionViews(path, tables, user)
  }

  const viewsForRef = useRef(viewsFor)
  viewsForRef.current = viewsFor

  const starredRows = starredViews.flatMap((item) => {
    const table = listedTables.find((row) => row.path === item.path)
    if (!table) return []
    const listedView = viewsFor(item.path).find((row) => row.id === item.viewId)
    const storedName = String(item.name ?? '').trim()
    if (!listedView && (hasPulledSavedViews(item.path) || !storedName)) return []
    const view = listedView ?? normalizeSavedView({
      id: item.viewId,
      name: storedName,
      mode: 'table',
      sortField: 'title',
      sortDir: 'asc',
      filters: {},
      columns: [],
    })
    return [{ table, view }]
  })
  useEffect(() => {
    const current = getStarredViews()
    if (!current.length) return
    const next = current.filter((item) => {
      if (!hasPulledSavedViews(item.path)) return true
      if (!listedTables.some((row) => row.path === item.path)) return true
      return viewsFor(item.path).some((row) => row.id === item.viewId)
    })
    if (next.length !== current.length) persistStarredViews(next)
  }, [listedTables, starredPathsKey, views, viewsTick])
  const starredRecordRows = starredRecords.flatMap((item) => {
    const table = listedTables.find((row) => row.path === item.path)
    if (!table) return []
    return [{ table, item }]
  })
  const favCount = starredRows.length + starredRecordRows.length

  useEffect(() => {
    let cancelled = false
    const stop = whenListIdle(() => {
      if (cancelled) return
      void Promise.all(
        starredRecords.map(async (item) => {
          if (item.label || peekRecord(item.path, item.recordId)?.label) {
            if (item.label) rememberRecords(item.path, [{ id: item.recordId, label: item.label, emoji: item.emoji }])
            return
          }
          try {
            const data = await readJson<{ value?: DbRecord }>(`/api/db/read?path=${encodeURIComponent(`${item.path}/${item.recordId}`)}`)
            const row = data.value
            if (cancelled || !row?.id) return
            const label = recordPreviewLabel(row)
            const emoji = recordPreviewEmoji(row)
            rememberRecords(item.path, [{ id: row.id, label, emoji, mascot: row.mascot }])
            persistStarredRecords(
              getStarredRecords().map((entry) =>
                entry.path === item.path && entry.recordId === item.recordId ? { ...entry, label, emoji } : entry,
              ),
            )
          } catch {
            /* ignore */
          }
        }),
      )
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [starredRecords])

  const { isCloud: isCloudSpace, myAccountId } = useCloudCreatorContext()
  const membersById = useMemberDirectory(isCloudSpace)

  const renderViewStatusIcons = (view: SavedView, tablePath: string) => {
    if (!isCloudSpace && !view.locked) return null
    const scope = view.shareScope ?? 'workspace'
    const isMembersCol = normalizeCollectionPath(tablePath) === WORKSPACE_MEMBERS_COLLECTION_PATH
    const creatorId = view.createdBy?.trim()
    const sharedByOther = Boolean(scope === 'shared' && creatorId && myAccountId && creatorId !== myAccountId)
    const creatorName = sharedByOther ? (membersById.get(creatorId!)?.name || creatorId!.slice(0, 8)) : ''
    const baseTip =
      scope === 'personal'
        ? '私人视图 · 仅自己可见'
        : scope === 'shared'
          ? sharedByOther
            ? `共享视图 · 由 ${creatorName} 共享`
            : '共享视图 · 指定成员可见'
          : '空间视图 · 全员可见'
    const lockTip = view.locked
      ? isMembersCol
        ? ' · 动态成员组（管理员锁定）'
        : ' · 已锁定配置'
      : ''
    const fullTip = `${baseTip}${lockTip}`
    const ScopeIcon = scope === 'personal' ? UserIcon : scope === 'shared' ? UsersIcon : UserGroupIcon
    return (
      <span
        className="sidebar-view-status inline-flex shrink-0 items-center text-(--biu-color-text-muted)"
        data-testid="sidebar-view-status"
        data-scope={scope}
        data-locked={view.locked ? '1' : '0'}
        title={fullTip}
        aria-label={fullTip}
      >
        {view.locked ? (
          <span className="inline-grid size-6 shrink-0 place-items-center" aria-hidden>
            <LockClosedIcon aria-hidden className="size-4 shrink-0" />
          </span>
        ) : null}
        {isCloudSpace ? (
          <span className="inline-grid size-6 shrink-0 place-items-center" aria-hidden>
            <ScopeIcon aria-hidden className="size-4 shrink-0" />
          </span>
        ) : null}
      </span>
    )
  }

  const starredTreePreviewKey = starredRecordRows
    .filter(({ table }) => isRecordTreeCollection(table.path))
    .map(({ table }) => table.path)
    .sort()
    .join('|')

  useEffect(() => {
    if (!favOpen || !starredTreePreviewKey) return
    let cancelled = false
    const paths = starredTreePreviewKey.split('|')
    const stop = whenListIdle(() => {
      if (cancelled) return
      void Promise.all(
        paths.map((path) => {
          const listed = viewsForRef.current(path)
          const view = listed.find((row) => row.id === 'all') ?? listed[0]
          if (!view) return Promise.resolve()
          const key = previewCacheKey(path, view)
          if (previewCache.get(key)?.items.length) return Promise.resolve()
          return fetchViewPreview(path, view, 0).then(
            (page) => {
              if (cancelled) return
              previewCache.set(key, { items: page.items, total: page.total, schema: page.schema })
              rememberPreviewTotal(key, page.total)
            },
            () => undefined,
          )
        }),
      )
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [favOpen, starredTreePreviewKey])

  function toggleStar(path: string, viewId: string) {
    const view = viewsFor(path).find((item) => item.id === viewId)
    persistStarredViews(toggleStarredView(getStarredViews(), path, viewId, view?.name))
  }

  function openView(path: string, viewId: string) {
    setPendingPick({ path, viewId })
    try {
      writeStorageString(activeViewStorageKey(path), viewId)
    } catch {
      /* ignore */
    }
    rememberInspectorWorkingView(path, viewId)
    if (path === collectionPath) {
      const view =
        loadViews(path).find((item) => item.id === viewId) ??
        viewsFor(path).find((item) => item.id === viewId)
      if (view) onApplyView(view)
    }
    onOpenTable?.(path, viewId)
  }

  function toggleViewPreview(key: string) {
    const next = toggleExpandedViewKey(expandedViewKey, key)
    if (onExpandedViewKeyChange) onExpandedViewKeyChange(next)
    else setExpandedViewKeyLocal(next)
  }

  function openRecord(path: string, view: SavedView, recordId: string, row?: DbRecord) {
    onOpenRecord?.(path, view, recordId, row)
  }

  function revealTable(_tableStateKey: string, path: string, viewId?: string) {
    onOpenTable?.(path, viewId)
  }

  function viewRowDelete(path: string, view: SavedView, listed: SavedView[]) {
    if (view.ephemeral || !canDeleteSavedView(view) || !canRemoveCollectionView(listed, view)) return undefined
    return () => onDeleteView(view, path)
  }

  function renderTableRows(rows: CollectionInfo[], group: 'user' | 'system' | 'public' = 'system') {
    return rows.map((table) => {
      const name = table.view?.title ?? table.label
      const tableStateKey = `${group}:${table.path}`
      const open = openTables[tableStateKey] ?? false
      const listed = viewsFor(table.path)
      return (
        <div key={`${group}:${table.path}`} className="flex min-w-0 flex-col gap-px" data-collection-kind={group}>
          <div className="sidebar-group-head" onClick={onSidebarRowClick}>
            <div
              className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-[14px] font-medium tracking-normal text-inherit"
              title={name}
              aria-expanded={open}
              {...pickDomAttrs('collection', table.path, name, { path: table.path })}
            >
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                title={open ? `收起 ${name}` : `展开 ${name}`}
                aria-label={open ? `收起 ${name}` : `展开 ${name}`}
                aria-expanded={open}
                data-testid={`sidebar-toggle-table-${table.path}`}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleTableOpen(tableStateKey)
                }}
              >
                <span className="sidebar-rail-icon sidebar-group-fold">
                  <span className="sidebar-group-fold-face">
                    <TableGlyph icon={table.view?.icon} />
                  </span>
                  <span className="sidebar-group-fold-chevron">
                    <ChevronRightIcon className={`size-4 shrink-0 opacity-80 sidebar-chevron${open ? ' is-open' : ''}`} />
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit outline-none hover:text-(--biu-color-text) focus-visible:ring-1 focus-visible:ring-(--biu-color-border)"
                onClick={() =>
                  revealTable(
                    tableStateKey,
                    table.path,
                    loadActiveViewId(table.path, listed) ?? listed[0]?.id,
                  )
                }
              >
                {name}
              </button>
            </div>
            <ChatCount count={listed.length} />
            <button
              type="button"
              className="sidebar-add"
              title={`在 ${name} 下添加视图`}
              aria-label={`在 ${name} 下添加视图`}
              data-testid={`sidebar-add-view-${table.path}`}
              onClick={(event) => {
                event.stopPropagation()
                setOpenTables((prev) => ({ ...prev, [tableStateKey]: true }))
                onAddView(table.path)
              }}
            >
              <PlusIcon className="size-4 shrink-0" />
            </button>
          </div>
          <SidebarFold open={open} className="sidebar-session-list min-w-0">
            {listed.map((view) => {
              const starred = isViewStarred(starredViews, table.path, view.id)
              const active = table.path === litPath && view.id === litViewId
              return (
                <div key={view.id} className="min-w-0">
                  <SidebarRow
                    active={active}
                    pinned={starred}
                    onClick={onSidebarRowClick}
                    attrs={pickDomAttrs('view', viewPickId(table.path, view.id), view.name, { path: table.path })}
                    main={
                      <SidebarRowMain>
                        <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                          <ViewModeGlyph mode={view.mode} />
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                          onClick={() => openView(table.path, view.id)}
                        >
                          {view.name}
                        </button>
                      </SidebarRowMain>
                    }
                    trail={renderViewStatusIcons(view, table.path)}
                    onDelete={viewRowDelete(table.path, view, listed)}
                    deleteLabel={`删除 ${view.name}`}
                    deleteIcon={<TrashGlyph className="size-4 shrink-0" />}
                    onStar={() => toggleStar(table.path, view.id)}
                    starOn={starred}
                    starLabel={starred ? `取消收藏 ${view.name}` : `收藏 ${view.name}`}
                    starIcon={<StarIcon className="size-4 shrink-0" />}
                  />
                </div>
              )
            })}
          </SidebarFold>
        </div>
      )
    })
  }

  const body = (
      <div className="fsdb-views-full min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        <div className="mt-2 space-y-1.5">
          {favCount ? (
            <section className="min-w-0">
              <SectionHead label="收藏" count={favCount} open={favOpen} onToggle={() => toggleSection(DATA_SECTION_FAV)} />
              <SidebarFold open={favOpen}>
                <div className="min-w-0 pt-0.5">
                  {starredRecordRows.map(({ table, item }) => {
                    const tableName = table.view?.title ?? table.label
                    const label = starredRecordLabel(item)
                    const emoji = starredRecordEmoji(item)
                    const chromeIcon = getDatabaseUi()?.chrome(table.path).Icon
                    const view = viewsFor(table.path).find((row) => row.id === 'all') ?? viewsFor(table.path)[0]
                    const nested = isRecordTreeCollection(table.path)
                    const previewKey = `star-record:${table.path}:${item.recordId}`
                    const expanded = expandedViewKey === previewKey
                    const kidCount = nested ? cachedDirectKidCount(table.path, item.recordId) : 0
                    const face = (
                      <RecordMark
                        record={recordMarkStub({ id: item.recordId, emoji, mascot: peekRecord(table.path, item.recordId)?.mascot })}
                        tableIcon={table.view?.icon}
                        Icon={chromeIcon}
                      />
                    )
                    return (
                      <div key={previewKey} className="min-w-0">
                        <SidebarRow
                          pinned
                          onClick={onSidebarRowClick}
                          attrs={pickDomAttrs(recordPickKind(table.view?.moduleId || table.id), item.recordId, label)}
                          main={
                            <SidebarRowMain>
                              {nested ? (
                                <button
                                  type="button"
                                  className="relative grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-inherit"
                                  title={expanded ? '收起子记录' : '展开子记录'}
                                  aria-expanded={expanded}
                                  onClick={() => toggleViewPreview(previewKey)}
                                >
                                  <span className="sidebar-rail-icon sidebar-group-fold">
                                    <span className="sidebar-group-fold-face">{face}</span>
                                    <span className="sidebar-group-fold-chevron">
                                      <ChevronRightIcon className={`size-4 shrink-0 opacity-80 sidebar-chevron${expanded ? ' is-open' : ''}`} />
                                    </span>
                                  </span>
                                </button>
                              ) : (
                                <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                                  {face}
                                </span>
                              )}
                              <button
                                type="button"
                                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                                title={label}
                                onClick={() => {
                                  if (!view) return
                                  openRecord(table.path, view, item.recordId, {
                                    id: item.recordId,
                                    title: label,
                                    emoji,
                                  })
                                }}
                              >
                                {label}
                              </button>
                            </SidebarRowMain>
                          }
                          trail={
                            <>
                              {nested ? <ChatCount count={kidCount} title={`${kidCount} 个子记录`} /> : null}
                              <span className="sidebar-trail-icon" title={tableName} aria-label={tableName}>
                                <TableGlyph icon={table.view?.icon} />
                              </span>
                              {nested ? (
                                <button
                                  type="button"
                                  className="sidebar-add"
                                  title={`在 ${label} 下添加子记录`}
                                  aria-label={`在 ${label} 下添加子记录`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void (async () => {
                                      try {
                                        const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
                                          method: 'POST',
                                          headers: { 'content-type': 'application/json' },
                                          body: JSON.stringify({ path: table.path, records: [{ parentId: item.recordId }] }),
                                        })
                                        for (const key of [...previewCache.keys()]) {
                                          if (key.startsWith(`${table.path}\0`)) previewCache.delete(key)
                                        }
                                        window.dispatchEvent(new Event(FSDB_CHANGE_EVENT))
                                        if (expandedViewKey !== previewKey) toggleViewPreview(previewKey)
                                        const created = data.items?.[0]?.value
                                        if (created?.id && view) openRecord(table.path, view, created.id, created)
                                      } catch {
                                        /* ignore */
                                      }
                                    })()
                                  }}
                                >
                                  <PlusIcon className="size-4 shrink-0" />
                                </button>
                              ) : null}
                            </>
                          }
                          onStar={() => persistStarredRecords(toggleStarredRecord(getStarredRecords(), table.path, item.recordId))}
                          starOn
                          starLabel={`取消收藏 ${label}`}
                          starIcon={<StarIcon className="size-4 shrink-0" />}
                        />
                        {nested && view ? (
                          <SidebarFold open={expanded}>
                            <ViewRecordPreview
                              path={table.path}
                              view={view}
                              open={expanded}
                              rootId={item.recordId}
                              recordKind={recordPickKind(table.view?.moduleId || table.id)}
                              tableIcon={table.view?.icon}
                              onOpenRecord={(id, row) => openRecord(table.path, view, id, row)}
                            />
                          </SidebarFold>
                        ) : null}
                      </div>
                    )
                  })}
                  {starredRows.map(({ table, view }) => {
                    const tableName = table.view?.title ?? table.label
                    const active = table.path === litPath && view.id === litViewId
                    const previewKey = `star:${table.path}:${view.id}`
                    return (
                      <div key={previewKey} className="min-w-0">
                        <SidebarRow
                          active={active}
                          pinned
                          onClick={onSidebarRowClick}
                          attrs={pickDomAttrs('view', viewPickId(table.path, view.id), view.name, { path: table.path })}
                          main={
                            <SidebarRowMain>
                              <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                                <ViewModeGlyph mode={view.mode} />
                              </span>
                              <button
                                type="button"
                                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                                onClick={() => openView(table.path, view.id)}
                              >
                                {view.name}
                              </button>
                            </SidebarRowMain>
                          }
                          trail={
                            <>
                              {renderViewStatusIcons(view, table.path)}
                              <span className="sidebar-trail-icon" title={tableName} aria-label={tableName}>
                                <TableGlyph icon={table.view?.icon} />
                              </span>
                            </>
                          }
                          onDelete={viewRowDelete(table.path, view, viewsFor(table.path))}
                          deleteLabel={`删除 ${view.name}`}
                          deleteIcon={<TrashGlyph className="size-4 shrink-0" />}
                          onStar={() => toggleStar(table.path, view.id)}
                          starOn
                          starLabel={`取消收藏 ${view.name}`}
                          starIcon={<StarIcon className="size-4 shrink-0" />}
                        />
                      </div>
                    )
                  })}
                </div>
              </SidebarFold>
            </section>
          ) : null}

          <section className="min-w-0">
            <SectionHead
              label="核心数据"
              count={userTables.length}
              open={userOpen}
              title="展开或收起核心数据"
              testId="sidebar-user-home"
              onToggle={() => toggleSection(DATA_SECTION_USER)}
            />
            <SidebarFold open={userOpen}>
              <div className="flex min-w-0 flex-col gap-px" data-testid="sidebar-user-collections">
                {userTables.length ? renderTableRows(userTables, 'user') : (
                  <div className="px-1 py-1 text-[12px] text-(--biu-color-text-subtle)">还没有核心数据表</div>
                )}
              </div>
            </SidebarFold>
          </section>

          <section className="min-w-0">
            <SectionHead
              label="公共数据"
              count={publicTables.length}
              open={publicOpen}
              title="展开或收起公共数据"
              testId="sidebar-public-home"
              onToggle={() => toggleSection(DATA_SECTION_PUBLIC)}
            />
            <SidebarFold open={publicOpen}>
              <div className="flex min-w-0 flex-col gap-px" data-testid="sidebar-public-collections">
                {publicTables.length ? renderTableRows(publicTables, 'public') : (
                  <div className="px-1 py-1 text-[12px] text-(--biu-color-text-subtle)">还没有公共数据</div>
                )}
              </div>
            </SidebarFold>
          </section>

          <section className="min-w-0">
            <SectionHead label="系统数据" count={systemTables.length} title="系统运行时记下的数据" />
            <div className="flex min-w-0 flex-col gap-px" data-testid="sidebar-system-collections">
              {renderTableRows(systemTables)}
            </div>
          </section>
        </div>
      </div>
  )

  const rail = <DataIconRail tables={listedTables} collectionPath={collectionPath} onOpenTable={onOpenTable} />
  if (framed) {
    return (
      <div className="fsdb-views flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label="数据">
        {body}
        {rail}
      </div>
    )
  }

  return (
    <aside
      className="app-side-bar fsdb-views flex min-h-0 flex-col overflow-hidden border-r border-(--biu-color-border) bg-(--biu-color-bg-subtle)"
      aria-label="数据"
    >
      <div className="app-side-bar-head app-side-bar-head-brand" data-biu-ignore>
        <SidebarBrandLockup />
        <button
          type="button"
          className="chat-view-header-expand"
          title="收起左侧边栏"
          aria-label="收起左侧边栏"
          data-testid="sidebar-collapse"
          onClick={onCollapse}
        >
          <ChevronDoubleLeftIcon aria-hidden className="size-4" />
        </button>
      </div>
      {body}
      {rail}
    </aside>
  )
})
