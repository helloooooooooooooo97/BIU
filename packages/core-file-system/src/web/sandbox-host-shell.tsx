import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CodeBracketIcon, EyeIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import {
  peekRecordViewFile,
  putRecordViewFile,
  readRecordViewFile,
  useRecordViewFileTick,
} from './record-sandboxes.ts'
import type { SandboxToastTone } from './sandbox-biu.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'

export type HostTab = 'preview' | 'code' | 'split'

export function splitPaneStyle(width: number) {
  return width > 0 ? { flex: `0 0 ${width}px` } : undefined
}

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

export function SandboxSplitResize({
  paneRef,
  onWidth,
  testId,
  min = 240,
}: {
  paneRef: RefObject<HTMLDivElement | null>
  onWidth: (px: number) => void
  testId: string
  min?: number
}) {
  return (
    <div
      className="sandbox-split-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整预览与代码分栏宽度"
      data-testid={testId}
      onMouseDown={(event) => {
        if (event.button !== 0) return
        const pane = paneRef.current
        const stage = pane?.parentElement
        if (!pane || !stage) return
        event.preventDefault()
        const startX = event.clientX
        const startWidth = pane.getBoundingClientRect().width
        const stageWidth = stage.getBoundingClientRect().width
        const prevCursor = document.body.style.cursor
        const prevSelect = document.body.style.userSelect
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        const onMove = (move: MouseEvent) => {
          const max = Math.max(min, stageWidth - min)
          onWidth(Math.round(Math.min(max, Math.max(min, startWidth + move.clientX - startX))))
        }
        const onUp = () => {
          document.body.style.cursor = prevCursor
          document.body.style.userSelect = prevSelect
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }}
    />
  )
}

function SandboxTitleInput({
  value,
  readOnly,
  testId,
  onCommit,
}: {
  value: string
  readOnly: boolean
  testId: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  return (
    <input
      className="page-block-expand-nav-title"
      data-testid={testId}
      value={draft}
      readOnly={readOnly}
      aria-label="沙盒标题"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim()
        if (next && next !== value) onCommit(next)
        else setDraft(value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function SandboxHostBar({
  tab,
  onTab,
  ro,
  expanded,
  onExpand,
  title,
  onTitle,
  testIdPrefix,
  kindLabel = '沙箱',
}: {
  tab: HostTab
  onTab: (next: HostTab) => void
  ro: boolean
  expanded: boolean
  onExpand: () => void
  title: string
  onTitle: (next: string) => void
  testIdPrefix: 'page-host' | 'record-prop-host'
  kindLabel?: string
}) {
  const coding = tab === 'code'
  return (
    <div
      className="page-block-expand-nav"
      data-testid={expanded ? `${testIdPrefix}-expand-nav` : `${testIdPrefix}-side-bar`}
      data-biu-ignore
    >
      <div
        className="page-block-expand-nav-type"
        data-testid={`${testIdPrefix}-type-icon`}
        title={kindLabel}
        aria-label={kindLabel}
      >
        <SandboxKindIcon />
      </div>
      <SandboxTitleInput
        value={title}
        readOnly={ro}
        testId={`${testIdPrefix}-title`}
        onCommit={onTitle}
      />
      <div className="page-block-expand-nav-tools">
        {ro ? null : (
          <>
            <button
              type="button"
              className={`page-slide-icon${coding ? ' is-on' : ''}`}
              title={coding ? '预览' : '编辑'}
              aria-label={coding ? '预览' : '编辑'}
              aria-pressed={coding}
              data-testid={`${testIdPrefix}-edit`}
              onMouseDown={hold}
              onClick={() => onTab(coding ? 'preview' : 'code')}
            >
              {coding ? <EyeIcon aria-hidden className="page-slide-ico" /> : <CodeBracketIcon aria-hidden className="page-slide-ico" />}
            </button>
            <button
              type="button"
              className={`page-slide-icon${tab === 'split' ? ' is-on' : ''}`}
              data-testid={`${testIdPrefix}-split`}
              title={tab === 'split' ? '取消分栏' : '分栏：左预览，右代码'}
              aria-label={tab === 'split' ? '取消分栏' : '分栏'}
              aria-pressed={tab === 'split'}
              onMouseDown={hold}
              onClick={() => onTab(tab === 'split' ? 'preview' : 'split')}
            >
              <ViewColumnsIcon aria-hidden className="page-slide-ico" />
            </button>
          </>
        )}
        <button
          type="button"
          className="page-slide-icon"
          data-page-block-expand=""
          data-testid={`${testIdPrefix}-expand`}
          title={expanded ? '缩小' : '放大'}
          aria-label={expanded ? '缩小' : '放大'}
          onMouseDown={hold}
          onClick={onExpand}
        >
          {expanded ? <ArrowsPointingInIcon aria-hidden className="page-slide-ico" /> : <ArrowsPointingOutIcon aria-hidden className="page-slide-ico" />}
        </button>
      </div>
    </div>
  )
}

export function useSandboxEscapeExpand(expanded: boolean, setExpanded: (next: boolean) => void) {
  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setExpanded(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [expanded, setExpanded])
}

function scopeStyleElement(style: HTMLStyleElement) {
  if (style.dataset.biuScoped === '1') return
  const raw = style.textContent ?? ''
  const trimmed = raw.trim()
  if (!trimmed) {
    style.dataset.biuScoped = '1'
    return
  }
  if (!trimmed.startsWith('@scope')) {
    style.textContent = `@scope {\n${raw}\n}`
  }
  style.dataset.biuScoped = '1'
}

/**
 * Wraps any <style> injected by user sandbox JSX inside CSS `@scope { ... }`
 * so Light DOM sandbox styles never leak out and pollute the host shell.
 */
export function useScopedSandboxStyles(previewRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const root = previewRef.current
    if (!root) return
    const scan = () => {
      for (const el of root.querySelectorAll('style')) {
        if (el instanceof HTMLStyleElement) scopeStyleElement(el)
      }
    }
    scan()
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(() => scan())
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [previewRef, active])
}

export function useSandboxToast() {
  const [toast, setToast] = useState<{ message: string; tone: SandboxToastTone } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, tone: SandboxToastTone = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ message, tone })
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setToast(null)
    }, 2600)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { toast, showToast }
}

export function SandboxToastBanner({
  toast,
  testId,
}: {
  toast: { message: string; tone: SandboxToastTone } | null
  testId: string
}) {
  if (!toast) return null
  return (
    <div
      className="page-host-toast"
      role="status"
      data-testid={testId}
      data-tone={toast.tone}
      style={{
        margin: '6px 8px 0',
        padding: '6px 10px',
        borderRadius: 6,
        fontSize: 12,
        background: 'var(--biu-color-bg-subtle)',
        border: '1px solid var(--biu-color-border)',
        color: toast.tone === 'error' ? 'var(--biu-color-danger)' : toast.tone === 'ok' ? 'var(--biu-color-ok)' : 'var(--biu-color-text)',
      }}
    >
      {toast.message}
    </div>
  )
}

/**
 * Loads sandbox source from cache/server, compiles immediately on initial load or
 * remote updates, and debounces compilation (150ms) + PUT persistence (400ms)
 * during interactive code editing so typing never blocks or floods 409 retries.
 */
export function useDebouncedSandboxSource({
  collectionPath,
  recordId,
  file,
  fallback,
  writable,
  compileDebounceMs = 150,
  saveDebounceMs = 400,
}: {
  collectionPath: string
  recordId: string
  file: string
  fallback: string
  writable: boolean
  compileDebounceMs?: number
  saveDebounceMs?: number
}) {
  const fileTick = useRecordViewFileTick()
  const initial = (file ? peekRecordViewFile(collectionPath, recordId, file) : undefined) || fallback
  const [source, setSource] = useState(initial)
  const [compiledSource, setCompiledSource] = useState(initial)
  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ path: string; recordId: string; file: string; text: string } | null>(null)

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const pending = pendingSaveRef.current
    if (!pending) return
    pendingSaveRef.current = null
    void putRecordViewFile(pending.path, pending.recordId, pending.file, pending.text, 'text/plain; charset=utf-8').catch(
      () => undefined,
    )
  }, [])

  useEffect(() => {
    let gone = false
    if (!file) {
      setSource(fallback)
      setCompiledSource(fallback)
      return
    }
    const cached = peekRecordViewFile(collectionPath, recordId, file)
    if (cached != null) {
      setSource(cached)
      setCompiledSource(cached)
      return
    }
    void readRecordViewFile(collectionPath, recordId, file, fallback).then((text) => {
      if (gone) return
      setSource(text)
      setCompiledSource(text)
    })
    return () => {
      gone = true
    }
  }, [collectionPath, recordId, file, fallback, fileTick])

  useEffect(() => {
    return () => {
      if (compileTimerRef.current) clearTimeout(compileTimerRef.current)
      flushSave()
    }
  }, [flushSave])

  const onSourceChange = useCallback(
    (next: string) => {
      setSource(next)
      if (compileTimerRef.current) clearTimeout(compileTimerRef.current)
      if (compileDebounceMs <= 0) {
        setCompiledSource(next)
      } else {
        compileTimerRef.current = setTimeout(() => {
          compileTimerRef.current = null
          setCompiledSource(next)
        }, compileDebounceMs)
      }
      if (writable && file) {
        pendingSaveRef.current = { path: collectionPath, recordId, file, text: next }
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          flushSave()
        }, saveDebounceMs)
      }
    },
    [collectionPath, compileDebounceMs, file, flushSave, recordId, saveDebounceMs, writable],
  )

  return { source, compiledSource, onSourceChange, flushSave }
}
