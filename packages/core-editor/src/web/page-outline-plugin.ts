import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { nodeBlockId } from './block-id.ts'
import { getPagePresentMode, pageOutlineFolded, togglePageOutlineFold } from './source-mode.ts'
import { PAGE_VIEW_EVENT } from './page-view-state.ts'

const key = new PluginKey('page-outline')

function recordIdFromDom(view: { dom?: HTMLElement } | null | undefined) {
  const host = view?.dom?.closest('[data-page-record]')
  return host instanceof HTMLElement ? host.dataset.pageRecord ?? '' : ''
}

export function listOutlineBlocks(doc: Node) {
  const out: { pos: number; size: number; id: string; heading: boolean; level: number; depth: number }[] = []
  let nest = 0
  doc.forEach((node, pos) => {
    const heading = node.type.name === 'heading'
    const level = heading ? Math.min(3, Math.max(1, Number(node.attrs.level) || 1)) : 0
    const depth = heading ? level - 1 : nest
    out.push({ pos, size: node.nodeSize, id: nodeBlockId(node), heading, level, depth })
    if (heading) nest = level
  })
  return out
}

export function collapsedOutlineIndices(
  blocks: { heading: boolean; level: number; id: string }[],
  folded: Set<string>,
) {
  const hide = new Set<number>()
  for (let i = 0; i < blocks.length; i += 1) {
    const item = blocks[i]
    if (!item.heading || !item.id || !folded.has(item.id)) continue
    for (let j = i + 1; j < blocks.length; j += 1) {
      const next = blocks[j]
      if (next.heading && next.level <= item.level) break
      hide.add(j)
    }
  }
  return hide
}

function foldButton(recordId: string, blockId: string, folded: boolean) {
  return () => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `page-outline-fold${folded ? ' is-folded' : ''}`
    btn.setAttribute('aria-label', folded ? '展开' : '收起')
    btn.setAttribute('aria-expanded', folded ? 'false' : 'true')
    btn.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    btn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      togglePageOutlineFold(recordId, blockId)
    })
    return btn
  }
}

function decorations(doc: Node, recordId: string) {
  if (getPagePresentMode(recordId) !== 'outline') return DecorationSet.empty
  const folded = pageOutlineFolded(recordId)
  const blocks = listOutlineBlocks(doc)
  const hidden = collapsedOutlineIndices(blocks, folded)
  const decos: Decoration[] = []
  blocks.forEach((item, index) => {
    const cls = ['page-outline-block']
    if (item.heading) cls.push('page-outline-heading')
    if (hidden.has(index)) cls.push('page-block-is-hidden')
    let child = false
    if (item.heading && item.id) {
      for (let j = index + 1; j < blocks.length; j += 1) {
        const next = blocks[j]
        if (next.heading && next.level <= item.level) break
        child = true
        break
      }
    }
    if (child) cls.push('has-fold')
    decos.push(
      Decoration.node(item.pos, item.pos + item.size, {
        class: cls.join(' '),
        style: `--page-outline-depth:${item.depth}`,
      }),
    )
    if (!child || !item.id) return
    decos.push(
      Decoration.widget(item.pos + 1, foldButton(recordId, item.id, folded.has(item.id)), {
        side: -1,
        ignoreSelection: true,
      }),
    )
  })
  return DecorationSet.create(doc, decos)
}

export const pageOutline = Extension.create({
  name: 'pageOutline',
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
