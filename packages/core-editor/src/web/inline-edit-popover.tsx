import { useEffect, useRef, useState } from 'react'
import { ArrowPathIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/16/solid'

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
  },
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('/api/editor/inline-edit', {
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
  const width = Math.min(440, Math.max(260, vw - 24))
  const left = Math.max(12, Math.min(target.left, vw - width - 12))
  const top = Math.max(12, Math.min(target.top, vh - 120))

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
        <SparklesIcon className="editor-inline-edit-icon" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          className="editor-inline-edit-input"
          placeholder={target.selection ? '输入修改指令… (Enter 执行，Esc 取消)' : '输入要生成的内容… (Enter 执行，Esc 取消)'}
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
          disabled={!instruction.trim() || busy}
          onClick={() => void submit()}
        >
          {busy ? <ArrowPathIcon className="editor-inline-edit-spin" aria-hidden /> : '修改'}
        </button>
        <button
          type="button"
          className="editor-inline-edit-close"
          aria-label="关闭原地修改"
          title="取消 (Esc)"
          onClick={cancel}
        >
          <XMarkIcon className="size-[14px]" aria-hidden />
        </button>
      </div>
      {error ? <div className="editor-inline-edit-error" role="alert">{error}</div> : null}
    </div>
  )
}
