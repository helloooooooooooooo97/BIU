import { useSyncExternalStore } from 'react'
import { createPageBlockId } from '../page-block-fence.ts'
import {
  defaultSandboxSource,
  parsePageViews,
  viewsAssetName,
  type PageSandboxView,
} from '../page-views.ts'
import { getPagePresentMode, setPagePresentMode } from './source-mode.ts'

export type { PageSandboxView } from '../page-views.ts'
export { defaultSandboxSource, parsePageViews, viewsAssetName } from '../page-views.ts'

const store = new Map<string, PageSandboxView[]>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

export function getPageViews(pageId: string): PageSandboxView[] {
  return store.get(String(pageId ?? '')) ?? []
}

export function setPageViews(pageId: string, views: PageSandboxView[]) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  store.set(id, parsePageViews(views))
  bump()
}

export function usePageViews(pageId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return getPageViews(pageId)
}

const fileCache = new Map<string, { text: string; etag: string }>()
const missingFiles = new Set<string>()

function openPagePath() {
  if (typeof document === 'undefined') return ''
  const host = document.querySelector('.page-editor')
  if (!(host instanceof HTMLElement)) return ''
  const stamped = String(host.dataset.livePath || host.dataset.pagePath || '').trim()
  if (stamped) return stamped
  const rec = String(host.dataset.pageRecord || '').trim()
  return rec ? `/pages/${rec}` : ''
}

function pageFileUrl(name: string) {
  const path = openPagePath()
  const params = new URLSearchParams()
  if (path) params.set('path', path)
  const q = params.toString()
  return `/api/page/file/${encodeURIComponent(name)}${q ? `?${q}` : ''}`
}

function pageFileHeaders(headers: Record<string, string>) {
  const path = openPagePath()
  if (path) headers['x-biu-resource-path'] = path
  return headers
}

function assetEtag(raw: string) {
  return raw.replace(/^W\//, '').replaceAll('"', '')
}

export function peekPageFile(name: string) {
  return fileCache.get(String(name ?? '').trim())?.text
}

export function rememberPageFile(name: string, text: string, etag = '') {
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

export function forgetPageFile(name: string) {
  const key = String(name ?? '').trim()
  if (!key) return
  fileCache.delete(key)
  missingFiles.delete(key)
  bumpFile()
}

/** 远端改了页面文件：丢掉内存缓存。etag 相同则是本机刚写过，不刷。 */
export function applyPageAssetChanged(detail?: { name?: string; etag?: string } | null) {
  const name = String(detail?.name ?? '')
    .trim()
    .replace(/^assets\//, '')
  if (!name) return false
  const etag = assetEtag(String(detail?.etag ?? ''))
  const cached = fileCache.get(name)
  if (cached && etag && cached.etag === etag) return false
  forgetPageFile(name)
  return true
}

export function usePageFileTick() {
  useSyncExternalStore(
    (fn) => {
      fileListeners.add(fn)
      return () => fileListeners.delete(fn)
    },
    () => fileSeq,
  )
  return fileSeq
}

export function resetPageFileState() {
  fileCache.clear()
  missingFiles.clear()
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

async function putPageFile(name: string, body: string, type: string) {
  const key = String(name ?? '').trim()
  const etag = fileCache.get(key)?.etag ?? ''
  rememberPageFile(key, body, etag)
  const headers = pageFileHeaders({ 'content-type': type })
  if (etag) headers['if-match'] = `"${etag}"`
  const url = pageFileUrl(key)
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
  rememberPageFile(key, body, await responseEtag(res))
}

export async function loadPageViews(pageId: string, seed?: unknown) {
  const id = String(pageId ?? '').trim()
  if (!id) return []
  if (seed != null && seed !== '') {
    const parsed = parsePageViews(seed)
    setPageViews(id, parsed)
    return parsed
  }
  const current = getPageViews(id)
  if (current.length) return current
  setPageViews(id, [])
  return []
}

export async function savePageViews(pageId: string, views: PageSandboxView[]) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  const next = parsePageViews(views)
  setPageViews(id, next)
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/pages/${id}`, content: { views: JSON.stringify(next) } }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  window.dispatchEvent(new Event('fsdb:change'))
}

export async function createPageSandboxView(pageId: string, title = '', name = '沙盒') {
  const id = String(pageId ?? '').trim()
  if (!id) throw new Error('missing page')
  const viewId = createPageBlockId()
  const view: PageSandboxView = {
    id: viewId,
    name: name.trim() || '沙盒',
    kind: 'sandbox',
    file: `view-${id}-${viewId}.jsx`,
    dataFile: `view-data-${id}-${viewId}.json`,
  }
  await putPageFile(view.file, defaultSandboxSource(title), 'text/plain; charset=utf-8')
  await putPageFile(view.dataFile, 'null', 'application/json')
  await savePageViews(id, [...getPageViews(id), view])
  setPagePresentMode(id, viewId)
  return view
}

export async function renamePageSandboxView(pageId: string, viewId: string, name: string) {
  const id = String(pageId ?? '').trim()
  const target = String(viewId ?? '').trim()
  const nextName = name.trim()
  if (!id || !target || !nextName) return
  const next = getPageViews(id).map((item) => (item.id === target ? { ...item, name: nextName } : item))
  await savePageViews(id, next)
}

export async function copyPageSandboxView(pageId: string, viewId: string, title = '') {
  const id = String(pageId ?? '').trim()
  const target = String(viewId ?? '').trim()
  const source = getPageViews(id).find((item) => item.id === target)
  if (!id || !source) return
  const body = await readPageFile(source.file, defaultSandboxSource(title))
  const data = await readPageFile(source.dataFile, 'null')
  const viewIdNext = createPageBlockId()
  const view: PageSandboxView = {
    id: viewIdNext,
    name: `${source.name} 副本`,
    kind: 'sandbox',
    file: `view-${id}-${viewIdNext}.jsx`,
    dataFile: `view-data-${id}-${viewIdNext}.json`,
  }
  await putPageFile(view.file, body, 'text/plain; charset=utf-8')
  await putPageFile(view.dataFile, data, 'application/json')
  await savePageViews(id, [...getPageViews(id), view])
  setPagePresentMode(id, viewIdNext)
  return view
}

export async function deletePageSandboxView(pageId: string, viewId: string) {
  const id = String(pageId ?? '').trim()
  const target = String(viewId ?? '').trim()
  if (!id || !target) return
  const next = getPageViews(id).filter((item) => item.id !== target)
  await savePageViews(id, next)
  if (getPagePresentMode(id) === target) setPagePresentMode(id, 'doc')
}

export async function readPageFile(name: string, fallback?: string) {
  const key = String(name ?? '').trim()
  const cached = fileCache.get(key)
  if (cached) return cached.text
  if (missingFiles.has(key)) {
    if (fallback !== undefined) return fallback
    throw new Error('Not Found')
  }
  try {
    const res = await fetch(pageFileUrl(key), { headers: pageFileHeaders({}) })
    if (res.ok) {
      const text = await res.text()
      rememberPageFile(key, text, String(res.headers.get('etag') ?? ''))
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

export async function writePageFile(name: string, body: string, type = 'text/plain; charset=utf-8') {
  await putPageFile(name, body, type)
}

if (typeof window !== 'undefined') {
  window.addEventListener('biu:asset-changed', (event) => {
    applyPageAssetChanged((event as CustomEvent<{ name?: string; etag?: string }>).detail)
  })
}
