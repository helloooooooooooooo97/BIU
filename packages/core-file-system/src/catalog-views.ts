import {
  DATA_COLLECTION_PATH,
  EDITOR_BLOCKS_COLLECTION_PATH,
  PAGES_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  normalizeCollectionPath,
} from './paths.ts'
import { SHARE_SCOPE_LABEL, type AuthzShareScope } from './shared/authz-labels.ts'
import { normalizeSavedView, type SavedView } from './shared/saved-view.ts'

export type DataScope = AuthzShareScope

/** 视图的逻辑域归属：默认 'all'（单逻辑表展示全部我可见数据），或通过 filters.$scope 筛选 'workspace' / 'personal' / 'shared'。 */
export type ViewDomain = DataScope | 'all'

export function viewDomainOf(
  view: {
    id?: string
    filters?: Record<string, string>
  } | null | undefined,
): ViewDomain {
  if (!view) return 'all'
  const filterScope = view.filters?.$scope
  if (filterScope === 'shared' || filterScope === 'workspace' || filterScope === 'personal') {
    return filterScope
  }
  return 'all'
}

export function scopedCollectionName(table: TableRef, scope: DataScope) {
  return `${SHARE_SCOPE_LABEL[scope]}${collectionNoun(table)}`
}

export const DEFAULT_VIEW_SORT_FIELD = 'updatedAt'
export const DEFAULT_VIEW_SORT_DIR = 'desc' as const

export type TableRef = {
  path: string
  label?: string
  view?: { title?: string } | null
}

export function collectionNoun(table: TableRef) {
  const path = normalizeCollectionPath(table.path)
  const named = String(table.view?.title ?? table.label ?? '').trim()
  if (path === DATA_COLLECTION_PATH) return named && named !== 'data' ? named : '数据'
  return named || path.replace(/^\//, '') || '记录'
}

export function displayNameForView(viewId: string, table: TableRef, storedName?: string) {
  const named = String(storedName ?? '').trim()
  if (named) return named
  if (String(viewId ?? '').trim() === 'all') return `全部${collectionNoun(table)}`
  return collectionNoun(table)
}

export function defaultGroupByForCollection(collectionPath: string) {
  const path = normalizeCollectionPath(collectionPath)
  if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) return 'membershipKind'
  if (path === VIEWS_COLLECTION_PATH) return 'table'
  if (path === EDITOR_BLOCKS_COLLECTION_PATH) return 'blockKind'
  if (path === TAGS_COLLECTION_PATH) return ''
  return 'shareScope'
}

export type SeedViewSpec = {
  view: SavedView
  accessMode: 'members' | 'private'
  memberDefaultRole: 'viewer' | 'editor'
}

const MEMBER_SEED_VIEWS = [
  { id: 'member', kind: 'member', name: '空间成员' },
  { id: 'external', kind: 'external', name: '外部成员' },
  { id: 'guest', kind: 'guest', name: '临时访客' },
] as const

/**
 * 集合首次初始化时写入数据库的普通默认种子视图（写库后与用户自建视图 100% 平权）。
 * - /pages：1 条「全部页面」（树形目录展开、展示序号、按分享权限分组、默认锁定、空间只读）
 * - 普通业务表：1 条「全部<表名>」（空间可编辑，未锁定）
 * - /workspace-members：3 条默认锁定成员视图（空间成员 / 外部成员 / 临时访客，开箱即用作为动态成员组）
 * - /data：1 条「全部数据」（空间可编辑，未锁定）
 */
export function defaultSeedViewsForCollection(table: TableRef): SeedViewSpec[] {
  const path = normalizeCollectionPath(table.path)
  if (!path || path === '/' || path === VIEWS_COLLECTION_PATH) return []
  if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
    return MEMBER_SEED_VIEWS.map((item, rank) => ({
      view: normalizeSavedView({
        id: item.id,
        name: item.name,
        mode: 'table',
        locked: true,
        revision: 1,
        sortField: DEFAULT_VIEW_SORT_FIELD,
        sortDir: DEFAULT_VIEW_SORT_DIR,
        filters: { membershipKind: item.kind },
        columns: ['title', 'email', 'role', 'joinedAt'],
        groupBy: '',
        tree: false,
        wrap: false,
        truncate: true,
        query: '',
        rank,
      }),
      accessMode: 'members',
      memberDefaultRole: 'viewer',
    }))
  }
  const isPages = path === PAGES_COLLECTION_PATH
  const name = path === DATA_COLLECTION_PATH ? '全部数据' : isPages ? '全部页面' : `全部${collectionNoun({ ...table, path })}`
  return [
    {
      view: normalizeSavedView({
        id: 'all',
        name,
        mode: 'table',
        locked: isPages,
        revision: 1,
        sortField: DEFAULT_VIEW_SORT_FIELD,
        sortDir: DEFAULT_VIEW_SORT_DIR,
        filters: {},
        columns: path === DATA_COLLECTION_PATH ? ['title', 'actions', 'table'] : [],
        groupBy: isPages ? 'shareScope' : defaultGroupByForCollection(path),
        tree: isPages,
        rowNumbers: isPages,
        wrap: false,
        truncate: true,
        query: '',
        rank: 0,
      }),
      accessMode: 'members',
      memberDefaultRole: isPages ? 'viewer' : 'editor',
    },
  ]
}

export const EPHEMERAL_VIEW_ID = '__ephemeral__'

/**
 * 零可见视图的只读兜底（外部协作者 / 访客无可见持久化视图时在内存中临时呈现，不落盘）。
 */
export function ephemeralFallbackView(table: TableRef): SavedView {
  const path = normalizeCollectionPath(table.path)
  return normalizeSavedView({
    id: EPHEMERAL_VIEW_ID,
    name: `全部${collectionNoun({ ...table, path })}`,
    mode: 'table',
    ephemeral: true,
    viewRole: 'viewer',
    locked: false,
    sortField: DEFAULT_VIEW_SORT_FIELD,
    sortDir: DEFAULT_VIEW_SORT_DIR,
    filters: {},
    columns: [],
    groupBy: defaultGroupByForCollection(path),
    tree: false,
    wrap: false,
    truncate: true,
    query: '',
    rank: 0,
  })
}

/** 视图自己的扁平筛选：单逻辑表下直接透传视图自身的 filters（含用户可选的 $scope 筛选）。 */
export function catalogLockFilters(
  viewId: string | null | undefined,
  listed: Array<{ id: string; filters?: Record<string, string> }> = [],
  _viewerAccountId = '',
): Record<string, string> {
  const key = String(viewId ?? '').trim()
  if (!key) return {}
  const current = listed.find((view) => view.id === key)
  if (!current) return {}
  return { ...(current.filters ?? {}) }
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

/** /views 表里的一行：打开时应跳到该视图对应表，而不是看视图记录自己的属性。 */
export function catalogRowOpenTarget(row: { tablePath?: unknown; viewId?: unknown }) {
  const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
  const viewId = String(row.viewId ?? '').trim()
  if (!collection || collection === '/' || !viewId) return null
  return { collection, viewId }
}
