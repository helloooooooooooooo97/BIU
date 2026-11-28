import { currentStorageWorkspaceId, readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import {
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  normalizeCollectionPath,
} from '../paths.ts'
import { invalidateListReads, readJson } from './db-client.ts'
import { looksLikeFilterTree, normalizeFilterGroup, parseSortsInput } from '../query-logic.ts'
import {
  canEditSavedView,
  extractViewCreatorId,
  normalizeColumnWidths,
  normalizeGroupConfig,
  normalizePageSize,
  normalizeSavedView,
  normalizeViewRole,
  normalizeViewShareScope,
  parseViewColumns,
  rankListedViews,
  sortViewsByRank,
  type SavedView,
  type SavedViewFieldPatch,
} from './saved-view.ts'
import { KeyedSerialQueue } from './record-write-queue.ts'
import { registerWorkspaceCache } from './workspace-client-store.ts'
import { clearCrumbCache } from './crumb-cache.ts'
import { resetStarredWorkspaceCache } from './starred-storage.ts'

export {
  type CrumbRecord,
  getCrumbsVersion,
  subscribeCrumbs,
  rememberRecords,
  applyListedCrumbMutation,
  loadRecords,
  peekRecord,
} from './crumb-cache.ts'

export {
  type StarredView,
  type StarredRecord,
  loadStarredViews,
  hydrateStarredFromServer,
  getStarredViews,
  subscribeStarredViews,
  getStarredViewsVersion,
  persistStarredViews,
  isViewStarred,
  toggleStarredView,
  removeStarredViews,
  loadStarredRecords,
  getStarredRecords,
  subscribeStarredRecords,
  getStarredRecordsVersion,
  persistStarredRecords,
  isRecordStarred,
  toggleStarredRecord,
  starredRecordLabel,
  starredRecordEmoji,
  loadViewOrderMap,
  getViewOrder,
  getAllViewOrders,
  subscribeViewOrder,
  getViewOrderVersion,
  persistViewOrderForPath,
  applyUserViewOrder,
} from './starred-storage.ts'

/** 按 collectionPath 串行化视图写入，防止连点改属性时并发 POST 乱序覆盖。 */
export const viewWriteQueue = new KeyedSerialQueue()

/** 按当前活动工作区隔离 localStorage 视图偏好，防止本机空间与云端空间、或不同空间之间互相污染。 */
function currentWorkspaceStorageId(): string {
  return currentStorageWorkspaceId()
}

function workspaceStoragePrefix(): string {
  const ws = currentWorkspaceStorageId()
  return ws ? `${ws}:` : ''
}

export function activeViewStorageKey(collectionPath: string) {
  return `fsdb.activeView:${workspaceStoragePrefix()}${collectionPath}`
}

/** 集合在服务端首拉前尚未载入时的约定默认种子视图 ID。 */
export function defaultSeedViewId(collectionPath: string): string {
  return normalizeCollectionPath(collectionPath) === WORKSPACE_MEMBERS_COLLECTION_PATH ? 'member' : 'all'
}

// ---------------------------------------------------------------------------
// 单一权威 ViewStore：serverViews（服务端权威快照） + pendingOps（本端在途增量）
// ---------------------------------------------------------------------------

export type PendingViewOp = {
  opId: number
  workspaceGen: number
  upsert?: SavedViewFieldPatch[]
  remove?: string[]
}

let workspaceGen = 0
let nextPendingOpId = 1
const viewListeners = new Set<() => void>()
const serverViews = new Map<string, SavedView[]>()
const pendingOps = new Map<string, PendingViewOp[]>()
const writeSeqByPath = new Map<string, number>()

function emitViewsStoreChange() {
  for (const fn of viewListeners) fn()
}

export function subscribeViews(listener: () => void): () => void {
  viewListeners.add(listener)
  return () => {
    viewListeners.delete(listener)
  }
}

function mergePatchOntoView(base: SavedView | undefined, patch: SavedViewFieldPatch): SavedView {
  if (!base) {
    return normalizeSavedView({
      mode: 'table',
      sortField: 'updatedAt',
      sortDir: 'desc',
      filters: {},
      columns: [],
      ...patch,
      id: patch.id,
      name: String(patch.name ?? patch.id),
    } as SavedView)
  }
  return normalizeSavedView({
    ...base,
    ...patch,
    freezeUntil: patch.freezeUntil === null ? undefined : (patch.freezeUntil ?? base.freezeUntil),
    groupConfig: patch.groupConfig === null ? undefined : (patch.groupConfig ?? base.groupConfig),
    filterTree: patch.filterTree === null ? undefined : (patch.filterTree ?? base.filterTree),
    id: base.id,
    name: typeof patch.name === 'string' && patch.name.trim() ? patch.name : base.name,
  } as SavedView)
}

function applyPendingOps(base: SavedView[], ops: PendingViewOp[]): SavedView[] {
  if (!ops.length) return base
  const byId = new Map<string, SavedView>()
  for (const view of base) {
    const id = String(view.id ?? '').trim()
    if (id) byId.set(id, view)
  }
  for (const op of ops) {
    for (const rawId of op.remove ?? []) {
      const id = String(rawId ?? '').trim()
      if (id) byId.delete(id)
    }
    for (const patch of op.upsert ?? []) {
      const id = String(patch.id ?? '').trim()
      if (!id) continue
      byId.set(id, mergePatchOntoView(byId.get(id), patch))
    }
  }
  return sortViewsByRank([...byId.values()])
}

function bumpWriteSeq(collectionPath: string) {
  const path = String(collectionPath ?? '').trim()
  if (!path) return
  writeSeqByPath.set(path, (writeSeqByPath.get(path) ?? 0) + 1)
}

/** 登记一次在途乐观视图变更，返回独立 opId；提交或失败时按 opId 精准结算，绝不误伤并发成功操作。 */
export function beginPendingViewOp(
  collectionPath: string,
  op: { upsert?: SavedViewFieldPatch[]; remove?: string[] },
): number {
  const opId = nextPendingOpId++
  const entry: PendingViewOp = {
    opId,
    workspaceGen,
    upsert: op.upsert?.map((patch) => ({ ...patch })),
    remove: op.remove?.map((id) => String(id ?? '').trim()).filter(Boolean),
  }
  const list = pendingOps.get(collectionPath) ?? []
  pendingOps.set(collectionPath, [...list, entry])
  noteLocalSavedViewsWrite(collectionPath)
  emitViewsStoreChange()
  return opId
}

/** 结算已落盘的在途变更：直接采纳服务端响应返回的权威视图列表，避免二次拉取回弹覆盖。 */
export function commitPendingViewOp(
  collectionPath: string,
  opId: number,
  serverAuthoritativeViews?: SavedView[],
) {
  const list = pendingOps.get(collectionPath) ?? []
  const op = list.find((item) => item.opId === opId)
  if (op && op.workspaceGen !== workspaceGen) return
  const remaining = list.filter((item) => item.opId !== opId)
  if (remaining.length) pendingOps.set(collectionPath, remaining)
  else pendingOps.delete(collectionPath)

  const prevServer = serverViews.get(collectionPath) ?? []
  if (serverAuthoritativeViews) {
    const normalized = serverAuthoritativeViews.map((view) => normalizeSavedView(view))
    serverViews.set(collectionPath, rankListedViews(normalized, prevServer))
  } else if (op) {
    const applied = applyPendingOps(prevServer, [op])
    serverViews.set(collectionPath, rankListedViews(applied, prevServer))
  }
  bumpWriteSeq(collectionPath)
  emitViewsStoreChange()
}

/** 失败时仅撤销指定 opId 的乐观变更，保留其余并发成功或在途操作。 */
export function rollbackPendingViewOp(collectionPath: string, opId: number) {
  const list = pendingOps.get(collectionPath) ?? []
  const remaining = list.filter((item) => item.opId !== opId)
  if (remaining.length === list.length) return
  if (remaining.length) pendingOps.set(collectionPath, remaining)
  else pendingOps.delete(collectionPath)
  emitViewsStoreChange()
}

export function rememberViews(collectionPath: string, views: SavedView[]) {
  serverViews.set(
    collectionPath,
    views.map((view) => normalizeSavedView(view)),
  )
  bumpWriteSeq(collectionPath)
  emitViewsStoreChange()
}

/** 合并两份视图列表（优先使用较高 revision，不依赖客户端时钟）。 */
export function mergeSavedViewLists(
  previous: SavedView[],
  incoming: SavedView[],
  removed: Iterable<string> = [],
): SavedView[] {
  const gone = new Set([...removed].map((id) => String(id ?? '').trim()).filter(Boolean))
  const byId = new Map<string, SavedView>()
  for (const view of previous) {
    const id = String(view.id ?? '').trim()
    if (!id || gone.has(id)) continue
    byId.set(id, normalizeSavedView(view))
  }
  for (const view of incoming) {
    const id = String(view.id ?? '').trim()
    if (!id || gone.has(id)) continue
    const next = normalizeSavedView(view)
    const prev = byId.get(id)
    if (prev && (prev.revision ?? 0) > (next.revision ?? 0)) {
      continue
    }
    byId.set(id, next)
  }
  return [...byId.values()]
}

export function loadViews(collectionPath: string): SavedView[] {
  const base = serverViews.get(collectionPath) ?? []
  const ops = pendingOps.get(collectionPath)
  const merged = ops?.length ? applyPendingOps(base, ops) : base
  return merged.map((view) => {
    if (canEditSavedView(view)) return view
    const localWidths = loadLocalColumnWidths(collectionPath, view.id)
    if (!Object.keys(localWidths).length) return view
    return { ...view, columnWidths: { ...view.columnWidths, ...localWidths } }
  })
}

export function loadActiveViewId(collectionPath: string, listed: SavedView[]) {
  try {
    const id = readStorageString(activeViewStorageKey(collectionPath))
    if (id && listed.some((view) => view.id === id)) return id
  } catch {
    /* ignore */
  }
  return listed[0]?.id ?? null
}

export function viewForPath(collectionPath: string, routeViewId?: string): SavedView | null {
  const listed = loadViews(collectionPath)
  const want = String(routeViewId ?? '').trim()
  const preferred =
    (want ? listed.find((item) => item.id === want) : undefined) ??
    listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ??
    listed[0]
  return preferred ? normalizeSavedView(preferred) : null
}

export function defaultViewId(collectionPath: string, routeViewId?: string) {
  const hit = viewForPath(collectionPath, routeViewId)
  if (hit) return hit.id
  const listed = loadViews(collectionPath)
  if (listed[0]) return listed[0].id
  return defaultSeedViewId(collectionPath)
}

export function pickViewForRoute(listed: SavedView[], collectionPath: string, routeViewId?: string) {
  const route = String(routeViewId ?? '').trim()
  if (route) {
    const hit = listed.find((item) => item.id === route)
    if (hit) return hit
  }
  return listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ?? listed[0] ?? null
}

/** 冷 origin 上 URL 里的视图尚未拉到缓存时先拉取权威列表。 */
export function routeViewNeedsFetch(collectionPath: string, routeViewId?: string) {
  const id = String(routeViewId ?? '').trim()
  if (!id) return false
  if (hasPulledSavedViews(collectionPath)) return false
  return !loadViews(collectionPath).some((view) => view.id === id)
}

const routeViewFetchByKey = new Map<string, Promise<SavedView | null>>()

export async function fetchSavedView(collectionPath: string, viewId: string): Promise<SavedView | null> {
  const id = String(viewId ?? '').trim()
  if (!id) return null
  const hit = loadViews(collectionPath).find((view) => view.id === id)
  if (hit) return normalizeSavedView(hit)
  const key = `${workspaceGen}\0${collectionPath}\0${id}`
  const pending = routeViewFetchByKey.get(key)
  if (pending) return pending
  const request = fetchSavedViewNow(collectionPath, id).finally(() => {
    if (routeViewFetchByKey.get(key) === request) routeViewFetchByKey.delete(key)
  })
  routeViewFetchByKey.set(key, request)
  return request
}

async function fetchSavedViewNow(collectionPath: string, viewId: string): Promise<SavedView | null> {
  const startGen = workspaceGen
  const startWs = currentWorkspaceStorageId()
  await pullSavedViews([collectionPath], { force: true })
  if (workspaceGen !== startGen || currentWorkspaceStorageId() !== startWs) return null
  const listed = loadViews(collectionPath).find((view) => view.id === viewId)
  return listed ? normalizeSavedView(listed) : null
}

export type SavedViewsPatch = { upsert?: SavedViewFieldPatch[]; remove?: string[] }

export function viewPatchKey(view: SavedView) {
  return JSON.stringify(normalizeSavedView(view))
}

/** 将字段级 patch 归一化为传输载荷（仅序列化传入的字段；可清空字段显式传 null / {}）。 */
function patchWirePayload(patch: SavedViewFieldPatch) {
  const out: Record<string, unknown> = { ...patch }
  if ('groupConfig' in patch && patch.groupConfig === undefined) out.groupConfig = null
  if ('freezeUntil' in patch && patch.freezeUntil === undefined) out.freezeUntil = null
  if ('filterTree' in patch && patch.filterTree === undefined) out.filterTree = null
  if ('columnWidths' in patch && patch.columnWidths === undefined) out.columnWidths = {}
  if ('columnSummaries' in patch && patch.columnSummaries === undefined) out.columnSummaries = {}
  if ('columnViews' in patch && patch.columnViews === undefined) out.columnViews = {}
  if ('sandboxViews' in patch && patch.sandboxViews === undefined) out.sandboxViews = []
  return out
}

export type SavedViewsWriteResult = 'skipped' | 'ok' | 'failed'

export type SavedViewsMutationOutcome = {
  status: SavedViewsWriteResult
  views?: SavedView[]
  error?: string
}

/** 字段级增量推视图，解析服务端返回的权威视图列表与具体报错原因。 */
export async function pushSavedViewsMutation(
  collectionPath: string,
  patch: SavedViewsPatch,
): Promise<SavedViewsMutationOutcome> {
  const upsert = patch.upsert ?? []
  const remove = patch.remove ?? []
  if (!upsert.length && !remove.length) return { status: 'skipped' }
  const startGen = workspaceGen
  const startWs = currentWorkspaceStorageId()
  try {
    const res = await apiFetch('/api/db/saved-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: collectionPath,
        upsert: upsert.map(patchWirePayload),
        remove,
      }),
    })
    if (workspaceGen !== startGen || currentWorkspaceStorageId() !== startWs) {
      return { status: 'failed', error: '工作区已切换' }
    }
    const text = await res.text()
    let parsed: { views?: unknown; error?: unknown } | null = null
    if (text && text.trim().startsWith('{')) {
      try {
        parsed = JSON.parse(text) as { views?: unknown; error?: unknown }
      } catch {
        parsed = null
      }
    }
    if (!res.ok) {
      const msg = typeof parsed?.error === 'string' && parsed.error.trim() ? parsed.error.trim() : `保存失败 (${res.status})`
      return { status: 'failed', error: msg }
    }
    let views: SavedView[] | undefined
    if (Array.isArray(parsed?.views)) {
      views = parsed.views
        .filter((item): item is SavedView => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
        .map((item) => normalizeSavedView(item))
    }
    return { status: 'ok', views }
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}

export async function pushSavedViewsPatch(collectionPath: string, patch: SavedViewsPatch): Promise<SavedViewsWriteResult> {
  const outcome = await pushSavedViewsMutation(collectionPath, patch)
  return outcome.status
}

/** 两份视图列表的差异：新增/改了什么、删了哪些 id。 */
export function diffSavedViews(prev: SavedView[], next: SavedView[]): SavedViewsPatch {
  const before = new Map(prev.map((view) => [view.id, view]))
  const upsert: SavedViewFieldPatch[] = []
  const seen = new Set<string>()
  for (const view of next) {
    if (!view.id) continue
    seen.add(view.id)
    const old = before.get(view.id)
    if (!old || viewPatchKey(old) !== viewPatchKey(view)) upsert.push(view)
  }
  const remove = [...before.keys()].filter((id) => !seen.has(id))
  return { upsert, remove }
}

export function mergeSavedViewsPatch(diff: SavedViewsPatch, extra?: SavedViewsPatch): SavedViewsPatch {
  const byId = new Map<string, SavedViewFieldPatch>()
  for (const view of [...(diff.upsert ?? []), ...(extra?.upsert ?? [])]) {
    if (!String(view.id ?? '').trim()) continue
    byId.set(view.id, { ...(byId.get(view.id) ?? {}), ...view })
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
      if (key.startsWith('$') && key !== '$scope') continue
      out[key] = String(item)
    }
    return out
  }
  return {}
}

export function savedViewFromRecord(row: Record<string, unknown>): SavedView | null {
  const id = String(row.viewId ?? row.id ?? '').trim()
  if (!id) return null
  const sortDir = row.sortDir === 'desc' ? 'desc' : 'asc'
  const sortField = String(row.sortField ?? 'title')
  const filters = parseViewFilters(row.filters)
  const filterTree =
    parseViewFilterTree(row.filterTree) ??
    (looksLikeFilterTree(parseMaybeJson(row.filters)) ? normalizeFilterGroup(parseMaybeJson(row.filters)) : undefined)
  return normalizeSavedView({
    id,
    name: String(row.title ?? row.name ?? id),
    mode: String(row.mode ?? 'table') as SavedView['mode'],
    locked: Boolean(row.locked),
    revision: Number.isFinite(Number(row.revision)) && Number(row.revision) > 0 ? Math.round(Number(row.revision)) : undefined,
    shareScope: normalizeViewShareScope(row.shareScope),
    hasExternal: Boolean(row.hasExternal),
    createdBy: extractViewCreatorId(row.createdBy),
    viewRole: normalizeViewRole(row.viewRole),
    sortField,
    sortDir,
    sorts: parseSortsInput(row.sorts, sortField, sortDir),
    query: String(row.query ?? ''),
    groupBy: String(row.groupBy ?? ''),
    groupConfig: normalizeGroupConfig(row.groupConfig),
    columns: parseViewColumns(row.columns),
    filters,
    filterTree,
    tree: Boolean(row.tree),
    wrap: Boolean(row.wrap),
    truncate: row.truncate !== false,
    rowNumbers: Boolean(row.rowNumbers),
    freezeTitle: Boolean(row.freezeTitle),
    freezeUntil: typeof row.freezeUntil === 'string' && row.freezeUntil.trim() ? row.freezeUntil.trim() : undefined,
    pageSize: normalizePageSize(row.pageSize),
    columnWidths: row.columnWidths as Record<string, number> | undefined,
    columnSummaries: row.columnSummaries as SavedView['columnSummaries'],
    columnViews: row.columnViews as SavedView['columnViews'],
    sandboxViews: row.sandboxViews as SavedView['sandboxViews'],
    rank: Number.isFinite(Number(row.rank)) ? Math.round(Number(row.rank)) : undefined,
    updatedAt: Number(row.updatedAt) || 0,
  })
}

const viewsPullByKey = new Map<string, Promise<boolean>>()
const pulledViewPaths = new Set<string>()
let pulledAllViews = false

export function hasPulledSavedViews(collectionPath: string) {
  const path = String(collectionPath ?? '').trim()
  return Boolean(path) && (pulledAllViews || pulledViewPaths.has(path))
}

function viewsPullKey(collectionPaths: readonly string[]) {
  return collectionPaths.map((path) => String(path ?? '').trim()).filter(Boolean).sort().join('\0') || '*'
}

export function noteLocalSavedViewsWrite(collectionPath: string) {
  const path = String(collectionPath ?? '').trim()
  if (!path) return
  bumpWriteSeq(path)
  for (const key of [...viewsPullByKey.keys()]) {
    if (key === '*' || key.split('\0').includes(path)) viewsPullByKey.delete(key)
  }
  invalidateListReads()
}

export async function pullSavedViews(
  collectionPaths: readonly string[] = [],
  opts?: { idle?: boolean; force?: boolean },
) {
  const key = viewsPullKey(collectionPaths)
  const pending = viewsPullByKey.get(key)
  if (pending && !opts?.force) return pending
  const request = pullSavedViewsNow(collectionPaths).finally(() => {
    if (viewsPullByKey.get(key) === request) viewsPullByKey.delete(key)
  })
  viewsPullByKey.set(key, request)
  return request
}

async function pullSavedViewsNow(collectionPaths: readonly string[] = []) {
  const startGen = workspaceGen
  const startWs = currentWorkspaceStorageId()
  const fetchPaths = [...new Set(collectionPaths.map((path) => String(path ?? '').trim()).filter(Boolean))]
  const startSeqByPath = new Map<string, number>()
  for (const p of fetchPaths) startSeqByPath.set(p, writeSeqByPath.get(p) ?? 0)
  for (const [p, seq] of writeSeqByPath) {
    if (!startSeqByPath.has(p)) startSeqByPath.set(p, seq)
  }
  try {
    const byPath = new Map<string, SavedView[]>()
    if (fetchPaths.length === 1) {
      const target = fetchPaths[0]!
      const data = await readJson<{ views?: SavedView[] }>(
        `/api/db/saved-views?path=${encodeURIComponent(target)}`,
      )
      byPath.set(target, Array.isArray(data.views) ? data.views.map((v) => normalizeSavedView(v)) : [])
    } else {
      const url = fetchPaths.length
        ? `/api/db/saved-views?paths=${encodeURIComponent(fetchPaths.join(','))}`
        : '/api/db/saved-views'
      const data = await readJson<{ viewsByPath?: Record<string, SavedView[]> }>(url)
      for (const [path, list] of Object.entries(data.viewsByPath ?? {})) {
        byPath.set(path, Array.isArray(list) ? list.map((v) => normalizeSavedView(v)) : [])
      }
    }
    // 切工作区后丢弃旧空间在飞响应，杜绝跨空间污染
    if (workspaceGen !== startGen || currentWorkspaceStorageId() !== startWs) return false
    let changed = false
    for (const path of new Set([...fetchPaths, ...byPath.keys()])) {
      const startedSeq = startSeqByPath.get(path) ?? 0
      if ((writeSeqByPath.get(path) ?? 0) !== startedSeq) continue
      pulledViewPaths.add(path)
      const incoming = byPath.get(path) ?? []
      const prevServer = serverViews.get(path) ?? []
      const ranked = rankListedViews(incoming, prevServer)
      if (JSON.stringify(prevServer) !== JSON.stringify(ranked)) {
        changed = true
        serverViews.set(path, ranked)
      }
    }
    if (!fetchPaths.length) pulledAllViews = true
    if (changed) emitViewsStoreChange()
    return changed
  } catch {
    return false
  }
}

export function upsertSavedView(collectionPath: string, view: SavedView) {
  const next = normalizeSavedView(view)
  const prev = serverViews.get(collectionPath) ?? []
  const idx = prev.findIndex((item) => item.id === next.id)
  const existing = idx >= 0 ? prev[idx] : undefined
  if (existing && (existing.revision ?? 0) > (next.revision ?? 0)) return
  const updated = idx >= 0 ? prev.map((item, i) => (i === idx ? next : item)) : [...prev, next]
  serverViews.set(collectionPath, updated)
  noteLocalSavedViewsWrite(collectionPath)
  emitViewsStoreChange()
}

export function localColumnWidthsKey(collectionPath: string, viewId: string) {
  return `fsdb.columnWidths:${workspaceStoragePrefix()}${collectionPath}:${viewId}`
}

export function loadLocalColumnWidths(collectionPath: string, viewId: string): Record<string, number> {
  if (!collectionPath || !viewId) return {}
  try {
    const raw = readStorageString(localColumnWidthsKey(collectionPath, viewId))
    if (!raw) return {}
    return normalizeColumnWidths(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

export function persistLocalColumnWidths(
  collectionPath: string,
  viewId: string,
  widths: Record<string, number>,
) {
  if (!collectionPath || !viewId) return
  try {
    const key = localColumnWidthsKey(collectionPath, viewId)
    const normalized = normalizeColumnWidths(widths)
    if (Object.keys(normalized).length) writeStorageString(key, JSON.stringify(normalized))
    else removeStorageKey(key)
  } catch {
    /* ignore */
  }
}

export function clearLocalColumnWidths(collectionPath: string, viewId: string) {
  if (!collectionPath || !viewId) return
  try {
    removeStorageKey(localColumnWidthsKey(collectionPath, viewId))
  } catch {
    /* ignore */
  }
}

export function collapsedGroupsKey(collectionPath: string, viewId: string, groupBy = '') {
  return `fsdb.collapsedGroups:${workspaceStoragePrefix()}${collectionPath}:${viewId}:${groupBy}`
}

export function loadCollapsedGroups(collectionPath: string, viewId: string, groupBy = ''): Record<string, boolean> {
  try {
    const raw = readStorageString(collapsedGroupsKey(collectionPath, viewId, groupBy))
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
    if (Object.keys(compact).length) writeStorageString(key, JSON.stringify(compact))
    else removeStorageKey(key)
  } catch {
    /* ignore */
  }
}

registerWorkspaceCache('view-storage', () => {
  workspaceGen += 1
  serverViews.clear()
  pendingOps.clear()
  writeSeqByPath.clear()
  routeViewFetchByKey.clear()
  clearCrumbCache()
  viewsPullByKey.clear()
  pulledViewPaths.clear()
  pulledAllViews = false
  resetStarredWorkspaceCache()
  emitViewsStoreChange()
})
