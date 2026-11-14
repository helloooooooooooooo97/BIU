import { buildAppPath, type AppRoute } from '@biu/web-session-view'
import { builtinAllViewId } from '../catalog-views.ts'
import { AGENTS_COLLECTION_PATH, normalizeCollectionPath } from '../paths.ts'

export const DATA_MODULE_ID = 'database'
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

/** 内置「全部 xx」视图，数据页默认进这里。 */
export function databaseAllViewPath(collection: string): string {
  return databaseViewPath(collection, builtinAllViewId(collection))
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

export const DATA_COLLECTION_PATH = '/data'
export const VIEWS_COLLECTION_PATH = '/views'
export const TAGS_COLLECTION_PATH = '/tags'
export const NOTICES_COLLECTION_PATH = '/notices'
export const EDITOR_BLOCKS_COLLECTION_PATH = '/editor-blocks'
export const PAGE_BLOCKS_COLLECTION_PATH = EDITOR_BLOCKS_COLLECTION_PATH
export const PAGES_COLLECTION_PATH = '/pages'
export const TASKS_COLLECTION_PATH = '/tasks'
export const MCP_COLLECTION_PATH = '/mcp'
export const SKILLS_COLLECTION_PATH = '/skills'
export const PLUGINS_COLLECTION_PATH = '/plugins'
export const TRASH_COLLECTION_PATH = '/trash'
export const WORKSPACE_MEMBERS_COLLECTION_PATH = '/workspace-members'

/** 数据侧栏记录行按 parentId 嵌套：只有页面和任务。 */
export function isRecordTreeCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return normalized === PAGES_COLLECTION_PATH || normalized === TASKS_COLLECTION_PATH
}

const SYSTEM_COLLECTION_ORDER = [
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  NOTICES_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
] as const

/** 侧栏「核心数据」：代理、任务、页面、标签。 */
const CORE_COLLECTION_ORDER = [AGENTS_COLLECTION_PATH, TASKS_COLLECTION_PATH, PAGES_COLLECTION_PATH, TAGS_COLLECTION_PATH] as const

/** 侧栏「能力数据」：MCP、技能、组件、视图。插件表若还在也放这里。 */
const CAPABILITY_COLLECTION_ORDER = [
  MCP_COLLECTION_PATH,
  SKILLS_COLLECTION_PATH,
  PAGE_BLOCKS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
] as const

/** 侧栏「系统数据」：成员、通知、回收站。视图改到能力数据，但分享规则仍按系统表。 */
const SYSTEM_SIDEBAR_ORDER = [
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  NOTICES_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
] as const

/** 组件和标签仍是反查索引（每人一份、没有分享）；侧栏分组另走 dataSidebarKind。 */
const INDEX_COLLECTION_ORDER = [PAGE_BLOCKS_COLLECTION_PATH, TAGS_COLLECTION_PATH] as const

/** 成员、视图、通知、回收站由系统维护。会话事件不进文件系统。 */
export function isSystemCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return (SYSTEM_COLLECTION_ORDER as readonly string[]).includes(normalized)
}

export function isIndexCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return (INDEX_COLLECTION_ORDER as readonly string[]).includes(normalized)
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
