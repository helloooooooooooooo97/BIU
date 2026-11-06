import { useSyncExternalStore } from 'react'
import { capturePageScroll } from './page-scroll-pin.ts'
import { PAGE_VIEW_EVENT } from './page-view-state.ts'

export const PAGE_BUILTIN_MODES = ['doc', 'outline', 'table', 'source'] as const
export type PageBuiltinMode = (typeof PAGE_BUILTIN_MODES)[number]
export type PagePresentMode = PageBuiltinMode | string

export function isPageBuiltinMode(mode: string): mode is PageBuiltinMode {
  return (PAGE_BUILTIN_MODES as readonly string[]).includes(mode)
}

export function isPageCustomView(mode: string) {
  return Boolean(mode) && !isPageBuiltinMode(mode)
}

const PRESENT_KEY = 'biu.page.present'
const modes = new Map<string, PagePresentMode>()
const folded = new Map<string, Set<string>>()
let seq = 0
const listeners = new Set<() => void>()

function readPresentStore(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESENT_KEY) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function writePresentStore(id: string, mode: PagePresentMode) {
  if (typeof localStorage === 'undefined') return
  const all = readPresentStore()
  if (mode === 'doc') delete all[id]
  else all[id] = mode
  localStorage.setItem(PRESENT_KEY, JSON.stringify(all))
}

function bump() {
  seq += 1
  for (const fn of listeners) fn()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAGE_VIEW_EVENT))
}

export function getPagePresentMode(recordId: string): PagePresentMode {
  const id = String(recordId ?? '')
  const live = modes.get(id)
  if (live) return live
  const stored = readPresentStore()[id]
  if (typeof stored === 'string' && stored.trim()) {
    modes.set(id, stored)
    return stored
  }
  return 'doc'
}

export function setPagePresentMode(recordId: string, mode: PagePresentMode) {
  const id = String(recordId ?? '').trim()
  if (!id) return
  if (getPagePresentMode(id) === mode) return
  capturePageScroll()
  modes.set(id, mode)
  writePresentStore(id, mode)
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
