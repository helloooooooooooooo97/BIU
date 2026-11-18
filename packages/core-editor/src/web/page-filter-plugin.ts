import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { nodeBlockId } from './block-id.ts'
import { PAGE_VIEW_EVENT, type PageSort } from './page-view-state.ts'
import { getActiveRecordLayout } from '@biu/core-file-system/record-layouts'
import { subscribeRecordViewCatalog } from '@biu/core-file-system/record-view-catalog'

const key = new PluginKey('page-filter')

function hostFromDom(view: { dom?: HTMLElement } | null | undefined) {
  const host = view?.dom?.closest('[data-page-record]')
  if (!(host instanceof HTMLElement)) return { id: '', collection: '' }
  const raw = String(host.dataset.pagePath ?? '')
  const rest = raw.replace(/^\/+/, '').replace(/\/+$/, '')
  const slash = rest.indexOf('/')
  const name = slash < 0 ? rest : rest.slice(0, slash)
  return { id: host.dataset.pageRecord ?? '', collection: name ? `/${name}` : '' }
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

function decorations(doc: Node, collection: string, recordId: string) {
  const view = getActiveRecordLayout(collection, recordId)
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
    const offCatalog = subscribeRecordViewCatalog(onView)
    this.storage.stop = () => {
      window.removeEventListener(PAGE_VIEW_EVENT, onView)
      offCatalog()
    }
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
            const host = hostFromDom(editor.view)
            if (tr.docChanged || tr.getMeta(key) || !host.id) return decorations(state.doc, host.collection, host.id)
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
