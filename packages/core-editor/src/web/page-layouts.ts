import { useSyncExternalStore } from 'react'
import { createPageBlockId } from '../page-block-fence.ts'
import {
  defaultPageLayout,
  listedPageLayouts as mergeListed,
  parsePageLayouts,
  PAGE_DEFAULT_LAYOUT_ID,
  type PageLayoutView,
} from '../page-layouts.ts'
import { getPageViews, uniqueViewName } from './page-views.ts'
import { isPageBuiltinMode, setPagePresentMode } from './source-mode.ts'
import { getPagePropViews } from './page-prop-views.ts'
import { PAGE_PROP_TABLE_VIEW_ID, setPagePropPresentMode } from './page-prop-present.ts'
import { patchPageViewState, type PageSort } from './page-view-state.ts'

export type { PageLayoutView }
export {
  defaultPageLayout,
  layoutsAssetName,
  parsePageLayouts,
  PAGE_DEFAULT_LAYOUT_ID,
} from '../page-layouts.ts'

const ACTIVE_KEY = 'biu.page.layout'
const DISPLAY_KEY = 'biu.page.layout.display'

const custom = new Map<string, PageLayoutView[]>()
const active = new Map<string, string>()
const display = new Map<string, Partial<PageLayoutView>>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

function displayKey(pageId: string, layoutId: string) {
  return `${pageId}::${layoutId}`
}

function readJson(key: string): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeJson(key: string, value: Record<string, unknown>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

function readActiveStore(): Record<string, string> {
  const raw = readJson(ACTIVE_KEY)
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim()) out[id] = value
  }
  return out
}

function withDisplay(pageId: string, layout: PageLayoutView): PageLayoutView {
  const overlay = display.get(displayKey(pageId, layout.id))
  return overlay ? { ...layout, ...overlay, id: layout.id, name: layout.name, builtin: layout.builtin } : layout
}

export function getPageLayouts(pageId: string): PageLayoutView[] {
  return custom.get(String(pageId ?? '')) ?? []
}

export function setPageLayouts(pageId: string, views: PageLayoutView[]) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  custom.set(id, parsePageLayouts(views))
  bump()
}

export function resetPageLayoutState(pageId: string) {
  const id = String(pageId ?? '').trim()
  custom.delete(id)
  active.delete(id)
  for (const key of [...display.keys()]) {
    if (key === id || key.startsWith(`${id}::`)) display.delete(key)
  }
  const stored = readActiveStore()
  delete stored[id]
  writeJson(ACTIVE_KEY, stored)
  const overlays = readJson(DISPLAY_KEY)
  for (const key of Object.keys(overlays)) {
    if (key === id || key.startsWith(`${id}::`)) delete overlays[key]
  }
  writeJson(DISPLAY_KEY, overlays)
  bump()
}

export function listedPageLayouts(pageId: string): PageLayoutView[] {
  const id = String(pageId ?? '').trim()
  return mergeListed(getPageLayouts(id)).map((item) => withDisplay(id, item))
}

export function getActivePageLayoutId(pageId: string) {
  const id = String(pageId ?? '')
  const live = active.get(id)
  if (live) return live
  const stored = readActiveStore()[id]
  if (stored) {
    active.set(id, stored)
    return stored
  }
  return PAGE_DEFAULT_LAYOUT_ID
}

export function getActivePageLayout(pageId: string): PageLayoutView {
  const id = String(pageId ?? '').trim()
  const listed = listedPageLayouts(id)
  const current = listed.find((item) => item.id === getActivePageLayoutId(id))
  return current ?? listed[0] ?? defaultPageLayout()
}

function liveContentViewId(pageId: string, contentViewId: string) {
  const next = String(contentViewId ?? '').trim() || 'doc'
  if (isPageBuiltinMode(next)) return next
  if (getPageViews(pageId).some((item) => item.id === next)) return next
  return 'doc'
}

function livePropViewId(pageId: string, propViewId: string) {
  const next = String(propViewId ?? '').trim() || PAGE_PROP_TABLE_VIEW_ID
  if (next === PAGE_PROP_TABLE_VIEW_ID) return next
  if (getPagePropViews(pageId).some((item) => item.id === next)) return next
  return PAGE_PROP_TABLE_VIEW_ID
}

export function applyPageLayout(pageId: string, layout: PageLayoutView) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  const next = withDisplay(id, layout)
  setPagePresentMode(id, liveContentViewId(id, next.contentViewId))
  setPagePropPresentMode(id, livePropViewId(id, next.propViewId || PAGE_PROP_TABLE_VIEW_ID))
  patchPageViewState(id, { sort: next.sort as PageSort, filterKinds: [...next.filterKinds] })
}

export function setActivePageLayoutId(pageId: string, layoutId: string) {
  const id = String(pageId ?? '').trim()
  const next = String(layoutId ?? '').trim() || PAGE_DEFAULT_LAYOUT_ID
  if (!id) return
  active.set(id, next)
  const all = readActiveStore()
  if (next === PAGE_DEFAULT_LAYOUT_ID) delete all[id]
  else all[id] = next
  writeJson(ACTIVE_KEY, all)
  bump()
}

export function selectPageLayout(pageId: string, layout: PageLayoutView) {
  setActivePageLayoutId(pageId, layout.id)
  applyPageLayout(pageId, layout)
}

export function subscribePageLayouts(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function usePageLayouts(pageId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return listedPageLayouts(pageId)
}

export function useActivePageLayout(pageId: string) {
  usePageLayouts(pageId)
  return getActivePageLayout(pageId)
}

function hydrateDisplay() {
  if (display.size) return
  const all = readJson(DISPLAY_KEY)
  for (const [key, value] of Object.entries(all)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      display.set(key, value as Partial<PageLayoutView>)
    }
  }
}

export async function loadPageLayouts(pageId: string, seed?: unknown) {
  const id = String(pageId ?? '').trim()
  if (!id) return []
  hydrateDisplay()
  if (seed != null && seed !== '') {
    const parsed = parsePageLayouts(seed)
    setPageLayouts(id, parsed)
  } else if (!getPageLayouts(id).length) {
    setPageLayouts(id, [])
  }
  applyPageLayout(id, getActivePageLayout(id))
  return getPageLayouts(id)
}

export async function savePageLayouts(pageId: string, views: PageLayoutView[]) {
  const id = String(pageId ?? '').trim()
  if (!id) return false
  const next = parsePageLayouts(views)
  setPageLayouts(id, next)
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/pages/${id}`, content: { layouts: JSON.stringify(next) } }),
  })
  if (!res.ok) return false
  window.dispatchEvent(new Event('fsdb:change'))
  return true
}

function persistDisplay(pageId: string, layoutId: string, patch: Partial<PageLayoutView>) {
  const key = displayKey(pageId, layoutId)
  display.set(key, { ...display.get(key), ...patch })
  const all = readJson(DISPLAY_KEY)
  all[key] = display.get(key)
  writeJson(DISPLAY_KEY, all)
  bump()
}

export async function patchActivePageLayout(pageId: string, patch: Partial<PageLayoutView>) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  const current = getActivePageLayout(id)
  if (patch.contentViewId) setPagePresentMode(id, patch.contentViewId)
  if (patch.propViewId) setPagePropPresentMode(id, patch.propViewId)
  if (patch.sort || patch.filterKinds) {
    patchPageViewState(id, {
      ...(patch.sort ? { sort: patch.sort as PageSort } : {}),
      ...(patch.filterKinds ? { filterKinds: patch.filterKinds } : {}),
    })
  }
  if (current.builtin) {
    persistDisplay(id, current.id, patch)
    return
  }
  const next = getPageLayouts(id).map((item) => (item.id === current.id ? { ...item, ...patch, id: item.id, builtin: undefined } : item))
  await savePageLayouts(id, next)
}

export async function addPageLayout(pageId: string) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  const listed = listedPageLayouts(id)
  const view: PageLayoutView = {
    id: createPageBlockId(),
    name: uniqueViewName('新视图', listed.map((item) => item.name)),
    contentViewId: 'doc',
    propViewId: PAGE_PROP_TABLE_VIEW_ID,
    sort: 'doc',
    filterKinds: [],
  }
  const ok = await savePageLayouts(id, [...getPageLayouts(id), view])
  if (!ok) return
  selectPageLayout(id, view)
  return view
}

export async function copyPageLayout(pageId: string, source?: PageLayoutView) {
  const id = String(pageId ?? '').trim()
  if (!id) return
  const listed = listedPageLayouts(id)
  const from = source ?? getActivePageLayout(id)
  const view: PageLayoutView = {
    id: createPageBlockId(),
    name: uniqueViewName(`${from.name} 副本`, listed.map((item) => item.name)),
    contentViewId: from.contentViewId,
    propViewId: from.propViewId,
    sort: from.sort,
    filterKinds: [...from.filterKinds],
  }
  const ok = await savePageLayouts(id, [...getPageLayouts(id), view])
  if (!ok) return
  selectPageLayout(id, view)
  return view
}

export async function renamePageLayout(pageId: string, layoutId: string, name: string) {
  const id = String(pageId ?? '').trim()
  const target = String(layoutId ?? '').trim()
  const nextName = name.trim()
  if (!id || !target || !nextName) return
  const current = getPageLayouts(id).find((item) => item.id === target)
  if (!current) return
  await savePageLayouts(
    id,
    getPageLayouts(id).map((item) => (item.id === target ? { ...item, name: nextName } : item)),
  )
}

export async function deletePageLayout(pageId: string, layoutId: string) {
  const id = String(pageId ?? '').trim()
  const target = String(layoutId ?? '').trim()
  if (!id || !target) return
  const ok = await savePageLayouts(
    id,
    getPageLayouts(id).filter((item) => item.id !== target),
  )
  if (!ok) return
  if (getActivePageLayoutId(id) === target) selectPageLayout(id, defaultPageLayout())
}
