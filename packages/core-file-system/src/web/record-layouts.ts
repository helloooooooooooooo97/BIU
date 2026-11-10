import { useSyncExternalStore } from 'react'
import {
  DEFAULT_RECORD_LAYOUT_ID,
  DEFAULT_RECORD_PROP_VIEW_ID,
  defaultRecordLayout,
  listedRecordLayouts as mergeListed,
  parseRecordLayoutDefaultName,
  parseRecordLayouts,
  uniqueViewName,
  type RecordLayoutView,
} from '@biu/type-file-system/record-views'

export type { RecordLayoutView }
export { DEFAULT_RECORD_LAYOUT_ID, DEFAULT_RECORD_PROP_VIEW_ID, defaultRecordLayout, parseRecordLayouts, uniqueViewName }

const ACTIVE_KEY = 'biu.record.layout'
const DISPLAY_KEY = 'biu.record.layout.display'

const custom = new Map<string, RecordLayoutView[]>()
const active = new Map<string, string>()
const display = new Map<string, Partial<RecordLayoutView>>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

export function subscribeRecordLayouts(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function recordViewKey(collectionPath: string, recordId: string) {
  return `${String(collectionPath ?? '').trim() || '/'}::${String(recordId ?? '').trim()}`
}

function displayKey(key: string, layoutId: string) {
  return `${key}::${layoutId}`
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

function hydrateDisplay() {
  if (display.size) return
  const all = readJson(DISPLAY_KEY)
  for (const [slot, value] of Object.entries(all)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      display.set(slot, value as Partial<RecordLayoutView>)
    }
  }
}

function withDisplay(key: string, layout: RecordLayoutView): RecordLayoutView {
  hydrateDisplay()
  const overlay = display.get(displayKey(key, layout.id))
  if (!overlay) return layout
  const name = String(overlay.name ?? '').trim()
  return { ...layout, ...overlay, id: layout.id, name: name || layout.name, builtin: layout.builtin }
}

export function getRecordLayouts(collectionPath: string, recordId: string): RecordLayoutView[] {
  return custom.get(recordViewKey(collectionPath, recordId)) ?? []
}

export function setRecordLayouts(collectionPath: string, recordId: string, views: RecordLayoutView[]) {
  const key = recordViewKey(collectionPath, recordId)
  if (!key.endsWith('::') && key.includes('::')) custom.set(key, parseRecordLayouts(views))
  bump()
}

export function listedRecordLayouts(collectionPath: string, recordId: string, fallbackContent = 'doc'): RecordLayoutView[] {
  const key = recordViewKey(collectionPath, recordId)
  return mergeListed(getRecordLayouts(collectionPath, recordId), fallbackContent).map((item) => withDisplay(key, item))
}

export function getActiveRecordLayoutId(collectionPath: string, recordId: string) {
  const key = recordViewKey(collectionPath, recordId)
  const live = active.get(key)
  if (live) return live
  const stored = readJson(ACTIVE_KEY)[key]
  if (typeof stored === 'string' && stored.trim()) {
    active.set(key, stored)
    return stored
  }
  return DEFAULT_RECORD_LAYOUT_ID
}

export function getActiveRecordLayout(collectionPath: string, recordId: string, fallbackContent = 'doc'): RecordLayoutView {
  const listed = listedRecordLayouts(collectionPath, recordId, fallbackContent)
  const current = listed.find((item) => item.id === getActiveRecordLayoutId(collectionPath, recordId))
  return current ?? listed[0] ?? defaultRecordLayout(fallbackContent)
}

export function setActiveRecordLayoutId(collectionPath: string, recordId: string, layoutId: string) {
  const key = recordViewKey(collectionPath, recordId)
  const next = String(layoutId ?? '').trim() || DEFAULT_RECORD_LAYOUT_ID
  active.set(key, next)
  const all = readJson(ACTIVE_KEY)
  if (next === DEFAULT_RECORD_LAYOUT_ID) delete all[key]
  else all[key] = next
  writeJson(ACTIVE_KEY, all)
  bump()
}

export function useRecordLayouts(collectionPath: string, recordId: string, fallbackContent = 'doc') {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return listedRecordLayouts(collectionPath, recordId, fallbackContent)
}

export function useActiveRecordLayout(collectionPath: string, recordId: string, fallbackContent = 'doc') {
  useRecordLayouts(collectionPath, recordId, fallbackContent)
  return getActiveRecordLayout(collectionPath, recordId, fallbackContent)
}

export async function loadRecordLayouts(collectionPath: string, recordId: string, seed?: unknown, fallbackContent = 'doc') {
  const id = String(recordId ?? '').trim()
  if (!id) return []
  hydrateDisplay()
  if (seed != null && seed !== '') {
    setRecordLayouts(collectionPath, id, parseRecordLayouts(seed, fallbackContent))
    const name = parseRecordLayoutDefaultName(seed)
    if (name) persistDisplay(recordViewKey(collectionPath, id), DEFAULT_RECORD_LAYOUT_ID, { name })
  } else if (!getRecordLayouts(collectionPath, id).length) {
    setRecordLayouts(collectionPath, id, [])
  }
  return getRecordLayouts(collectionPath, id)
}

export async function saveRecordLayouts(collectionPath: string, recordId: string, views: RecordLayoutView[]) {
  const id = String(recordId ?? '').trim()
  const path = String(collectionPath ?? '').trim()
  if (!id || !path) return false
  const next = parseRecordLayouts(views)
  setRecordLayouts(path, id, next)
  const defaultName = String(display.get(displayKey(recordViewKey(path, id), DEFAULT_RECORD_LAYOUT_ID))?.name ?? '').trim()
  const payload =
    defaultName && defaultName !== defaultRecordLayout().name
      ? [{ id: DEFAULT_RECORD_LAYOUT_ID, name: defaultName }, ...next]
      : next
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `${path}/${id}`, content: { layouts: JSON.stringify(payload) } }),
  })
  if (!res.ok) return false
  window.dispatchEvent(new Event('fsdb:change'))
  return true
}

function persistDisplay(key: string, layoutId: string, patch: Partial<RecordLayoutView>) {
  const slot = displayKey(key, layoutId)
  display.set(slot, { ...display.get(slot), ...patch })
  const all = readJson(DISPLAY_KEY)
  all[slot] = display.get(slot)
  writeJson(DISPLAY_KEY, all)
  bump()
}

export async function patchActiveRecordLayout(
  collectionPath: string,
  recordId: string,
  patch: Partial<RecordLayoutView>,
  fallbackContent = 'doc',
) {
  const path = String(collectionPath ?? '').trim()
  const id = String(recordId ?? '').trim()
  if (!path || !id) return
  const key = recordViewKey(path, id)
  const current = getActiveRecordLayout(path, id, fallbackContent)
  if (current.builtin) {
    persistDisplay(key, current.id, patch)
    return
  }
  const next = getRecordLayouts(path, id).map((item) =>
    item.id === current.id ? { ...item, ...patch, id: item.id, builtin: undefined } : item,
  )
  await saveRecordLayouts(path, id, next)
}

export async function addRecordLayout(collectionPath: string, recordId: string, fallbackContent = 'doc') {
  const path = String(collectionPath ?? '').trim()
  const id = String(recordId ?? '').trim()
  if (!path || !id) return
  const listed = listedRecordLayouts(path, id, fallbackContent)
  const view: RecordLayoutView = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 8),
    name: uniqueViewName('新视图', listed.map((item) => item.name)),
    contentViewId: fallbackContent,
    propViewId: DEFAULT_RECORD_PROP_VIEW_ID,
    sort: 'doc',
    filterKinds: [],
  }
  const ok = await saveRecordLayouts(path, id, [...getRecordLayouts(path, id), view])
  if (!ok) return
  setActiveRecordLayoutId(path, id, view.id)
  return view
}

export async function copyRecordLayout(collectionPath: string, recordId: string, source?: RecordLayoutView, fallbackContent = 'doc') {
  const path = String(collectionPath ?? '').trim()
  const id = String(recordId ?? '').trim()
  if (!path || !id) return
  const listed = listedRecordLayouts(path, id, fallbackContent)
  const from = source ?? getActiveRecordLayout(path, id, fallbackContent)
  const view: RecordLayoutView = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 8),
    name: uniqueViewName(`${from.name} 副本`, listed.map((item) => item.name)),
    contentViewId: from.contentViewId,
    propViewId: from.propViewId,
    sort: from.sort,
    filterKinds: [...from.filterKinds],
  }
  const ok = await saveRecordLayouts(path, id, [...getRecordLayouts(path, id), view])
  if (!ok) return
  setActiveRecordLayoutId(path, id, view.id)
  return view
}

export async function renameRecordLayout(collectionPath: string, recordId: string, layoutId: string, name: string) {
  const path = String(collectionPath ?? '').trim()
  const id = String(recordId ?? '').trim()
  const target = String(layoutId ?? '').trim()
  const nextName = name.trim()
  if (!path || !id || !target || !nextName) return
  const current = listedRecordLayouts(path, id).find((item) => item.id === target)
  if (!current) return
  if (current.builtin) {
    persistDisplay(recordViewKey(path, id), target, { name: nextName })
    await saveRecordLayouts(path, id, getRecordLayouts(path, id))
    return
  }
  await saveRecordLayouts(
    path,
    id,
    getRecordLayouts(path, id).map((item) => (item.id === target ? { ...item, name: nextName } : item)),
  )
}

export async function deleteRecordLayout(collectionPath: string, recordId: string, layoutId: string, fallbackContent = 'doc') {
  const path = String(collectionPath ?? '').trim()
  const id = String(recordId ?? '').trim()
  const target = String(layoutId ?? '').trim()
  if (!path || !id || !target) return
  const ok = await saveRecordLayouts(
    path,
    id,
    getRecordLayouts(path, id).filter((item) => item.id !== target),
  )
  if (!ok) return
  if (getActiveRecordLayoutId(path, id) === target) setActiveRecordLayoutId(path, id, DEFAULT_RECORD_LAYOUT_ID)
}

export function resetRecordLayoutState(collectionPath: string, recordId: string) {
  const key = recordViewKey(collectionPath, recordId)
  custom.delete(key)
  active.delete(key)
  for (const slot of [...display.keys()]) {
    if (slot.startsWith(`${key}::`)) display.delete(slot)
  }
  bump()
}
