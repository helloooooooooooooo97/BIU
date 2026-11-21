import { useEffect, useRef, useState } from 'react'
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import type { CommentAnchor } from './comment-anchor.ts'
import type { CommentThread } from './comment-store.ts'

export type CommentFilter = 'open' | 'resolved' | 'all'

function formatTime(ms: number) {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CommentPanel({
  threads,
  activeId,
  detachedIds,
  draftAnchor,
  onCancelDraft,
  onCreateThread,
  onReplyThread,
  onSetStatus,
  onDelete,
  onSelectThread,
  onAskAi,
  onClose,
}: {
  threads: CommentThread[]
  activeId: string
  detachedIds: ReadonlySet<string>
  draftAnchor: CommentAnchor | null
  onCancelDraft: () => void
  onCreateThread: (body: string, anchor: CommentAnchor | null) => Promise<void> | void
  onReplyThread: (threadId: string, body: string) => Promise<void> | void
  onSetStatus: (threadId: string, status: 'open' | 'resolved') => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onSelectThread: (threadId: string) => void
  onAskAi?: (thread: CommentThread) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState<CommentFilter>('open')
  const [draftBody, setDraftBody] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const draftInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (draftAnchor) {
      setFilter('open')
      requestAnimationFrame(() => draftInputRef.current?.focus())
    }
  }, [draftAnchor])

  const openCount = threads.filter((t) => t.root.status === 'open').length
  const resolvedCount = threads.length - openCount
  const visible = threads.filter((t) => (filter === 'all' ? true : t.root.status === filter))

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
    <aside className="editor-comment-panel" data-testid="editor-comment-panel" aria-label="文档批注">
      <div className="editor-comment-head">
        <span className="editor-comment-title">批注</span>
        <div className="editor-comment-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'open'}
            className={`editor-comment-tab${filter === 'open' ? ' is-on' : ''}`}
            onClick={() => setFilter('open')}
          >
            未解决{openCount ? ` ${openCount}` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'resolved'}
            className={`editor-comment-tab${filter === 'resolved' ? ' is-on' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            已解决{resolvedCount ? ` ${resolvedCount}` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`editor-comment-tab${filter === 'all' ? ' is-on' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部
          </button>
        </div>
        <button
          type="button"
          className="editor-comment-icon-btn"
          aria-label="关闭批注面板"
          title="关闭"
          onClick={onClose}
        >
          <XMarkIcon aria-hidden className="size-[14px]" />
        </button>
      </div>

      <div className="editor-comment-body">
        {draftAnchor ? (
          <div className="editor-comment-composer" data-testid="editor-comment-composer">
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
          return (
            <div
              key={root.id}
              className={`editor-comment-card${isActive ? ' is-active' : ''}${root.status === 'resolved' ? ' is-resolved' : ''}`}
              data-testid="editor-comment-card"
              data-comment-thread={root.id}
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
