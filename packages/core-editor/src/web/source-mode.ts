import { useSyncExternalStore } from 'react'
import { PAGE_VIEW_EVENT } from './editor-view-state.ts'

export const PAGE_BUILTIN_MODES = ['doc', 'outline', 'table', 'source', 'hidden'] as const
export type PageBuiltinMode = (typeof PAGE_BUILTIN_MODES)[number]

export function isPageBuiltinMode(mode: string): mode is PageBuiltinMode {
  return (PAGE_BUILTIN_MODES as readonly string[]).includes(mode)
}

export function isPageCustomView(mode: string) {
  return Boolean(mode) && !isPageBuiltinMode(mode)
}

const folded = new Map<string, Set<string>>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAGE_VIEW_EVENT))
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

export function subscribePagePresent(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

