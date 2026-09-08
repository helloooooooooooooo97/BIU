import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findInPmDoc, wrapFindIndex } from './find-ranges.ts'

export const FIND_PLUGIN = new PluginKey('page-find')

type FindMeta = { query: string; index: number }

function findDecorations(doc: Node, query: string, index: number) {
  const hits = findInPmDoc(doc, query)
  if (!hits.length) return DecorationSet.empty
  const current = wrapFindIndex(index, hits.length)
  return DecorationSet.create(
    doc,
    hits.map((hit, i) =>
      Decoration.inline(hit.from, hit.to, {
        class: i === current ? 'page-find-hit is-current' : 'page-find-hit',
      }),
    ),
  )
}

export const pageFind = Extension.create({
  name: 'pageFind',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: FIND_PLUGIN,
        state: {
          init: () => ({ query: '', index: 0, set: DecorationSet.empty }),
          apply(tr, prev: { query: string; index: number; set: DecorationSet }) {
            const meta = tr.getMeta(FIND_PLUGIN) as FindMeta | undefined
            if (!meta && !tr.docChanged) return prev
            const query = meta?.query ?? prev.query
            const hits = findInPmDoc(tr.doc, query)
            const index = wrapFindIndex(meta?.index ?? prev.index, hits.length)
            return { query, index, set: findDecorations(tr.doc, query, index) }
          },
        },
        props: {
          decorations(state) {
            return FIND_PLUGIN.getState(state)?.set
          },
        },
      }),
    ]
  },
})

export function applyEditorFind(editor: Editor, query: string, index: number) {
  const hits = findInPmDoc(editor.state.doc, query)
  const total = hits.length
  const i = wrapFindIndex(index, total)
  const tr = editor.state.tr.setMeta(FIND_PLUGIN, { query, index: i })
  if (total) {
    const hit = hits[i]!
    tr.setSelection(TextSelection.create(editor.state.doc, hit.from, hit.to))
    tr.scrollIntoView()
  }
  editor.view.dispatch(tr)
  return { total, index: i }
}
