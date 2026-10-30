import { builtinAllViewId, stubBuiltinAllView, stubBuiltinBlockKindView, stubBuiltinCatalogView, stubBuiltinTagView, stubBuiltinScopeView, stubBuiltinMemberView, isReadOnlyViewId, isBuiltinAllViewForCollection, isBuiltinAllViewId } from '../catalog-views.ts'
import { isIndexCollection } from './database-path.ts'
import { invalidateListReads, listCollection, readJson } from './db-client.ts'
import { savedViewRecordPath } from '../paths.ts'
import { looksLikeFilterTree, normalizeFilterGroup, parseSortsInput } from '../query-logic.ts'
import { normalizePageSize, normalizeSavedView, parseViewColumns, rankListedViews, type SavedView } from './saved-view.ts'

export function viewsKey(collectionPath: string) {
  return `fsdb.views:${collectionPath}`
}

export function activeViewStorageKey(collectionPath: string) {
  return `fsdb.activeView:${collectionPath}`
}

const memoryViews = new Map<string, SavedView[]>()

export function rememberViews(collectionPath: string, views: SavedView[]) {
  memoryViews.set(collectionPath, views.map((view) => normalizeSavedView(view)))
}

export function loadViews(collectionPath: string): SavedView[] {
  const remembered = memoryViews.get(collectionPath)
  if (remembered) return remembered
  try {
    const raw = localStorage.getItem(viewsKey(collectionPath))
    const parsed = raw ? (JSON.parse(raw) as SavedView[]) : []
    if (parsed.length) return parsed.map((view) => normalizeSavedView(view))
  } catch {
    /* ignore */
  }
  return []
}

export type CrumbRecord = { id: string; label: string; emoji?: string; mascot?: unknown }

const memoryRecords = new Map<string, CrumbRecord[]>()
const memoryRecordMeta = new Map<string, CrumbRecord>()

function recordsKey(collectionPath: string, viewId?: string) {
  return `${collectionPath}\0${viewId ?? ''}`
}

function recordMetaKey(collectionPath: string, recordId: string) {
  return `${collectionPath}\0id:${recordId}`
}

function keepCrumbLabel(row: CrumbRecord, prev?: CrumbRecord) {
  const next = String(row.label ?? '').trim()
  const last = String(prev?.label ?? '').trim()
  if (next && next !== row.id) return next
  if (last && last !== row.id) return last
  return next || last || row.id
}

let crumbsVersion = 0
const crumbListeners = new Set<() => void>()

function emitCrumbs() {
  crumbsVersion += 1
  for (const fn of crumbListeners) fn()
}

export function getCrumbsVersion() {
  return crumbsVersion
}

export function subscribeCrumbs(fn: () => void) {
  crumbListeners.add(fn)
  return () => {
    crumbListeners.delete(fn)
  }
}

export function rememberRecords(collectionPath: string, rows: CrumbRecord[], viewId?: string) {
  const painted = rows.map((row) => {
    const last = memoryRecordMeta.get(recordMetaKey(collectionPath, row.id))
    const next = {
      ...last,
      ...row,
      label: keepCrumbLabel(row, last),
      emoji: row.emoji || last?.emoji,
      mascot: row.mascot ?? last?.mascot,
    }
    memoryRecordMeta.set(recordMetaKey(collectionPath, row.id), next)
    return next
  })
  memoryRecords.set(recordsKey(collectionPath, viewId), painted)
  emitCrumbs()
}

export function applyListedCrumbMutation(
  path: string,
  mutation:
    | { op: 'patch'; row: CrumbRecord }
    | { op: 'create'; row: CrumbRecord; viewId?: string | null }
    | { op: 'remove'; ids: string[] },
) {
  if (mutation.op === 'patch') {
    const last = memoryRecordMeta.get(recordMetaKey(path, mutation.row.id))
    const next = {
      ...last,
      ...mutation.row,
      label: keepCrumbLabel(mutation.row, last),
      emoji: mutation.row.emoji || last?.emoji,
      mascot: mutation.row.mascot ?? last?.mascot,
    }
    memoryRecordMeta.set(recordMetaKey(path, mutation.row.id), next)
    for (const [key, rows] of memoryRecords) {
      if (!key.startsWith(`${path}\0`)) continue
      const at = rows.findIndex((row) => row.id === next.id)
      if (at < 0) continue
      const copy = rows.slice()
      copy[at] = { ...copy[at], ...next }
      memoryRecords.set(key, copy)
    }
    emitCrumbs()
    return
  }
  if (mutation.op === 'remove') {
    const gone = new Set(mutation.ids.map(String))
    let changed = false
    for (const [key, rows] of memoryRecords) {
      if (!key.startsWith(`${path}\0`)) continue
      const next = rows.filter((row) => !gone.has(row.id))
      if (next.length === rows.length) continue
      memoryRecords.set(key, next)
      changed = true
    }
    for (const id of gone) {
      if (memoryRecordMeta.delete(recordMetaKey(path, id))) changed = true
    }
    if (changed) emitCrumbs()
    return
  }
  const crumb = mutation.row
  memoryRecordMeta.set(recordMetaKey(path, crumb.id), crumb)
  const key = recordsKey(path, mutation.viewId ?? undefined)
  const prev = memoryRecords.get(key) ?? []
  memoryRecords.set(key, [crumb, ...prev.filter((row) => row.id !== crumb.id)])
  emitCrumbs()
}

export function loadRecords(collectionPath: string, viewId?: string): CrumbRecord[] {
  return memoryRecords.get(recordsKey(collectionPath, viewId)) ?? []
}

export function peekRecord(collectionPath: string, recordId: string): CrumbRecord | undefined {
  return memoryRecordMeta.get(recordMetaKey(collectionPath, recordId))
}

export function loadActiveViewId(collectionPath: string, listed: SavedView[]) {
  try {
    const id = localStorage.getItem(activeViewStorageKey(collectionPath))
    if (id && listed.some((view) => view.id === id)) return id
  } catch {
    /* ignore */
  }
  return listed[0]?.id ?? null
}

export function viewForPath(collectionPath: string, routeViewId?: string): SavedView | null {
  const listed = loadViews(collectionPath)
  const fallback = stubBuiltinAllView(builtinAllViewId(collectionPath))
  const preferred =
    (routeViewId
      ? listed.find((item) => item.id === routeViewId) ??
        stubBuiltinScopeView(routeViewId, listed) ??
        stubBuiltinMemberView(routeViewId) ??
        stubBuiltinCatalogView(routeViewId) ??
        stubBuiltinTagView(routeViewId) ??
        stubBuiltinBlockKindView(routeViewId) ??
        (isBuiltinAllViewForCollection(routeViewId, collectionPath) ? stubBuiltinAllView(routeViewId) : null)
      : undefined) ??
    listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ??
    fallback ??
    listed[0]
  return preferred ? withViewDisplay(collectionPath, normalizeSavedView(preferred)) : null
}

export function defaultViewId(collectionPath: string, routeViewId?: string) {
  return viewForPath(collectionPath, routeViewId)?.id ?? builtinAllViewId(collectionPath)
}

/** 水合时列表可能还没有内置块类型视图；URL 上的 builtin-block: 仍用 stub 还原，不能退回「全部」。 */
export function pickViewForRoute(listed: SavedView[], collectionPath: string, routeViewId?: string) {
  const route = String(routeViewId ?? '').trim()
  if (route) {
    return listed.find((item) => item.id === route) ?? viewForPath(collectionPath, route)
  }
  return listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ?? listed[0] ?? null
}

/** 冷 origin 上 URL 里的已存视图不在 localStorage；内置 stub 不用拉。 */
export function routeViewNeedsFetch(collectionPath: string, routeViewId?: string) {
  const id = String(routeViewId ?? '').trim()
  if (!id || isReadOnlyViewId(id)) return false
  return !loadViews(collectionPath).some((view) => view.id === id)
}

const routeViewFetchByKey = new Map<string, Promise<SavedView | null>>()

export async function fetchSavedView(collectionPath: string, viewId: string): Promise<SavedView | null> {
  const id = String(viewId ?? '').trim()
  if (!id) return null
  if (isReadOnlyViewId(id)) return viewForPath(collectionPath, id)
  const hit = loadViews(collectionPath).find((view) => view.id === id)
  if (hit) return withViewDisplay(collectionPath, hit)
  const key = `${collectionPath}\0${id}`
  const pending = routeViewFetchByKey.get(key)
  if (pending) return pending
  const request = fetchSavedViewNow(collectionPath, id).finally(() => {
    if (routeViewFetchByKey.get(key) === request) routeViewFetchByKey.delete(key)
  })
  routeViewFetchByKey.set(key, request)
  return request
}

async function fetchSavedViewNow(collectionPath: string, viewId: string): Promise<SavedView | null> {
  const path = savedViewRecordPath(collectionPath, viewId)
  if (path) {
    try {
      const data = await readJson<{ value?: Parameters<typeof savedViewFromRecord>[0] }>(
        `/api/db/read?path=${encodeURIComponent(path)}`,
      )
      const view = data.value ? savedViewFromRecord(data.value) : null
      if (view && view.id === viewId) {
        upsertSavedView(collectionPath, view)
        return withViewDisplay(collectionPath, view)
      }
    } catch {
      /* 单条读失败就停，不拉整表 80 条视图挡首屏 */
    }
  }
  const listed = loadViews(collectionPath).find((view) => view.id === viewId)
  return listed ? withViewDisplay(collectionPath, listed) : null
}

export type StarredView = { path: string; viewId: string }

const STARRED_VIEWS_KEY = 'fsdb.starredViews'

export function loadStarredViews(): StarredView[] {
  try {
    const raw = localStorage.getItem(STARRED_VIEWS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const rec = item as Record<string, unknown>
      const path = String(rec.path ?? '').trim()
      const viewId = String(rec.viewId ?? '').trim()
      return path && viewId ? [{ path, viewId }] : []
    })
  } catch {
    return []
  }
}

let starredViews = loadStarredViews()
let starredVersion = 0
const starredListeners = new Set<() => void>()

export function getStarredViews() {
  return starredViews
}

export function subscribeStarredViews(fn: () => void) {
  starredListeners.add(fn)
  return () => {
    starredListeners.delete(fn)
  }
}

export function getStarredViewsVersion() {
  return starredVersion
}

export function persistStarredViews(items: StarredView[]) {
  starredViews = items
  starredVersion += 1
  localStorage.setItem(STARRED_VIEWS_KEY, JSON.stringify(items))
  for (const fn of starredListeners) fn()
}

export type SavedViewsPatch = { upsert?: SavedView[]; remove?: string[] }

export function viewPatchKey(view: SavedView) {
  return JSON.stringify(normalizeSavedView(view))
}

/** 推给后端的载荷：带上本地修改时间，后端据此丢掉比库更旧的快照。 */
function viewWirePayload(view: SavedView) {
  return { ...view, updatedAt: Number(view.updatedAt) || 0 }
}

/** 本地改了哪些视图就打个时间戳，切窗口/切会话时旧快照不会盖掉刚做的修改。 */
export function stampSavedView(view: SavedView): SavedView {
  return { ...view, updatedAt: Date.now() }
}

export type SavedViewsWriteResult = 'skipped' | 'ok' | 'failed'

/** 按差异推视图：只发这一个窗口真正改动的条目，避免把别的窗口新建的视图整份冲掉。 */
export async function pushSavedViewsPatch(collectionPath: string, patch: SavedViewsPatch): Promise<SavedViewsWriteResult> {
  const upsert = patch.upsert ?? []
  const remove = patch.remove ?? []
  if (!upsert.length && !remove.length) return 'skipped'
  try {
    const res = await fetch('/api/db/saved-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: collectionPath, upsert: upsert.map(viewWirePayload), remove }),
    })
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

/** 整份覆盖。只有确知「本地就是权威」时才用，普通增删改请走 pushSavedViewsPatch。 */
export function pushSavedViews(collectionPath: string, views: SavedView[]) {
  return fetch('/api/db/saved-views', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: collectionPath, views, replace: true }),
  }).catch(() => undefined)
}

/** 两份视图列表的差异：新增/改了什么、删了哪些 id。 */
export function diffSavedViews(prev: SavedView[], next: SavedView[]): SavedViewsPatch {
  const before = new Map(prev.filter((view) => !view.builtin).map((view) => [view.id, view]))
  const upsert: SavedView[] = []
  const seen = new Set<string>()
  for (const view of next) {
    if (view.builtin || isReadOnlyViewId(view.id)) continue
    seen.add(view.id)
    const old = before.get(view.id)
    if (!old || viewPatchKey(old) !== viewPatchKey(view)) upsert.push(view)
  }
  const remove = [...before.keys()].filter((id) => !seen.has(id))
  return { upsert, remove }
}

function writableSavedView(view: SavedView) {
  return !view.builtin && !isReadOnlyViewId(view.id)
}

/** 把调用方点名的 upsert/remove 并进 diff，避免新 id 不在 baseline 时整次写入被 skipped。 */
export function mergeSavedViewsPatch(diff: SavedViewsPatch, extra?: SavedViewsPatch): SavedViewsPatch {
  const byId = new Map<string, SavedView>()
  for (const view of [...(diff.upsert ?? []), ...(extra?.upsert ?? [])]) {
    if (!writableSavedView(view)) continue
    byId.set(view.id, view)
  }
  const remove = [...new Set([...(diff.remove ?? []), ...(extra?.remove ?? [])].map((id) => String(id ?? '').trim()).filter(Boolean))]
  for (const id of remove) byId.delete(id)
  return { upsert: [...byId.values()], remove }
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function parseViewFilterTree(value: unknown) {
  const raw = parseMaybeJson(value)
  if (!looksLikeFilterTree(raw)) return undefined
  return normalizeFilterGroup(raw)
}

function parseViewFilters(value: unknown): Record<string, string> {
  const raw = parseMaybeJson(value)
  if (looksLikeFilterTree(raw)) return {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
      if (key.startsWith('$')) continue
      out[key] = String(item)
    }
    return out
  }
  return {}
}

export function savedViewFromRecord(row: { viewId?: unknown; title?: unknown; mode?: unknown; sortField?: unknown; sortDir?: unknown; sorts?: unknown; query?: unknown; groupBy?: unknown; columns?: unknown; filters?: unknown; filterTree?: unknown; tree?: unknown; wrap?: unknown; truncate?: unknown; pageSize?: unknown; columnWidths?: unknown; rank?: unknown }): SavedView | null {
  const id = String(row.viewId ?? '').trim()
  if (!id || isReadOnlyViewId(id)) return null
  const sortDir = row.sortDir === 'desc' ? 'desc' : 'asc'
  const sortField = String(row.sortField ?? 'title')
  const filters = parseViewFilters(row.filters)
  const filterTree = parseViewFilterTree(row.filterTree) ?? (looksLikeFilterTree(parseMaybeJson(row.filters)) ? normalizeFilterGroup(parseMaybeJson(row.filters)) : undefined)
  return normalizeSavedView({
    id,
    name: String(row.title ?? id),
    mode: String(row.mode ?? 'table') as SavedView['mode'],
    sortField,
    sortDir,
    sorts: parseSortsInput(row.sorts, sortField, sortDir),
    query: String(row.query ?? ''),
    groupBy: String(row.groupBy ?? ''),
    columns: parseViewColumns(row.columns),
    filters,
    filterTree,
    tree: row.tree !== false,
    wrap: Boolean(row.wrap),
    truncate: row.truncate !== false,
    pageSize: normalizePageSize(row.pageSize),
    columnWidths: row.columnWidths,
    builtin: false,
    rank: Number.isFinite(Number(row.rank)) ? Math.round(Number(row.rank)) : undefined,
  })
}

const viewsPullByKey = new Map<string, Promise<boolean>>()
const viewsPulledAtByKey = new Map<string, number>()
const viewsWriteEpoch = new Map<string, number>()
let viewsIdle = 0
let viewsIdleResolve: ((changed: boolean) => void) | null = null
let viewsIdlePaths: readonly string[] = []
const VIEWS_PULL_TTL_MS = 2500
const VIEWS_PULL_IDLE_MS = 2800
const VIEWS_PULL_LIMIT = 80
/** 视图行要整份拿：可见列/列宽/筛选不能跟表数据一样做 list 投影，否则 `columns` 字段会被投影参数吃掉。 */

function viewsPullKey(collectionPaths: readonly string[]) {
  return collectionPaths.map((path) => String(path ?? '').trim()).filter(Boolean).sort().join('\0') || '*'
}

function viewsPullTouches(key: string, path: string) {
  if (key === '*') return true
  return key.split('\0').includes(path)
}

function snapshotViewWriteEpochs(paths: readonly string[]) {
  const out = new Map<string, number>()
  if (!paths.length) {
    for (const [path, epoch] of viewsWriteEpoch) out.set(path, epoch)
    return out
  }
  for (const path of paths) out.set(path, viewsWriteEpoch.get(path) ?? 0)
  return out
}

function viewWriteStale(path: string, started: Map<string, number>) {
  return (viewsWriteEpoch.get(path) ?? 0) !== (started.get(path) ?? 0)
}

/** 本地刚写过视图（含删除）时，丢掉进行中的 /views 拉取，避免旧快照把删掉的视图写回来。 */
export function noteLocalSavedViewsWrite(collectionPath: string) {
  const path = String(collectionPath ?? '').trim()
  if (!path) return
  viewsWriteEpoch.set(path, (viewsWriteEpoch.get(path) ?? 0) + 1)
  for (const key of [...viewsPullByKey.keys()]) {
    if (viewsPullTouches(key, path)) viewsPullByKey.delete(key)
  }
  for (const key of [...viewsPulledAtByKey.keys()]) {
    if (viewsPullTouches(key, path)) viewsPulledAtByKey.delete(key)
  }
  viewsPulledAtByKey.set(viewsPullKey([path]), Date.now())
  invalidateListReads()
}

export async function pullSavedViews(
  collectionPaths: readonly string[] = [],
  opts?: { idle?: boolean },
) {
  const key = viewsPullKey(collectionPaths)
  const pending = viewsPullByKey.get(key)
  if (opts?.idle) {
    if (pending) return pending
    const pulledAt = viewsPulledAtByKey.get(key) ?? 0
    if (pulledAt && Date.now() - pulledAt < VIEWS_PULL_TTL_MS) return false
    if (viewsIdle) return new Promise<boolean>((resolve) => {
      const prev = viewsIdleResolve
      viewsIdleResolve = (changed) => {
        prev?.(changed)
        resolve(changed)
      }
    })
    viewsIdlePaths = collectionPaths
    return new Promise<boolean>((resolve) => {
      viewsIdleResolve = resolve
      viewsIdle = window.setTimeout(() => {
        viewsIdle = 0
        const done = viewsIdleResolve
        viewsIdleResolve = null
        const paths = viewsIdlePaths
        void pullSavedViews(paths).then(done ?? (() => undefined), () => done?.(false))
      }, VIEWS_PULL_IDLE_MS)
    })
  }
  if (viewsIdle) {
    window.clearTimeout(viewsIdle)
    viewsIdle = 0
  }
  const idleDone = viewsIdleResolve
  viewsIdleResolve = null
  if (pending) {
    if (idleDone) void pending.then(idleDone)
    return pending
  }
  const pulledAt = viewsPulledAtByKey.get(key) ?? 0
  if (pulledAt && Date.now() - pulledAt < VIEWS_PULL_TTL_MS) {
    idleDone?.(false)
    return false
  }
  const started = snapshotViewWriteEpochs(
    collectionPaths.map((path) => String(path ?? '').trim()).filter(Boolean),
  )
  const request = pullSavedViewsNow(collectionPaths, started).finally(() => {
    if (viewsPullByKey.get(key) === request) viewsPullByKey.delete(key)
    const paths = [...started.keys()]
    if (paths.length ? paths.some((path) => viewWriteStale(path, started)) : [...viewsWriteEpoch.keys()].some((path) => viewWriteStale(path, started))) {
      return
    }
    viewsPulledAtByKey.set(key, Date.now())
  })
  viewsPullByKey.set(key, request)
  if (idleDone) void request.then(idleDone)
  return request
}

async function pullSavedViewsNow(
  collectionPaths: readonly string[] = [],
  started = snapshotViewWriteEpochs(
    collectionPaths.map((path) => String(path ?? '').trim()).filter(Boolean),
  ),
) {
  try {
    const fetchPaths = [...new Set(collectionPaths.map((path) => String(path ?? '').trim()).filter(Boolean))]
    const pages = fetchPaths.length
      ? await Promise.all(
          fetchPaths.map((tablePath) =>
            listCollection({
              path: '/views',
              limit: VIEWS_PULL_LIMIT,
              offset: 0,
              filters: { tablePath },
            }),
          ),
        )
      : [
          await listCollection({
            path: '/views',
            limit: 200,
            offset: 0,
          }),
        ]
    const byPath = new Map<string, SavedView[]>()
    for (const row of pages.flatMap((page) => page.items)) {
      const tablePath = String(row.tablePath ?? '').trim()
      const view = savedViewFromRecord(row)
      if (!tablePath || !view) continue
      const list = byPath.get(tablePath) ?? []
      list.push(view)
      byPath.set(tablePath, list)
    }
    const paths = new Set([...fetchPaths, ...byPath.keys()])
    let changed = false
    for (const path of paths) {
      if (viewWriteStale(path, started)) continue
      const views = byPath.get(path) ?? []
      const previous = memoryViews.get(path) ?? loadViews(path)
      const ranked = rankListedViews(
        views.map((view) => withViewDisplay(path, view)),
        previous,
      )
      const prev = JSON.stringify(previous)
      const next = JSON.stringify(ranked)
      if (prev !== next) changed = true
      rememberViews(path, ranked)
      try {
        if (ranked.length) localStorage.setItem(viewsKey(path), JSON.stringify(ranked))
        else localStorage.removeItem(viewsKey(path))
      } catch {
        /* ignore */
      }
    }
    return changed
  } catch {
    return false
  }
}

export function upsertSavedView(collectionPath: string, view: SavedView) {
  const next = normalizeSavedView({ ...view, builtin: false })
  const stored = loadViews(collectionPath).filter((item) => item.id !== next.id && !item.builtin)
  stored.push(next)
  rememberViews(collectionPath, stored)
  noteLocalSavedViewsWrite(collectionPath)
  try {
    localStorage.setItem(viewsKey(collectionPath), JSON.stringify(stored))
  } catch {
    /* ignore */
  }
}

export function isViewStarred(items: StarredView[], path: string, viewId: string) {
  return items.some((item) => item.path === path && item.viewId === viewId)
}

export function toggleStarredView(items: StarredView[], path: string, viewId: string): StarredView[] {
  if (isViewStarred(items, path, viewId)) return items.filter((item) => item.path !== path || item.viewId !== viewId)
  return [...items, { path, viewId }]
}

export type StarredRecord = { path: string; recordId: string; label?: string; emoji?: string }

const STARRED_RECORDS_KEY = 'fsdb.starredRecords'

export function loadStarredRecords(): StarredRecord[] {
  try {
    const raw = localStorage.getItem(STARRED_RECORDS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const rec = item as Record<string, unknown>
      const path = String(rec.path ?? '').trim()
      const recordId = String(rec.recordId ?? '').trim()
      if (!path || !recordId) return []
      const label = String(rec.label ?? '').trim()
      const emoji = String(rec.emoji ?? '').trim()
      return [{ path, recordId, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}) }]
    })
  } catch {
    return []
  }
}

let starredRecords = loadStarredRecords()
let starredRecordsVersion = 0
const starredRecordListeners = new Set<() => void>()

export function getStarredRecords() {
  return starredRecords
}

export function subscribeStarredRecords(fn: () => void) {
  starredRecordListeners.add(fn)
  return () => {
    starredRecordListeners.delete(fn)
  }
}

export function getStarredRecordsVersion() {
  return starredRecordsVersion
}

export function persistStarredRecords(items: StarredRecord[]) {
  starredRecords = items
  starredRecordsVersion += 1
  localStorage.setItem(STARRED_RECORDS_KEY, JSON.stringify(items))
  for (const fn of starredRecordListeners) fn()
}

export function isRecordStarred(items: StarredRecord[], path: string, recordId: string) {
  return items.some((item) => item.path === path && item.recordId === recordId)
}

export function toggleStarredRecord(
  items: StarredRecord[],
  path: string,
  recordId: string,
  meta?: { label?: string; emoji?: string },
): StarredRecord[] {
  if (isRecordStarred(items, path, recordId)) return items.filter((item) => item.path !== path || item.recordId !== recordId)
  const label = String(meta?.label ?? '').trim()
  const emoji = String(meta?.emoji ?? '').trim()
  return [...items, { path, recordId, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}) }]
}

export function starredRecordLabel(item: StarredRecord) {
  const peeked = peekRecord(item.path, item.recordId)
  const label = String(peeked?.label ?? item.label ?? '').trim()
  return label && label !== item.recordId ? label : label || item.recordId
}

export function starredRecordEmoji(item: StarredRecord) {
  return String(peekRecord(item.path, item.recordId)?.emoji ?? item.emoji ?? '').trim()
}

const DISPLAY_KEYS = [
  'mode',
  'sortField',
  'sortDir',
  'sorts',
  'columns',
  'groupBy',
  'tree',
  'wrap',
  'truncate',
  'query',
  'pageSize',
  'columnWidths',
  'filterTree',
  'rank',
] as const

export type ViewDisplayPatch = Partial<Pick<SavedView, (typeof DISPLAY_KEYS)[number]>>

export function viewDisplayKey(collectionPath: string, viewId: string) {
  return `fsdb.viewDisplay:${collectionPath}:${viewId}`
}

export function collapsedGroupsKey(collectionPath: string, viewId: string, groupBy = '') {
  return `fsdb.collapsedGroups:${collectionPath}:${viewId}:${groupBy}`
}

export function loadCollapsedGroups(collectionPath: string, viewId: string, groupBy = ''): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(collapsedGroupsKey(collectionPath, viewId, groupBy))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const next: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) next[key] = true
    }
    return next
  } catch {
    return {}
  }
}

export function persistCollapsedGroups(
  collectionPath: string,
  viewId: string,
  groupBy: string,
  next: Record<string, boolean>,
) {
  try {
    const key = collapsedGroupsKey(collectionPath, viewId, groupBy)
    const compact: Record<string, boolean> = {}
    for (const [id, folded] of Object.entries(next)) {
      if (folded) compact[id] = true
    }
    if (Object.keys(compact).length) localStorage.setItem(key, JSON.stringify(compact))
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function pickDisplay(patch: Partial<SavedView>): ViewDisplayPatch {
  const next: ViewDisplayPatch = {}
  for (const key of DISPLAY_KEYS) {
    if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key]
  }
  return next
}

export function loadViewDisplay(collectionPath: string, viewId: string): ViewDisplayPatch {
  try {
    const raw = localStorage.getItem(viewDisplayKey(collectionPath, viewId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    return pickDisplay(parsed)
  } catch {
    return {}
  }
}

export function persistViewDisplay(collectionPath: string, viewId: string, patch: Partial<SavedView>) {
  try {
    const next = { ...loadViewDisplay(collectionPath, viewId), ...pickDisplay(patch) }
    localStorage.setItem(viewDisplayKey(collectionPath, viewId), JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** 内置「全部 xx」不能当用户视图存整份，显示项（换行等）单独记。索引表没有分享，全部视图不按分享分组。 */
export function withViewDisplay(collectionPath: string, view: SavedView): SavedView {
  const overlay = loadViewDisplay(collectionPath, view.id)
  const painted = Object.keys(overlay).length
    ? {
        ...view,
        ...overlay,
        id: view.id,
        name: view.name,
        builtin: view.builtin,
        filters: view.filters,
        filterTree: view.builtin ? overlay.filterTree ?? view.filterTree : view.filterTree,
        rank: Number.isFinite(Number(overlay.rank)) ? overlay.rank : view.rank,
      }
    : view
  return normalizeSavedView({
    ...painted,
    ...(isIndexCollection(collectionPath) && isBuiltinAllViewId(view.id) ? { groupBy: '' } : {}),
  })
}
