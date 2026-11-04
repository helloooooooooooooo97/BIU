import { useSyncExternalStore } from 'react'
import { createPageBlockId } from '../page-block-fence.ts'
import {
  defaultSandboxSource,
  parsePageViews,
  viewsAssetName,
  type PageSandboxView,
} from '../page-views.ts'
import { setPagePresentMode } from './source-mode.ts'

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

async function putPageFile(name: string, body: string, type: string) {
  let etag = ''
  try {
    const prev = await fetch(`/api/page/file/${encodeURIComponent(name)}`)
    if (prev.ok) etag = String(prev.headers.get('etag') ?? '').replace(/^W\//, '').replaceAll('"', '')
  } catch {
    etag = ''
  }
  const headers: Record<string, string> = { 'content-type': type }
  if (etag) headers['if-match'] = `"${etag}"`
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers,
    body,
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
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
  try {
    const res = await fetch(`/api/page/file/${encodeURIComponent(viewsAssetName(id))}`)
    if (!res.ok) return current
    const parsed = parsePageViews(await res.text())
    setPageViews(id, parsed)
    return parsed
  } catch {
    return current
  }
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

export async function readPageFile(name: string) {
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(res.statusText)
  return res.text()
}

export async function writePageFile(name: string, body: string, type = 'text/plain; charset=utf-8') {
  await putPageFile(name, body, type)
}
