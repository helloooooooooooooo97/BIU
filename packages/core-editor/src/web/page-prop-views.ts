import { useSyncExternalStore } from 'react'
import { seedRecordSandbox } from '@biu/type-file-system/record-views'
import { parsePagePropViews, defaultPropSandboxSource, type PagePropSandboxView } from '../page-prop-views.ts'
import { peekPageFile, readPageFile, uniqueViewName, writePageFile } from './page-views.ts'
import { getPagePropPresentMode, PAGE_PROP_HIDDEN_VIEW_ID, PAGE_PROP_TABLE_VIEW_ID, setPagePropPresentMode } from './page-prop-present.ts'

export type { PagePropSandboxView }
export { defaultPropSandboxSource, parsePagePropViews, propViewsAssetName } from '../page-prop-views.ts'

const store = new Map<string, PagePropSandboxView[]>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

export function getPagePropViews(pageId: string): PagePropSandboxView[] {
  return store.get(String(pageId ?? '')) ?? []
}

export function setPagePropViews(pageId: string, views: PagePropSandboxView[]) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  const next = parsePagePropViews(views)
  store.set(id, next)
  bump()
  const present = getPagePropPresentMode(id)
  if (
    present !== PAGE_PROP_TABLE_VIEW_ID &&
    present !== PAGE_PROP_HIDDEN_VIEW_ID &&
    !next.some((item) => item.id === present)
  ) {
    setPagePropPresentMode(id, PAGE_PROP_TABLE_VIEW_ID)
  }
}

export function subscribePagePropViews(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function usePagePropViews(pageId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return getPagePropViews(pageId)
}

export async function loadPagePropViews(pageId: string, seed?: unknown) {
  const id = String(pageId ?? '').trim()
  if (!id) return []
  if (seed != null && seed !== '') {
    const parsed = parsePagePropViews(seed)
    setPagePropViews(id, parsed)
    return parsed
  }
  const current = getPagePropViews(id)
  if (current.length) return current
  setPagePropViews(id, [])
  return []
}

export async function savePagePropViews(pageId: string, views: PagePropSandboxView[]) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  const next = parsePagePropViews(views)
  setPagePropViews(id, next)
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/pages/${id}`, content: { propViews: JSON.stringify(next) } }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  window.dispatchEvent(new Event('fsdb:change'))
}

export function uniquePagePropViewName(pageId: string, base: string) {
  return uniqueViewName(base, getPagePropViews(pageId).map((item) => item.name))
}

export async function createPagePropSandboxView(pageId: string, title = '', name = '新视图') {
  const id = String(pageId ?? '').trim()
  if (!id) throw new Error('missing page')
  const listed = getPagePropViews(id)
  const view = await seedRecordSandbox({
    fieldKey: 'propViews',
    recordId: id,
    listed,
    name,
    title,
    writeFile: writePageFile,
  })
  await savePagePropViews(id, [...listed, view])
  setPagePropPresentMode(id, view.id)
  return view
}

export async function renamePagePropSandboxView(pageId: string, viewId: string, name: string) {
  const id = String(pageId ?? '').trim()
  const target = String(viewId ?? '').trim()
  const nextName = name.trim()
  if (!id || !target || !nextName) return
  const next = getPagePropViews(id).map((item) => (item.id === target ? { ...item, name: nextName } : item))
  await savePagePropViews(id, next)
}

export async function copyPagePropSandboxView(pageId: string, viewId: string, title = '', fallbackName = '') {
  const id = String(pageId ?? '').trim()
  const target = String(viewId ?? '').trim()
  if (!id || !target) return
  const source = getPagePropViews(id).find((item) => item.id === target)
  if (!source) {
    if (target !== PAGE_PROP_TABLE_VIEW_ID && !fallbackName) return
    return createPagePropSandboxView(id, title, uniquePagePropViewName(id, `${fallbackName || '表格'} 副本`))
  }
  const listed = getPagePropViews(id)
  const view = await seedRecordSandbox({
    fieldKey: 'propViews',
    recordId: id,
    listed,
    name: `${source.name} 副本`,
    title,
    source,
    readFile: readPageFile,
    writeFile: writePageFile,
  })
  await savePagePropViews(id, [...listed, view])
  setPagePropPresentMode(id, view.id)
  return view
}

export async function deletePagePropSandboxView(pageId: string, viewId: string) {
  const id = String(pageId ?? '').trim()
  const target = String(viewId ?? '').trim()
  if (!id || !target) return
  const next = getPagePropViews(id).filter((item) => item.id !== target)
  await savePagePropViews(id, next)
  if (getPagePropPresentMode(id) === target) setPagePropPresentMode(id, PAGE_PROP_TABLE_VIEW_ID)
}

export { peekPageFile, readPageFile, writePageFile }
