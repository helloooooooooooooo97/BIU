import type { CollectionInfo } from '@biu/type-file-system'
import {
  DATA_COLLECTION_PATH,
  EDITOR_BLOCKS_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  normalizeCollectionPath,
  tableModeFor,
} from './paths.ts'
import { normalizeSavedView, type SavedView } from './web/saved-view.ts'

const ALL_PREFIX = 'builtin-all:'
const MEMBER_PREFIX = 'builtin-member:'
export type DataScope = 'personal' | 'workspace' | 'shared'
/** 视图的逻辑域归属：'all' 为 /data 跨表聚合视图，'workspace' / 'personal' / 'shared' 为依附于 K+1 逻辑表的视图。 */
export type ViewDomain = DataScope | 'all'

export function viewDomainOf(
  view: {
    id?: string
    builtin?: boolean
    filters?: Record<string, string>
    ownerTable?: string
    scope?: string
    protection?: string
  } | null | undefined,
): ViewDomain {
  if (!view) return 'all'
  const id = String(view.id ?? '').trim()
  if (
    isBuiltinAllViewId(id) ||
    isBuiltinCatalogViewId(id) ||
    isBuiltinTagViewId(id) ||
    isBuiltinBlockKindViewId(id) ||
    isBuiltinMemberViewId(id)
  ) {
    return 'all'
  }
  const filterScope = view.filters?.$scope
  if (view.ownerTable === 'shared' || filterScope === 'shared') return 'shared'
  if (view.ownerTable === 'all') return 'all'
  if (filterScope === 'workspace' || filterScope === 'personal') return filterScope
  if (view.ownerTable === 'workspace') return 'workspace'
  if (view.ownerTable?.startsWith('account:')) return 'personal'
  if (view.scope === 'personal' || view.protection === 'personal') return 'personal'
  if (view.scope === 'workspace') return 'workspace'
  return 'all'
}
const SCOPE_NAME: Record<DataScope, string> = {
  personal: '个人',
  workspace: '空间',
  shared: '共享',
}

export function scopedCollectionName(table: TableRef, scope: DataScope) {
  return `${SCOPE_NAME[scope]}${collectionNoun(table)}`
}

export const BUILTIN_VIEW_SORT_FIELD = 'updatedAt'
export const BUILTIN_VIEW_SORT_DIR = 'desc' as const

function builtinViewLayout() {
  return {
    sortField: BUILTIN_VIEW_SORT_FIELD,
    sortDir: BUILTIN_VIEW_SORT_DIR,
    tree: false as const,
  }
}

export type TableRef = {
  path: string
  label?: string
  view?: { title?: string } | null
}

export function builtinCatalogViewId(collectionPath: string) {
  return `builtin:${normalizeCollectionPath(collectionPath)}`
}

const TAG_PREFIX = 'builtin-tag:'

const BLOCK_PREFIX = 'builtin-block:'

export function isBuiltinCatalogViewId(id: string) {
  return (
    id.startsWith('builtin:') &&
    !id.startsWith(ALL_PREFIX) &&
    !id.startsWith(TAG_PREFIX) &&
    !id.startsWith(BLOCK_PREFIX)
  )
}

export function builtinTagViewId(tagId: string) {
  return `${TAG_PREFIX}${String(tagId ?? '').trim()}`
}

export function isBuiltinTagViewId(id: string) {
  return id.startsWith(TAG_PREFIX)
}

export function tagIdFromViewId(id: string) {
  return isBuiltinTagViewId(id) ? id.slice(TAG_PREFIX.length) : ''
}

export function defaultTableViewId(ownerTable: string, collectionPath: string) {
  return `default:${ownerTable}:${normalizeCollectionPath(collectionPath)}`
}

export function parseDefaultTableViewId(id: string): { ownerTable: string; collectionPath: string } | null {
  if (!id.startsWith('default:')) return null
  const rest = id.slice('default:'.length)
  const split = rest.lastIndexOf(':/')
  if (split <= 0) return null
  const ownerTable = rest.slice(0, split).trim()
  const collectionPath = normalizeCollectionPath(rest.slice(split + 1))
  if (!ownerTable || !collectionPath || collectionPath === '/') return null
  return { ownerTable, collectionPath }
}

export function stubDefaultTableView(id: string, table?: TableRef): SavedView | null {
  const parsed = parseDefaultTableViewId(id)
  if (!parsed) return null
  const isWorkspace = parsed.ownerTable === 'workspace'
  const isShared = parsed.ownerTable === 'shared'
  const scope: DataScope = isWorkspace ? 'workspace' : isShared ? 'shared' : 'personal'
  const noun = collectionNoun(table ?? { path: parsed.collectionPath, label: parsed.collectionPath.replace(/^\//, '') })
  return normalizeSavedView({
    id,
    name: `${SCOPE_NAME[scope]}${noun}`,
    mode: 'table',
    ownerTable: parsed.ownerTable,
    scope: isWorkspace ? 'workspace' : 'personal',
    protection: isWorkspace ? 'public' : 'personal',
    ...builtinViewLayout(),
    filters: { $scope: scope },
    columns: [],
    groupBy: '',
    wrap: false,
    truncate: true,
    query: '',
    builtin: false,
  })
}

export function isNonPersonalView(view: { protection?: string; scope?: string; ownerTable?: string } | null | undefined): boolean {
  if (!view || view.ownerTable === 'all' || view.ownerTable === 'shared') return false
  const p = view.protection ?? (view.scope === 'personal' ? 'personal' : 'public')
  return p === 'public' || p === 'locked'
}

export function builtinAllViewId(collectionPath: string) {
  return `${ALL_PREFIX}${normalizeCollectionPath(collectionPath)}`
}

export function isBuiltinAllViewId(id: string) {
  return id.startsWith(ALL_PREFIX)
}

export function isBuiltinAllViewForCollection(id: string, collectionPath: string) {
  if (!isBuiltinAllViewId(id)) return false
  return normalizeCollectionPath(id.slice(ALL_PREFIX.length)) === normalizeCollectionPath(collectionPath)
}

export function isReadOnlyViewId(id: string) {
  return (
    isBuiltinAllViewId(id) ||
    isBuiltinCatalogViewId(id) ||
    isBuiltinTagViewId(id) ||
    isBuiltinBlockKindViewId(id) ||
    isBuiltinMemberViewId(id)
  )
}

const MEMBER_VIEWS = [
  { kind: 'member', name: '空间成员' },
  { kind: 'external', name: '外部成员' },
  { kind: 'guest', name: '临时访客' },
] as const

export function isBuiltinMemberViewId(id: string) {
  return id.startsWith(MEMBER_PREFIX)
}

export function stubBuiltinMemberView(id: string): SavedView | null {
  if (!isBuiltinMemberViewId(id)) return null
  const kind = id.slice(MEMBER_PREFIX.length)
  const found = MEMBER_VIEWS.find((item) => item.kind === kind)
  if (!found) return null
  return normalizeSavedView({
    id: `${MEMBER_PREFIX}${found.kind}`,
    name: found.name,
    mode: 'table',
    ...builtinViewLayout(),
    filters: { membershipKind: found.kind },
    columns: ['title', 'email', 'role', 'joinedAt'],
    builtin: true,
  })
}

export function builtinMemberViews() {
  return MEMBER_VIEWS.map((item) => stubBuiltinMemberView(`${MEMBER_PREFIX}${item.kind}`)!)
}

export function collectionNoun(table: TableRef) {
  const path = normalizeCollectionPath(table.path)
  const named = String(table.view?.title ?? table.label ?? '').trim()
  if (path === DATA_COLLECTION_PATH) return named && named !== 'data' ? named : '数据'
  return named || path.replace(/^\//, '') || '记录'
}

/** 分享/面包屑用：内置视图不在 saved-views 里，不能把路径 id 当名称。 */
export function displayNameForView(viewId: string, table: TableRef, storedName?: string) {
  const named = String(storedName ?? '').trim()
  if (named) return named
  const id = String(viewId ?? '').trim()
  if (isBuiltinAllViewId(id)) return builtinAllView(table).name
  if (isBuiltinCatalogViewId(id)) {
    const path = normalizeCollectionPath(id.slice('builtin:'.length))
    if (normalizeCollectionPath(table.path) === path) return collectionNoun(table)
    return collectionNoun({ path, label: path.replace(/^\//, '') })
  }
  if (isBuiltinTagViewId(id)) return stubBuiltinTagView(id)?.name || collectionNoun(table)
  if (isBuiltinBlockKindViewId(id)) return stubBuiltinBlockKindView(id)?.name || collectionNoun(table)
  if (isBuiltinMemberViewId(id)) return stubBuiltinMemberView(id)?.name || collectionNoun(table)
  return collectionNoun(table)
}

export function builtinAllGroupBy(collectionPath: string) {
  const path = normalizeCollectionPath(collectionPath)
  if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) return 'membershipKind'
  if (path === VIEWS_COLLECTION_PATH) return 'table'
  if (path === EDITOR_BLOCKS_COLLECTION_PATH) return 'blockKind'
  if (path === TAGS_COLLECTION_PATH) return ''
  return 'shareScope'
}

export function builtinAllView(table: TableRef): SavedView {
  const path = normalizeCollectionPath(table.path)
  return normalizeSavedView({
    id: builtinAllViewId(path),
    name: `全部${collectionNoun({ ...table, path })}`,
    mode: 'table',
    ...builtinViewLayout(),
    filters: {},
    columns: [],
    groupBy: builtinAllGroupBy(path),
    wrap: false,
    truncate: true,
    query: '',
    builtin: true,
  })
}

export function stubBuiltinAllView(id: string): SavedView | null {
  if (!isBuiltinAllViewId(id)) return null
  const path = normalizeCollectionPath(id.slice(ALL_PREFIX.length))
  return builtinAllView({ path, label: path.replace(/^\//, '') })
}

export function builtinCatalogViews(tables: CollectionInfo[]): SavedView[] {
  return tables
    .filter((table) => table.path && table.path !== '/' && table.path !== DATA_COLLECTION_PATH)
    .map((table) => {
      const path = normalizeCollectionPath(table.path)
      return normalizeSavedView({
        id: builtinCatalogViewId(path),
        name: table.view?.title ?? table.label ?? path.replace(/^\//, ''),
        mode: 'table',
        ...builtinViewLayout(),
        filters: { tablePath: path },
        columns: [],
        groupBy: '',
        wrap: false,
        truncate: true,
        query: '',
        builtin: true,
      })
    })
}

/** 工作区种子视图和后来保存的视图同一套：同 id 以已存为准，删掉的 id 不再插回去。 */
export function overlayListedViews(
  seeds: SavedView[],
  user: SavedView[],
  skipIds: Iterable<string> = [],
): SavedView[] {
  const skip = new Set([...skipIds].map((id) => String(id ?? '').trim()).filter(Boolean))
  const byId = new Map<string, SavedView>()
  for (const view of user) {
    const id = String(view?.id ?? '').trim()
    if (!id || skip.has(id)) continue
    byId.set(id, normalizeSavedView(view))
  }
  const out: SavedView[] = []
  const used = new Set<string>()
  for (const seed of seeds) {
    const id = String(seed.id ?? '').trim()
    if (!id || skip.has(id)) continue
    out.push(byId.get(id) ?? normalizeSavedView(seed))
    used.add(id)
  }
  for (const view of user) {
    const id = String(view?.id ?? '').trim()
    if (!id || skip.has(id) || used.has(id)) continue
    out.push(byId.get(id) ?? normalizeSavedView(view))
    used.add(id)
  }
  return out
}

function withoutRetiredBuiltinViews(user: SavedView[], retired: (id: string) => boolean) {
  return user.filter((view) => !retired(String(view.id ?? '').trim()))
}

export function mergeCatalogViews(tables: CollectionInfo[], user: SavedView[], skipIds: Iterable<string> = []): SavedView[] {
  const viewsTable = tables.find((table) => normalizeCollectionPath(table.path) === VIEWS_COLLECTION_PATH) ?? {
    path: VIEWS_COLLECTION_PATH,
    label: '视图',
    view: { title: '视图' },
  }
  return overlayListedViews(
    [builtinAllView(viewsTable)],
    withoutRetiredBuiltinViews(user, isBuiltinCatalogViewId),
    skipIds,
  )
}

export function mergeTableViews(table: TableRef | undefined, user: SavedView[], skipIds: Iterable<string> = []): SavedView[] {
  if (!table?.path || table.path === '/') return overlayListedViews([], user, skipIds)
  const path = normalizeCollectionPath(table.path)
  // K+1 业务集合不再注入顶层聚合视图（/data 是唯一聚合表）
  if (path !== DATA_COLLECTION_PATH && tableModeFor(path) === 'k-plus-1') {
    const concrete = user.filter((v) => !isBuiltinAllViewId(String(v?.id ?? '')) && v?.ownerTable !== 'all')
    return overlayListedViews([], concrete, skipIds)
  }
  const seeds = path === WORKSPACE_MEMBERS_COLLECTION_PATH
    ? [builtinAllView(table), ...builtinMemberViews()]
    : [builtinAllView(table)]
  return overlayListedViews(seeds, user, skipIds)
}

export type BlockKindRef = { kind: string; label: string }

export function builtinBlockKindViewId(kind: string) {
  return `${BLOCK_PREFIX}${String(kind ?? '').trim()}`
}

export function isBuiltinBlockKindViewId(id: string) {
  return id.startsWith(BLOCK_PREFIX)
}

export function blockKindFromViewId(id: string) {
  return isBuiltinBlockKindViewId(id) ? id.slice(BLOCK_PREFIX.length) : ''
}

export function builtinBlockKindView(block: BlockKindRef): SavedView {
  const kind = String(block.kind ?? '').trim()
  return normalizeSavedView({
    id: builtinBlockKindViewId(kind),
    name: String(block.label ?? '').trim() || kind,
    mode: 'table',
    ...builtinViewLayout(),
    filters: { blockKind: kind },
    columns: [],
    groupBy: '',
    wrap: false,
    truncate: true,
    query: '',
    builtin: true,
  })
}

export function stubBuiltinBlockKindView(id: string): SavedView | null {
  if (!isBuiltinBlockKindViewId(id)) return null
  const kind = blockKindFromViewId(id)
  if (!kind) return null
  return builtinBlockKindView({ kind, label: kind })
}

export function stubAnyBuiltinView(id: string): SavedView | null {
  return stubBuiltinMemberView(id)
    ?? stubBuiltinBlockKindView(id)
    ?? stubBuiltinCatalogView(id)
    ?? stubBuiltinTagView(id)
    ?? stubBuiltinAllView(id)
}

/**
 * 视图自己的扁平筛选（含 K+1 逻辑表强绑定）：
 * - 聚合视图（ownerTable='all' 或 builtin-all）不锁 $scope，可跨表筛选所有我可见的数据；
 * - 依附于空间/个人/共享逻辑表的视图始终锁定对应 $scope，即使筛选条件为空也绝不越表读取。
 */
export function catalogLockFilters(
  viewId: string | null | undefined,
  listed: Array<{ id: string; builtin?: boolean; filters?: Record<string, string>; ownerTable?: string; scope?: string; protection?: string }> = [],
  viewerAccountId = '',
): Record<string, string> {
  const key = String(viewId ?? '').trim()
  if (!key) return {}
  const current = listed.find((view) => view.id === key)
  if (current) {
    const base = { ...(current.filters ?? {}) }
    const ot = current.ownerTable?.trim()
    if (ot === 'shared') {
      base.$scope = 'shared'
      delete base.$ownerTable
      return base
    }
    if (ot && ot.startsWith('account:') && viewerAccountId && ot !== `account:${viewerAccountId}`) {
      base.$scope = 'shared'
      base.$ownerTable = ot
      return base
    }
    const domain = viewDomainOf(current)
    if (domain === 'all') {
      delete base.$scope
      return base
    }
    base.$scope = domain
    return base
  }
  const stub = stubDefaultTableView(key) ?? stubAnyBuiltinView(key)
  if (!stub) return {}
  const base = { ...(stub.filters ?? {}) }
  const ot = stub.ownerTable?.trim()
  if (ot && ot.startsWith('account:')) {
    if (viewerAccountId && ot !== `account:${viewerAccountId}`) {
      base.$scope = 'shared'
      base.$ownerTable = ot
    } else {
      base.$scope = 'personal'
    }
    return base
  }
  if (ot === 'workspace') {
    base.$scope = 'workspace'
    return base
  }
  return base
}

/** /editor-blocks：只内置「全部组件」。 */
export function mergePageBlockViews(
  table: TableRef | undefined,
  user: SavedView[],
  skipIds: Iterable<string> = [],
): SavedView[] {
  if (!table?.path || table.path === '/') {
    return overlayListedViews([], withoutRetiredBuiltinViews(user, isBuiltinBlockKindViewId), skipIds)
  }
  return overlayListedViews(
    [builtinAllView(table)],
    withoutRetiredBuiltinViews(user, isBuiltinBlockKindViewId),
    skipIds,
  )
}

export type TagRef = { id: string; label: string }

export function builtinTagView(tag: TagRef): SavedView {
  const id = String(tag.id ?? '').trim()
  return normalizeSavedView({
    id: builtinTagViewId(id),
    name: tag.label || id,
    mode: 'table',
    ...builtinViewLayout(),
    filters: { tag: id },
    columns: ['title', 'table'],
    groupBy: '',
    wrap: false,
    truncate: true,
    query: '',
    builtin: true,
  })
}

export function stubBuiltinTagView(id: string): SavedView | null {
  if (!isBuiltinTagViewId(id)) return null
  const tagId = tagIdFromViewId(id)
  if (!tagId) return null
  return builtinTagView({ id: tagId, label: tagId })
}

export function stampRecordId(collection: string, recordId: string) {
  const table = normalizeCollectionPath(collection).replace(/^\//, '')
  const id = String(recordId ?? '').trim()
  if (!table || !id) return ''
  return `${table}::${id}`
}

/** 收集表里的一行：打开原始表里的那条记录。 */
export function stampRowOpenTarget(row: { id?: unknown; tablePath?: unknown; sourceId?: unknown }) {
  const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
  const recordId = String(row.sourceId ?? '').trim()
  if (collection && collection !== '/' && recordId) return { collection, recordId }
  const raw = String(row.id ?? '').trim()
  const at = raw.indexOf('::')
  if (at > 0) {
    const table = raw.slice(0, at).trim()
    const source = raw.slice(at + 2).trim()
    if (table && source) return { collection: normalizeCollectionPath(`/${table}`), recordId: source }
  }
  return null
}

/** 路由里已经是 builtin: 时，即使本地还没合并登记表，也能先还原筛选。 */
export function stubBuiltinCatalogView(id: string): SavedView | null {
  if (!isBuiltinCatalogViewId(id)) return null
  const path = normalizeCollectionPath(id.slice('builtin:'.length))
  return normalizeSavedView({
    id: builtinCatalogViewId(path),
    name: path.replace(/^\//, '') || 'views',
    mode: 'table',
    ...builtinViewLayout(),
    filters: { tablePath: path },
    columns: [],
    groupBy: '',
    wrap: false,
    truncate: true,
    query: '',
    builtin: true,
  })
}

/** /views 表里的一行：打开时应跳到该视图对应表，而不是看视图记录自己的属性。 */
export function catalogRowOpenTarget(row: { tablePath?: unknown; viewId?: unknown }) {
  const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
  const viewId = String(row.viewId ?? '').trim()
  if (!collection || collection === '/' || !viewId) return null
  return { collection, viewId }
}
