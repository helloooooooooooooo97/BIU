import { useSyncExternalStore } from 'react'

export const PAGE_PROP_TABLE_VIEW_ID = 'table'

const PRESENT_KEY = 'biu.page.props.present'
const modes = new Map<string, string>()
let seq = 0
const listeners = new Set<() => void>()

function readStore(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESENT_KEY) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function writeStore(id: string, mode: string) {
  if (typeof localStorage === 'undefined') return
  const all = readStore()
  if (!mode || mode === PAGE_PROP_TABLE_VIEW_ID) delete all[id]
  else all[id] = mode
  localStorage.setItem(PRESENT_KEY, JSON.stringify(all))
}

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

export function getPagePropPresentMode(recordId: string) {
  const id = String(recordId ?? '')
  const live = modes.get(id)
  if (live) return live
  const stored = readStore()[id]
  if (typeof stored === 'string' && stored.trim()) {
    modes.set(id, stored)
    return stored
  }
  return PAGE_PROP_TABLE_VIEW_ID
}

export function setPagePropPresentMode(recordId: string, mode: string) {
  const id = String(recordId ?? '').trim()
  if (!id) return
  const next = String(mode ?? '').trim() || PAGE_PROP_TABLE_VIEW_ID
  if (getPagePropPresentMode(id) === next) return
  modes.set(id, next)
  writeStore(id, next)
  bump()
}

export function usePagePropPresentMode(recordId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return getPagePropPresentMode(recordId)
}
