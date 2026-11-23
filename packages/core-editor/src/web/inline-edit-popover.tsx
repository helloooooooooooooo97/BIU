import { apiFetch } from '@biu/biu-ui/api-client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowPathIcon, ArrowUpIcon, SparklesIcon } from '@heroicons/react/16/solid'
import { resolveSessionMascot, SidebarMascot } from '@biu/public-mascot'

type SessionListEntry = {
  id: string
  title?: string
  mascot?: { shape: string; color: string; eye?: number }
}

type SessionViewLike = {
  get?: () => { sessionId?: string | null; sessions?: SessionListEntry[] }
  subscribe?: (fn: () => void) => () => void
}

type GlobalAgentSnapshot = {
  sessionId: string
  title: string
  mascot?: { shape: string; color: string; eye?: number }
}

let boundCtx: { get?: (key: string) => unknown } | null = null
let cachedSnapshot: GlobalAgentSnapshot | null = null

export function bindInlineEditSessionView(ctx: { get?: (key: string) => unknown } | null) {
  boundCtx = ctx
  cachedSnapshot = null
}

function getSessionView(): SessionViewLike | undefined {
  try {
    return boundCtx?.get?.('sessionView') as SessionViewLike | undefined
  } catch {
    return undefined
  }
}

function subscribeGlobalAgent(fn: () => void) {
  const view = getSessionView()
  if (!view?.subscribe) return () => undefined
  return view.subscribe(fn)
}

function readGlobalAgent(): GlobalAgentSnapshot | null {
  const view = getSessionView()
  const state = view?.get?.()
  const sessionId = String(state?.sessionId ?? '').trim()
  if (!sessionId) {
    cachedSnapshot = null
    return null
  }
  const hit = state?.sessions?.find((item) => item.id === sessionId)
  const title = String(hit?.title ?? '').trim()
  const mascot = hit?.mascot
  if (
    cachedSnapshot &&
    cachedSnapshot.sessionId === sessionId &&
    cachedSnapshot.title === title &&
    cachedSnapshot.mascot?.shape === mascot?.shape &&
    cachedSnapshot.mascot?.color === mascot?.color &&
    cachedSnapshot.mascot?.eye === mascot?.eye
  ) {
    return cachedSnapshot
  }
  cachedSnapshot = { sessionId, title, ...(mascot ? { mascot } : {}) }
  return cachedSnapshot
}

export function isInlineEditHotkey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}) {
  return Boolean((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k')
}

export type InlineEditTarget = {
  from: number
  to: number
  selection: string
  before: string
  after: string
  top: number
  left: number
}

export async function requestInlineEdit(
  payload: {
    instruction: string
    selection: string
    before: string
    after: string
    title?: string
    sessionId?: string
  },
  signal?: AbortSignal,
): Promise<string> {
  const res = await apiFetch('/api/editor/inline-edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string }
  if (!res.ok || !data.ok || typeof data.text !== 'string') {
    throw new Error(data.error || `原地修改失败 (${res.status})`)
  }
  return data.text
}

export function InlineEditPopover({
  target,
  title,
  onApply,
  onClose,
}: {
  target: InlineEditTarget
  title?: string
  onApply: (text: string, target: InlineEditTarget) => void
  onClose: () => void
}) {
  const agent = useSyncExternalStore(subscribeGlobalAgent, readGlobalAgent, () => null)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node | null
      if (node && boxRef.current?.contains(node)) return
      if (!busy) onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [busy, onClose])

  const submit = async () => {
    const prompt = instruction.trim()
    if (!prompt || busy) return
    setBusy(true)
    setError('')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const next = await requestInlineEdit(
        {
          instruction: prompt,
          selection: target.selection,
          before: target.before,
          after: target.after,
          title,
          ...(agent?.sessionId ? { sessionId: agent.sessionId } : {}),
        },
        ctrl.signal,
      )
      if (ctrl.signal.aborted) return
      onApply(next, target)
    } catch (err) {
      if (ctrl.signal.aborted) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null
      setBusy(false)
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
    onClose()
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const width = Math.min(520, Math.max(280, vw - 24))
  const left = Math.max(12, Math.min(target.left, vw - width - 12))
  const top = Math.max(12, Math.min(target.top, vh - 96))

  return (
    <div
      ref={boxRef}
      className="editor-inline-edit"
      data-testid="editor-inline-edit"
      role="dialog"
      aria-label="原地修改"
      style={{ top, left, width }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="editor-inline-edit-row">
        <span className="editor-inline-edit-avatar" title={agent?.title || 'AI 助手'}>
          {agent?.sessionId ? (
            <SidebarMascot
              size={20}
              sessionId={agent.sessionId}
              identity={resolveSessionMascot(agent.sessionId, agent.mascot)}
              animate={busy}
              title=""
            />
          ) : (
            <SparklesIcon className="editor-inline-edit-icon" aria-hidden />
          )}
        </span>
        <input
          ref={inputRef}
          type="text"
          className="editor-inline-edit-input"
          placeholder={target.selection ? '输入修改指令…' : '输入要生成的内容…'}
          aria-label="原地修改指令"
          value={instruction}
          disabled={busy}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
        />
        <button
          type="button"
          className="editor-inline-edit-submit"
          aria-label="发送"
          disabled={!instruction.trim() || busy}
          onClick={() => void submit()}
        >
          {busy ? (
            <ArrowPathIcon className="editor-inline-edit-spin" aria-hidden />
          ) : (
            <ArrowUpIcon className="size-[14px]" aria-hidden />
          )}
        </button>
      </div>
      {error ? <div className="editor-inline-edit-error" role="alert">{error}</div> : null}
    </div>
  )
}
