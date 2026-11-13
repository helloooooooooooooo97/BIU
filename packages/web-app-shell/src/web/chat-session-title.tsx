import { memo, useEffect, useRef, useState } from 'react'
import { SparklesIcon } from '@heroicons/react/16/solid'
import { bindSessionView, type SessionViewService } from '@biu/web-session-view'

export const ChatSessionTitle = memo(function ChatSessionTitle({
  useSessionView,
  sessionView,
}: {
  useSessionView: ReturnType<typeof bindSessionView>
  sessionView: SessionViewService
}) {
  const sessionId = useSessionView((state) => state.sessionId)
  const title = useSessionView((state) => {
    const id = state.sessionId
    if (!id) return ''
    return state.sessions.find((item) => item.id === id)?.title ?? ''
  })
  const [draft, setDraft] = useState(title)
  const [editing, setEditing] = useState(false)
  const [naming, setNaming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(title)
  }, [sessionId, title, editing])

  function commit() {
    if (!sessionId) return
    setEditing(false)
    const next = draft.trim()
    if (next === title.trim()) {
      setDraft(title)
      return
    }
    void sessionView.setSessionTitle(sessionId, next).catch(() => {
      setDraft(title)
    })
  }

  async function nameWithModel() {
    if (!sessionId || naming) return
    setNaming(true)
    try {
      const res = await fetch('/api/db/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `/agents/${sessionId}`, action: 'rename' }),
      })
      const body = (await res.json().catch(() => ({}))) as { title?: string; error?: string }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      const next = String(body.title ?? '').trim()
      if (next) {
        setDraft(next)
        setEditing(false)
        await sessionView.setSessionTitle(sessionId, next)
      } else {
        await sessionView.refreshSessions({ refresh: true })
      }
    } catch {
      await sessionView.refreshSessions({ refresh: true }).catch(() => undefined)
    } finally {
      setNaming(false)
    }
  }

  if (!sessionId) return null

  return (
    <div className="chat-view-session-title-wrap">
      <button
        type="button"
        className="chat-view-session-title-magic"
        aria-label="命名"
        title="根据对话给这个代理命名"
        disabled={naming}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void nameWithModel()}
      >
        <SparklesIcon aria-hidden className="size-[14px]" />
      </button>
      <input
        ref={inputRef}
        className={`chat-view-session-title${editing ? ' is-editing' : ''}`}
        value={draft}
        placeholder="未命名代理"
        aria-label="代理名称"
        data-testid="chat-session-title"
        title={title || '代理名称'}
        disabled={naming}
        size={Math.max(4, (editing ? draft : title || '未命名代理').length)}
        onFocus={() => {
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(title)
            setEditing(false)
            inputRef.current?.blur()
            return
          }
          if (event.key !== 'Enter') return
          event.preventDefault()
          inputRef.current?.blur()
        }}
      />
    </div>
  )
})
