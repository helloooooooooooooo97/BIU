import { currentStorageWorkspaceId, readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import { builtinAllGroupBy, builtinAllViewId, stubBuiltinAllView, stubBuiltinBlockKindView, stubBuiltinCatalogView, stubBuiltinTagView, stubBuiltinScopeView, stubBuiltinOwnerView, stubBuiltinMemberView, isBuiltinAllViewForCollection, isBuiltinAllViewId, isNonPersonalView, parseBuiltinScopeViewId, viewDomainOf } from '../catalog-views.ts'
import {
  EDITOR_BLOCKS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  isIndexCollection,
} from './database-path.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { invalidateListReads, listCollection, readJson } from './db-client.ts'
import { savedViewRecordPath } from '../paths.ts'
import { emptyFilterGroup, looksLikeFilterTree, normalizeFilterGroup, parseSortsInput, resolveViewFilterTree } from '../query-logic.ts'
import { extractViewCreatorId, normalizeGroupConfig, normalizePageSize, normalizeSavedView, normalizeViewProtection, normalizeViewRole, normalizeViewScope, parseViewColumns, rankListedViews, viewIsFresher, type SavedView } from './saved-view.ts'
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

/** 按当前活动工作区隔离 localStorage 视图缓存，防止本机空间与云端空间、或不同空间之间互相污染默认视图。 */
function currentWorkspaceStorageId(): string {
  return currentStorageWorkspaceId()
}

function workspaceStoragePrefix(): string {
  const ws = currentWorkspaceStorageId()
  return ws ? `${ws}:` : ''
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

export function omitSavedViewIds(collectionPath: string, ids: Iterable<string>) {
  persistOmittedViewIds(collectionPath, [...loadOmittedViewIds(collectionPath), ...ids])
}

export function reviveSavedViewIds(collectionPath: string, ids: Iterable<string>) {
  const drop = new Set([...ids].map((id) => String(id ?? '').trim()))
  persistOmittedViewIds(
    collectionPath,
    loadOmittedViewIds(collectionPath).filter((id) => !drop.has(id)),
  )
}

export function activeViewStorageKey(collectionPath: string) {
  return `fsdb.activeView:${workspaceStoragePrefix()}${collectionPath}`
}

const memoryViews = new Map<string, SavedView[]>()

export function rememberViews(collectionPath: string, views: SavedView[]) {
  memoryViews.set(collectionPath, views.map((view) => normalizeSavedView(view)))
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
  return memoryViews.get(collectionPath) ?? []
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
  const omitted = new Set(loadOmittedViewIds(collectionPath))
  const listed = loadViews(collectionPath).filter((item) => !omitted.has(item.id))
  const allId = builtinAllViewId(collectionPath)
  const fallback = omitted.has(allId) ? null : stubBuiltinAllView(allId)
  const route = String(routeViewId ?? '').trim()
  const want = route && !omitted.has(route) ? route : ''
  const preferred =
    (want
      ? listed.find((item) => item.id === want) ??
        stubBuiltinOwnerView(want) ??
        stubBuiltinScopeView(want, listed) ??
        stubBuiltinMemberView(want) ??
        stubBuiltinCatalogView(want) ??
        stubBuiltinTagView(want) ??
        stubBuiltinBlockKindView(want) ??
        (isBuiltinAllViewForCollection(want, collectionPath) ? stubBuiltinAllView(want) : null)
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
  const allId = builtinAllViewId(collectionPath)
  return omitted.has(allId) ? '' : allId
}

/** 水合时列表可能还没有内置块类型视图；URL 上的 builtin-block: 仍用 stub 还原，不能退回「全部」。 */
export function pickViewForRoute(listed: SavedView[], collectionPath: string, routeViewId?: string) {
  const route = String(routeViewId ?? '').trim()
  if (route) {
    const hit = listed.find((item) => item.id === route)
    if (hit) return hit
    // 具体多维表（空间 / 个人）已下发真实视图时，自动把旧/兜底 builtin-scope: 路由升级为真实可持久化视图
    const parsedScope = parseBuiltinScopeViewId(route)
    if (parsedScope && (parsedScope.scope === 'workspace' || parsedScope.scope === 'personal')) {
      const concrete = listed.filter(
        (item) =>
          !isBuiltinAllViewId(item.id) &&
          !item.builtin &&
          (parsedScope.scope === 'workspace'
            ? item.ownerTable === 'workspace' || (!item.ownerTable && viewDomainOf(item) === 'workspace')
            : Boolean(item.ownerTable?.startsWith('account:')) || viewDomainOf(item) === 'personal'),
      )
      const preferred = concrete.find((item) => isNonPersonalView(item)) ?? concrete[0]
      if (preferred) return preferred
    }
    if (isOmittedViewId(collectionPath, route)) {
      return listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ?? listed[0] ?? null
    }
    return viewForPath(collectionPath, route)
  }
  return listed.find((item) => item.id === loadActiveViewId(collectionPath, listed)) ?? listed[0] ?? null
}

/** 冷 origin 上 URL 里的已存视图不在 localStorage；内置 stub 不用拉。 */
export function routeViewNeedsFetch(collectionPath: string, routeViewId?: string) {
  const id = String(routeViewId ?? '').trim()
  if (!id) return false
  if (isOmittedViewId(collectionPath, id)) return false
  if (stubBuiltinAllView(id) || stubBuiltinBlockKindView(id) || stubBuiltinCatalogView(id) || stubBuiltinTagView(id) || stubBuiltinMemberView(id) || stubBuiltinOwnerView(id) || stubBuiltinScopeView(id)) {
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

export type SavedViewsPatch = { upsert?: SavedView[]; remove?: string[] }

export function viewPatchKey(view: SavedView) {
  return JSON.stringify(normalizeSavedView(view))
}

/** 推给后端的载荷：带上本地修改时间，并显式序列化已清空的可选字段为 null / {}，后端据此清理旧值并丢弃旧快照。 */
function viewWirePayload(view: SavedView) {
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

/** 按差异推视图：只发这一个窗口真正改动的条目，避免把别的窗口新建的视图整份冲掉。 */
export async function pushSavedViewsPatch(collectionPath: string, patch: SavedViewsPatch): Promise<SavedViewsWriteResult> {
  const upsert = patch.upsert ?? []
  const remove = patch.remove ?? []
  if (!upsert.length && !remove.length) return 'skipped'
  try {
    const res = await apiFetch('/api/db/saved-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: collectionPath, upsert: upsert.map(viewWirePayload), remove }),
    })
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
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
  const filterTree = parseViewFilterTree(row.filterTree) ?? (looksLikeFilterTree(parseMaybeJson(row.filters)) ? normalizeFilterGroup(parseMaybeJson(row.filters)) : undefined)
  const scope = normalizeViewScope(row.scope)
  const ownerTable = typeof row.ownerTable === 'string' && row.ownerTable.trim() ? row.ownerTable.trim() : undefined
  const protection = normalizeViewProtection(row.protection, scope, ownerTable)
  return normalizeSavedView({
    id,
    name: String(row.title ?? id),
    mode: String(row.mode ?? 'table') as SavedView['mode'],
    scope: ownerTable === 'all' ? 'personal' : scope,
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
  try {
    const fetchPaths = [...new Set(collectionPaths.map((path) => String(path ?? '').trim()).filter(Boolean))]
    const pages = fetchPaths.length
      ? await Promise.all(fetchPaths.map((tablePath) => listAllSavedViewRows(tablePath)))
      : [await listAllSavedViewRows()]
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
      pulledViewPaths.add(path)
      const views = byPath.get(path) ?? []
      const previous = memoryViews.get(path) ?? loadViews(path)
      const ranked = rankListedViews(
        mergeSavedViewLists(previous, views.map((view) => withViewDisplay(path, view)), loadOmittedViewIds(path)),
        previous,
      )
      if (JSON.stringify(previous) !== JSON.stringify(ranked)) changed = true
      rememberViews(path, ranked)
    }
    if (!fetchPaths.length) pulledAllViews = true
    return changed
  } catch {
    return false
  }
}

export function upsertSavedView(collectionPath: string, view: SavedView) {
  const next = normalizeSavedView(view)
  reviveSavedViewIds(collectionPath, [next.id])
  const stored = loadViews(collectionPath).filter((item) => item.id !== next.id)
  stored.push(next)
  rememberViews(collectionPath, stored)
  noteLocalSavedViewsWrite(collectionPath)
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
  memoryViews.clear()
  clearCrumbCache()
  viewsPullByKey.clear()
  pulledViewPaths.clear()
  pulledAllViews = false
  resetStarredWorkspaceCache()
})
