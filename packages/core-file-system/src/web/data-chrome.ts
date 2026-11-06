import type { CollectionChrome } from '@biu/type-file-system/ui'
import { builtinAllView, builtinAllViewId, stampRowOpenTarget } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH } from './database-path.ts'
import type { SavedView } from './saved-view.ts'

const VIA_DATA_KEY = 'biu.fsdb.via-data'

type ViaData = { viewId: string }

function readViaData(): ViaData | null {
  try {
    const raw = sessionStorage.getItem(VIA_DATA_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { viewId?: unknown }
    const viewId = String(parsed.viewId ?? '').trim()
    return viewId ? { viewId } : null
  } catch {
    return null
  }
}

let viaData: ViaData | null = typeof sessionStorage !== 'undefined' ? readViaData() : null
const viaDataListeners = new Set<() => void>()

function persistViaData(next: ViaData | null) {
  try {
    if (next) sessionStorage.setItem(VIA_DATA_KEY, JSON.stringify(next))
    else sessionStorage.removeItem(VIA_DATA_KEY)
  } catch {
    /* ignore */
  }
}

export function setViaDataCrumbs(on: boolean, viewId?: string) {
  const next = on
    ? { viewId: String(viewId || viaData?.viewId || builtinAllViewId(DATA_COLLECTION_PATH)).trim() }
    : null
  if ((viaData?.viewId ?? '') === (next?.viewId ?? '')) return
  viaData = next
  persistViaData(next)
  for (const fn of viaDataListeners) fn()
}

export function viaDataCrumbsOn() {
  return Boolean(viaData)
}

export function viaDataViewId() {
  return viaData?.viewId || builtinAllViewId(DATA_COLLECTION_PATH)
}

export function subscribeViaDataCrumbs(fn: () => void) {
  viaDataListeners.add(fn)
  return () => {
    viaDataListeners.delete(fn)
  }
}

export const dataChrome: CollectionChrome = {
  openRow(row) {
    const stamp = stampRowOpenTarget(row)
    if (!stamp) return false
    return { kind: 'record', recordId: stamp.recordId, collection: stamp.collection }
  },
  listViews(_tables, user) {
    const all = builtinAllView({ path: DATA_COLLECTION_PATH, label: '数据', view: { title: '数据' } })
    return [
      { ...all, groupBy: '', columns: ['title', 'actions', 'table'] },
      ...(user as SavedView[]).filter((view) => !view.builtin),
    ]
  },
}
