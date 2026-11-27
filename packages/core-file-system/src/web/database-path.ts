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
  TASKS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  DATA_MODULE_ID,
  isIndexCollection,
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
  TASKS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  isIndexCollection,
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

/** 数据侧栏记录行按 parentId 嵌套：只有页面和任务。 */
export function isRecordTreeCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return normalized === PAGES_COLLECTION_PATH || normalized === TASKS_COLLECTION_PATH
}

/** 侧栏「核心数据」：代理、页面、标签、插件。 */
const CORE_COLLECTION_ORDER = [
  AGENTS_COLLECTION_PATH,
  PAGES_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
] as const

/** 侧栏「能力数据」：任务、MCP、技能、组件、视图。 */
const CAPABILITY_COLLECTION_ORDER = [
  TASKS_COLLECTION_PATH,
  MCP_COLLECTION_PATH,
  SKILLS_COLLECTION_PATH,
  PAGE_BLOCKS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
] as const

/** 侧栏「系统数据」：成员、通知、回收站。成员没有私人/共享列。 */
const SYSTEM_SIDEBAR_ORDER = [
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  NOTICES_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
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

export function dataSidebarKind(path: string): 'user' | 'index' | 'system' {
  const normalized = normalizeCollectionPath(path)
  if ((CORE_COLLECTION_ORDER as readonly string[]).includes(normalized)) return 'user'
  if ((CAPABILITY_COLLECTION_ORDER as readonly string[]).includes(normalized)) return 'index'
  if ((SYSTEM_SIDEBAR_ORDER as readonly string[]).includes(normalized)) return 'system'
  if (isSystemCollection(normalized)) return 'system'
  if (isIndexCollection(normalized)) return 'index'
  return 'user'
}

export function sortDataCollections<T extends { path: string }>(tables: T[]): { user: T[]; index: T[]; system: T[] } {
  const user: T[] = []
  const index: T[] = []
  const system: T[] = []
  for (const table of tables) {
    if (normalizeCollectionPath(table.path) === DATA_COLLECTION_PATH) continue
    const kind = dataSidebarKind(table.path)
    if (kind === 'system') system.push(table)
    else if (kind === 'index') index.push(table)
    else user.push(table)
  }
  const rank = (order: readonly string[], path: string) => {
    const idx = order.indexOf(normalizeCollectionPath(path))
    return idx >= 0 ? idx : 50
  }
  user.sort((a, b) => rank(CORE_COLLECTION_ORDER, a.path) - rank(CORE_COLLECTION_ORDER, b.path) || a.path.localeCompare(b.path))
  index.sort(
    (a, b) =>
      rank(CAPABILITY_COLLECTION_ORDER, a.path) - rank(CAPABILITY_COLLECTION_ORDER, b.path) || a.path.localeCompare(b.path),
  )
  system.sort((a, b) => rank(SYSTEM_SIDEBAR_ORDER, a.path) - rank(SYSTEM_SIDEBAR_ORDER, b.path) || a.path.localeCompare(b.path))
  return { user, index, system }
}

export function viewsCatalogSource(search: string): string {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('source')
  return raw ? normalizeCollectionPath(raw) : ''
}
