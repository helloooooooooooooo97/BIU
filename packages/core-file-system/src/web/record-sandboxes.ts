import { useSyncExternalStore } from 'react'
import type { RecordSandboxView } from '@biu/type-file-system/record-views'
import { parseRecordSandboxes, seedRecordSandbox } from '@biu/type-file-system/record-views'
import { normalizeCollectionPath } from '../paths.ts'

function assetEtag(raw: string) {
  return raw.replace(/^W\//, '').replaceAll('"', '')
}

const fileCache = new Map<string, { text: string; etag: string }>()
let fileSeq = 0
const fileListeners = new Set<() => void>()

function cacheKey(collectionPath: string, recordId: string, name: string) {
  return `${normalizeCollectionPath(collectionPath)}\0${recordId}\0${name}`
}

function bumpFile() {
  fileSeq += 1
  for (const fn of fileListeners) fn()
}

export function rememberRecordViewFile(collectionPath: string, recordId: string, name: string, text: string, etag = '') {
  fileCache.set(cacheKey(collectionPath, recordId, name), { text, etag: assetEtag(etag) })
}

export function peekRecordViewFile(collectionPath: string, recordId: string, name: string) {
  return fileCache.get(cacheKey(collectionPath, recordId, name))?.text
}

export function useRecordViewFileTick() {
  return useSyncExternalStore(
    (fn) => {
      fileListeners.add(fn)
      return () => fileListeners.delete(fn)
    },
    () => fileSeq,
  )
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
  type: string,
) {
  const path = `${normalizeCollectionPath(collectionPath)}/${recordId}`
  const key = String(name ?? '').trim()
  const cached = fileCache.get(cacheKey(collectionPath, recordId, key))
  const headers: Record<string, string> = { 'content-type': type, 'x-biu-resource-path': path }
  if (cached?.etag) headers['if-match'] = `"${cached.etag}"`
  const url = `/api/db/file/${encodeURIComponent(key)}?path=${encodeURIComponent(path)}`
  let res = await fetch(url, { method: 'PUT', headers, body })
  if (res.status === 409) {
    const next = assetEtag(String(res.headers.get('etag') ?? ''))
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
) {
  const key = String(name ?? '').trim()
  const hit = fileCache.get(cacheKey(collectionPath, recordId, key))
  if (hit) return hit.text
  const path = `${normalizeCollectionPath(collectionPath)}/${recordId}`
  const url = `/api/db/file/${encodeURIComponent(key)}?path=${encodeURIComponent(path)}`
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

export async function writeRecordViewCatalog(
  collectionPath: string,
  recordId: string,
  fieldKey: 'views' | 'propViews',
  value: RecordSandboxView[],
) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: `${normalizeCollectionPath(collectionPath)}/${recordId}`,
      content: { [fieldKey]: JSON.stringify(value) },
    }),
  })
  if (!res.ok) return false
  window.dispatchEvent(new Event('fsdb:change'))
  return true
}

export async function createRecordSandboxView(opts: {
  collectionPath: string
  recordId: string
  fieldKey: 'views' | 'propViews'
  listed?: unknown
  name?: string
  title?: string
  source?: RecordSandboxView | null
}) {
  const collectionPath = normalizeCollectionPath(opts.collectionPath)
  const recordId = String(opts.recordId ?? '').trim()
  if (!collectionPath || !recordId) throw new Error('missing record')
  const listed = parseRecordSandboxes(opts.listed)
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
  const ok = await writeRecordViewCatalog(collectionPath, recordId, opts.fieldKey, [...listed, view])
  if (!ok) throw new Error('could not save view catalog')
  return view
}

if (typeof window !== 'undefined') {
  window.addEventListener('biu:asset-changed', (event) => {
    applyRecordViewAssetChanged((event as CustomEvent<{ name?: string; etag?: string }>).detail)
  })
}
