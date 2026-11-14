import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { bindEditorTextHost, type EditorTextLocus } from '@biu/core-pick/web'

export type HostSourceLanguage = 'json' | 'javascript'

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--biu-color-text-muted)' },
  { tag: tags.keyword, color: 'var(--biu-color-emphasis)' },
  { tag: tags.string, color: 'var(--biu-color-ok)' },
  { tag: tags.number, color: 'var(--biu-color-warning)' },
  { tag: tags.bool, color: 'var(--biu-color-emphasis)' },
  { tag: tags.null, color: 'var(--biu-color-emphasis)' },
  { tag: tags.className, color: 'var(--biu-color-ink-purple)' },
  { tag: tags.propertyName, color: 'var(--biu-color-ink-purple)' },
  { tag: tags.function(tags.variableName), color: 'var(--biu-color-ink-purple)' },
])

const theme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--biu-color-text)',
    fontSize: '14px',
    height: '100%',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--biu-color-text)', padding: '0', minHeight: '0' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: 'var(--biu-color-text-muted)',
    minWidth: '2.4em',
  },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--biu-color-bg-hover) 70%, transparent)' },
  '.cm-activeLineGutter': { background: 'transparent', color: 'var(--biu-color-text)' },
  '.cm-cursor': { borderLeftColor: 'var(--biu-color-text)' },
  '.cm-content ::selection': { background: 'color-mix(in srgb, var(--biu-color-emphasis) 40%, transparent)', color: 'inherit' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--biu-color-emphasis) 40%, transparent)',
  },
})

function languageSupport(language: HostSourceLanguage) {
  if (language === 'json') return json()
  return javascript({ jsx: true, typescript: true })
}

function locusFromView(view: EditorView | null): EditorTextLocus | null {
  if (!view) return null
  const sel = view.state.selection.main
  const from = Math.min(sel.from, sel.to)
  const to = Math.max(sel.from, sel.to)
  if (sel.empty || from === to) {
    const line = view.state.doc.lineAt(from)
    return { start_line: line.number, end_line: line.number, text: line.text, insert: from - line.from }
  }
  const selection = view.state.doc.sliceString(from, to).trim()
  if (!selection) return null
  const start_line = view.state.doc.lineAt(from).number
  const end_line = view.state.doc.lineAt(Math.max(from, to - 1)).number
  const start = view.state.doc.line(start_line)
  const end = view.state.doc.line(end_line)
  return { start_line, end_line, text: view.state.doc.sliceString(start.from, end.to), selection }
}

function locusFromViewElement(view: EditorView | null, node: Element): EditorTextLocus | null {
  if (!view) return null
  const lineEl = node.closest('.cm-line')
  if (lineEl) {
    try {
      const pos = view.posAtDOM(lineEl, 0)
      const line = view.state.doc.lineAt(pos)
      const sel = view.state.selection.main
      if (!sel.empty) {
        const from = Math.min(sel.from, sel.to)
        const to = Math.max(sel.from, sel.to)
        if (from < line.to && to > line.from) return locusFromView(view)
      }
      return { start_line: line.number, end_line: line.number, text: line.text }
    } catch {
      /* jsdom / detached */
    }
  }
  return locusFromView(view)
}

export function HostSourceEditor({
  value,
  writable,
  onChange,
  language = 'javascript',
  pickHost,
  testId = 'page-source-editor',
}: {
  value: string
  writable: boolean
  onChange?: (next: string) => void
  language?: HostSourceLanguage
  pickHost?: { path?: string; name?: string; title?: string } | null
  testId?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          languageSupport(language),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          theme,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => {
              onChangeRef.current?.(update.state.doc.toString())
            }, 400)
          }),
          EditorState.readOnly.of(!writable),
          EditorView.editable.of(writable),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      if (timer.current) clearTimeout(timer.current)
      view.destroy()
      viewRef.current = null
    }
  }, [writable, language])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    if (view.hasFocus) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: EditorSelection.cursor(Math.min(view.state.selection.main.head, value.length)),
    })
  }, [value])

  useEffect(() => {
    const el = host.current
    if (!el || !pickHost) return
    bindEditorTextHost(el, {
      path: pickHost.path,
      name: pickHost.name,
      title: pickHost.title,
      locusFromSelection: () => locusFromView(viewRef.current),
      locusFromElement: (node) => locusFromViewElement(viewRef.current, node),
    })
    return () => bindEditorTextHost(el, null)
  }, [pickHost?.path, pickHost?.name, pickHost?.title, Boolean(pickHost)])

  return <div className="page-source" data-testid={testId} data-readonly={writable ? undefined : '1'} ref={host} />
}
