/** 检查器里每个数据库 Tab 有自己的路径，不改中间主界面。 */

import { normalizeCollectionPath } from '../paths.ts'
import { DATA_MODULE_PATH, databaseAllViewPath, databaseRecordPath, databaseViewPath } from './database-path.ts'
import { upsertSavedView, savedViewFromRecord } from './view-storage.ts'
import { type SavedView } from './saved-view.ts'

const DEFAULT_PANE = 'database'
const STORAGE_PREFIX = 'inspector.dbPath:'
const listeners = new Set<() => void>()
const paths = new Map<string, string>()
const abandonedPanes = new Set<string>()
const working = new Set<string>()
const workingListeners = new Set<() => void>()
const FOLLOW_KEY = 'inspector.agentFollow'
const followListeners = new Set<() => void>()
let followLoaded = false
let follow = false

function bumpFollow() {
  for (const fn of followListeners) fn()
}

function readFollow() {
  if (followLoaded) return follow
  followLoaded = true
  try {
    follow = localStorage.getItem(FOLLOW_KEY) === '1'
  } catch {
    follow = false
  }
  return follow
}

export function subscribeInspectorAgentFollow(fn: () => void) {
  followListeners.add(fn)
  return () => {
    followListeners.delete(fn)
  }
}

/** 开：Agent 改库时右侧检查器跟着打开/跳转。关：自己看，不被打断。默认关。 */
export function isInspectorAgentFollow() {
  return readFollow()
}

export function setInspectorAgentFollow(next: boolean) {
  followLoaded = true
  const value = Boolean(next)
  if (follow === value) {
    try {
      localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0')
    } catch {
      /* ignore */
    }
    return
  }
  follow = value
  try {
    localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0')
  } catch {
    /* ignore */
  }
  bumpFollow()
}

function storageKey(paneId: string) {
  return `${STORAGE_PREFIX}${paneId}`
}

function slotTabId(openedId: string) {
  const split = openedId.indexOf('::')
  return split === -1 ? openedId : openedId.slice(0, split)
}

function paneIdsForTab(tabId: string) {
  const ids = new Set<string>([tabId])
  for (const id of paths.keys()) {
    if (id === tabId || slotTabId(id) === tabId) ids.add(id)
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? ''
      if (!key.startsWith(STORAGE_PREFIX)) continue
      const id = key.slice(STORAGE_PREFIX.length)
      if (id === tabId || slotTabId(id) === tabId) ids.add(id)
    }
  } catch {
    /* ignore */
  }
  return [...ids]
}

function readStoredPath(paneId: string) {
  try {
    const raw = localStorage.getItem(storageKey(paneId)) ?? ''
    return isInspectorDatabasePath(raw) ? raw : ''
  } catch {
    return ''
  }
}

function writeStoredPath(paneId: string, path: string) {
  try {
    if (!path) localStorage.removeItem(storageKey(paneId))
    else localStorage.setItem(storageKey(paneId), path)
  } catch {
    /* ignore */
  }
}

export function subscribeInspectorAgentWorking(fn: () => void) {
  workingListeners.add(fn)
  return () => {
    workingListeners.delete(fn)
  }
}

function bumpWorking() {
  for (const fn of workingListeners) fn()
}

export function isInspectorAgentWorking(collection: string) {
  return working.has(normalizeCollectionPath(collection))
}

export function setInspectorAgentWorking(collection: string, next: boolean) {
  const path = normalizeCollectionPath(collection)
  if (!path || path === '/') return
  const had = working.has(path)
  if (next && !had) {
    working.add(path)
    bumpWorking()
    return
  }
  if (!next && had) {
    working.delete(path)
    bumpWorking()
  }
}

export function subscribeInspectorDbPath(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function bump() {
  for (const fn of listeners) fn()
}

export function isInspectorDatabasePath(pathname: string) {
  const path = String(pathname || '').split('?')[0]
  return path === DATA_MODULE_PATH || path.startsWith(`${DATA_MODULE_PATH}/`)
}

function panePath(paneId = DEFAULT_PANE) {
  const mem = paths.get(paneId)
  if (mem !== undefined) return isInspectorDatabasePath(mem) ? mem : ''
  const stored = readStoredPath(paneId)
  if (stored) paths.set(paneId, stored)
  return stored
}

export function getInspectorDbPath(paneId = DEFAULT_PANE) {
  return panePath(paneId)
}

/** 测试用：清空内存路径，模拟整页刷新后只剩 localStorage。 */
export function resetInspectorDbPathMemory() {
  paths.clear()
  abandonedPanes.clear()
}

export function setInspectorDbPath(paneId: string, next?: string) {
  const id = next === undefined ? DEFAULT_PANE : paneId
  const path = next === undefined ? paneId : next
  const stored = isInspectorDatabasePath(path) ? path : ''
  if (stored) abandonedPanes.delete(id)
  if ((paths.get(id) ?? '') === stored) {
    writeStoredPath(id, stored)
    return
  }
  if (!stored) paths.delete(id)
  else paths.set(id, stored)
  writeStoredPath(id, stored)
  bump()
}

/** 关掉检查器里这一栏时清掉路径，避免左侧再点同一页又把右侧弹回来。 */
export function clearInspectorDbPath(paneId: string) {
  if (!paneId) return
  abandonedPanes.add(paneId)
  setInspectorDbPath(paneId, '')
}

export function isInspectorPaneAbandoned(paneId: string) {
  return abandonedPanes.has(paneId)
}

export function inspectorCollectionTabId(collection: string) {
  return `database:${collection}`
}

function hrefPathKey(href: string) {
  return String(href || '').split('?')[0]
}

function paneWithHref(tabId: string, href: string) {
  const key = hrefPathKey(href)
  return paneIdsForTab(tabId).find((id) => hrefPathKey(getInspectorDbPath(id)) === key)
}

function revealInspectorPane(paneId: string, href: string) {
  setInspectorDbPath(paneId, href)
  window.dispatchEvent(new Event('biu:inspector-open'))
  window.dispatchEvent(new CustomEvent('biu:inspector-tab', { detail: paneId }))
}

function nextInspectorPaneId(tabId: string) {
  return `${tabId}::${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 右侧已经打开同一路径时只聚焦，不新开。 */
export function focusInspectorIfOpen(collection: string, href: string) {
  const pane = paneWithHref(inspectorCollectionTabId(collection), href)
  if (!pane) return false
  revealInspectorPane(pane, href)
  return true
}

/** 右侧检查器打开这条路径，中间主界面不动。默认同表实例一起改路径；unique 时同页只聚焦、不同页新开。 */
export function showInInspector(collection: string, href: string, opts?: { unique?: boolean }) {
  const tabId = inspectorCollectionTabId(collection)
  const unique = opts?.unique === true
  const paneIds = paneIdsForTab(tabId)
  if (unique) {
    const same = paneWithHref(tabId, href)
    if (same) {
      revealInspectorPane(same, href)
      return
    }
    const live = paneIds.filter((id) => getInspectorDbPath(id))
    const target = live.length ? nextInspectorPaneId(tabId) : tabId
    revealInspectorPane(target, href)
    return
  }
  for (const paneId of paneIds) setInspectorDbPath(paneId, href)
  window.dispatchEvent(new Event('biu:inspector-open'))
  window.dispatchEvent(new CustomEvent('biu:inspector-tab', { detail: tabId }))
}

/** 右侧检查器打开这条记录。同一页已在检查器里则只聚焦。 */
export function showRecordInInspector(collection: string, recordId: string) {
  showInInspector(collection, databaseRecordPath(collection, recordId), { unique: true })
}

/** 工具查/改/删某张表后：打开右侧检查器并切到该表（中间主界面不动）。 */
export function applyDatabaseReveal(reveal: unknown) {
  if (!reveal || typeof reveal !== 'object' || Array.isArray(reveal)) return
  const rec = reveal as { collection?: unknown; recordId?: unknown; viewId?: unknown; unique?: unknown }
  const collection = normalizeCollectionPath(String(rec.collection ?? ''))
  if (!collection || collection === '/') return
  const unique = rec.unique === true
  const recordId = String(rec.recordId ?? '').trim()
  if (recordId) {
    showInInspector(collection, databaseRecordPath(collection, recordId), { unique })
    return
  }
  const viewId = String(rec.viewId ?? '').trim()
  if (viewId) {
    showInInspector(collection, databaseViewPath(collection, viewId), { unique })
    return
  }
  showInInspector(collection, databaseAllViewPath(collection), { unique })
}

/** 视图表写入立刻套到来源表；检查器跟随仍只跟当前主 Session。 */
export function applyDatabaseChannelPayload(payload: unknown, currentSessionId?: string | null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return
  const reveal = (payload as { reveal?: unknown }).reveal
  const revealRec = reveal && typeof reveal === 'object' && !Array.isArray(reveal) ? (reveal as { collection?: unknown; viewId?: unknown }) : null
  const collection = normalizeCollectionPath(String(revealRec?.collection ?? ''))
  const savedRaw = (payload as { savedView?: unknown }).savedView
  const savedView = savedViewFromPayload(savedRaw, revealRec?.viewId)
  const tablePath = savedViewTablePath(savedRaw, collection)
  if (savedView && tablePath) {
    upsertSavedView(tablePath, savedView)
    window.dispatchEvent(new CustomEvent(SAVED_VIEW_EVENT, { detail: { collection: tablePath, view: savedView } }))
  }
  const sessionId = String((payload as { sessionId?: unknown }).sessionId ?? '').trim()
  if (!sessionId || !currentSessionId || sessionId !== String(currentSessionId)) return
  if (!collection || collection === '/') return
  const phase = String((payload as { phase?: unknown }).phase ?? '')
  if (isInspectorAgentFollow()) applyDatabaseReveal(reveal)
  setInspectorAgentWorking(collection, phase !== 'done')
}

function savedViewFromPayload(raw: unknown, revealViewId: unknown): SavedView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const parsed = savedViewFromRecord({
    viewId: rec.id ?? rec.viewId ?? revealViewId,
    title: rec.name ?? rec.title,
    mode: rec.mode,
    sortField: rec.sortField,
    sortDir: rec.sortDir,
    sorts: rec.sorts,
    query: rec.query,
    groupBy: rec.groupBy,
    columns: rec.columns,
    filters: rec.filters,
    filterTree: rec.filterTree,
    tree: rec.tree,
    wrap: rec.wrap,
    truncate: rec.truncate,
    pageSize: rec.pageSize,
    columnWidths: rec.columnWidths,
  })
  return parsed
}

function savedViewTablePath(raw: unknown, revealCollection: string) {
  const fromRow =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? normalizeCollectionPath(String((raw as { tablePath?: unknown }).tablePath ?? ''))
      : '/'
  const fromReveal = revealCollection === '/views' ? '/' : revealCollection
  const path = fromRow && fromRow !== '/' && fromRow !== '/views' ? fromRow : fromReveal
  if (!path || path === '/' || path === '/views') return ''
  return path
}

export const SAVED_VIEW_EVENT = 'fsdb:saved-view'
export const INSPECTOR_REVEAL_EVENT = 'biu:inspector-reveal'
export const INSPECTOR_PANE_CLOSED_EVENT = 'biu:inspector-pane-closed'

function onInspectorReveal(event: Event) {
  applyDatabaseReveal((event as CustomEvent).detail)
}

function onInspectorPaneClosed(event: Event) {
  const detail = (event as CustomEvent).detail
  const paneId = typeof detail === 'string' ? detail : String((detail as { paneId?: unknown })?.paneId ?? '')
  if (paneId) clearInspectorDbPath(paneId)
}

if (typeof window !== 'undefined') {
  window.addEventListener(INSPECTOR_REVEAL_EVENT, onInspectorReveal)
  window.addEventListener(INSPECTOR_PANE_CLOSED_EVENT, onInspectorPaneClosed)
}
