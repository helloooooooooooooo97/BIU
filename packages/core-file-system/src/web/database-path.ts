import { buildAppPath, type AppRoute } from '@biu/web-session-view'
import {
  AGENTS_COLLECTION_PATH,
  COMMENTS_COLLECTION_PATH,
  DATA_COLLECTION_PATH,
  EDITOR_BLOCKS_COLLECTION_PATH,
  MCP_COLLECTION_PATH,
  NOTICES_COLLECTION_PATH,
  PAGE_BLOCKS_COLLECTION_PATH,
  PAGES_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
  SKILLS_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  DATA_MODULE_ID,
  isIndexCollection,
  isPersonalOnlyCollection,
  isSystemCollection,
  normalizeCollectionPath,
} from '../paths.ts'

export {
  AGENTS_COLLECTION_PATH,
  COMMENTS_COLLECTION_PATH,
  DATA_COLLECTION_PATH,
  DATA_MODULE_ID,
  EDITOR_BLOCKS_COLLECTION_PATH,
  MCP_COLLECTION_PATH,
  NOTICES_COLLECTION_PATH,
  PAGE_BLOCKS_COLLECTION_PATH,
  PAGES_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
  SKILLS_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  isIndexCollection,
  isPersonalOnlyCollection,
  isSystemCollection,
}

export const DATA_MODULE_PATH = '/database'
export const DATA_MODULE = { id: DATA_MODULE_ID, label: '数据', path: DATA_MODULE_PATH }

const ROUTE = { moduleId: DATA_MODULE_ID, path: DATA_MODULE_PATH } as const

export function databaseViewPath(collection: string, viewId?: string): string {
  return buildAppPath({
    kind: 'collection-view',
    ...ROUTE,
    collection,
    viewId,
  })
}

/** 默认「全部 xx」视图，数据页默认进这里。 */
export function databaseAllViewPath(collection: string): string {
  const defaultId = normalizeCollectionPath(collection) === WORKSPACE_MEMBERS_COLLECTION_PATH ? 'member' : 'all'
  return databaseViewPath(collection, defaultId)
}

export function databaseRecordPath(collection: string, recordId: string, viewId?: string): string {
  return buildAppPath({
    kind: 'record',
    ...ROUTE,
    collection,
    recordId,
    ...(viewId ? { viewId } : {}),
  } satisfies AppRoute)
}

/** 数据侧栏记录行按 parentId 嵌套：目前为页面。 */
export function isRecordTreeCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return normalized === PAGES_COLLECTION_PATH
}

/** 侧栏「核心数据」：代理、页面、组件。 */
const CORE_COLLECTION_ORDER = [
  AGENTS_COLLECTION_PATH,
  PAGES_COLLECTION_PATH,
  PAGE_BLOCKS_COLLECTION_PATH,
] as const

/** 侧栏「系统数据」：成员、视图、通知、回收站。 */
const SYSTEM_SIDEBAR_ORDER = [
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  NOTICES_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
] as const

/** 侧栏「公共数据」：标签、插件、技能、MCP（发布型公共资产）。 */
const PUBLIC_COLLECTION_ORDER = [
  TAGS_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
  SKILLS_COLLECTION_PATH,
  MCP_COLLECTION_PATH,
] as const

/** 全部数据「新建」菜单优先遵循后端下发的集合能力声明（caps.overviewCreate / caps.create / view.sidebar），缺失时回退路径规则。 */
export function isOverviewCreatableCollection(
  target: string | { path: string; caps?: { create?: boolean; overviewCreate?: boolean }; view?: { sidebar?: boolean } | null },
) {
  const path = typeof target === 'string' ? target : target.path
  const normalized = normalizeCollectionPath(path)
  if (normalized === DATA_COLLECTION_PATH || isIndexCollection(normalized) || isSystemCollection(normalized)) {
    return false
  }
  if (typeof target !== 'string') {
    if (typeof target.caps?.overviewCreate === 'boolean') return target.caps.overviewCreate
    if (target.caps?.create === false) return false
    if (target.view?.sidebar === false) return false
  }
  return normalized !== PLUGINS_COLLECTION_PATH && normalized !== COMMENTS_COLLECTION_PATH
}

export function dataSidebarKind(path: string): 'user' | 'system' | 'public' {
  const normalized = normalizeCollectionPath(path)
  if ((PUBLIC_COLLECTION_ORDER as readonly string[]).includes(normalized)) return 'public'
  if ((CORE_COLLECTION_ORDER as readonly string[]).includes(normalized)) return 'user'
  if ((SYSTEM_SIDEBAR_ORDER as readonly string[]).includes(normalized)) return 'system'
  if (isSystemCollection(normalized)) return 'system'
  return 'user'
}

export function sortDataCollections<T extends { path: string }>(tables: T[]): { user: T[]; system: T[]; public: T[] } {
  const user: T[] = []
  const system: T[] = []
  const pub: T[] = []
  for (const table of tables) {
    if (normalizeCollectionPath(table.path) === DATA_COLLECTION_PATH) continue
    const kind = dataSidebarKind(table.path)
    if (kind === 'public') pub.push(table)
    else if (kind === 'system') system.push(table)
    else user.push(table)
  }
  const rank = (order: readonly string[], path: string) => {
    const idx = order.indexOf(normalizeCollectionPath(path))
    return idx >= 0 ? idx : 50
  }
  user.sort((a, b) => rank(CORE_COLLECTION_ORDER, a.path) - rank(CORE_COLLECTION_ORDER, b.path) || a.path.localeCompare(b.path))
  system.sort((a, b) => rank(SYSTEM_SIDEBAR_ORDER, a.path) - rank(SYSTEM_SIDEBAR_ORDER, b.path) || a.path.localeCompare(b.path))
  pub.sort((a, b) => rank(PUBLIC_COLLECTION_ORDER, a.path) - rank(PUBLIC_COLLECTION_ORDER, b.path) || a.path.localeCompare(b.path))
  return { user, system, public: pub }
}

export function viewsCatalogSource(search: string): string {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('source')
  return raw ? normalizeCollectionPath(raw) : ''
}
