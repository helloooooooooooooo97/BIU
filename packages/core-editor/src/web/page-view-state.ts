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
export const PAGE_FIND_EVENT = 'biu:page-find'

export type PageFindState = {
  open: boolean
  query: string
  index: number
  total: number
}

const emptyFind: PageFindState = { open: false, query: '', index: 0, total: 0 }
const findStore = new Map<string, PageFindState>()
let findSeq = 0
const findListeners = new Set<() => void>()

function bumpFind() {
  findSeq += 1
  for (const fn of findListeners) fn()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAGE_FIND_EVENT))
}

export function getPageFind(recordId: string): PageFindState {
  return findStore.get(String(recordId ?? '')) ?? emptyFind
}

export function patchPageFind(recordId: string, patch: Partial<PageFindState>) {
  const id = String(recordId ?? '').trim()
  if (!id) return
  const prev = getPageFind(id)
  const next: PageFindState = {
    open: patch.open ?? prev.open,
    query: patch.query ?? prev.query,
    index: patch.index ?? prev.index,
    total: patch.total ?? prev.total,
  }
  findStore.set(id, next)
  bumpFind()
}

export function usePageFind(recordId: string) {
  useSyncExternalStore(
    (fn) => {
      findListeners.add(fn)
      return () => findListeners.delete(fn)
    },
    () => findSeq,
  )
  return getPageFind(recordId)
}

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
