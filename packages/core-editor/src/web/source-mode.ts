import { useSyncExternalStore } from 'react'
import { PAGE_VIEW_EVENT } from './page-view-state.ts'

export type PagePresentMode = 'doc' | 'outline' | 'table' | 'source'

const modes = new Map<string, PagePresentMode>()
const folded = new Map<string, Set<string>>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAGE_VIEW_EVENT))
}

export function getPagePresentMode(recordId: string): PagePresentMode {
  return modes.get(String(recordId ?? '')) ?? 'doc'
}

export function setPagePresentMode(recordId: string, mode: PagePresentMode) {
  const id = String(recordId ?? '').trim()
  if (!id) return
  if (getPagePresentMode(id) === mode) return
  modes.set(id, mode)
  bump()
}

export function isPageSourceMode(recordId: string) {
  return getPagePresentMode(recordId) === 'source'
}

export function setPageSourceMode(recordId: string, on: boolean) {
  setPagePresentMode(recordId, on ? 'source' : 'doc')
}

export function togglePageSourceMode(recordId: string) {
  setPageSourceMode(recordId, !isPageSourceMode(recordId))
}

export function pageOutlineFolded(recordId: string) {
  return folded.get(String(recordId ?? '')) ?? new Set<string>()
}

export function togglePageOutlineFold(recordId: string, blockId: string) {
  const id = String(recordId ?? '').trim()
  const block = String(blockId ?? '').trim()
  if (!id || !block) return
  const next = new Set(pageOutlineFolded(id))
  if (next.has(block)) next.delete(block)
  else next.add(block)
  folded.set(id, next)
  bump()
}

export function usePagePresentMode(recordId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return getPagePresentMode(recordId)
}

export function usePageSourceMode(recordId: string) {
  return usePagePresentMode(recordId) === 'source'
}
