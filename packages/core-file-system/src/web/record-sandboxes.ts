import { apiFetch } from '@biu/biu-ui/api-client'
import { BoundedMap, registerWorkspaceCache } from '@biu/biu-ui/cache'
import { useSyncExternalStore } from 'react'
import { BIU_ASSET_CHANGED_EVENT } from '@biu/type-file-system'
import type { RecordSandboxView } from '@biu/type-file-system/record-views'
import { parseRecordLayouts, parseRecordSandboxes, seedRecordSandbox } from '@biu/type-file-system/record-views'
import { normalizeCollectionPath } from '../paths.ts'
import { emitViewCatalogChange, getRecordViewCatalog, patchRecordViewCatalog } from './record-view-catalog.ts'

function recordViewFileUrl(collectionPath: string, recordId: string, name: string) {
  const path = `${normalizeCollectionPath(collectionPath)}/${recordId}`
  const key = encodeURIComponent(name)
  return `/api/db/file/${key}?path=${encodeURIComponent(path)}`
}

function assetEtag(raw: string) {
  return raw.replace(/^W\//, '').replaceAll('"', '')
}

const MAX_FILE_CACHE_ENTRIES = 200
const fileCache = new BoundedMap<string, { text: string; etag: string }>(MAX_FILE_CACHE_ENTRIES)
let fileSeq = 0
const fileListeners = new Set<() => void>()

registerWorkspaceCache('record-sandboxes-files', () => {
  if (fileCache.size === 0) return
  fileCache.clear()
  fileSeq += 1
  for (const fn of fileListeners) fn()
})

export class RecordViewFileConflictError extends Error {
  readonly status = 409
  readonly etag: string
  constructor(message: string, etag = '') {
    super(message)
    this.name = 'RecordViewFileConflictError'
    this.etag = etag
  }
}

function cacheKey(collectionPath: string, recordId: string, name: string) {
  return `${normalizeCollectionPath(collectionPath)}\0${recordId}\0${name}`
}

function bumpFile() {
  fileSeq += 1
  for (const fn of fileListeners) fn()
}

function touchCache(key: string, entry: { text: string; etag: string }) {
  fileCache.set(key, entry)
}

export function rememberRecordViewFile(collectionPath: string, recordId: string, name: string, text: string, etag = '') {
  touchCache(cacheKey(collectionPath, recordId, name), { text, etag: assetEtag(etag) })
}

export function peekRecordViewFile(collectionPath: string, recordId: string, name: string) {
  return fileCache.get(cacheKey(collectionPath, recordId, name))?.text
}
export function subscribeRecordViewFileTick(fn: () => void) {
  fileListeners.add(fn)
  return () => {
    fileListeners.delete(fn)
  }
}

export function useRecordViewFileTick() {
  return useSyncExternalStore(subscribeRecordViewFileTick, () => fileSeq)
}

/** 远端改了沙盒 jsx：丢掉内存缓存。etag 相同则是本机刚写过，不刷。 */
export function applyRecordViewAssetChanged(detail?: { name?: string; etag?: string } | null) {
  const name = String(detail?.name ?? '')
    .trim()
    .replace(/^assets\//, '')
  if (!name) return false
  const etag = assetEtag(String(detail?.etag ?? ''))
  const suffix = `\0${name}`
  let seen = 0
  let same = 0
  for (const [key, cached] of fileCache) {
    if (!key.endsWith(suffix)) continue
    seen += 1
    if (etag && cached.etag === etag) {
      same += 1
      continue
    }
    fileCache.delete(key)
  }
  if (seen && same === seen) return false
  bumpFile()
  return true
}

export async function putRecordViewFile(
  collectionPath: string,
  recordId: string,
  name: string,
  body: string,
  type = 'text/plain; charset=utf-8',
  opts?: { onConflict?: 'overwrite' | 'throw' },
) {
  const path = `${normalizeCollectionPath(collectionPath)}/${recordId}`
  const key = String(name ?? '').trim()
  const cached = fileCache.get(cacheKey(collectionPath, recordId, key))
  const headers: Record<string, string> = { 'content-type': type, 'x-biu-resource-path': path }
  if (cached?.etag) headers['if-match'] = `"${cached.etag}"`
  const url = recordViewFileUrl(collectionPath, recordId, key)
  let res = await fetch(url, { method: 'PUT', headers, body })
  if (res.status === 409) {
    const next = assetEtag(String(res.headers.get('etag') ?? ''))
    if (opts?.onConflict === 'throw') {
      fileCache.delete(cacheKey(collectionPath, recordId, key))
      throw new RecordViewFileConflictError('file changed on server', next)
    }
    if (next) {
      headers['if-match'] = `"${next}"`
      res = await fetch(url, { method: 'PUT', headers, body })
    }
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  rememberRecordViewFile(collectionPath, recordId, key, body, String(res.headers.get('etag') ?? ''))
}

export async function readRecordViewFile(
  collectionPath: string,
  recordId: string,
  name: string,
  fallback: string,
  opts?: { fresh?: boolean },
) {
  const key = String(name ?? '').trim()
  if (!opts?.fresh) {
    const hit = fileCache.get(cacheKey(collectionPath, recordId, key))
    if (hit) {
      touchCache(cacheKey(collectionPath, recordId, key), hit)
      return hit.text
    }
  }
  const path = `${normalizeCollectionPath(collectionPath)}/${recordId}`
  const url = recordViewFileUrl(collectionPath, recordId, key)
  try {
    const res = await fetch(url, { headers: { 'x-biu-resource-path': path } })
    if (!res.ok) return fallback
    const text = await res.text()
    rememberRecordViewFile(collectionPath, recordId, key, text, String(res.headers.get('etag') ?? ''))
    return text
  } catch {
    return fallback
  }
}

export function resetRecordViewFileState() {
  fileCache.clear()
}

export async function writeRecordViewCatalog(
  collectionPath: string,
  recordId: string,
  fieldKey: 'views' | 'propViews' | 'layouts',
  value: unknown | ((current: unknown) => unknown),
  extra?: { contentViewId?: string; propViewId?: string; activeLayoutId?: string },
) {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(recordId ?? '').trim()
  if (!path || !id) return false
  const current = getRecordViewCatalog(path, id)[fieldKey]
  const raw = typeof value === 'function' ? value(current) : value
  const parsed = fieldKey === 'layouts' ? parseRecordLayouts(raw) : parseRecordSandboxes(raw)
  patchRecordViewCatalog(path, id, { [fieldKey]: parsed, ...extra })
  const res = await apiFetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: `${path}/${id}`,
      content: { [fieldKey]: JSON.stringify(parsed) },
    }),
  })
  if (!res.ok) {
    patchRecordViewCatalog(path, id, { [fieldKey]: current, ...extra })
    return false
  }
  emitViewCatalogChange(path, id)
  return true
}

export async function createRecordSandboxView(opts: {
  collectionPath: string
  recordId: string
  fieldKey: 'views' | 'propViews'
  name?: string
  title?: string
  source?: RecordSandboxView | null
  select?: boolean
}) {
  const collectionPath = normalizeCollectionPath(opts.collectionPath)
  const recordId = String(opts.recordId ?? '').trim()
  if (!collectionPath || !recordId) throw new Error('missing record')
  const listed = parseRecordSandboxes(getRecordViewCatalog(collectionPath, recordId)[opts.fieldKey])
  const view = await seedRecordSandbox({
    fieldKey: opts.fieldKey,
    recordId,
    listed,
    name: opts.name,
    title: opts.title,
    source: opts.source,
    readFile: (name, fallback) => readRecordViewFile(collectionPath, recordId, name, fallback),
    writeFile: (name, body, type) => putRecordViewFile(collectionPath, recordId, name, body, type),
  })
  const extra =
    opts.select === false
      ? undefined
      : opts.fieldKey === 'propViews'
        ? { propViewId: view.id }
        : { contentViewId: view.id }
  const ok = await writeRecordViewCatalog(
    collectionPath,
    recordId,
    opts.fieldKey,
    (current: unknown) => [...parseRecordSandboxes(current), view],
    extra,
  )
  if (!ok) throw new Error('could not save view catalog')
  return view
}

if (typeof window !== 'undefined') {
  window.addEventListener(BIU_ASSET_CHANGED_EVENT, (event) => {
    applyRecordViewAssetChanged((event as CustomEvent<{ name?: string; etag?: string }>).detail)
  })
}
