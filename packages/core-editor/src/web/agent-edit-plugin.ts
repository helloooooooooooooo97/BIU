import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const AGENT_EDIT_PLUGIN = new PluginKey('page-agent-edit')

const FADE_MS = 8000

type AgentEditMeta = { from: number; to: number; token: number } | { clear: true; token?: number }

function rangeDecos(doc: PmNode, from: number, to: number) {
  const size = doc.content.size
  const a = Math.min(Math.max(0, from), size)
  const b = Math.min(Math.max(a, to), size)
  if (b <= a) return DecorationSet.empty
  const decos: Decoration[] = []
  doc.nodesBetween(a, b, (node, pos) => {
    if (!node.isTextblock) return
    const start = Math.max(a, pos + 1)
    const end = Math.min(b, pos + node.nodeSize - 1)
    if (end > start) decos.push(Decoration.inline(start, end, { class: 'page-agent-edit' }))
  })
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty
}

export const pageAgentEdit = Extension.create({
  name: 'pageAgentEdit',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: AGENT_EDIT_PLUGIN,
        state: {
          init: () => ({ set: DecorationSet.empty, token: 0 }),
          apply(tr, prev: { set: DecorationSet; token: number }) {
            const meta = tr.getMeta(AGENT_EDIT_PLUGIN) as AgentEditMeta | undefined
            if (meta && 'clear' in meta) {
              if (meta.token != null && meta.token !== prev.token) return prev
              return { set: DecorationSet.empty, token: prev.token }
            }
            if (meta && 'from' in meta) {
              return { set: rangeDecos(tr.doc, meta.from, meta.to), token: meta.token }
            }
            if (tr.docChanged) return { set: prev.set.map(tr.mapping, tr.doc), token: prev.token }
            return prev
          },
        },
        props: {
          decorations(state) {
            return AGENT_EDIT_PLUGIN.getState(state)?.set
          },
        },
      }),
    ]
  },
})

const fadeTimers = new WeakMap<Editor, number>()

export function applyAgentEditMark(editor: Editor, range: { from: number; to: number } | null) {
  if (editor.isDestroyed || !range || range.to <= range.from) return false
  const token = Date.now()
  editor.view.dispatch(editor.state.tr.setMeta(AGENT_EDIT_PLUGIN, { from: range.from, to: range.to, token }))
  if (typeof window === 'undefined') return true
  const prev = fadeTimers.get(editor)
  if (prev) window.clearTimeout(prev)
  const id = window.setTimeout(() => {
    if (editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta(AGENT_EDIT_PLUGIN, { clear: true, token }))
  }, FADE_MS)
  fadeTimers.set(editor, id)
  return true
}
