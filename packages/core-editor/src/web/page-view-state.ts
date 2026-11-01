import { useSyncExternalStore } from 'react'

export type PageSort = 'doc' | 'title-asc' | 'title-desc' | 'kind'
export type PageGroup = '' | 'kind' | 'heading'

export type PageViewState = {
  filterKinds: string[]
  sort: PageSort
  group: PageGroup
}

export const PAGE_INSERT_EVENT = 'biu:page-insert'
export const PAGE_FIND_OPEN_EVENT = 'biu:page-find-open'
export const PAGE_OUTLINE_EVENT = 'biu:page-outline'
export const PAGE_VIEW_EVENT = 'biu:page-view'

const empty: PageViewState = { filterKinds: [], sort: 'doc', group: '' }
const store = new Map<string, PageViewState>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAGE_VIEW_EVENT))
}

export function getPageViewState(recordId: string): PageViewState {
  return store.get(String(recordId ?? '')) ?? empty
}

export function patchPageViewState(recordId: string, patch: Partial<PageViewState>) {
  const id = String(recordId ?? '').trim()
  if (!id) return
  const prev = getPageViewState(id)
  const next: PageViewState = {
    filterKinds: patch.filterKinds ?? prev.filterKinds,
    sort: patch.sort ?? prev.sort,
    group: patch.group ?? prev.group,
  }
  store.set(id, next)
  bump()
}

export function pageFilterActive(state: PageViewState) {
  return state.filterKinds.length > 0
}

export function usePageViewState(recordId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return getPageViewState(recordId)
}
