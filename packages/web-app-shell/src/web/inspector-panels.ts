import type { InspectorCenterKind } from '@biu/web-session-view'

export type InspectorPanelExtra = {
  centerKinds?: unknown
  requiresSession?: unknown
  common?: unknown
  action?: unknown
  repeatable?: unknown
}

/** 右侧检查器跟当前 Session：页面附加块不进这一栏，但 Session 可以加数据库。 */
export function inspectorPanelMatches(extra: InspectorPanelExtra, sessionId: string | null): boolean {
  if (!sessionId) return false
  const kinds = Array.isArray(extra.centerKinds)
    ? extra.centerKinds.filter((item): item is InspectorCenterKind => typeof item === 'string')
    : []
  if (kinds.length) return kinds.includes('session')
  if (extra.common) return false
  return Boolean(extra.requiresSession)
}

/** 检查器槽位上的元数据不要摊到 React 组件 props 上（Cordis 服务一碰 $$typeof 就会炸）。 */
const INSPECTOR_VIEW_OMIT = new Set([
  'tabId',
  'tabLabel',
  'tabIcon',
  'Tab',
  'centerKinds',
  'common',
  'action',
  'ensureTrajectory',
  'focusOnCall',
  'requiresSession',
  'databaseUi',
  'useSnapshot',
  'slots',
  'repeatable',
])

const inspectorViewPropsCache = new WeakMap<object, Record<string, unknown>>()

export function inspectorViewProps(raw: Record<string, unknown>) {
  if (!raw || typeof raw !== 'object') return raw
  const cached = inspectorViewPropsCache.get(raw)
  if (cached) return cached
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (INSPECTOR_VIEW_OMIT.has(key)) continue
    next[key] = value
  }
  inspectorViewPropsCache.set(raw, next)
  return next
}
export function slotTabId(openedId: string) {
  const split = openedId.indexOf('::')
  return split === -1 ? openedId : openedId.slice(0, split)
}

export function inspectorTabCollectionPath(tabId: string) {
  const slot = slotTabId(tabId)
  return slot.startsWith('database:') ? slot.slice('database:'.length) : null
}

const INSPECTOR_HOME_PATHS = ['/data', '/agents', '/pages', '/tags', '/plugins'] as const
const INSPECTOR_PLUS_PIN = ['usage', 'traj']

/** 加号菜单：用量、轨迹固定在最上面。 */
export function inspectorPlusPinRank(tabId: string) {
  const i = INSPECTOR_PLUS_PIN.indexOf(slotTabId(tabId))
  return i === -1 ? INSPECTOR_PLUS_PIN.length : i
}

/** 检查器空白页顺序：数据、代理、页面、标签、插件。 */
export function inspectorHomeRank(tabId: string) {
  const path = inspectorTabCollectionPath(tabId)
  const i = path ? INSPECTOR_HOME_PATHS.indexOf(path as (typeof INSPECTOR_HOME_PATHS)[number]) : -1
  return i === -1 ? INSPECTOR_HOME_PATHS.length : i
}

/** 检查器空白页放核心数据：数据、代理、页面、标签、插件。加号菜单才有任务、轨迹和用量。 */
export function isInspectorHomeOffer(tabId: string) {
  const path = inspectorTabCollectionPath(tabId)
  return Boolean(path && (INSPECTOR_HOME_PATHS as readonly string[]).includes(path))
}

export function pruneOpenedForCollections(opened: string[], collections: Array<{ path: string }> | undefined) {
  if (!collections?.length) return opened
  const live = new Set(collections.map((item) => item.path))
  return opened.filter((id) => {
    const path = inspectorTabCollectionPath(id)
    return !path || live.has(path)
  })
}

export function nextRepeatableTabId(tabId: string) {
  return `${tabId}::${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function resolveInspectorTab(current: string, allowed: string[], opened: string[] = []) {
  if (current && opened.includes(current)) return current
  const currentSlot = current ? slotTabId(current) : ''
  const bySlot = currentSlot ? opened.find((id) => slotTabId(id) === currentSlot) : undefined
  if (bySlot) return bySlot
  const hanging = allowed.length
    ? opened.filter((id) => allowed.includes(id) || allowed.includes(slotTabId(id)))
    : [...opened]
  return hanging[0] ?? ''
}

/** 右侧检查器最多常驻保活的面板数量（LRU）。超出后自动卸载最久未访问的非激活面板。 */
export const INSPECTOR_KEEP_ALIVE_LIMIT = 5

/** 维护最近访问的检查器面板 LRU 列表：仅懒挂载访问过的面板，且最多保活 limit 个。 */
export function touchInspectorMountedPanes(
  current: readonly string[],
  activeId: string,
  openedIds: readonly string[],
  limit = INSPECTOR_KEEP_ALIVE_LIMIT,
): string[] {
  const openSet = new Set(openedIds)
  const kept = current.filter((id) => openSet.has(id) && id !== activeId)
  if (activeId && openSet.has(activeId)) kept.push(activeId)
  const max = Math.max(1, limit)
  return kept.length > max ? kept.slice(kept.length - max) : kept
}
