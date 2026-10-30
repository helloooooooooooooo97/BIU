import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { CONTENT_JUMP_EVENT, parseContentJump } from '@biu/type-file-system'
import { peekContentJump } from './content-jump.ts'
import { findRanges, wrapFindIndex } from './find-ranges.ts'

const findEffect = StateEffect.define<{ query: string; index: number }>()
const agentEditEffect = StateEffect.define<{ from: number; to: number } | null>()
const findHit = Decoration.mark({ class: 'page-find-hit' })
const findCurrent = Decoration.mark({ class: 'page-find-hit is-current' })
const agentEditMark = Decoration.mark({ class: 'page-agent-edit' })

const findField = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(findEffect)) {
        const hits = findRanges(tr.state.doc.toString(), effect.value.query)
        if (!hits.length) return Decoration.none
        const current = wrapFindIndex(effect.value.index, hits.length)
        return Decoration.set(
          hits.map((hit, i) => (i === current ? findCurrent : findHit).range(hit.from, hit.to)),
        )
      }
    }
    if (tr.docChanged) return value.map(tr.changes)
    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

function applySourceAgentEdit(view: EditorView, raw: unknown) {
  const jump = parseContentJump(raw)
  if (!jump) return
  const doc = view.state.doc
  const start = Math.min(Math.max(1, jump.start_line), doc.lines)
  const endLine = Math.min(Math.max(start, jump.end_line ?? jump.start_line), doc.lines)
  const from = doc.line(start).from
  const to = doc.line(endLine).to
  view.dispatch({ effects: agentEditEffect.of({ from, to }) })
  window.setTimeout(() => {
    view.dispatch({ effects: agentEditEffect.of(null) })
  }, 8000)
}

const agentEditField = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(agentEditEffect)) {
        const range = effect.value
        if (!range || range.to <= range.from) return Decoration.none
        return Decoration.set([agentEditMark.range(range.from, range.to)])
      }
    }
    if (tr.docChanged) return value.map(tr.changes)
    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

export type SourceEditorHandle = {
  applyFind: (query: string, index: number) => { total: number; index: number }
  getLocus: () => { start_line: number; end_line: number; text: string; selection?: string; insert?: number } | null
  isAtStart: () => boolean
}

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--biu-color-text)', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--biu-color-text)' },
  { tag: tags.url, color: 'var(--biu-color-text)' },
  { tag: tags.monospace, color: 'var(--biu-color-text)' },
  { tag: tags.meta, color: 'var(--biu-color-text-muted)' },
  { tag: tags.processingInstruction, color: 'var(--biu-color-text-muted)' },
  { tag: tags.comment, color: 'var(--biu-color-text-muted)' },
  { tag: tags.keyword, color: 'var(--biu-color-emphasis)' },
  { tag: tags.string, color: 'var(--biu-color-ok)' },
  { tag: tags.number, color: 'var(--biu-color-warning)' },
])

const compactTheme = EditorView.theme({
  '.cm-content': { minHeight: '0' },
  '.cm-scroller': { overflow: 'auto', maxHeight: '220px' },
})

const theme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--biu-color-text)',
    fontSize: '14px',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65', overflow: 'visible' },
  '.cm-content': { caretColor: 'var(--biu-color-text)', padding: '0', minHeight: '240px' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: 'var(--biu-color-text-muted)',
    minWidth: '2.4em',
  },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--biu-color-bg-hover) 70%, transparent)' },
  '.cm-activeLineGutter': { background: 'transparent', color: 'var(--biu-color-text)' },
  '.cm-cursor': { borderLeftColor: 'var(--biu-color-text)' },
  /* 与正文 TipTap / --biu-color-emphasis 同一蓝。系统 Highlight 在深色页会发白。 */
  '.cm-content ::selection': { background: 'color-mix(in srgb, var(--biu-color-emphasis) 40%, transparent)', color: 'inherit' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--biu-color-emphasis) 40%, transparent)',
  },
})

export const SourceEditor = forwardRef<SourceEditorHandle, {
  value: string
  writable: boolean
  onChange?: (next: string) => void
  compact?: boolean
  language?: 'markdown' | 'json'
}>(function SourceEditor({ value, writable, onChange, compact, language = 'markdown' }, ref) {
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
          findField,
          agentEditField,
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          language === 'json' ? json() : markdown({ codeLanguages: languages }),
          syntaxHighlighting(mdHighlight),
          EditorView.lineWrapping,
          theme,
          ...(compact ? [compactTheme] : []),
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
  }, [writable, compact, language])

  useImperativeHandle(ref, () => ({
    applyFind(query, index) {
      const view = viewRef.current
      if (!view) return { total: 0, index: 0 }
      const hits = findRanges(view.state.doc.toString(), query)
      const total = hits.length
      const i = wrapFindIndex(index, total)
      const hit = total ? hits[i] : null
      view.dispatch({
        effects: findEffect.of({ query, index: i }),
        ...(hit
          ? {
              selection: EditorSelection.range(hit.from, hit.to),
              scrollIntoView: true,
            }
          : {}),
      })
      return { total, index: i }
    },
    getLocus() {
      const view = viewRef.current
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
    },
    isAtStart() {
      const view = viewRef.current
      if (!view) return false
      const sel = view.state.selection.main
      return sel.empty && sel.from === 0
    },
  }))

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    if (view.hasFocus) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
    applySourceAgentEdit(view, peekContentJump())
  }, [value])

  useEffect(() => {
    const onJump = (event: Event) => {
      const view = viewRef.current
      if (!view) return
      applySourceAgentEdit(view, (event as CustomEvent).detail)
    }
    window.addEventListener(CONTENT_JUMP_EVENT, onJump)
    return () => window.removeEventListener(CONTENT_JUMP_EVENT, onJump)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return <div className={compact ? 'page-source is-compact' : 'page-source'} data-testid="page-source-editor" ref={host} />
})

