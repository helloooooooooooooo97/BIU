import { ReUI } from '@biu/reui'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap, lineNumbers } from '@codemirror/view'
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  CodeBracketIcon,
  EyeIcon,
  ViewColumnsIcon,
} from '@heroicons/react/16/solid'
import { tags } from '@lezer/highlight'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { compileSandboxSource, looksLikeJsx, sandboxModuleFile } from './compile.ts'
import { BASIC_BLOCK_TYPE, type BlockEditorService } from '../service.ts'
import {
  assetEtag,
  assetName,
  isAbsentSandboxAsset,
  isFreshSandboxAsset,
  loadTextAsset,
  markFreshSandboxAssets,
  pageResourcePath,
  saveTextAsset,
} from './page-file.ts'
import { mountSandbox, unmountSandbox } from './runtime.ts'
import { SANDBOX_SAMPLE } from './sample.ts'
import { SplitResize, splitPaneStyle } from './split-resize.tsx'
import { sandboxBlockKey, stampSandboxPickSurfaces } from './stamp-picks.ts'
import {
  clearSandboxIf,
  isSelectedSandbox,
  onSandboxActiveChange,
  selectSandbox,
  setLivePreview,
} from './active.ts'

function newSandboxFiles() {
  const id = crypto.randomUUID().slice(0, 8)
  const files = { file: `assets/sandbox-${id}.jsx`, dataFile: `assets/sandbox-data-${id}.json` }
  markFreshSandboxAssets(files.file, files.dataFile)
  return files
}

function legacySource(data: Record<string, unknown>) {
  if (typeof data.source === 'string' && data.source.trim()) return data.source
  if (typeof data.html === 'string' && data.html.trim()) return data.html
  return ''
}

function useSandboxSource(
  data: Record<string, unknown>,
  update: (patch: Record<string, unknown>) => void,
  sample: string,
) {
  const file = typeof data.file === 'string' ? data.file.trim() : ''
  const dataFile = typeof data.dataFile === 'string' ? data.dataFile.trim() : ''
  const inline = legacySource(data)
  const [source, setSource] = useState(inline || sample)
  const [rev, setRev] = useState(0)
  const etagRef = useRef('')
  const dataEtagRef = useRef('')
  const sourceRef = useRef(source)
  const fileRef = useRef(file)
  const dataFileRef = useRef(dataFile)
  const quietUntil = useRef(0)
  sourceRef.current = source
  fileRef.current = file
  dataFileRef.current = dataFile
  useEffect(() => {
    const moduleOk = sandboxModuleFile(file)
    if (file && dataFile && moduleOk) return
    const created = newSandboxFiles()
    update({
      file: moduleOk ? file : created.file,
      dataFile: dataFile || created.dataFile,
      ...(inline ? { source: undefined, html: undefined } : {}),
    })
  }, [file, dataFile, inline, update])
  useEffect(() => {
    const from = typeof data.cloneDataFrom === 'string' ? data.cloneDataFrom.trim() : ''
    if (!from || !dataFile) return
    let gone = false
    void (async () => {
      const copied = await loadTextAsset(from, '', { createOnMiss: false })
      if (copied.etag || copied.text.trim()) {
        dataEtagRef.current = await saveTextAsset(dataFile, copied.text, '', { json: true })
      }
      if (!gone) update({ cloneDataFrom: undefined })
    })()
    return () => {
      gone = true
    }
  }, [data.cloneDataFrom, dataFile, update])
  useEffect(() => {
    if (!file || !sandboxModuleFile(file)) return
    if (inline) update({ source: undefined, html: undefined })
    let gone = false
    void loadTextAsset(file, sourceRef.current || inline || sample, { bust: rev > 0 }).then((loaded) => {
      if (gone) return
      quietUntil.current = Date.now() + 1200
      etagRef.current = loaded.etag
      if (!looksLikeJsx(loaded.text) && looksLikeJsx(sourceRef.current)) return
      setSource(loaded.text)
      if (inline) update({ source: undefined, html: undefined })
    })
    return () => {
      gone = true
    }
  }, [file, rev, inline, sample, update])
  useEffect(() => {
    const onAsset = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; etag?: string }>).detail
      const name = String(detail?.name ?? '')
      const current = fileRef.current
      if (!name || !current) return
      if (assetName(current) !== name && current !== name) return
      if (Date.now() < quietUntil.current) return
      const nextEtag = assetEtag(String(detail?.etag ?? ''))
      if (nextEtag && nextEtag === etagRef.current) return
      setRev((n) => n + 1)
    }
    window.addEventListener('biu:asset-changed', onAsset)
    return () => window.removeEventListener('biu:asset-changed', onAsset)
  }, [])
  const save = (next: string) => {
    setSource(next)
    sourceRef.current = next
    const current = fileRef.current
    if (!current) return
    quietUntil.current = Date.now() + 1200
    void saveTextAsset(current, next, etagRef.current).then((etag) => {
      etagRef.current = etag
    })
  }
  const readData = async () => {
    const current = dataFileRef.current
    if (!current) return null
    if ((isFreshSandboxAsset(current) || isAbsentSandboxAsset(current)) && !dataEtagRef.current) return null
    try {
      const loaded = await loadTextAsset(current, 'null', { createOnMiss: false })
      dataEtagRef.current = loaded.etag
      if (!loaded.text.trim() || loaded.text.trim() === 'null') return null
      return JSON.parse(loaded.text) as unknown
    } catch {
      return null
    }
  }
  const writeData = async (value: unknown) => {
    const current = dataFileRef.current
    if (!current) return
    const etag = await saveTextAsset(current, JSON.stringify(value ?? null), dataEtagRef.current, { json: true })
    if (etag) dataEtagRef.current = etag
  }
  const record = () => {
    const path = pageResourcePath()
    const parts = path.split('/').filter(Boolean)
    return { path, collection: parts[0] ? `/${parts[0]}` : '', id: parts[1] ?? '' }
  }
  const patchData = async (values: unknown) => {
    const path = pageResourcePath()
    if (!path) throw new Error('no current record')
    const res = await fetch('/api/page/sandbox/patch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, values }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error || res.statusText)
    window.dispatchEvent(new Event('fsdb:change'))
    return data
  }
  return { source, save, readData, writeData, record, patchData }
}

function SandboxPreview({
  source,
  onStamp,
  readData,
  writeData,
  record,
  patchData,
}: {
  source: string
  onStamp?: (root: ShadowRoot) => void
  readData: () => Promise<unknown>
  writeData: (value: unknown) => Promise<void>
  record: () => { path: string; collection: string; id: string }
  patchData: (values: unknown) => Promise<unknown>
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState('')
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    let mo: MutationObserver | undefined
    try {
      mountSandbox(root, source, { read: readData, write: writeData, record, patch: patchData })
      setError('')
      onStamp?.(root)
      const target = root.querySelector('[data-sandbox-root]')
      if (target && onStamp) {
        mo = new MutationObserver(() => onStamp(root))
        mo.observe(target, { childList: true, subtree: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    return () => {
      mo?.disconnect()
      unmountSandbox(root)
    }
  }, [source])
  return (
    <>
      <div
        ref={hostRef}
        data-testid="page-sandbox-preview"
        data-sandbox=""
        data-page-block-capture=""
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: 'auto',
          height: 'auto',
          minHeight: 0,
          overflow: 'auto',
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
        }}
      />
      {error ? (
        <div data-testid="sandbox-error" style={{ color: 'var(--biu-color-danger)', fontSize: 12, padding: 8 }}>
          {error}
        </div>
      ) : null}
    </>
  )
}

export const name = 'page-sandbox'

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
  selected?: boolean
}

const field = {
  width: '100%',
  boxSizing: 'border-box' as const,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
}

const cmHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--biu-color-text)', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.comment, color: 'var(--biu-color-text-muted)' },
  { tag: tags.keyword, color: 'var(--biu-color-emphasis)' },
  { tag: tags.string, color: 'var(--biu-color-ok)' },
  { tag: tags.number, color: 'var(--biu-color-warning)' },
  { tag: tags.bool, color: 'var(--biu-color-emphasis)' },
  { tag: tags.null, color: 'var(--biu-color-emphasis)' },
  { tag: tags.meta, color: 'var(--biu-color-text-muted)' },
  { tag: tags.className, color: 'var(--biu-color-ink-purple)' },
  { tag: tags.function(tags.variableName), color: 'var(--biu-color-ink-purple)' },
])

const cmTheme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--biu-color-text)',
    fontSize: '12px',
    height: '100%',
  },
  '&.cm-editor': { outline: 'none', height: '100%' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--biu-color-text)', padding: '10px 8px 16px', minHeight: '160px' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: 'var(--biu-color-text-muted)',
  },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--biu-color-bg-hover) 70%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--biu-color-text)' },
  /* 与正文选中同一蓝。drawSelection 画的是 selectionLayer，不是系统 ::selection。 */
  '.cm-content ::selection': {
    background: 'color-mix(in srgb, var(--biu-color-emphasis) 40%, transparent)',
    color: 'inherit',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--biu-color-emphasis) 40%, transparent)',
  },
})

/** 源码编辑区。草稿在本地，避免每次回车写回 pageBlock 把光标甩到最后。 */
function SourceEditor({
  source,
  onChange,
  compile,
}: {
  source: string
  onChange: (v: string) => void
  compile?: ReturnType<typeof compileSandboxSource>
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const focused = useRef(false)
  const draftRef = useRef(source)
  const sourceRef = useRef(source)
  const onChangeRef = useRef(onChange)
  sourceRef.current = source
  onChangeRef.current = onChange
  useEffect(() => {
    const el = host.current
    if (!el) return
    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: source,
        extensions: [
          history(),
          drawSelection(),
          lineNumbers(),
          EditorView.lineWrapping,
          cmTheme,
          syntaxHighlighting(cmHighlight),
          javascript({ jsx: true, typescript: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            draftRef.current = update.state.doc.toString()
          }),
        ],
      }),
    })
    viewRef.current = view
    draftRef.current = view.state.doc.toString()
    return () => {
      if (draftRef.current !== sourceRef.current) onChangeRef.current(draftRef.current)
      view.destroy()
      viewRef.current = null
    }
  }, [])
  useEffect(() => {
    const view = viewRef.current
    if (!view || focused.current) return
    if (source === view.state.doc.toString()) return
    draftRef.current = source
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
    })
  }, [source])
  const flush = () => {
    if (draftRef.current !== sourceRef.current) onChangeRef.current(draftRef.current)
  }
  return (
    <>
    <div
      ref={host}
      data-testid="sandbox-source"
      data-page-block-capture=""
      data-biu-ignore
      className="cm-editor"
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        flush()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
      }}
      style={{
        ...field,
        minHeight: 0,
        height: '100%',
        border: 'none',
        borderRadius: 0,
        overflow: 'hidden',
      }}
    />
    {compile ? (
      <div
        data-testid="sandbox-compile"
        data-ok={compile.ok ? '1' : '0'}
        style={{ marginTop: 6, fontSize: 11, color: compile.ok ? 'var(--biu-color-ok)' : 'var(--biu-color-danger)' }}
      >
        {compile.ok ? `编译通过 · ${compile.mode}` : `编译失败 · ${compile.error}`}
      </div>
    ) : null}
    </>
  )
}

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function NavTitle({
  value,
  readOnly,
  onCommit,
}: {
  value: string
  readOnly?: boolean
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  const commit = () => {
    const next = draft.trim()
    if (!next || next === value) {
      setDraft(value)
      return
    }
    onCommit(next)
  }
  return (
    <input
      className="page-block-expand-nav-title"
      data-testid="sandbox-title"
      data-biu-ignore
      readOnly={readOnly}
      value={draft}
      placeholder="标题"
      aria-label="标题"
      onMouseDown={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function cssBoxSize(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `${Math.round(value)}px`
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function sandboxLooksFillLayout(source: string) {
  const head = source.trim().slice(0, 1600)
  const pct = /\bheight\s*:\s*100%\b/i.test(head) || /\bheight\s*:\s*100vh\b/i.test(head)
  const clipped = /\boverflow\s*:\s*hidden\b/i.test(head)
  const abs = (source.match(/\bposition\s*:\s*absolute\b/gi) ?? []).length >= 3
  return (pct && clipped) || (pct && abs) || (clipped && abs)
}

const SANDBOX_DEFAULT_HEIGHT = 280

function HeightGrip({
  boxRef,
  onHeight,
}: {
  boxRef: { current: HTMLElement | null }
  onHeight: (height: number) => void
}) {
  const drag = useRef<{ y: number; h: number } | null>(null)
  const onHeightRef = useRef(onHeight)
  onHeightRef.current = onHeight
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const start = drag.current
      if (!start) return
      event.preventDefault()
      onHeightRef.current(Math.max(160, Math.round(start.h + event.clientY - start.y)))
    }
    const up = () => {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])
  return (
    <button
      type="button"
      data-testid="sandbox-size-grip"
      data-biu-ignore
      tabIndex={-1}
      title="拖动调整高度"
      aria-label="拖动调整高度"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const box = boxRef.current
        if (!box) return
        drag.current = { y: event.clientY, h: box.offsetHeight }
      }}
      style={{
        appearance: 'none',
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 18,
        height: 10,
        margin: 0,
        padding: 0,
        cursor: 'ns-resize',
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
      }}
    />
  )
}

function SandboxKindIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="var(--biu-color-ink-purple)" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.628 1.349a.75.75 0 0 1 .744 0l1.247.712a.75.75 0 1 1-.744 1.303L8 2.864l-.875.5a.75.75 0 0 1-.744-1.303l1.247-.712ZM4.65 3.914a.75.75 0 0 1-.279 1.023L4.262 5l.11.063a.75.75 0 0 1-.744 1.302l-.13-.073A.75.75 0 0 1 2 6.25V5a.75.75 0 0 1 .378-.651l1.25-.714a.75.75 0 0 1 1.023.279Zm6.698 0a.75.75 0 0 1 1.023-.28l1.25.715A.75.75 0 0 1 14 5v1.25a.75.75 0 0 1-1.499.042l-.129.073a.75.75 0 0 1-.744-1.302l.11-.063-.11-.063a.75.75 0 0 1-.28-1.023ZM6.102 6.915a.75.75 0 0 1 1.023-.279l.875.5.875-.5a.75.75 0 0 1 .744 1.303l-.869.496v.815a.75.75 0 0 1-1.5 0v-.815l-.869-.496a.75.75 0 0 1-.28-1.024ZM2.75 9a.75.75 0 0 1 .75.75v.815l.872.498a.75.75 0 0 1-.744 1.303l-1.25-.715A.75.75 0 0 1 2 11V9.75A.75.75 0 0 1 2.75 9Zm10.5 0a.75.75 0 0 1 .75.75V11a.75.75 0 0 1-.378.651l-1.25.715a.75.75 0 0 1-.744-1.303l.872-.498V9.75a.75.75 0 0 1 .75-.75Zm-4.501 3.708.126-.072a.75.75 0 0 1 .744 1.303l-1.247.712a.75.75 0 0 1-.744 0L6.38 13.94a.75.75 0 0 1 .744-1.303l.126.072a.75.75 0 0 1 1.498 0Z"
      />
    </svg>
  )
}

function SandboxTools({
  tab,
  onTab,
  ro,
  expanded,
  onExpand,
}: {
  tab: 'preview' | 'code' | 'split'
  onTab: (next: 'preview' | 'code' | 'split') => void
  ro: boolean
  expanded: boolean
  onExpand: () => void
}) {
  const coding = tab === 'code'
  return (
    <>
      {ro ? null : (
        <>
          <button
            type="button"
            className={`page-slide-icon${coding ? ' is-on' : ''}`}
            title={coding ? '预览' : '编辑'}
            aria-label={coding ? '预览' : '编辑'}
            aria-pressed={coding}
            data-testid="sandbox-edit"
            onMouseDown={hold}
            onClick={() => onTab(coding ? 'preview' : 'code')}
          >
            {coding ? <EyeIcon aria-hidden className="page-slide-ico" /> : <CodeBracketIcon aria-hidden className="page-slide-ico" />}
          </button>
          <button
            type="button"
            className={`page-slide-icon${tab === 'split' ? ' is-on' : ''}`}
            data-testid="sandbox-split"
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
        data-testid="sandbox-expand"
        title={expanded ? '缩小' : '放大'}
        aria-label={expanded ? '缩小' : '放大'}
        onMouseDown={hold}
        onClick={onExpand}
      >
        {expanded ? <ArrowsPointingInIcon aria-hidden className="page-slide-ico" /> : <ArrowsPointingOutIcon aria-hidden className="page-slide-ico" />}
      </button>
    </>
  )
}

function SandboxBar({
  tab,
  onTab,
  ro,
  expanded,
  onExpand,
  title,
  onTitle,
}: {
  tab: 'preview' | 'code' | 'split'
  onTab: (next: 'preview' | 'code' | 'split') => void
  ro: boolean
  expanded: boolean
  onExpand: () => void
  title: string
  onTitle: (next: string) => void
}) {
  const tools = <SandboxTools tab={tab} onTab={onTab} ro={ro} expanded={expanded} onExpand={onExpand} />
  return (
    <div
      className="page-block-expand-nav"
      data-testid={expanded ? 'sandbox-expand-nav' : 'sandbox-bar'}
      data-biu-ignore
    >
      <div className="page-block-expand-nav-type" data-testid="sandbox-type-icon" title="沙箱" aria-label="沙箱">
        <SandboxKindIcon />
      </div>
      <NavTitle value={title} readOnly={ro} onCommit={onTitle} />
      <div className="page-block-expand-nav-tools">{tools}</div>
    </div>
  )
}

function SandboxCard({ data, update, writable, selected: nodeSelected }: BlockProps) {
  const ro = !writable
  const title = String(data.title ?? '').trim() || '沙箱'
  const live = useSandboxSource(data, update, SANDBOX_SAMPLE)
  const source = live.source
  const ioRef = useRef({
    read: live.readData,
    write: live.writeData,
    record: live.record,
    patch: live.patchData,
  })
  ioRef.current = { read: live.readData, write: live.writeData, record: live.record, patch: live.patchData }
  const width = data.width
  const height = data.height == null || data.height === '' ? SANDBOX_DEFAULT_HEIGHT : data.height
  const fill = sandboxLooksFillLayout(source)
  const [tab, setTab] = useState<'preview' | 'code' | 'split'>('preview')
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(0)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const previewPaneRef = useRef<HTMLDivElement | null>(null)
  const compiled = useMemo(() => compileSandboxSource(source), [source])
  const codeOnly = tab === 'code'
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'

  useEffect(() => onSandboxActiveChange(() => setSelected(isSelectedSandbox(hostRef.current))), [])
  useEffect(() => {
    const card = hostRef.current
    if (!card) return
    if (nodeSelected) selectSandbox(card)
    else if (isSelectedSandbox(card)) selectSandbox(null)
  }, [nodeSelected])
  useEffect(() => {
    if (codeOnly) setLivePreview(null)
  }, [codeOnly])
  useEffect(() => {
    const card = hostRef.current
    if (!card) return
    return () => clearSandboxIf(card, card.querySelector('[data-sandbox]'))
  }, [])
  useEffect(() => {
    const card = hostRef.current
    if (!card) return
    const onCard = (event: PointerEvent) => {
      selectSandbox(card)
      const preview = card.querySelector<HTMLElement>('[data-sandbox]')
      const path = event.composedPath()
      const inPreview = Boolean(
        preview &&
          path.some(
            (node) =>
              node === preview || (preview.shadowRoot instanceof ShadowRoot && node instanceof Node && preview.shadowRoot.contains(node)),
          ),
      )
      setLivePreview(inPreview && !codeOnly ? preview : null)
    }
    const onDoc = (event: PointerEvent) => {
      const path = event.composedPath()
      if (path.some((node) => node instanceof HTMLElement && node.closest('[data-testid="page-sandbox-block"]'))) return
      if (isSelectedSandbox(card)) selectSandbox(null)
    }
    card.addEventListener('pointerdown', onCard)
    document.addEventListener('pointerdown', onDoc)
    return () => {
      card.removeEventListener('pointerdown', onCard)
      document.removeEventListener('pointerdown', onDoc)
    }
  }, [codeOnly])

  useEffect(() => {
    if (!expanded) return
    const root = hostRef.current
    void Promise.resolve(root?.requestFullscreen?.({ navigationUI: 'hide' })).catch(() => {})
    const onFs = () => {
      if (!document.fullscreenElement) setExpanded(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setExpanded(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onKey, true)
      if (document.fullscreenElement) void document.exitFullscreen?.()
    }
  }, [expanded])

  const card = (
    <div
      ref={hostRef}
      data-testid="page-sandbox-block"
      data-sandbox-expanded={expanded ? '1' : undefined}
      data-sandbox-selected={selected ? '1' : undefined}
      className={fill ? 'sandbox-fill' : undefined}
      style={{
        position: expanded ? 'fixed' : 'relative',
        inset: expanded ? 0 : undefined,
        zIndex: expanded ? 2147483646 : undefined,
        display: 'flex',
        flexDirection: 'column',
        width: expanded ? '100%' : cssBoxSize(width) ?? '100%',
        height: expanded ? '100%' : cssBoxSize(height) ?? SANDBOX_DEFAULT_HEIGHT,
        maxWidth: '100%',
        overflow: expanded ? 'hidden' : 'visible',
        boxSizing: 'border-box',
        border: 'none',
        borderRadius: 0,
        background: 'var(--biu-color-bg)',
      }}
    >
      {expanded ? (
        <style>{`[data-testid="page-sandbox-block"]:fullscreen,[data-testid="page-sandbox-block"]:-webkit-full-screen{inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;display:flex!important;flex-direction:column!important}`}</style>
      ) : null}
      <SandboxBar
        tab={tab}
        onTab={setTab}
        ro={ro}
        expanded={expanded}
        onExpand={() => setExpanded((open) => !open)}
        title={title}
        onTitle={(next) => update({ title: next })}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {showPreview ? (
          <div ref={previewPaneRef} style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'auto', ...splitPaneStyle(showCode ? previewWidth : 0) }}>
            <SandboxPreview
              source={source}
              readData={() => ioRef.current.read()}
              writeData={(value) => ioRef.current.write(value)}
              record={() => ioRef.current.record()}
              patchData={(values) => ioRef.current.patch(values)}
              onStamp={(root) => {
                const host = hostRef.current?.closest('[data-page-block]') ?? null
                const key = sandboxBlockKey(host, source)
                const body = root.querySelector('[data-sandbox-root]')
                if (body instanceof HTMLElement) stampSandboxPickSurfaces(body, `${key}-doc`, { plugin: name, includeRoot: false })
              }}
            />
            {showCode ? <SplitResize paneRef={previewPaneRef} onWidth={setPreviewWidth} /> : null}
          </div>
        ) : null}
        {showCode ? (
          <div
            style={{
              position: 'relative',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              borderLeft: showPreview ? 'var(--biu-stroke-width) solid var(--biu-color-border)' : 'none',
            }}
          >
            <SourceEditor source={source} onChange={ro ? () => undefined : live.save} compile={compiled} />
          </div>
        ) : null}
        {ro || expanded ? null : <HeightGrip boxRef={hostRef} onHeight={(next) => update({ height: next })} />}
      </div>
    </div>
  )

  return <ReUI>{expanded ? createPortal(card, document.body) : card}</ReUI>
}

export function registerSandboxBlock(blockEditor: BlockEditorService) {
  return blockEditor.registerBlock({
    kind: 'sandbox',
    plugin: name,
    label: '沙箱',
    blockType: BASIC_BLOCK_TYPE,
    blockTypeLabel: '基础模块',
    hint: '沙箱跑 React。围栏只写 {"file":"assets/sandbox-….jsx","dataFile":"assets/sandbox-data-….json"}。源码用 db_doc 写 .jsx；要记住的数据用 biu.write 写到 dataFile 的 .json，不要写进源码或围栏',
    aliases: ['sandbox', '沙箱', 'Sandbox'],
    assets: ['file', 'dataFile'],
    defaults: () => ({ ...newSandboxFiles(), title: '沙箱', height: SANDBOX_DEFAULT_HEIGHT }),
    View: SandboxCard,
  })
}
