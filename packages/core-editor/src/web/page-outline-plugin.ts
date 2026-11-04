import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
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

export function listFoldableItems(doc: Node) {
  const out: { pos: number; size: number }[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'listItem') return
    let nested = false
    node.forEach((child) => {
      if (child.type.name === 'bulletList' || child.type.name === 'orderedList') nested = true
    })
    if (nested) out.push({ pos, size: node.nodeSize })
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

/** 点在标题左侧图标槽才折叠，不往正文里插 widget，避免挡住方向键。 */
export function outlineFoldGutterHit(heading: HTMLElement, event: { clientX: number; clientY: number }) {
  const rect = heading.getBoundingClientRect()
  const css = getComputedStyle(heading)
  const icon = Number.parseFloat(css.getPropertyValue('--page-outline-icon')) || 14
  const gap = Number.parseFloat(css.getPropertyValue('--page-outline-gap')) || 8
  const pad = 6
  return (
    event.clientX >= rect.left - icon - gap - pad &&
    event.clientX < rect.left &&
    event.clientY >= rect.top &&
    event.clientY <= rect.top + Math.max(icon + 12, 28)
  )
}

function headingHasChildren(blocks: { heading: boolean; level: number }[], index: number) {
  const item = blocks[index]
  if (!item?.heading) return false
  for (let j = index + 1; j < blocks.length; j += 1) {
    const next = blocks[j]
    if (next.heading && next.level <= item.level) break
    return true
  }
  return false
}

function mapFolded(folded: Set<number>, tr: Transaction, doc: Node) {
  const next = new Set<number>()
  for (const pos of folded) {
    const mapped = tr.mapping.mapResult(pos)
    if (mapped.deleted) continue
    if (doc.nodeAt(mapped.pos)?.type.name === 'listItem') next.add(mapped.pos)
  }
  return next
}

type PluginState = { decos: DecorationSet; folded: Set<number> }

function decorations(doc: Node, recordId: string, folded: Set<number>): PluginState {
  const mode = recordId ? getPagePresentMode(recordId) : 'doc'
  const decos: Decoration[] = []
  if (mode === 'outline') {
    const shut = pageOutlineFolded(recordId)
    const blocks = listOutlineBlocks(doc)
    const hidden = collapsedOutlineIndices(blocks, shut)
    blocks.forEach((item, index) => {
      const cls = ['page-outline-block']
      if (item.heading) cls.push('page-outline-heading')
      if (hidden.has(index)) cls.push('page-block-is-hidden')
      const child = Boolean(item.id && headingHasChildren(blocks, index))
      if (child) cls.push('has-fold')
      const attrs: Record<string, string> = {
        class: cls.join(' '),
        style: `--page-outline-depth:${item.depth}`,
      }
      if (item.id) attrs['data-outline-id'] = item.id
      if (child) attrs['data-outline-folded'] = shut.has(item.id) ? 'true' : 'false'
      decos.push(Decoration.node(item.pos, item.pos + item.size, attrs))
    })
  }
  if (mode === 'doc' || mode === 'outline' || mode === 'table') {
    for (const item of listFoldableItems(doc)) {
      const shut = folded.has(item.pos)
      decos.push(
        Decoration.node(item.pos, item.pos + item.size, {
          class: `has-fold${shut ? ' is-folded' : ''}`,
          'data-list-pos': String(item.pos),
          'data-list-folded': shut ? 'true' : 'false',
        }),
      )
    }
  }
  return { decos: DecorationSet.create(doc, decos), folded }
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
          init: (_: unknown, state): PluginState => decorations(state.doc, '', new Set()),
          apply(tr, old, _oldState, state) {
            const id = recordIdFromDom(editor.view)
            const meta = tr.getMeta(key)
            let folded = old.folded
            if (tr.docChanged) folded = mapFolded(folded, tr, state.doc)
            if (meta && typeof meta === 'object' && typeof meta.listFold === 'number') {
              folded = new Set(folded)
              if (folded.has(meta.listFold)) folded.delete(meta.listFold)
              else folded.add(meta.listFold)
            }
            return decorations(state.doc, id, folded)
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.decos
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const recordId = recordIdFromDom(view)
              const target = event.target
              if (!(target instanceof Element)) return false
              const li = target.closest<HTMLElement>('li.has-fold')
              const listPos = Number(li?.dataset.listPos)
              if (li && Number.isFinite(listPos) && outlineFoldGutterHit(li, event)) {
                event.preventDefault()
                event.stopPropagation()
                view.dispatch(view.state.tr.setMeta(key, { listFold: listPos }))
                return true
              }
              if (!recordId || getPagePresentMode(recordId) !== 'outline') return false
              const heading = target.closest<HTMLElement>('.page-outline-heading.has-fold')
              const id = heading?.dataset.outlineId
              if (!heading || !id || !outlineFoldGutterHit(heading, event)) return false
              event.preventDefault()
              event.stopPropagation()
              togglePageOutlineFold(recordId, id)
              return true
            },
          },
        },
      }),
    ]
  },
})
