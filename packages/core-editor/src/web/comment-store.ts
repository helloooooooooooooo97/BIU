import { apiFetch } from '@biu/biu-ui/api-client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { asPerson, emitFsdbChange, FSDB_CHANGE_EVENT, type DbRecord, type PersonValue } from '@biu/type-file-system'
import type { CommentAnchor } from './comment-anchor.ts'

export type CommentItem = {
  id: string
  body: string
  targetPath: string
  threadId: string
  parentId: string
  status: 'open' | 'resolved'
  anchor: CommentAnchor | null
  author: string
  createdBy?: PersonValue | null
  createdAt: number
  updatedAt: number
}

export type CommentThread = {
  root: CommentItem
  replies: CommentItem[]
}

function parseAnchor(raw: unknown): CommentAnchor | null {
  let obj = raw
  if (typeof obj === 'string') {
    const trimmed = obj.trim()
    if (!trimmed) return null
    try {
      obj = JSON.parse(trimmed) as unknown
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const data = obj as Record<string, unknown>
  const quote = String(data.quote ?? '')
  const blockId = String(data.blockId ?? '').trim()
  if (!quote && !blockId) return null
  return {
    blockId,
    quote,
    ...(typeof data.originalQuote === 'string' && data.originalQuote ? { originalQuote: data.originalQuote } : {}),
    prefix: String(data.prefix ?? ''),
    suffix: String(data.suffix ?? ''),
    offset: Number.isFinite(Number(data.offset)) ? Math.max(0, Math.round(Number(data.offset))) : 0,
  }
}

export function commentItemFromRecord(row: Record<string, unknown>): CommentItem | null {
  const id = String(row.id ?? '').trim()
  if (!id) return null
  const parentId = String(row.parentId ?? '').trim()
  const threadId = String(row.threadId ?? '').trim() || parentId || id
  const createdBy = asPerson(row.createdBy)
  const rawAuthor = String(row.author ?? '').trim()
  const author =
    (createdBy?.name && createdBy.name.trim()) ||
    (rawAuthor && rawAuthor !== '用户' ? rawAuthor : '') ||
    rawAuthor ||
    '用户'
  return {
    id,
    body: String(row.body ?? row.title ?? ''),
    targetPath: String(row.targetPath ?? '').trim(),
    threadId,
    parentId,
    status: row.status === 'resolved' ? 'resolved' : 'open',
    anchor: parseAnchor(row.anchor),
    author,
    ...(createdBy ? { createdBy } : {}),
    createdAt: Number(row.createdAt) || 0,
    updatedAt: Number(row.updatedAt) || 0,
  }
}

export function groupCommentThreads(items: CommentItem[]): CommentThread[] {
  const roots = new Map<string, CommentItem>()
  const repliesByThread = new Map<string, CommentItem[]>()
  for (const item of items) {
    if (!item.parentId && item.threadId === item.id) {
      roots.set(item.id, item)
    } else {
      const list = repliesByThread.get(item.threadId) ?? []
      list.push(item)
      repliesByThread.set(item.threadId, list)
    }
  }
  const out: CommentThread[] = []
  for (const root of roots.values()) {
    const replies = (repliesByThread.get(root.id) ?? []).sort((a, b) => a.createdAt - b.createdAt)
    out.push({ root, replies })
  }
  out.sort((a, b) => a.root.createdAt - b.root.createdAt)
  return out
}

export function sortCommentThreadsByPosition(
  threads: CommentThread[],
  positions: ReadonlyMap<string, { from: number; to: number }>,
): CommentThread[] {
  return [...threads].sort((a, b) => {
    const pa = positions.get(a.root.id)
    const pb = positions.get(b.root.id)
    if (pa && pb) {
      if (pa.from !== pb.from) return pa.from - pb.from
      if (pa.to !== pb.to) return pa.to - pb.to
      return a.root.createdAt - b.root.createdAt
    }
    if (pa) return -1
    if (pb) return 1
    return a.root.createdAt - b.root.createdAt
  })
}

export async function fetchComments(targetPath: string, signal?: AbortSignal): Promise<CommentItem[]> {
  if (!targetPath) return []
  const params = new URLSearchParams({
    path: '/comments',
    limit: '500',
    filter: JSON.stringify({ targetPath }),
  })
  const res = await apiFetch(`/api/db/list?${params.toString()}`, { signal })
  if (!res.ok) return []
  const data = (await res.json()) as { items?: DbRecord[] }
  const items = Array.isArray(data?.items) ? data.items : []
  return items
    .map(commentItemFromRecord)
    .filter((item): item is CommentItem => Boolean(item && item.targetPath === targetPath))
}

export async function apiCreateComment(input: {
  body: string
  targetPath: string
  threadId?: string
  parentId?: string
  anchor?: CommentAnchor | null
}): Promise<CommentItem | null> {
  const res = await apiFetch('/api/db/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: '/comments',
      records: [
        {
          body: input.body,
          targetPath: input.targetPath,
          ...(input.threadId ? { threadId: input.threadId } : {}),
          ...(input.parentId ? { parentId: input.parentId } : {}),
          status: 'open',
          anchor: input.anchor ? JSON.stringify(input.anchor) : '',
        },
      ],
    }),
  })
  if (!res.ok) return null
  emitFsdbChange({ scope: 'records', path: '/comments' })
  const data = (await res.json()) as { items?: DbRecord[]; ids?: string[]; records?: DbRecord[] }
  const first = data?.items?.[0] ?? data?.records?.[0]
  return first ? commentItemFromRecord(first) : null
}

export async function apiUpdateComment(
  id: string,
  patch: { body?: string; status?: 'open' | 'resolved'; anchor?: CommentAnchor | null },
): Promise<boolean> {
  const content: Record<string, unknown> = {}
  if (patch.body !== undefined) content.body = patch.body
  if (patch.status !== undefined) content.status = patch.status
  if (patch.anchor !== undefined) content.anchor = patch.anchor ? JSON.stringify(patch.anchor) : ''
  const res = await apiFetch('/api/db/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: `/comments/${id}`, content }),
  })
  if (!res.ok) return false
  emitFsdbChange({ scope: 'records', path: '/comments' })
  return true
}

export async function apiDeleteComment(id: string): Promise<boolean> {
  const res = await apiFetch('/api/db/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/comments', ids: [id] }),
  })
  if (!res.ok) return false
  emitFsdbChange({ scope: 'records', path: '/comments' })
  return true
}

export function useRecordComments(targetPath: string) {
  const [items, setItems] = useState<CommentItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!targetPath) {
      setItems([])
      setLoaded(true)
      return
    }
    try {
      const next = await fetchComments(targetPath, signal)
      if (signal?.aborted) return
      setItems(next)
      setLoaded(true)
    } catch {
      if (signal?.aborted) return
      setLoaded(true)
    }
  }, [targetPath])

  useEffect(() => {
    const controller = new AbortController()
    void reload(controller.signal)
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (!targetPath || typeof window === 'undefined') return
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail
      const changed = String(detail?.path ?? '')
      if (!changed || changed === '/comments' || changed.startsWith('/comments/')) {
        void reload()
      }
    }
    window.addEventListener(FSDB_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(FSDB_CHANGE_EVENT, onChange)
  }, [reload, targetPath])

  const createThread = useCallback(
    async (body: string, anchor: CommentAnchor | null) => {
      const text = body.trim()
      if (!text || !targetPath) return null
      const created = await apiCreateComment({ body: text, targetPath, anchor })
      await reload()
      return created
    },
    [reload, targetPath],
  )

  const replyThread = useCallback(
    async (threadId: string, body: string) => {
      const text = body.trim()
      if (!text || !targetPath) return null
      const created = await apiCreateComment({ body: text, targetPath, threadId, parentId: threadId })
      await reload()
      return created
    },
    [reload, targetPath],
  )

  const setThreadStatus = useCallback(
    async (id: string, status: 'open' | 'resolved') => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)))
      await apiUpdateComment(id, { status })
      await reload()
    },
    [reload],
  )

  const updateThreadAnchor = useCallback(
    async (id: string, anchor: CommentAnchor) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, anchor } : item)))
      await apiUpdateComment(id, { anchor })
    },
    [],
  )

  const deleteComment = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((item) => item.id !== id && item.threadId !== id))
      await apiDeleteComment(id)
      await reload()
    },
    [reload],
  )

  const threads = useMemo(() => groupCommentThreads(items), [items])

  return {
    items,
    threads,
    loaded,
    reload,
    createThread,
    replyThread,
    setThreadStatus,
    updateThreadAnchor,
    deleteComment,
  }
}
