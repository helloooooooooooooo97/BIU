import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowUpIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import type { CommentAnchor } from './comment-anchor.ts'
import type { CommentItem, CommentThread } from './comment-store.ts'
import type { CommentFilter } from './editor-view-state.ts'

export type { CommentFilter }

type CommentMemberInfo = {
  id: string
  name: string
  avatar?: string
}

const INSPECTOR_REVEAL_EVENT = 'biu:inspector-reveal'
const ACCOUNT_EVENT = 'biu:account-token'
let membersCache: Map<string, CommentMemberInfo> | null = null
let membersLoadedAt = 0
let membersInflight: Promise<Map<string, CommentMemberInfo>> | null = null
const MEMBERS_TTL_MS = 8000

async function loadCommentMembers(): Promise<Map<string, CommentMemberInfo>> {
  if (membersCache && Date.now() - membersLoadedAt < MEMBERS_TTL_MS) return membersCache
  if (membersInflight) return membersInflight
  const params = new URLSearchParams({
    path: '/workspace-members',
    limit: '500',
    columns: 'title,name,email,avatar',
  })
  const req = apiFetch(`/api/db/list?${params.toString()}`)
    .then(async (res) => {
      if (!res.ok) return new Map<string, CommentMemberInfo>()
      const data = (await res.json()) as { items?: Array<Record<string, unknown>> }
      const map = new Map<string, CommentMemberInfo>()
      for (const item of data?.items ?? []) {
        const id = String(item?.id ?? '').trim()
        if (!id) continue
        const name =
          String(item.name ?? '').trim() ||
          String(item.title ?? '').trim() ||
          String(item.email ?? '').trim() ||
          id.slice(0, 8)
        const avatar = typeof item.avatar === 'string' ? item.avatar.trim() : ''
        map.set(id, { id, name, ...(avatar ? { avatar } : {}) })
      }
      membersCache = map
      membersLoadedAt = Date.now()
      return map
    })
    .catch(() => new Map<string, CommentMemberInfo>())
    .finally(() => {
      membersInflight = null
    })
  membersInflight = req
  return req
}

function useCommentMembers(enabled: boolean): ReadonlyMap<string, CommentMemberInfo> {
  const [members, setMembers] = useState<Map<string, CommentMemberInfo>>(() => membersCache ?? new Map())
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const sync = () => {
      void loadCommentMembers().then((map) => {
        if (!cancelled) setMembers(map)
      })
    }
    const onAccountChange = () => {
      membersCache = null
      membersLoadedAt = 0
      sync()
    }
    sync()
    window.addEventListener(ACCOUNT_EVENT, onAccountChange)
    return () => {
      cancelled = true
      window.removeEventListener(ACCOUNT_EVENT, onAccountChange)
    }
  }, [enabled])
  return members
}

export function openCommentAuthor(item: CommentItem): boolean {
  const person = item.createdBy
  if (!person || typeof window === 'undefined') return false
  if (person.kind === 'user') {
    const recordId = String(person.accountId ?? '').trim()
    if (!recordId) return false
    window.dispatchEvent(
      new CustomEvent(INSPECTOR_REVEAL_EVENT, {
        detail: { collection: '/workspace-members', recordId, unique: true },
      }),
    )
    return true
  }
  if (person.kind === 'agent') {
    const recordId = String(person.sessionId ?? '').trim()
    if (!recordId) return false
    window.dispatchEvent(
      new CustomEvent(INSPECTOR_REVEAL_EVENT, {
        detail: { collection: '/agents', recordId, unique: true },
      }),
    )
    return true
  }
  return false
}

function CommentAuthorBadge({
  item,
  members,
}: {
  item: CommentItem
  members: ReadonlyMap<string, CommentMemberInfo>
}) {
  const person = item.createdBy
  const accountId = person?.kind === 'user' ? String(person.accountId ?? '').trim() : ''
  const sessionId = person?.kind === 'agent' ? String(person.sessionId ?? '').trim() : ''
  const member = accountId ? members.get(accountId) : undefined
  const displayName =
    member?.name ||
    (person?.name && person.name.trim()) ||
    item.author ||
    '用户'
  const avatar =
    member?.avatar ||
    (person?.kind === 'user' && typeof person.avatar === 'string' ? person.avatar.trim() : '')
  const seed = accountId || sessionId || displayName || 'biu-ai'
  const clickable = Boolean(accountId || sessionId)

  const content = (
    <>
      <span className="editor-comment-author-avatar" aria-hidden>
        {avatar ? <img src={avatar} alt="" /> : <AiAvatar seed={seed} className="editor-comment-author-ai-avatar" />}
      </span>
      <span className="editor-comment-author-name">{displayName}</span>
    </>
  )

  if (clickable) {
    return (
      <button
        type="button"
        className="editor-comment-author editor-comment-author-btn"
        data-testid="editor-comment-author-link"
        title={`查看成员：${displayName}`}
        onClick={(e) => {
          e.stopPropagation()
          openCommentAuthor(item)
        }}
      >
        {content}
      </button>
    )
  }

  return <span className="editor-comment-author">{content}</span>
}

export function layoutRailCards(
  items: ReadonlyArray<{ id: string; desiredTop: number | null; height: number }>,
  minTop: number,
  gap = 10,
): { tops: Map<string, number>; totalHeight: number } {
  const tops = new Map<string, number>()
  let cursor = minTop
  for (const item of items) {
    const h = Math.max(48, item.height)
    const target = item.desiredTop != null ? Math.max(minTop, item.desiredTop) : cursor
    const y = Math.max(target, cursor)
    tops.set(item.id, y)
    cursor = y + h + gap
  }
  return { tops, totalHeight: Math.max(minTop, cursor) }
}

function formatTime(ms: number) {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DRAFT_KEY = '__draft__'

export function CommentPanel({
  threads,
  filter = 'open',
  activeId,
  detachedIds,
  anchorTops,
  draftAnchor,
  draftTop,
  onCancelDraft,
  onCreateThread,
  onReplyThread,
  onSetStatus,
  onDelete,
  onSelectThread,
  onAskAi,
}: {
  threads: CommentThread[]
  filter?: CommentFilter
  activeId: string
  detachedIds: ReadonlySet<string>
  anchorTops?: ReadonlyMap<string, number>
  draftAnchor: CommentAnchor | null
  draftTop?: number | null
  onCancelDraft: () => void
  onCreateThread: (body: string, anchor: CommentAnchor | null) => Promise<void> | void
  onReplyThread: (threadId: string, body: string) => Promise<void> | void
  onSetStatus: (threadId: string, status: 'open' | 'resolved') => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onSelectThread: (threadId: string) => void
  onAskAi?: (thread: CommentThread) => void
}) {
  const [draftBody, setDraftBody] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const draftInputRef = useRef<HTMLTextAreaElement>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const members = useCommentMembers(threads.length > 0)

  useEffect(() => {
    if (draftAnchor) {
      requestAnimationFrame(() => draftInputRef.current?.focus({ preventScroll: true }))
    }
  }, [draftAnchor])

  const visible = threads.filter((t) => (filter === 'all' ? true : t.root.status === filter))

  useLayoutEffect(() => {
    const measure = () => {
      const next: Record<string, number> = {}
      let changed = false
      for (const [id, el] of cardRefs.current) {
        const h = Math.round(el.getBoundingClientRect().height)
        if (h > 0) next[id] = h
      }
      setHeights((prev) => {
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
        for (const k of keys) {
          if (prev[k] !== next[k]) {
            changed = true
            break
          }
        }
        return changed ? next : prev
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    for (const el of cardRefs.current.values()) ro.observe(el)
    return () => ro.disconnect()
  }, [visible, draftAnchor, replyDrafts])

  const usePositionedRail = Boolean(anchorTops && (anchorTops.size > 0 || draftTop != null))

  const railEntries: Array<{ id: string; desiredTop: number | null; height: number }> = []
  if (draftAnchor) {
    railEntries.push({
      id: DRAFT_KEY,
      desiredTop: draftTop ?? 0,
      height: heights[DRAFT_KEY] ?? 148,
    })
  }
  for (const thread of visible) {
    const rawTop = anchorTops?.get(thread.root.id)
    railEntries.push({
      id: thread.root.id,
      desiredTop: rawTop != null ? rawTop : null,
      height: heights[thread.root.id] ?? 128,
    })
  }
  if (usePositionedRail && draftAnchor && draftTop != null) {
    // Keep draft card sorted in visual order with existing cards
    railEntries.sort((a, b) => {
      if (a.desiredTop != null && b.desiredTop != null) return a.desiredTop - b.desiredTop
      if (a.desiredTop != null) return -1
      if (b.desiredTop != null) return 1
      return 0
    })
  }
  const layout = usePositionedRail ? layoutRailCards(railEntries, 0, 10) : null

  const bindCardRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }

  const submitDraft = async () => {
    const text = draftBody.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      await onCreateThread(text, draftAnchor)
      setDraftBody('')
      onCancelDraft()
    } finally {
      setSubmitting(false)
    }
  }

  const submitReply = async (threadId: string) => {
    const text = (replyDrafts[threadId] ?? '').trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      await onReplyThread(threadId, text)
      setReplyDrafts((prev) => ({ ...prev, [threadId]: '' }))
    } finally {
      setSubmitting(false)
    }
  }

  if (visible.length === 0 && !draftAnchor) return null

  return (
    <aside
      className={`editor-comment-rail${usePositionedRail ? ' is-anchored' : ''}`}
      data-testid="editor-comment-panel"
      aria-label="文档批注"
      style={layout ? { minHeight: layout.totalHeight } : undefined}
    >
      <div className="editor-comment-list">
        {draftAnchor ? (
          <div
            ref={bindCardRef(DRAFT_KEY)}
            className="editor-comment-composer"
            data-testid="editor-comment-composer"
            style={layout ? { top: layout.tops.get(DRAFT_KEY) ?? 0 } : undefined}
          >
            <div className="editor-comment-quote" title={draftAnchor.quote}>
              {draftAnchor.quote}
            </div>
            <textarea
              ref={draftInputRef}
              className="editor-comment-input"
              rows={3}
              placeholder="输入批注内容… (Enter 发送，Shift+Enter 换行)"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submitDraft()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  onCancelDraft()
                }
              }}
            />
            <div className="editor-comment-composer-actions">
              <button type="button" className="editor-comment-btn" onClick={onCancelDraft}>
                取消
              </button>
              <button
                type="button"
                className="editor-comment-btn is-primary"
                disabled={!draftBody.trim() || submitting}
                onClick={() => void submitDraft()}
              >
                发送
              </button>
            </div>
          </div>
        ) : null}

        {visible.map((thread) => {
          const { root, replies } = thread
          const isActive = activeId === root.id
          const detached = root.status === 'open' && Boolean(root.anchor) && detachedIds.has(root.id)
          const quoteText = root.anchor?.quote || root.anchor?.originalQuote || ''
          const top = layout?.tops.get(root.id)
          return (
            <div
              key={root.id}
              ref={bindCardRef(root.id)}
              className={`editor-comment-card${isActive ? ' is-active' : ''}${root.status === 'resolved' ? ' is-resolved' : ''}`}
              data-testid="editor-comment-card"
              data-comment-thread={root.id}
              style={top != null ? { top } : undefined}
              onClick={() => onSelectThread(root.id)}
            >
              {quoteText ? (
                <div className={`editor-comment-quote${detached ? ' is-detached' : ''}`} title={quoteText}>
                  <span>{quoteText}</span>
                  {detached ? <em className="editor-comment-detached-tag">原文已变更或删除</em> : null}
                </div>
              ) : null}

              <div className="editor-comment-meta">
                <CommentAuthorBadge item={root} members={members} />
                <span className="editor-comment-time">{formatTime(root.createdAt)}</span>
                <div className="editor-comment-actions" onClick={(e) => e.stopPropagation()}>
                  {onAskAi ? (
                    <button
                      type="button"
                      className="editor-comment-icon-btn"
                      aria-label="交给 AI 处理"
                      title="交给 AI 处理"
                      onClick={() => onAskAi(thread)}
                    >
                      <ChatBubbleLeftRightIcon aria-hidden className="size-[13px]" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="editor-comment-icon-btn"
                    aria-label={root.status === 'open' ? '解决批注' : '重新打开批注'}
                    title={root.status === 'open' ? '解决' : '重新打开'}
                    onClick={() => void onSetStatus(root.id, root.status === 'open' ? 'resolved' : 'open')}
                  >
                    {root.status === 'open' ? (
                      <CheckIcon aria-hidden className="size-[13px]" />
                    ) : (
                      <ArrowUturnLeftIcon aria-hidden className="size-[13px]" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="editor-comment-icon-btn is-danger"
                    aria-label="删除批注"
                    title="删除"
                    onClick={() => void onDelete(root.id)}
                  >
                    <TrashGlyph aria-hidden className="size-[13px]" />
                  </button>
                </div>
              </div>

              <div className="editor-comment-text">{root.body}</div>

              {replies.length > 0 ? (
                <div className="editor-comment-replies">
                  {replies.map((reply) => (
                    <div key={reply.id} className="editor-comment-reply">
                      <div className="editor-comment-meta">
                        <CommentAuthorBadge item={reply} members={members} />
                        <span className="editor-comment-time">{formatTime(reply.createdAt)}</span>
                        <div className="editor-comment-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="editor-comment-icon-btn is-danger"
                            aria-label="删除回复"
                            title="删除回复"
                            onClick={() => void onDelete(reply.id)}
                          >
                            <TrashGlyph aria-hidden className="size-[12px]" />
                          </button>
                        </div>
                      </div>
                      <div className="editor-comment-text">{reply.body}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="editor-comment-reply-box" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  className="editor-comment-reply-input"
                  placeholder="回复…"
                  aria-label="回复批注"
                  value={replyDrafts[root.id] ?? ''}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [root.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void submitReply(root.id)
                    }
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export type InlineCommentAnchorRect = {
  top: number
  bottom: number
  left: number
  right: number
}

export type InlineCommentPopoverTarget =
  | { kind: 'compose'; from: number; to: number; anchor: CommentAnchor; rect: InlineCommentAnchorRect }
  | { kind: 'view'; threadIds: string[]; rect: InlineCommentAnchorRect }

export function computeInlineCommentPopoverPos(
  rect: InlineCommentAnchorRect,
  boxSize: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const pad = 12
  const gap = 8
  const maxLeft = Math.max(pad, viewport.width - boxSize.width - pad)
  const left = Math.max(pad, Math.min(Math.round(rect.left), maxLeft))
  const spaceBelow = viewport.height - rect.bottom - pad - gap
  const spaceAbove = rect.top - pad - gap
  // 与 ⌘K 原地修改对齐：默认出现在选区/高亮下方 8px，仅当下方空间不足且上方更宽敞时翻转到上方。
  const preferBelow = spaceBelow >= boxSize.height || spaceBelow >= spaceAbove
  const rawTop = preferBelow ? rect.bottom + gap : rect.top - boxSize.height - gap
  const maxTop = Math.max(pad, viewport.height - boxSize.height - pad)
  const top = Math.max(pad, Math.min(Math.round(rawTop), maxTop))
  return { top, left }
}

export function CommentInlinePopover({
  target,
  threads,
  totalOpenCount,
  detachedIds,
  onClose,
  onOpenAll,
  onCreateThread,
  onReplyThread,
  onSetStatus,
  onDelete,
  onAskAi,
}: {
  target: InlineCommentPopoverTarget
  threads: CommentThread[]
  totalOpenCount: number
  detachedIds: ReadonlySet<string>
  onClose: () => void
  onOpenAll: (activeId?: string) => void
  onCreateThread: (body: string, anchor: CommentAnchor | null) => Promise<void> | void
  onReplyThread: (threadId: string, body: string) => Promise<void> | void
  onSetStatus: (threadId: string, status: 'open' | 'resolved') => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onAskAi?: (thread: CommentThread) => void
}) {
  const [draftBody, setDraftBody] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const members = useCommentMembers(target.kind === 'view' && threads.length > 0)
  const [pos, setPos] = useState<{ top: number; left: number }>(() =>
    computeInlineCommentPopoverPos(
      target.rect,
      { width: target.kind === 'compose' ? 360 : 312, height: target.kind === 'compose' ? 48 : 200 },
      {
        width: typeof window === 'undefined' ? 1280 : window.innerWidth,
        height: typeof window === 'undefined' ? 800 : window.innerHeight,
      },
    ),
  )
  const boxRef = useRef<HTMLDivElement>(null)
  const draftInputRef = useRef<HTMLInputElement>(null)

  const viewedThreads =
    target.kind === 'view'
      ? target.threadIds
          .map((id) => threads.find((t) => t.root.id === id))
          .filter((t): t is CommentThread => Boolean(t))
      : []

  useEffect(() => {
    if (target.kind === 'compose') {
      requestAnimationFrame(() => draftInputRef.current?.focus({ preventScroll: true }))
    }
  }, [target])

  useEffect(() => {
    if (target.kind === 'view' && viewedThreads.length === 0) {
      onClose()
    }
  }, [target.kind, viewedThreads.length, onClose])

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const next = computeInlineCommentPopoverPos(
      target.rect,
      { width: rect.width || 312, height: rect.height || 180 },
      { width: window.innerWidth, height: window.innerHeight },
    )
    setPos((prev) => (prev.top === next.top && prev.left === next.left ? prev : next))
  }, [target, viewedThreads.length, replyDrafts])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node | null
      if (node && boxRef.current?.contains(node)) return
      if (!submitting) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [submitting, onClose])

  const submitDraft = async () => {
    if (target.kind !== 'compose') return
    const text = draftBody.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      await onCreateThread(text, target.anchor)
      setDraftBody('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const submitReply = async (threadId: string) => {
    const text = (replyDrafts[threadId] ?? '').trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      await onReplyThread(threadId, text)
      setReplyDrafts((prev) => ({ ...prev, [threadId]: '' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={boxRef}
      className={target.kind === 'compose' ? 'editor-inline-edit editor-comment-compose-pill' : 'editor-comment-popover'}
      data-testid={target.kind === 'compose' ? 'editor-comment-popover-compose' : 'editor-comment-popover-view'}
      role="dialog"
      aria-label={target.kind === 'compose' ? '添加批注' : '查看批注'}
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {target.kind === 'compose' ? (
        <div className="editor-inline-edit-row" data-testid="editor-comment-composer">
          <span className="editor-inline-edit-avatar" aria-hidden>
            <ChatBubbleBottomCenterTextIcon className="editor-inline-edit-icon" />
          </span>
          <input
            ref={draftInputRef}
            type="text"
            className="editor-inline-edit-input"
            placeholder="添加批注…"
            aria-label="输入批注内容"
            value={draftBody}
            disabled={submitting}
            onChange={(e) => setDraftBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submitDraft()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
          <button
            type="button"
            className="editor-inline-edit-submit"
            aria-label="发送批注"
            disabled={!draftBody.trim() || submitting}
            onClick={() => void submitDraft()}
          >
            <ArrowUpIcon className="size-[14px]" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="editor-comment-popover-stack">
          {viewedThreads.map((thread) => {
            const { root, replies } = thread
            const detached = root.status === 'open' && Boolean(root.anchor) && detachedIds.has(root.id)
            const quoteText = root.anchor?.quote || root.anchor?.originalQuote || ''
            return (
              <div
                key={root.id}
                className={`editor-comment-card is-active${root.status === 'resolved' ? ' is-resolved' : ''}`}
                data-testid="editor-comment-card"
                data-comment-thread={root.id}
              >
                {quoteText ? (
                  <div className={`editor-comment-quote${detached ? ' is-detached' : ''}`} title={quoteText}>
                    <span>{quoteText}</span>
                    {detached ? <em className="editor-comment-detached-tag">原文已变更或删除</em> : null}
                  </div>
                ) : null}

                <div className="editor-comment-meta">
                  <CommentAuthorBadge item={root} members={members} />
                  <span className="editor-comment-time">{formatTime(root.createdAt)}</span>
                  <div className="editor-comment-actions">
                    {onAskAi ? (
                      <button
                        type="button"
                        className="editor-comment-icon-btn"
                        aria-label="交给 AI 处理"
                        title="交给 AI 处理"
                        onClick={() => onAskAi(thread)}
                      >
                        <ChatBubbleLeftRightIcon aria-hidden className="size-[13px]" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="editor-comment-icon-btn"
                      aria-label={root.status === 'open' ? '解决批注' : '重新打开批注'}
                      title={root.status === 'open' ? '解决' : '重新打开'}
                      onClick={() => {
                        void onSetStatus(root.id, root.status === 'open' ? 'resolved' : 'open')
                        if (root.status === 'open' && viewedThreads.length <= 1) onClose()
                      }}
                    >
                      {root.status === 'open' ? (
                        <CheckIcon aria-hidden className="size-[13px]" />
                      ) : (
                        <ArrowUturnLeftIcon aria-hidden className="size-[13px]" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="editor-comment-icon-btn is-danger"
                      aria-label="删除批注"
                      title="删除"
                      onClick={() => {
                        void onDelete(root.id)
                        if (viewedThreads.length <= 1) onClose()
                      }}
                    >
                      <TrashGlyph aria-hidden className="size-[13px]" />
                    </button>
                  </div>
                </div>

                <div className="editor-comment-text">{root.body}</div>

                {replies.length > 0 ? (
                  <div className="editor-comment-replies">
                    {replies.map((reply) => (
                      <div key={reply.id} className="editor-comment-reply">
                        <div className="editor-comment-meta">
                          <CommentAuthorBadge item={reply} members={members} />
                          <span className="editor-comment-time">{formatTime(reply.createdAt)}</span>
                          <div className="editor-comment-actions">
                            <button
                              type="button"
                              className="editor-comment-icon-btn is-danger"
                              aria-label="删除回复"
                              title="删除回复"
                              onClick={() => void onDelete(reply.id)}
                            >
                              <TrashGlyph aria-hidden className="size-[12px]" />
                            </button>
                          </div>
                        </div>
                        <div className="editor-comment-text">{reply.body}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="editor-comment-reply-box">
                  <input
                    type="text"
                    className="editor-comment-reply-input"
                    placeholder="回复…"
                    aria-label="回复批注"
                    value={replyDrafts[root.id] ?? ''}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [root.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void submitReply(root.id)
                      }
                    }}
                  />
                </div>
              </div>
            )
          })}
          {totalOpenCount > 1 ? (
            <button
              type="button"
              className="editor-comment-popover-all"
              onClick={() => onOpenAll(viewedThreads[0]?.root.id)}
            >
              查看全部批注 ({totalOpenCount})
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
