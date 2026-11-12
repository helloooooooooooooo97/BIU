import { useSyncExternalStore } from 'react'
import { parseTagViews, type TagSandboxView } from '../tag-views.ts'
import { createRecordSandboxView } from './record-sandboxes.ts'
import { TAGS_COLLECTION_PATH } from './database-path.ts'
import { getTagPresentMode, setTagPresentMode, TAG_TABLE_VIEW_ID } from './tag-present.ts'

export type { TagSandboxView } from '../tag-views.ts'
export { defaultTagSandboxSource, parseTagViews, tagViewsAssetName, createTagViewId } from '../tag-views.ts'

const store = new Map<string, TagSandboxView[]>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

export function getTagViews(tagId: string): TagSandboxView[] {
  return store.get(String(tagId ?? '')) ?? []
}

export function setTagViews(tagId: string, views: TagSandboxView[]) {
  const id = String(tagId ?? '').trim()
  if (!id) return
  store.set(id, parseTagViews(views))
  bump()
}

export function subscribeTagViews(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useTagViews(tagId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return getTagViews(tagId)
}

const fileCache = new Map<string, { text: string; etag: string }>()
const missingFiles = new Set<string>()

function tagFileUrl(name: string, tagId: string) {
  const params = new URLSearchParams()
  const path = String(tagId ?? '').trim() ? `/tags/${tagId}` : ''
  if (path) params.set('path', path)
  const q = params.toString()
  return `/api/tag/file/${encodeURIComponent(name)}${q ? `?${q}` : ''}`
}

function tagFileHeaders(tagId: string, headers: Record<string, string>) {
  const path = String(tagId ?? '').trim() ? `/tags/${tagId}` : ''
  if (path) headers['x-biu-resource-path'] = path
  return headers
}

function assetEtag(raw: string) {
  return raw.replace(/^W\//, '').replaceAll('"', '')
}

export function peekTagFile(name: string) {
  return fileCache.get(String(name ?? '').trim())?.text
}

export function rememberTagFile(name: string, text: string, etag = '') {
  const key = String(name ?? '').trim()
  if (!key) return
  missingFiles.delete(key)
  fileCache.set(key, { text, etag: assetEtag(etag) })
}

let fileSeq = 0
const fileListeners = new Set<() => void>()

function bumpFile() {
  fileSeq += 1
  for (const fn of fileListeners) fn()
}

export function forgetTagFile(name: string) {
  const key = String(name ?? '').trim()
  if (!key) return
  fileCache.delete(key)
  missingFiles.delete(key)
  bumpFile()
}

export function useTagFileTick() {
  useSyncExternalStore(
    (fn) => {
      fileListeners.add(fn)
      return () => fileListeners.delete(fn)
    },
    () => fileSeq,
  )
  return fileSeq
}

async function responseEtag(res: Response) {
  const header = assetEtag(String(res.headers.get('etag') ?? ''))
  if (header) return header
  try {
    const body = (await res.clone().json()) as { etag?: unknown }
    return assetEtag(String(body?.etag ?? ''))
  } catch {
    return ''
  }
}

async function putTagFile(tagId: string, name: string, body: string, type: string) {
  const key = String(name ?? '').trim()
  const etag = fileCache.get(key)?.etag ?? ''
  rememberTagFile(key, body, etag)
  const headers = tagFileHeaders(tagId, { 'content-type': type })
  if (etag) headers['if-match'] = `"${etag}"`
  const url = tagFileUrl(key, tagId)
  let res = await fetch(url, { method: 'PUT', headers, body })
  if (res.status === 409) {
    const next = (await responseEtag(res)) || assetEtag(String(res.headers.get('etag') ?? ''))
    if (next) {
      headers['if-match'] = `"${next}"`
      res = await fetch(url, { method: 'PUT', headers, body })
    }
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  rememberTagFile(key, body, await responseEtag(res))
}

export async function loadTagViews(tagId: string, seed?: unknown) {
  const id = String(tagId ?? '').trim()
  if (!id) return []
  if (seed != null && seed !== '') {
    const parsed = parseTagViews(seed)
    setTagViews(id, parsed)
    return parsed
  }
  try {
    const res = await fetch(`/api/db/read?path=${encodeURIComponent(`/tags/${id}`)}`)
    const data = (await res.json().catch(() => ({}))) as { value?: { views?: unknown } }
    const parsed = parseTagViews(data.value?.views)
    setTagViews(id, parsed)
    return parsed
  } catch {
    const current = getTagViews(id)
    if (current.length) return current
    setTagViews(id, [])
    return []
  }
}

export async function saveTagViews(tagId: string, views: TagSandboxView[]) {
  const id = String(tagId ?? '').trim()
  if (!id) return
  const next = parseTagViews(views)
  setTagViews(id, next)
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/tags/${id}`, content: { views: JSON.stringify(next) } }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  window.dispatchEvent(new Event('fsdb:change'))
}

export async function createTagSandboxView(tagId: string, title = '', name = '新视图') {
  const id = String(tagId ?? '').trim()
  if (!id) throw new Error('missing tag')
  const listed = getTagViews(id)
  const view = await createRecordSandboxView({
    collectionPath: TAGS_COLLECTION_PATH,
    recordId: id,
    fieldKey: 'views',
    listed,
    name,
    title,
  })
  setTagViews(id, [...listed, view])
  setTagPresentMode(id, view.id)
  return view
}

export async function renameTagSandboxView(tagId: string, viewId: string, name: string) {
  const id = String(tagId ?? '').trim()
  const target = String(viewId ?? '').trim()
  const nextName = name.trim()
  if (!id || !target || !nextName) return
  const next = getTagViews(id).map((item) => (item.id === target ? { ...item, name: nextName } : item))
  await saveTagViews(id, next)
}

export async function copyTagSandboxView(tagId: string, viewId: string, title = '') {
  const id = String(tagId ?? '').trim()
  const target = String(viewId ?? '').trim()
  const listed = getTagViews(id)
  const source = listed.find((item) => item.id === target)
  if (!id || !source) return
  const view = await createRecordSandboxView({
    collectionPath: TAGS_COLLECTION_PATH,
    recordId: id,
    fieldKey: 'views',
    listed,
    name: `${source.name} 副本`,
    title,
    source,
  })
  setTagViews(id, [...listed, view])
  setTagPresentMode(id, view.id)
  return view
}

export async function deleteTagSandboxView(tagId: string, viewId: string) {
  const id = String(tagId ?? '').trim()
  const target = String(viewId ?? '').trim()
  if (!id || !target) return
  await saveTagViews(id, getTagViews(id).filter((item) => item.id !== target))
  if (getTagPresentMode(id) === target) setTagPresentMode(id, TAG_TABLE_VIEW_ID)
}

export async function readTagFile(tagId: string, name: string, fallback?: string) {
  const key = String(name ?? '').trim()
  const cached = fileCache.get(key)
  if (cached) return cached.text
  if (missingFiles.has(key)) {
    if (fallback !== undefined) return fallback
    throw new Error('Not Found')
  }
  try {
    const res = await fetch(tagFileUrl(key, tagId), { headers: tagFileHeaders(tagId, {}) })
    if (res.ok) {
      const text = await res.text()
      rememberTagFile(key, text, String(res.headers.get('etag') ?? ''))
      return text
    }
    if (res.status === 404) missingFiles.add(key)
    if (fallback !== undefined) return fallback
    throw new Error(res.statusText)
  } catch (error) {
    if (fallback !== undefined) {
      missingFiles.add(key)
      return fallback
    }
    throw error
  }
}

export async function writeTagFile(tagId: string, name: string, body: string, type = 'text/plain; charset=utf-8') {
  await putTagFile(tagId, name, body, type)
}

export function openHostRecordPath() {
  if (typeof document === 'undefined') return ''
  const host = document.querySelector('.page-editor')
  if (!(host instanceof HTMLElement)) return ''
  const stamped = String(host.dataset.livePath || host.dataset.pagePath || '').trim()
  if (stamped) return stamped
  const rec = String(host.dataset.pageRecord || '').trim()
  return rec ? `/pages/${rec}` : ''
}

export async function patchTagSandbox(path: string, tagId: string, values: Record<string, unknown>) {
  const recordPath = String(path ?? '').trim()
  const id = String(tagId ?? '').trim()
  if (!recordPath) throw new Error('no current record')
  if (!id) throw new Error('missing tag')
  const res = await fetch('/api/tag/sandbox/patch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: recordPath, tagId: id, values }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; value?: unknown }
  if (!res.ok) throw new Error(data.error || res.statusText)
  window.dispatchEvent(new Event('fsdb:change'))
  return data
}

if (typeof window !== 'undefined') {
  window.addEventListener('biu:asset-changed', (event) => {
    const name = String((event as CustomEvent<{ name?: string }>).detail?.name ?? '')
      .trim()
      .replace(/^assets\//, '')
    if (!name.startsWith('tag-view')) return
    forgetTagFile(name)
  })
}
