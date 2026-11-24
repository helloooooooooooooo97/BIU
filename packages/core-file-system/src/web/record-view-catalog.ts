import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import { useSyncExternalStore } from 'react'
import { FSDB_CHANGE_EVENT, emitFsdbChange, parseFsdbChange } from '@biu/type-file-system'
import {
  parseRecordLayouts,
  parseRecordSandboxes,
  type RecordLayoutView,
  type RecordSandboxView,
} from '@biu/type-file-system/record-views'
import { normalizeCollectionPath } from '../paths.ts'
import { BoundedMap } from './bounded-map.ts'
import { registerWorkspaceCache } from './workspace-client-store.ts'

export type RecordViewCatalog = {
  views: RecordSandboxView[]
  propViews: RecordSandboxView[]
  layouts: RecordLayoutView[]
  activeLayoutId: string
  contentViewId: string
  propViewId: string
}

const EMPTY: RecordViewCatalog = {
  views: [],
  propViews: [],
  layouts: [],
  activeLayoutId: '',
  contentViewId: '',
  propViewId: '',
}
const SELECTION_KEY = 'biu.record.view-selection'
const store = new BoundedMap<string, RecordViewCatalog>(200)
registerWorkspaceCache('record-view-catalog', () => {
  store.clear()
})
let seq = 0
const listeners = new Set<() => void>()

export function recordViewCatalogKey(collectionPath: string, recordId: string) {
  return `${normalizeCollectionPath(collectionPath)}\0${String(recordId ?? '').trim()}`
}

export function recordViewCatalogPath(collectionPath: string, recordId: string) {
  const id = String(recordId ?? '').trim()
  const path = normalizeCollectionPath(collectionPath)
  return path && id ? `${path}/${id}` : ''
}

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

function readJson(key: string): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(readStorageString(key, { scope: 'workspace' }) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function stringMap(key: string) {
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(readJson(key))) {
    if (typeof value === 'string' && value.trim()) out[id] = value
  }
  return out
}

function migrateSelection(collectionPath: string, recordId: string) {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(recordId ?? '').trim()
  const layout = stringMap('biu.record.layout')[`${path}::${id}`]
  return { activeLayoutId: layout ?? '', contentViewId: '', propViewId: '' }
}

function readPersistedSelection(collectionPath: string, recordId: string) {
  const key = recordViewCatalogKey(collectionPath, recordId)
  const raw = readJson(SELECTION_KEY)[key]
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const bag = raw as Record<string, unknown>
    return {
      activeLayoutId: String(bag.activeLayoutId ?? '').trim(),
      contentViewId: String(bag.contentViewId ?? '').trim(),
      propViewId: String(bag.propViewId ?? '').trim(),
    }
  }
  return migrateSelection(collectionPath, recordId)
}

function persistSelection(collectionPath: string, recordId: string, catalog: RecordViewCatalog) {
  if (typeof localStorage === 'undefined') return
  const key = recordViewCatalogKey(collectionPath, recordId)
  const all = readJson(SELECTION_KEY)
  all[key] = {
    activeLayoutId: catalog.activeLayoutId,
    contentViewId: catalog.contentViewId,
    propViewId: catalog.propViewId,
  }
  writeStorageString(SELECTION_KEY, JSON.stringify(all), { scope: 'workspace' })
}

function withSelection(collectionPath: string, recordId: string, catalog: RecordViewCatalog): RecordViewCatalog {
  if (catalog.activeLayoutId || catalog.contentViewId || catalog.propViewId) return catalog
  const sel = readPersistedSelection(collectionPath, recordId)
  return { ...catalog, ...sel }
}

export function getRecordViewCatalog(collectionPath: string, recordId: string): RecordViewCatalog {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(recordId ?? '').trim()
  if (!path || !id) return EMPTY
  const current = store.get(recordViewCatalogKey(path, id))
  return withSelection(path, id, current ?? EMPTY)
}

export function patchRecordViewCatalog(
  collectionPath: string,
  recordId: string,
  patch: Partial<RecordViewCatalog>,
) {
  const id = String(recordId ?? '').trim()
  const path = normalizeCollectionPath(collectionPath)
  if (!path || !id) return EMPTY
  const current = getRecordViewCatalog(path, id)
  const next: RecordViewCatalog = {
    views: patch.views ?? current.views,
    propViews: patch.propViews ?? current.propViews,
    layouts: patch.layouts ?? current.layouts,
    activeLayoutId: patch.activeLayoutId ?? current.activeLayoutId,
    contentViewId: patch.contentViewId ?? current.contentViewId,
    propViewId: patch.propViewId ?? current.propViewId,
  }
  store.set(recordViewCatalogKey(path, id), next)
  if (
    patch.activeLayoutId != null ||
    patch.contentViewId != null ||
    patch.propViewId != null
  ) {
    persistSelection(path, id, next)
  }
  bump()
  return next
}

export function hydrateRecordViewCatalog(
  collectionPath: string,
  recordId: string,
  record: Record<string, unknown> | null | undefined,
) {
  if (!record) return getRecordViewCatalog(collectionPath, recordId)
  const current = getRecordViewCatalog(collectionPath, recordId)
  const take = <T extends { id: string }>(raw: unknown, parsed: T[], live: T[]) => {
    if (raw == null || raw === '') return live
    if (!parsed.length && live.length) return live
    if (live.length && live.length < parsed.length && live.every((item) => parsed.some((row) => row.id === item.id))) {
      return live
    }
    if (parsed.length < live.length) {
      const seen = new Set(parsed.map((item) => item.id))
      return [...parsed, ...live.filter((item) => !seen.has(item.id))]
    }
    return parsed
  }
  return patchRecordViewCatalog(collectionPath, recordId, {
    views: take(record.views, parseRecordSandboxes(record.views), current.views),
    propViews: take(record.propViews, parseRecordSandboxes(record.propViews), current.propViews),
    layouts: take(record.layouts, parseRecordLayouts(record.layouts), current.layouts),
  })
}

export function subscribeRecordViewCatalog(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useRecordViewCatalog(collectionPath: string, recordId: string) {
  useSyncExternalStore(subscribeRecordViewCatalog, () => seq)
  return getRecordViewCatalog(collectionPath, recordId)
}

export function emitViewCatalogChange(collectionPath: string, recordId: string) {
  const path = recordViewCatalogPath(collectionPath, recordId)
  emitFsdbChange({ scope: 'views', ...(path ? { path } : {}) })
}

function splitRecordPath(path: string) {
  const parts = String(path ?? '')
    .split('/')
    .filter(Boolean)
  if (parts.length !== 2) return null
  return { collectionPath: `/${parts[0]}`, recordId: parts[1]! }
}

async function pullRecordCatalog(path: string) {
  const parts = splitRecordPath(path)
  if (!parts) return
  try {
    const res = await apiFetch(`/api/db/read?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json().catch(() => ({}))) as { value?: { views?: unknown; propViews?: unknown; layouts?: unknown } }
    if (!data.value) return
    hydrateRecordViewCatalog(parts.collectionPath, parts.recordId, data.value)
  } catch {
    /* keep local catalog */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener(FSDB_CHANGE_EVENT, (event) => {
    const change = parseFsdbChange(event)
    if (change.scope !== 'views' || !change.path) return
    void pullRecordCatalog(change.path)
  })
}
