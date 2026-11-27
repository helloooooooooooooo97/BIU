import { readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { stampRowOpenTarget } from '../catalog-views.ts'

const VIA_DATA_KEY = 'biu.fsdb.via-data'

type ViaData = { viewId: string }

function readViaData(): ViaData | null {
  try {
    const raw = readStorageString(VIA_DATA_KEY, 'session')
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
    if (next) writeStorageString(VIA_DATA_KEY, JSON.stringify(next), { area: 'session' })
    else removeStorageKey(VIA_DATA_KEY, 'session')
  } catch {
    /* ignore */
  }
}

export function setViaDataCrumbs(on: boolean, viewId?: string) {
  const next = on
    ? { viewId: String(viewId || viaData?.viewId || 'all').trim() }
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
  return viaData?.viewId || 'all'
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
}
