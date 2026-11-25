import { useSyncExternalStore } from 'react'
import type { RecordLayoutSort } from '@biu/type-file-system/record-views'
import type { CommentAnchor } from './comment-anchor.ts'

export type PageSort = RecordLayoutSort
export type PageGroup = '' | 'kind' | 'heading'

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

export type CommentFilter = 'open' | 'resolved' | 'all'

export type EditorCommentsUiState = {
  open: boolean
  filter: CommentFilter
  activeId: string
  openCount: number
  resolvedCount: number
  draftAnchor: CommentAnchor | null
}

const emptyCommentsUi: EditorCommentsUiState = {
  open: false,
  filter: 'open',
  activeId: '',
  openCount: 0,
  resolvedCount: 0,
  draftAnchor: null,
}
const commentsUiStore = new Map<string, EditorCommentsUiState>()
let commentsUiSeq = 0
const commentsUiListeners = new Set<() => void>()

function bumpCommentsUi() {
  commentsUiSeq += 1
  for (const fn of commentsUiListeners) fn()
}

export function getEditorCommentsUi(recordId: string): EditorCommentsUiState {
  return commentsUiStore.get(String(recordId ?? '')) ?? emptyCommentsUi
}

export function patchEditorCommentsUi(recordId: string, patch: Partial<EditorCommentsUiState>) {
  const id = String(recordId ?? '').trim()
  if (!id) return
  const prev = getEditorCommentsUi(id)
  const next: EditorCommentsUiState = {
    open: patch.open ?? prev.open,
    filter: patch.filter ?? prev.filter,
    activeId: patch.activeId ?? prev.activeId,
    openCount: patch.openCount ?? prev.openCount,
    resolvedCount: patch.resolvedCount ?? prev.resolvedCount,
    draftAnchor: patch.draftAnchor !== undefined ? patch.draftAnchor : prev.draftAnchor,
  }
  if (
    next.open === prev.open &&
    next.filter === prev.filter &&
    next.activeId === prev.activeId &&
    next.openCount === prev.openCount &&
    next.resolvedCount === prev.resolvedCount &&
    next.draftAnchor === prev.draftAnchor
  ) {
    return
  }
  commentsUiStore.set(id, next)
  bumpCommentsUi()
}

export function useEditorCommentsUi(recordId: string) {
  useSyncExternalStore(
    (fn) => {
      commentsUiListeners.add(fn)
      return () => commentsUiListeners.delete(fn)
    },
    () => commentsUiSeq,
  )
  return getEditorCommentsUi(recordId)
}
