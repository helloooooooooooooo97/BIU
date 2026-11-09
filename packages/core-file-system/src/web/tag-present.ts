import { useSyncExternalStore } from 'react'

export const TAG_TABLE_VIEW_ID = 'table'

const PRESENT_KEY = 'biu.tag.present'
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
  if (!mode || mode === TAG_TABLE_VIEW_ID) delete all[id]
  else all[id] = mode
  localStorage.setItem(PRESENT_KEY, JSON.stringify(all))
}

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

export function subscribeTagPresent(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getTagPresentMode(tagId: string) {
  const id = String(tagId ?? '').trim()
  if (!id) return TAG_TABLE_VIEW_ID
  const live = modes.get(id)
  if (live) return live
  const stored = readStore()[id]
  if (typeof stored === 'string' && stored.trim()) {
    modes.set(id, stored)
    return stored
  }
  return TAG_TABLE_VIEW_ID
}

export function setTagPresentMode(tagId: string, mode: string) {
  const id = String(tagId ?? '').trim()
  if (!id) return
  const next = String(mode ?? '').trim() || TAG_TABLE_VIEW_ID
  if (getTagPresentMode(id) === next) return
  modes.set(id, next)
  writeStore(id, next)
  bump()
}

export function useTagPresentMode(tagId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return getTagPresentMode(tagId)
}
