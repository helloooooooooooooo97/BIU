import { currentStorageWorkspaceId, readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import { peekRecord } from './crumb-cache.ts'

export type StarredView = { path: string; viewId: string; name?: string }
export type StarredRecord = { path: string; recordId: string; label?: string; emoji?: string }

const STARRED_VIEWS_KEY = 'fsdb.starredViews'
const STARRED_RECORDS_KEY = 'fsdb.starredRecords'

function starredViewsKey() {
  const ws = currentStorageWorkspaceId()
  return ws ? `${STARRED_VIEWS_KEY}:${ws}` : STARRED_VIEWS_KEY
}

function starredRecordsKey() {
  const ws = currentStorageWorkspaceId()
  return ws ? `${STARRED_RECORDS_KEY}:${ws}` : STARRED_RECORDS_KEY
}

function normalizeStarredViews(raw: unknown): StarredView[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const rec = item as Record<string, unknown>
    const path = String(rec.path ?? '').trim()
    const viewId = String(rec.viewId ?? '').trim()
    const name = String(rec.name ?? '').trim()
    return path && viewId ? [{ path, viewId, ...(name ? { name } : {}) }] : []
  })
}

function normalizeStarredRecords(raw: unknown): StarredRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const rec = item as Record<string, unknown>
    const path = String(rec.path ?? '').trim()
    const recordId = String(rec.recordId ?? '').trim()
    if (!path || !recordId) return []
    const label = String(rec.label ?? '').trim()
    const emoji = String(rec.emoji ?? '').trim()
    return [{ path, recordId, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}) }]
  })
}

export function loadStarredViews(): StarredView[] {
  try {
    const raw = readStorageString(starredViewsKey())
    return normalizeStarredViews(raw ? JSON.parse(raw) : [])
  } catch {
    return []
  }
}

export function loadStarredRecords(): StarredRecord[] {
  try {
    const raw = readStorageString(starredRecordsKey())
    return normalizeStarredRecords(raw ? JSON.parse(raw) : [])
  } catch {
    return []
  }
}

let starredViews = loadStarredViews()
let starredVersion = 0
let starredRecords = loadStarredRecords()
let starredRecordsVersion = 0
let starredHydrateSeq = 0
let starredHydratedOnce = false
const starredListeners = new Set<() => void>()
const starredRecordListeners = new Set<() => void>()

function pushStarredToServer(patch: { starredViews?: StarredView[]; starredRecords?: StarredRecord[] }) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return
  void apiFetch('/api/account/starred', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).catch(() => undefined)
}

export async function hydrateStarredFromServer() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return
  const seq = ++starredHydrateSeq
  try {
    const res = await apiFetch('/api/account/starred')
    if (!res.ok || seq !== starredHydrateSeq) return
    const data = (await res.json()) as { starredViews?: unknown; starredRecords?: unknown }
    if (seq !== starredHydrateSeq) return
    if (Array.isArray(data.starredViews)) {
      persistStarredViews(normalizeStarredViews(data.starredViews), { remote: false })
    }
    if (Array.isArray(data.starredRecords)) {
      persistStarredRecords(normalizeStarredRecords(data.starredRecords), { remote: false })
    }
  } catch {
    /* ignore */
  }
}

function ensureStarredHydrated() {
  if (starredHydratedOnce) return
  starredHydratedOnce = true
  void hydrateStarredFromServer()
}

export function getStarredViews() {
  return starredViews
}

export function subscribeStarredViews(fn: () => void) {
  starredListeners.add(fn)
  ensureStarredHydrated()
  return () => {
    starredListeners.delete(fn)
  }
}

export function getStarredViewsVersion() {
  return starredVersion
}

export function persistStarredViews(items: StarredView[], options?: { remote?: boolean }) {
  if (options?.remote !== false) starredHydrateSeq += 1
  starredViews = items
  starredVersion += 1
  writeStorageString(starredViewsKey(), JSON.stringify(items))
  for (const fn of starredListeners) fn()
  if (options?.remote !== false) pushStarredToServer({ starredViews: items })
}

export function isViewStarred(items: StarredView[], path: string, viewId: string) {
  return items.some((item) => item.path === path && item.viewId === viewId)
}

export function toggleStarredView(items: StarredView[], path: string, viewId: string, name?: string): StarredView[] {
  if (isViewStarred(items, path, viewId)) return items.filter((item) => item.path !== path || item.viewId !== viewId)
  const label = String(name ?? '').trim()
  return [...items, { path, viewId, ...(label ? { name: label } : {}) }]
}

export function removeStarredViews(path: string, viewIds: Iterable<string>) {
  const drop = new Set([...viewIds].map((id) => String(id ?? '').trim()).filter(Boolean))
  if (!drop.size) return false
  const current = getStarredViews()
  const next = current.filter((item) => item.path !== path || !drop.has(item.viewId))
  if (next.length === current.length) return false
  persistStarredViews(next)
  return true
}

export function getStarredRecords() {
  return starredRecords
}

export function subscribeStarredRecords(fn: () => void) {
  starredRecordListeners.add(fn)
  ensureStarredHydrated()
  return () => {
    starredRecordListeners.delete(fn)
  }
}

export function getStarredRecordsVersion() {
  return starredRecordsVersion
}

export function persistStarredRecords(items: StarredRecord[], options?: { remote?: boolean }) {
  if (options?.remote !== false) starredHydrateSeq += 1
  starredRecords = items
  starredRecordsVersion += 1
  writeStorageString(starredRecordsKey(), JSON.stringify(items))
  for (const fn of starredRecordListeners) fn()
  if (options?.remote !== false) pushStarredToServer({ starredRecords: items })
}

export function isRecordStarred(items: StarredRecord[], path: string, recordId: string) {
  return items.some((item) => item.path === path && item.recordId === recordId)
}

export function toggleStarredRecord(
  items: StarredRecord[],
  path: string,
  recordId: string,
  meta?: { label?: string; emoji?: string },
): StarredRecord[] {
  if (isRecordStarred(items, path, recordId)) return items.filter((item) => item.path !== path || item.recordId !== recordId)
  const label = String(meta?.label ?? '').trim()
  const emoji = String(meta?.emoji ?? '').trim()
  return [...items, { path, recordId, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}) }]
}

export function starredRecordLabel(item: StarredRecord) {
  const peeked = peekRecord(item.path, item.recordId)
  const label = String(peeked?.label ?? item.label ?? '').trim()
  return label && label !== item.recordId ? label : label || item.recordId
}

export function starredRecordEmoji(item: StarredRecord) {
  return String(peekRecord(item.path, item.recordId)?.emoji ?? item.emoji ?? '').trim()
}

export function resetStarredWorkspaceCache() {
  persistStarredViews([], { remote: false })
  persistStarredRecords([], { remote: false })
  starredHydratedOnce = true
  void hydrateStarredFromServer()
}
