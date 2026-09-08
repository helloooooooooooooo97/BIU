import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { findRanges, wrapFindIndex } from './find-ranges.ts'

const findEffect = StateEffect.define<{ query: string; index: number }>()
const findHit = Decoration.mark({ class: 'page-find-hit' })
const findCurrent = Decoration.mark({ class: 'page-find-hit is-current' })

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

export type SourceEditorHandle = {
  applyFind: (query: string, index: number) => { total: number; index: number }
}

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading, color: '#F0EFED', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--dsw-business)' },
  { tag: tags.url, color: 'var(--dsw-business)' },
  { tag: tags.monospace, color: '#E8E0D0' },
  { tag: tags.meta, color: '#7B7B79' },
  { tag: tags.processingInstruction, color: '#7B7B79' },
  { tag: tags.comment, color: '#7B7B79' },
  { tag: tags.keyword, color: '#C4B5FD' },
  { tag: tags.string, color: '#86EFAC' },
  { tag: tags.number, color: '#FDBA74' },
])

const theme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--dsw-label)',
    fontSize: '14px',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65', overflow: 'visible' },
  '.cm-content': { caretColor: 'var(--dsw-label)', padding: '0', minHeight: '240px' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: '#7B7B79',
    minWidth: '2.4em',
  },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--dsw-hover) 70%, transparent)' },
  '.cm-activeLineGutter': { background: 'transparent', color: '#F0EFED' },
  '.cm-cursor': { borderLeftColor: 'var(--dsw-label)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--dsw-business) 28%, transparent)',
  },
})

export const SourceEditor = forwardRef<SourceEditorHandle, {
  value: string
  writable: boolean
  onChange?: (next: string) => void
}>(function SourceEditor({ value, writable, onChange }, ref) {
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
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ codeLanguages: languages }),
          syntaxHighlighting(mdHighlight),
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
  }, [writable])

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
  }, [value])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return <div className="page-source" data-testid="page-source-editor" ref={host} />
})

