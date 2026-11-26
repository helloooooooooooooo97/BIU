import { currentStorageWorkspaceId, readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import {
  builtinAllGroupBy,
  builtinAllViewId,
  isBuiltinAllViewForCollection,
  isBuiltinAllViewId,
  isBuiltinCatalogViewId,
  isNonPersonalView,
  parseDefaultTableViewId,
  stubBuiltinAllView,
  stubBuiltinBlockKindView,
  stubBuiltinCatalogView,
  stubBuiltinMemberView,
  stubBuiltinTagView,
  stubDefaultTableView,
} from '../catalog-views.ts'
import {
  DATA_COLLECTION_PATH,
  EDITOR_BLOCKS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  isIndexCollection,
} from './database-path.ts'
import { normalizeCollectionPath, savedViewRecordPath, tableModeFor } from '../paths.ts'
import { invalidateListReads, listCollection, readJson } from './db-client.ts'
import { looksLikeFilterTree, normalizeFilterGroup, parseSortsInput, resolveViewFilterTree } from '../query-logic.ts'
import {
  extractViewCreatorId,
  normalizeGroupConfig,
  normalizePageSize,
  normalizeSavedView,
  normalizeViewProtection,
  normalizeViewRole,
  normalizeViewScope,
  parseViewColumns,
  rankListedViews,
  sortViewsByRank,
  viewIsFresher,
  type SavedView,
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

function isVirtualBuiltinSeedId(id: string): boolean {
  const key = String(id ?? '').trim()
  return Boolean(
    key &&
      (isBuiltinAllViewId(key) ||
        key.startsWith('__all__:') ||
        isBuiltinCatalogViewId(key) ||
        Boolean(stubBuiltinBlockKindView(key)) ||
        Boolean(stubBuiltinTagView(key)) ||
        Boolean(stubBuiltinMemberView(key))),
  )
}

export function omittedViewsKey(collectionPath: string) {
  return `fsdb.omittedViews:${workspaceStoragePrefix()}${collectionPath}`
}

export function loadOmittedViewIds(collectionPath: string): string[] {
  try {
    const raw = readStorageString(omittedViewsKey(collectionPath))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map((id) => String(id ?? '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

function persistOmittedViewIds(collectionPath: string, ids: Iterable<string>) {
  const next = [...new Set([...ids].map((id) => String(id ?? '').trim()).filter(Boolean))]
  try {
    if (next.length) writeStorageString(omittedViewsKey(collectionPath), JSON.stringify(next))
    else removeStorageKey(omittedViewsKey(collectionPath))
  } catch {
    /* ignore */
  }
}

/** 仅对虚拟内置种子视图（如 builtin-all:*）记录本地隐藏；普通数据库视图的删除以服务端权威列表为准，不再写入永久黑名单。 */
export function omitSavedViewIds(collectionPath: string, ids: Iterable<string>) {
  const builtinOnly = [...ids].map((id) => String(id ?? '').trim()).filter(isVirtualBuiltinSeedId)
  if (!builtinOnly.length) return
  persistOmittedViewIds(collectionPath, [...loadOmittedViewIds(collectionPath), ...builtinOnly])
}

export function reviveSavedViewIds(collectionPath: string, ids: Iterable<string>) {
  const drop = new Set([...ids].map((id) => String(id ?? '').trim()))
  const existing = loadOmittedViewIds(collectionPath)
  const filtered = existing.filter((id) => !drop.has(id))
  if (filtered.length !== existing.length) persistOmittedViewIds(collectionPath, filtered)
}

export function activeViewStorageKey(collectionPath: string) {
  return `fsdb.activeView:${workspaceStoragePrefix()}${collectionPath}`
}

// ---------------------------------------------------------------------------
// 单一权威 ViewStore：serverViews（服务端权威快照） + pendingOps（本端在途增量）
// ---------------------------------------------------------------------------

export type PendingViewOp = {
  opId: number
  workspaceGen: number
  upsert?: SavedView[]
  remove?: string[]
}

let workspaceGen = 0
let viewsVersion = 0
let nextPendingOpId = 1
const viewListeners = new Set<() => void>()
const serverViews = new Map<string, SavedView[]>()
const pendingOps = new Map<string, PendingViewOp[]>()
const writeSeqByPath = new Map<string, number>()

function emitViewsStoreChange() {
  viewsVersion += 1
  for (const fn of viewListeners) fn()
}

export function subscribeViews(listener: () => void): () => void {
  viewListeners.add(listener)
  return () => {
    viewListeners.delete(listener)
  }
}

export function getViewsVersion(): number {
  return viewsVersion
}

export function getViewsWorkspaceGen(): number {
  return workspaceGen
}

export function hasPendingViewOps(collectionPath: string): boolean {
  return (pendingOps.get(collectionPath)?.length ?? 0) > 0
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
    for (const view of op.upsert ?? []) {
      const id = String(view.id ?? '').trim()
      if (!id) continue
      byId.set(id, normalizeSavedView(view))
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
  op: { upsert?: SavedView[]; remove?: string[] },
): number {
  const opId = nextPendingOpId++
  const entry: PendingViewOp = {
    opId,
    workspaceGen,
    upsert: op.upsert?.map((view) => normalizeSavedView(view)),
    remove: op.remove?.map((id) => String(id ?? '').trim()).filter(Boolean),
  }
  const list = pendingOps.get(collectionPath) ?? []
  pendingOps.set(collectionPath, [...list, entry])
  noteLocalSavedViewsWrite(collectionPath)
  emitViewsStoreChange()
  return opId
}

/** 结算已落盘的在途变更：优先采纳服务端响应返回的权威视图列表，避免二次拉取回弹覆盖。 */
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
    const omitted = new Set(loadOmittedViewIds(collectionPath))
    const normalized = serverAuthoritativeViews
      .map((view) => withViewDisplay(collectionPath, normalizeSavedView(view)))
      .filter((view) => !omitted.has(view.id))
    serverViews.set(collectionPath, rankListedViews(normalized, prevServer))
  } else if (op) {
    const applied = applyPendingOps(prevServer, [op]).map((view) => withViewDisplay(collectionPath, view))
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

/** 把这次写入的视图叠进已有列表。快照缺了的条目不能当成删除。 */
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
    if (prev && !viewIsFresher(next, prev)) {
      const patched = {
        ...prev,
        ...(!prev.createdBy && next.createdBy ? { createdBy: next.createdBy } : {}),
        ...(next.viewRole && next.viewRole !== prev.viewRole ? { viewRole: next.viewRole } : {}),
      }
      if (patched.createdBy !== prev.createdBy || patched.viewRole !== prev.viewRole) {
        byId.set(id, patched)
      }
      continue
    }
    byId.set(id, next)
  }
  return [...byId.values()]
}

export function loadViews(collectionPath: string): SavedView[] {
  const base = serverViews.get(collectionPath) ?? []
  const ops = pendingOps.get(collectionPath)
  if (!ops?.length) return base
  return applyPendingOps(base, ops)
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

export function isOmittedViewId(collectionPath: string, viewId: string) {
  const id = String(viewId ?? '').trim()
  return Boolean(id) && loadOmittedViewIds(collectionPath).includes(id)
}

export function viewForPath(collectionPath: string, routeViewId?: string): SavedView | null {
  const path = normalizeCollectionPath(collectionPath)
  const isKPlus1 = path !== DATA_COLLECTION_PATH && tableModeFor(path) === 'k-plus-1'
  const omitted = new Set(loadOmittedViewIds(collectionPath))
  const listed = loadViews(collectionPath).filter((item) => !omitted.has(item.id))
  const allId = builtinAllViewId(collectionPath)
  const fallback = isKPlus1 || omitted.has(allId) ? null : stubBuiltinAllView(allId)
  const route = String(routeViewId ?? '').trim()
  const want = route && !omitted.has(route) ? route : ''
  const preferred =
    (want
      ? listed.find((item) => item.id === want) ??
        stubDefaultTableView(want) ??
        stubBuiltinMemberView(want) ??
        stubBuiltinCatalogView(want) ??
        stubBuiltinTagView(want) ??
        stubBuiltinBlockKindView(want) ??
        (!isKPlus1 && isBuiltinAllViewForCollection(want, collectionPath) ? stubBuiltinAllView(want) : null)
      : undefined) ??
    listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ??
    fallback ??
    listed[0]
  return preferred ? withViewDisplay(collectionPath, normalizeSavedView(preferred)) : null
}

export function defaultViewId(collectionPath: string, routeViewId?: string) {
  const hit = viewForPath(collectionPath, routeViewId)
  if (hit) return hit.id
  const omitted = new Set(loadOmittedViewIds(collectionPath))
  const listed = loadViews(collectionPath).filter((item) => !omitted.has(item.id))
  if (listed[0]) return listed[0].id
  const path = normalizeCollectionPath(collectionPath)
  if (path !== DATA_COLLECTION_PATH && tableModeFor(path) === 'k-plus-1') return ''
  const allId = builtinAllViewId(collectionPath)
  return omitted.has(allId) ? '' : allId
}

/** 水合时列表可能还没有内置块类型视图；URL 上的 builtin-block: 仍用 stub 还原，不能退回「全部」。 */
export function pickViewForRoute(listed: SavedView[], collectionPath: string, routeViewId?: string) {
  const path = normalizeCollectionPath(collectionPath)
  const isKPlus1 = path !== DATA_COLLECTION_PATH && tableModeFor(path) === 'k-plus-1'
  const route = String(routeViewId ?? '').trim()
  if (route) {
    const hit = listed.find((item) => item.id === route)
    if (hit) return hit
    // 如果路由点名具体表默认视图（如 default:account:97:/agents），优先匹配该表的真实视图，否则临时 stub 防止误跳空间表
    const parsedDefault = parseDefaultTableViewId(route)
    if (parsedDefault) {
      const sameTable = listed.filter((item) => item.ownerTable === parsedDefault.ownerTable)
      const preferred = sameTable.find((item) => isNonPersonalView(item)) ?? sameTable[0]
      if (preferred) return preferred
      return stubDefaultTableView(route)
    }
    // K+1 业务集合不再有聚合视图：旧 URL（builtin-all / builtin-scope 等）自动落回空间表或首个真实视图
    if (isKPlus1 && listed.length > 0) {
      const wsDefault = listed.find((item) => item.ownerTable === 'workspace' && isNonPersonalView(item))
      return wsDefault ?? listed.find((item) => isNonPersonalView(item)) ?? listed[0] ?? null
    }
    if (isOmittedViewId(collectionPath, route)) {
      return listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ?? listed[0] ?? null
    }
    return viewForPath(collectionPath, route)
  }
  return listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ?? listed[0] ?? null
}

/** 冷 origin 上 URL 里的已存视图不在缓存里；内置 stub 不用拉。 */
export function routeViewNeedsFetch(collectionPath: string, routeViewId?: string) {
  const id = String(routeViewId ?? '').trim()
  if (!id) return false
  if (isOmittedViewId(collectionPath, id)) return false
  if (
    stubBuiltinAllView(id) ||
    stubBuiltinBlockKindView(id) ||
    stubBuiltinCatalogView(id) ||
    stubBuiltinTagView(id) ||
    stubBuiltinMemberView(id)
  ) {
    return false
  }
  return !loadViews(collectionPath).some((view) => view.id === id)
}

const routeViewFetchByKey = new Map<string, Promise<SavedView | null>>()

export async function fetchSavedView(collectionPath: string, viewId: string): Promise<SavedView | null> {
  const id = String(viewId ?? '').trim()
  if (!id) return null
  const hit = loadViews(collectionPath).find((view) => view.id === id)
  if (hit) return withViewDisplay(collectionPath, hit)
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
  const path = savedViewRecordPath(collectionPath, viewId)
  if (path) {
    try {
      const data = await readJson<{ value?: Parameters<typeof savedViewFromRecord>[0] }>(
        `/api/db/read?path=${encodeURIComponent(path)}`,
      )
      if (workspaceGen !== startGen || currentWorkspaceStorageId() !== startWs) return null
      const view = data.value ? savedViewFromRecord(data.value) : null
      if (view && view.id === viewId) {
        upsertSavedView(collectionPath, view)
        return withViewDisplay(collectionPath, view)
      }
    } catch {
      /* 单条读失败就停，不拉整表视图挡首屏 */
    }
  }
  if (workspaceGen !== startGen || currentWorkspaceStorageId() !== startWs) return null
  const listed = loadViews(collectionPath).find((view) => view.id === viewId)
  return listed ? withViewDisplay(collectionPath, listed) : null
}

export type SavedViewsPatch = { upsert?: SavedView[]; remove?: string[]; baseUpdatedAtById?: Record<string, number> }

export function viewPatchKey(view: SavedView) {
  return JSON.stringify(normalizeSavedView(view))
}

/** 推给后端的载荷：带上 baseUpdatedAt 与本地修改时间，并显式序列化已清空的可选字段为 null / {}。 */
function viewWirePayload(view: SavedView, baseUpdatedAt?: number) {
  const normalized = normalizeSavedView(view)
  return {
    ...normalized,
    filterTree: resolveViewFilterTree(normalized),
    groupConfig: normalized.groupConfig ?? null,
    freezeUntil: normalized.freezeUntil ?? null,
    columnWidths: normalized.columnWidths ?? {},
    columnSummaries: normalized.columnSummaries ?? {},
    columnViews: normalized.columnViews ?? {},
    sandboxViews: normalized.sandboxViews ?? [],
    updatedAt: Number(normalized.updatedAt) || 0,
    ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
  }
}

let lastViewStamp = 0

/** 本地改了哪些视图就打个单调递增时间戳，同一毫秒内连续修改或切窗口时旧快照不会盖掉刚做的修改。 */
export function stampSavedView(view: SavedView): SavedView {
  const now = Date.now()
  const next = Math.max(now, lastViewStamp + 1, (Number(view.updatedAt) || 0) + 1)
  lastViewStamp = next
  return { ...view, updatedAt: next }
}

export type SavedViewsWriteResult = 'skipped' | 'ok' | 'failed'

export type SavedViewsMutationOutcome = {
  status: SavedViewsWriteResult
  views?: SavedView[]
  skipped?: string[]
}

/** 按差异推视图并解析服务端返回的权威视图列表。 */
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
        upsert: upsert.map((view) => viewWirePayload(view, patch.baseUpdatedAtById?.[view.id])),
        remove,
      }),
    })
    if (workspaceGen !== startGen || currentWorkspaceStorageId() !== startWs) {
      return { status: 'failed' }
    }
    if (!res.ok) return { status: 'failed' }
    let views: SavedView[] | undefined
    let skipped: string[] | undefined
    try {
      const text = await res.text()
      if (text && text.trim().startsWith('{')) {
        const parsed = JSON.parse(text) as { views?: unknown; skipped?: unknown }
        if (Array.isArray(parsed.views)) {
          views = parsed.views
            .filter((item): item is SavedView => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
            .map((item) => normalizeSavedView(item))
        }
        if (Array.isArray(parsed.skipped)) {
          skipped = parsed.skipped.map(String).filter(Boolean)
        }
      }
    } catch {
      /* 兼容返回纯文本 "ok" 的响应 */
    }
    return { status: 'ok', views, skipped }
  } catch {
    return { status: 'failed' }
  }
}

/** 按差异推视图：只发这一个窗口真正改动的条目，避免把别的窗口新建的视图整份冲掉。 */
export async function pushSavedViewsPatch(collectionPath: string, patch: SavedViewsPatch): Promise<SavedViewsWriteResult> {
  const outcome = await pushSavedViewsMutation(collectionPath, patch)
  return outcome.status
}

/** 两份视图列表的差异：新增/改了什么、删了哪些 id。 */
export function diffSavedViews(prev: SavedView[], next: SavedView[]): SavedViewsPatch {
  const before = new Map(prev.map((view) => [view.id, view]))
  const upsert: SavedView[] = []
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

function writableSavedView(view: SavedView) {
  return Boolean(String(view.id ?? '').trim())
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
      if (key.startsWith('$') && key !== '$scope' && key !== '$ownerTable') continue
      out[key] = String(item)
    }
    return out
  }
  return {}
}

export function savedViewFromRecord(row: Record<string, unknown>): SavedView | null {
  const id = String(row.viewId ?? '').trim()
  if (!id) return null
  const sortDir = row.sortDir === 'desc' ? 'desc' : 'asc'
  const sortField = String(row.sortField ?? 'title')
  const filters = parseViewFilters(row.filters)
  const filterTree =
    parseViewFilterTree(row.filterTree) ??
    (looksLikeFilterTree(parseMaybeJson(row.filters)) ? normalizeFilterGroup(parseMaybeJson(row.filters)) : undefined)
  const scope = normalizeViewScope(row.scope)
  const ownerTable = typeof row.ownerTable === 'string' && row.ownerTable.trim() ? row.ownerTable.trim() : undefined
  const protection = normalizeViewProtection(row.protection, scope, ownerTable)
  return normalizeSavedView({
    id,
    name: String(row.title ?? id),
    mode: String(row.mode ?? 'table') as SavedView['mode'],
    scope: protection === 'personal' ? 'personal' : (scope ?? 'workspace'),
    protection,
    ownerTable,
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
    builtin: false,
    rank: Number.isFinite(Number(row.rank)) ? Math.round(Number(row.rank)) : undefined,
    updatedAt: Number(row.updatedAt) || 0,
  })
}

const viewsPullByKey = new Map<string, Promise<boolean>>()
const pulledViewPaths = new Set<string>()
let pulledAllViews = false
const VIEWS_PULL_LIMIT = 200

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

async function listAllSavedViewRows(tablePath?: string) {
  const items: Awaited<ReturnType<typeof listCollection>>['items'] = []
  let offset = 0
  for (;;) {
    const page = await listCollection({
      path: VIEWS_COLLECTION_PATH,
      limit: VIEWS_PULL_LIMIT,
      offset,
      fresh: true,
      ...(tablePath ? { filters: { tablePath } } : {}),
    })
    items.push(...page.items)
    if (page.items.length < VIEWS_PULL_LIMIT || (offset += page.items.length) >= 4000) break
  }
  return items
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
    const pages = fetchPaths.length
      ? await Promise.all(fetchPaths.map((tablePath) => listAllSavedViewRows(tablePath)))
      : [await listAllSavedViewRows()]
    // 切工作区后丢弃旧空间在飞响应，杜绝跨空间污染
    if (workspaceGen !== startGen || currentWorkspaceStorageId() !== startWs) return false
    const byPath = new Map<string, SavedView[]>()
    for (const row of pages.flat()) {
      const tablePath = String(row.tablePath ?? '').trim()
      const view = savedViewFromRecord(row)
      if (!tablePath || !view) continue
      const list = byPath.get(tablePath) ?? []
      list.push(view)
      byPath.set(tablePath, list)
    }
    let changed = false
    for (const path of new Set([...fetchPaths, ...byPath.keys()])) {
      // 拉取在途期间若本端发生过写入，跳过用旧快照覆写 serverViews
      const startedSeq = startSeqByPath.get(path) ?? 0
      if ((writeSeqByPath.get(path) ?? 0) !== startedSeq) continue
      pulledViewPaths.add(path)
      const omitted = new Set(loadOmittedViewIds(path))
      const incoming = (byPath.get(path) ?? [])
        .map((view) => withViewDisplay(path, view))
        .filter((view) => !omitted.has(view.id))
      const prevServer = serverViews.get(path) ?? []
      // 权威覆盖 serverViews：其他端/Agent 删除的视图直接移除；本端未落盘的 pendingOps 由 loadViews 自动叠加保护
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
  reviveSavedViewIds(collectionPath, [next.id])
  const prev = serverViews.get(collectionPath) ?? []
  const idx = prev.findIndex((item) => item.id === next.id)
  const existing = idx >= 0 ? prev[idx] : undefined
  if (existing && !viewIsFresher(next, existing)) return
  const updated = idx >= 0 ? prev.map((item, i) => (i === idx ? next : item)) : [...prev, next]
  serverViews.set(collectionPath, updated)
  noteLocalSavedViewsWrite(collectionPath)
  emitViewsStoreChange()
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

/** 仅修正索引/系统内置视图的默认分组约束，不再叠加 localStorage 覆盖。 */
export function withViewDisplay(collectionPath: string, view: SavedView): SavedView {
  const path = normalizeCollectionPath(collectionPath)
  const forcedGroup =
    isIndexCollection(collectionPath) && isBuiltinAllViewId(view.id)
      ? path === EDITOR_BLOCKS_COLLECTION_PATH
        ? !view.groupBy || view.groupBy === 'shareScope'
          ? builtinAllGroupBy(collectionPath)
          : undefined
        : ''
      : path === WORKSPACE_MEMBERS_COLLECTION_PATH &&
          isBuiltinAllViewId(view.id) &&
          (!view.groupBy || view.groupBy === 'shareScope')
        ? builtinAllGroupBy(collectionPath)
        : path === VIEWS_COLLECTION_PATH &&
            isBuiltinAllViewId(view.id) &&
            view.groupBy === 'shareScope'
          ? builtinAllGroupBy(collectionPath)
          : undefined
  return normalizeSavedView({
    ...view,
    ...(forcedGroup !== undefined ? { groupBy: forcedGroup } : {}),
  })
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
