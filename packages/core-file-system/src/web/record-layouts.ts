import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import { useSyncExternalStore } from 'react'
import { emitViewCatalogChange, getRecordViewCatalog, patchRecordViewCatalog, subscribeRecordViewCatalog } from './record-view-catalog.ts'
import { registerWorkspaceCache } from './workspace-client-store.ts'
import {
  DEFAULT_RECORD_LAYOUT_ID,
  DEFAULT_RECORD_PROP_VIEW_ID,
  createRecordViewId,
  defaultRecordLayout,
  listedRecordLayouts as mergeListed,
  parseRecordLayoutDefaultName,
  parseRecordLayouts,
  uniqueViewName,
  type RecordLayoutView,
} from '@biu/type-file-system/record-views'

export type { RecordLayoutView }
export { DEFAULT_RECORD_LAYOUT_ID, DEFAULT_RECORD_PROP_VIEW_ID, defaultRecordLayout, parseRecordLayouts, uniqueViewName }

const DISPLAY_KEY = 'biu.record.layout.display'

const display = new Map<string, Partial<RecordLayoutView>>()
let seq = 0
const listeners = new Set<() => void>()

registerWorkspaceCache('record-layouts-display', () => {
  if (display.size === 0) return
  display.clear()
  bump()
})

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

export function subscribeRecordLayouts(fn: () => void) {
  const offCatalog = subscribeRecordViewCatalog(fn)
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
    offCatalog()
  }
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
    const parsed = JSON.parse(readStorageString(key, { scope: 'workspace' }) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeJson(key: string, value: Record<string, unknown>) {
  if (typeof localStorage === 'undefined') return
  writeStorageString(key, JSON.stringify(value), { scope: 'workspace' })
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

/** 记录里真实存的布局数组（用于写回服务端）。不含内置默认布局、不含本机 overlay。 */
export function getRecordLayouts(collectionPath: string, recordId: string): RecordLayoutView[] {
  return getRecordViewCatalog(collectionPath, recordId).layouts
}

export function setRecordLayouts(collectionPath: string, recordId: string, views: RecordLayoutView[]) {
  const next = parseRecordLayouts(views)
  patchRecordViewCatalog(collectionPath, recordId, { layouts: next })
  bump()
}

/** 菜单展示用的布局列表：内置默认布局 + 记录里的 + 本机 overlay 改名。 */
export function listedRecordLayouts(collectionPath: string, recordId: string, fallbackContent = 'doc'): RecordLayoutView[] {
  const key = recordViewKey(collectionPath, recordId)
  return mergeListed(getRecordLayouts(collectionPath, recordId), fallbackContent).map((item) => withDisplay(key, item))
}

export function getActiveRecordLayoutId(collectionPath: string, recordId: string) {
  return getRecordViewCatalog(collectionPath, recordId).activeLayoutId.trim() || DEFAULT_RECORD_LAYOUT_ID
}

export function getActiveRecordLayout(collectionPath: string, recordId: string, fallbackContent = 'doc'): RecordLayoutView {
  const listed = listedRecordLayouts(collectionPath, recordId, fallbackContent)
  const current = listed.find((item) => item.id === getActiveRecordLayoutId(collectionPath, recordId))
  return current ?? listed[0] ?? defaultRecordLayout(fallbackContent)
}

export function setActiveRecordLayoutId(collectionPath: string, recordId: string, layoutId: string) {
  const next = String(layoutId ?? '').trim() || DEFAULT_RECORD_LAYOUT_ID
  patchRecordViewCatalog(collectionPath, recordId, { activeLayoutId: next })
  bump()
}

export function useRecordLayouts(collectionPath: string, recordId: string, fallbackContent = 'doc') {
  useSyncExternalStore(subscribeRecordLayouts, () => seq)
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
  const res = await apiFetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `${path}/${id}`, content: { layouts: JSON.stringify(payload) } }),
  })
  if (!res.ok) return false
  patchRecordViewCatalog(path, id, { layouts: next })
  emitViewCatalogChange(path, id)
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

export function persistRecordLayoutDisplay(
  collectionPath: string,
  recordId: string,
  layoutId: string,
  patch: Partial<RecordLayoutView>,
) {
  persistDisplay(recordViewKey(collectionPath, recordId), layoutId, patch)
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
  if (patch.contentViewId || patch.propViewId) {
    patchRecordViewCatalog(path, id, {
      ...(patch.contentViewId ? { contentViewId: patch.contentViewId } : {}),
      ...(patch.propViewId ? { propViewId: patch.propViewId } : {}),
    })
  }
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
    id: createRecordViewId(),
    name: uniqueViewName('新视图', listed.map((item) => item.name)),
    contentViewId: fallbackContent,
    propViewId: DEFAULT_RECORD_PROP_VIEW_ID,
    sort: fallbackContent === 'chat' ? 'time-desc' : 'doc',
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
    id: createRecordViewId(),
    name: uniqueViewName(`${from.name} 副本`, listed.map((item) => item.name)),
    contentViewId: from.contentViewId,
    propViewId: from.propViewId,
    sort: from.sort,
    filterKinds: [...from.filterKinds],
    ...(from.group ? { group: from.group } : {}),
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