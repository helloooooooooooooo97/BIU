import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { nodeBlockId } from './block-id.ts'
import { getPageViewState, PAGE_VIEW_EVENT, type PageSort } from './page-view-state.ts'

const key = new PluginKey('page-filter')

function recordIdFromDom(view: { dom?: HTMLElement } | null | undefined) {
  const host = view?.dom?.closest('[data-page-record]')
  return host instanceof HTMLElement ? host.dataset.pageRecord ?? '' : ''
}

function blockLabel(node: Node) {
  return node.textContent.replace(/\s+/g, ' ').trim() || node.type.name
}

export function comparePageBlocks(
  a: { kind: string; label: string },
  b: { kind: string; label: string },
  sort: PageSort,
) {
  if (sort === 'title-desc') return b.label.localeCompare(a.label, 'zh')
  if (sort === 'title-asc') return a.label.localeCompare(b.label, 'zh')
  if (sort === 'kind') return a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label, 'zh')
  return 0
}

function decorations(doc: Node, recordId: string) {
  const view = getPageViewState(recordId)
  const kinds = view.filterKinds
  const allow = kinds.length ? new Set(kinds) : null
  const decos: Decoration[] = []
  const ranked: { pos: number; size: number; kind: string; label: string; id: string }[] = []
  doc.forEach((node, pos) => {
    if (allow && !allow.has(node.type.name)) {
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'page-block-is-hidden' }))
    }
    ranked.push({
      pos,
      size: node.nodeSize,
      kind: node.type.name,
      label: blockLabel(node),
      id: nodeBlockId(node),
    })
  })
  if (view.sort !== 'doc') {
    ranked.sort((a, b) => comparePageBlocks(a, b, view.sort) || a.id.localeCompare(b.id) || a.pos - b.pos)
    ranked.forEach((item, index) => {
      decos.push(
        Decoration.node(item.pos, item.pos + item.size, {
          class: 'page-block-is-sorted',
          style: `order:${index}`,
        }),
      )
    })
  }
  if (!decos.length) return DecorationSet.empty
  return DecorationSet.create(doc, decos)
}

export const pageFilter = Extension.create({
  name: 'pageFilter',
  addStorage() {
    return { stop: undefined as undefined | (() => void) }
  },
  onCreate() {
    const editor = this.editor
    const onView = () => {
      if (editor.isDestroyed) return
      editor.view.dispatch(editor.state.tr.setMeta(key, true))
    }
    window.addEventListener(PAGE_VIEW_EVENT, onView)
    this.storage.stop = () => window.removeEventListener(PAGE_VIEW_EVENT, onView)
  },
  onDestroy() {
    this.storage.stop?.()
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old, _oldState, state) {
            const id = recordIdFromDom(editor.view)
            if (tr.docChanged || tr.getMeta(key) || !id) return decorations(state.doc, id)
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)
          },
        },
      }),
    ]
  },
})
