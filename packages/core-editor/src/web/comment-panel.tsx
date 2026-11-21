import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import type { CommentAnchor } from './comment-anchor.ts'
import type { CommentThread } from './comment-store.ts'
import type { CommentFilter } from './editor-view-state.ts'

export type { CommentFilter }

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
              placeholder="输入批注内容… (⌘+Enter 发送)"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
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

        {visible.length === 0 && !draftAnchor ? (
          <div className="editor-comment-empty">
            {filter === 'open' ? '暂无未解决批注。选中正文后可点击「批注」或按 ⌘⌥M 添加。' : '暂无批注'}
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
                <span className="editor-comment-author">{root.author}</span>
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
                        <span className="editor-comment-author">{reply.author}</span>
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
