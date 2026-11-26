export const AGENTS_COLLECTION_PATH = '/agents'
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
export const COMMENTS_COLLECTION_PATH = '/comments'
export const TRASH_COLLECTION_PATH = '/trash'
export const WORKSPACE_MEMBERS_COLLECTION_PATH = '/workspace-members'
export const LEGACY_SESSIONS_COLLECTION_PATH = '/' + 'sessions'
export const DATA_MODULE_ID = 'database'

const SYSTEM_COLLECTION_ORDER = [
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  NOTICES_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
] as const

/** 组件和标签仍是反查索引（每人一份、没有分享）。 */
const INDEX_COLLECTION_ORDER = [PAGE_BLOCKS_COLLECTION_PATH, TAGS_COLLECTION_PATH] as const

export type CollectionTableMode = 'k-plus-1' | 'workspace-only' | 'personal-only' | 'derived'

const WORKSPACE_ONLY_COLLECTIONS = new Set<string>([
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
])

const PERSONAL_ONLY_COLLECTIONS = new Set<string>([
  NOTICES_COLLECTION_PATH,
])

const DERIVED_COLLECTIONS = new Set<string>([
  PAGE_BLOCKS_COLLECTION_PATH,
  COMMENTS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  DATA_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
])

/** 集合的逻辑表形态：workspace-only（仅空间表）、personal-only（仅个人表）、derived（派生跟随源记录）、k-plus-1（1 张空间表 + K 张个人表）。 */
export function tableModeFor(path: string, explicit?: CollectionTableMode): CollectionTableMode {
  if (explicit) return explicit
  const normalized = normalizeCollectionPath(path)
  if (WORKSPACE_ONLY_COLLECTIONS.has(normalized)) return 'workspace-only'
  if (PERSONAL_ONLY_COLLECTIONS.has(normalized)) return 'personal-only'
  if (DERIVED_COLLECTIONS.has(normalized)) return 'derived'
  return 'k-plus-1'
}

/** 成员、视图、通知、回收站由系统维护。会话事件不进文件系统。 */
export function isSystemCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return (SYSTEM_COLLECTION_ORDER as readonly string[]).includes(normalized)
}

export function isIndexCollection(path: string) {
  const normalized = normalizeCollectionPath(path)
  return (INDEX_COLLECTION_ORDER as readonly string[]).includes(normalized)
}

/** 集合路径：补前导斜杠、去掉尾斜杠。host 与 web 共用。旧 /sessions 表迁到 /agents。 */
export function normalizeCollectionPath(path: string) {
  const raw = String(path || '/').trim() || '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  const normalized = withSlash === '/' ? '/' : withSlash.replace(/\/+$/, '') || '/'
  if (normalized === LEGACY_SESSIONS_COLLECTION_PATH) return AGENTS_COLLECTION_PATH
  if (normalized.startsWith(`${LEGACY_SESSIONS_COLLECTION_PATH}/`)) {
    return `${AGENTS_COLLECTION_PATH}${normalized.slice(LEGACY_SESSIONS_COLLECTION_PATH.length)}`
  }
  return normalized
}

/** 第一段是表，其余原样当记录 id。组件 id 以 `/pages::` 开头，拼路径会出现 `//`，不能 filter 掉空段。 */
export function splitResourcePath(path: string): { collection: string; recordId?: string } | null {
  const normalized = normalizeCollectionPath(path)
  if (normalized === '/') return null
  const rest = normalized.slice(1)
  const slash = rest.indexOf('/')
  if (slash < 0) return { collection: `/${rest}` }
  const name = rest.slice(0, slash)
  if (!name) return null
  const recordId = rest.slice(slash + 1)
  return recordId ? { collection: `/${name}`, recordId } : { collection: `/${name}` }
}

export type DatabaseReveal = {
  collection: string
  recordId?: string
  viewId?: string
}

function resultPathOf(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ''
  const path = (result as { path?: unknown }).path
  return typeof path === 'string' ? path : ''
}

/** 工具路径：根目录不算；/<表> 切表，/<表>/<id> 切到该行。 */
export function databaseRevealFromPath(path: string): DatabaseReveal | null {
  return splitResourcePath(path)
}

/** 删除后记录没了只切表；创建/读取可跟结果 path。新建视图切到来源表的该视图。 */
export function databaseRevealForTool(opts: {
  path: string
  result?: unknown
  dropRecord?: boolean
}): DatabaseReveal | null {
  if (opts.dropRecord) {
    const fromPath = databaseRevealFromPath(opts.path)
    return fromPath ? { collection: fromPath.collection } : null
  }
  const fromView = revealFromSavedViewRow(opts.result)
  if (fromView) return fromView
  return databaseRevealFromPath(resultPathOf(opts.result) || opts.path)
}

function viewRowFromResult(result: unknown): { tablePath?: unknown; viewId?: unknown } | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const rec = result as { kind?: unknown; items?: unknown; value?: unknown }
  if (rec.kind === 'created') {
    const items = rec.items
    if (!Array.isArray(items) || !items.length) return null
    const first = items[0]
    if (!first || typeof first !== 'object' || Array.isArray(first)) return null
    const value = (first as { value?: unknown }).value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as { tablePath?: unknown; viewId?: unknown }
  }
  if (rec.kind === 'record') {
    const value = rec.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as { tablePath?: unknown; viewId?: unknown }
  }
  return null
}

/** /views 行属于来源表；通知 tablePath 上的那条视图，而不是 /views 自己。 */
function revealFromSavedViewRow(result: unknown): DatabaseReveal | null {
  const row = viewRowFromResult(result)
  if (!row) return null
  const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
  const viewId = String(row.viewId ?? '').trim()
  if (!collection || collection === '/' || collection === VIEWS_COLLECTION_PATH || !viewId) return null
  return { collection, viewId }
}

/** /views 行 id：`<表>::<viewId>`，和 SavedViewsStore 一致。 */
export function savedViewRecordPath(tablePath: string, viewId: string) {
  const path = normalizeCollectionPath(tablePath)
  const id = String(viewId ?? '').trim()
  if (!path || path === '/' || !id) return ''
  return `/views/${path.slice(1)}::${id}`
}
