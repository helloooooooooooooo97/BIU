import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { overlayPortalRoot } from '@biu/biu-ui/overlay-portal'

export function CheckRow({
  label,
  icon,
  on,
  onToggle,
  locked,
  count,
  switchControl = false,
}: {
  label: ReactNode
  icon?: ReactNode
  on: boolean
  onToggle: () => void
  locked?: boolean
  count?: number
  switchControl?: boolean
}) {
  return (
    <button
      type="button"
      className={`fsdb-checkrow fsdb-tool-row${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}${switchControl ? ' is-switch' : ''}`}
      role="menuitemcheckbox"
      aria-checked={on}
      disabled={locked}
      title={locked ? '始终显示' : undefined}
      onClick={onToggle}
    >
      <span className="fsdb-checkrow-label">
        {icon ? <span className="fsdb-checkrow-icon">{icon}</span> : null}
        {label}
      </span>
      {switchControl ? (
        <span className="fsdb-checkrow-right">
          {count != null ? <span className="fsdb-col-tag-count">{count}</span> : null}
          <span className={`fsdb-group-switch${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}`} aria-hidden>
            <span className="fsdb-group-switch-thumb" />
          </span>
        </span>
      ) : count != null ? (
        <span className="fsdb-col-tag-count">{count}</span>
      ) : null}
    </button>
  )
}

export function AppDialog({
  title,
  body,
  confirm,
  danger,
  disabled,
  hideCancel,
  onCancel,
  onConfirm,
  input,
  error,
  onClearError,
}: {
  title: string
  body?: ReactNode
  confirm: string
  danger?: boolean
  disabled?: boolean
  hideCancel?: boolean
  onCancel: () => void
  onConfirm: (name?: string) => void
  input?: {
    defaultValue: string
    placeholder?: string
    maxLength?: number
  }
  error?: string
  onClearError?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const named = Boolean(input)

  useEffect(() => {
    if (!named) return
    const id = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [named])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel])

  function submit() {
    onConfirm(input ? inputRef.current?.value : undefined)
  }

  const dialog = (
    <div
      className="fsdb-dlg-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="fsdb-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }}
      >
        <div className="fsdb-dlg-title">{title}</div>
        <div className="fsdb-dlg-body">
          {input ? (
            <input
              ref={inputRef}
              className="fsdb-dlg-input"
              defaultValue={input.defaultValue}
              placeholder={input.placeholder}
              maxLength={input.maxLength}
              onInput={() => {
                if (error) onClearError?.()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
            />
          ) : null}
          {body}
          {error ? <div className="fsdb-dlg-error">{error}</div> : null}
        </div>
        <div className="fsdb-dlg-actions">
          {hideCancel ? null : (
            <button type="button" className="fsdb-dlg-cancel" onClick={onCancel}>
              取消
            </button>
          )}
          <button type="button" className={`fsdb-dlg-ok${danger ? ' is-danger' : ''}`} disabled={disabled} onClick={submit}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(dialog, overlayPortalRoot() ?? document.body)
}

export type LocalTextHandle = {
  /** 供标题 Enter 拆分 / 正文首行 Backspace 合并做 0ms 同步写入，消除失焦旧草稿回滚与连按退格漏字。 */
  syncValue: (next: string, caretPos?: number) => void
}

/** 详情正文/文本列：输入只更新自己，失焦才回传，避免整张表跟着每个按键重绘。 */
export function LocalText({
  as = 'input',
  className,
  value,
  rows,
  autoSize = false,
  placeholder,
  title,
  'aria-label': ariaLabel,
  controlRef,
  onCommit,
  onKeyDown,
}: {
  as?: 'input' | 'textarea'
  className?: string
  value: string
  rows?: number
  autoSize?: boolean
  placeholder?: string
  title?: string
  'aria-label'?: string
  controlRef?: Ref<LocalTextHandle | null>
  onCommit: (next: string) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void
}) {
  const [draft, setDraft] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  const draftRef = useRef(draft)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  if (prevValue !== value) {
    setPrevValue(value)
    // 若用户正在输入框内连续打字/退格且本地已有未提交改动，不被后台慢请求回声覆盖；非聚焦态立即同步外部新值。
    const activeEl = as === 'textarea' ? boxRef.current : inputRef.current
    const activelyEditingDirty =
      typeof document !== 'undefined' && activeEl != null && document.activeElement === activeEl && draftRef.current !== prevValue
    if (!activelyEditingDirty) {
      setDraft(value)
      draftRef.current = value
    }
  }
  valueRef.current = value
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  useImperativeHandle(
    controlRef,
    () => ({
      syncValue(next: string, caretPos?: number) {
        draftRef.current = next
        valueRef.current = next
        setPrevValue(next)
        setDraft(next)
        const el = as === 'textarea' ? boxRef.current : inputRef.current
        if (!el) return
        el.value = next
        if (autoSize && el instanceof HTMLTextAreaElement) {
          el.style.height = 'auto'
          el.style.height = `${el.scrollHeight}px`
        }
        if (caretPos != null && el.isConnected) {
          el.focus({ preventScroll: true })
          const clamped = Math.max(0, Math.min(caretPos, next.length))
          try {
            el.setSelectionRange(clamped, clamped)
          } catch {
            /* ignore */
          }
        }
      },
    }),
    [as, autoSize],
  )
  const commit = () => {
    if (draftRef.current !== valueRef.current) onCommitRef.current(draftRef.current)
  }
  useEffect(() => () => commit(), [])
  useLayoutEffect(() => {
    if (!autoSize) return
    const el = boxRef.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const host = el.parentElement ?? el
    const ro = new ResizeObserver(fit)
    ro.observe(host)
    return () => ro.disconnect()
  }, [autoSize, draft])
  const shared = {
    className,
    value: draft,
    title,
    placeholder,
    'aria-label': ariaLabel,
    onChange: (event: { target: { value: string } }) => {
      draftRef.current = event.target.value
      setDraft(event.target.value)
    },
    onBlur: commit,
    onKeyDown,
  }
  if (as === 'textarea') return <textarea ref={boxRef} {...shared} rows={autoSize ? 1 : rows} />
  return <input ref={inputRef} {...shared} />
}
