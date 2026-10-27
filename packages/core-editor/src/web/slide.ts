import { mergeAttributes, Node } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { SlideView } from './slide-view.tsx'
import {
  SLIDE_LAYOUT_META,
  emptySlideJSON,
  isSlideLayout,
  takeSlideFence,
  type SlideLayout,
} from './slide-md.ts'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    slide: {
      insertSlide: (layout?: SlideLayout) => ReturnType
      setSlideLayout: (layout: SlideLayout) => ReturnType
    }
  }
}

function emptyCell() {
  return { type: 'slideCell', content: [{ type: 'paragraph' }] }
}

function fitSlideCells(layout: SlideLayout, cells: unknown[]) {
  const n = SLIDE_LAYOUT_META[layout].slots
  const next = cells.slice(0, n)
  while (next.length < n) next.push(emptyCell())
  return next
}

function nearestSlidePos(state: EditorState) {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'slide') return $from.before(d)
  }
  const around = $from.nodeAfter ?? $from.nodeBefore
  if (around?.type.name === 'slide') {
    return $from.nodeAfter?.type.name === 'slide' ? $from.pos : $from.pos - around.nodeSize
  }
  let found = -1
  state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.type.name === 'slide') found = pos
    return found < 0
  })
  return found
}

export const slideCell = Node.create({
  name: 'slideCell',
  content: 'block+',
  isolating: true,
  defining: true,
  parseHTML() {
    return [{ tag: 'section[data-slide-cell]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-slide-cell': '' }), 0]
  },
  renderMarkdown: (node, h) => {
    const body = h.renderChildren(Array.isArray(node.content) ? node.content : [])
    return `:::cell\n${String(body ?? '').trim()}\n:::`
  },
})

export const slide = Node.create({
  name: 'slide',
  group: 'block',
  content: 'slideCell+',
  isolating: true,
  defining: true,
  selectable: true,
  addAttributes() {
    return {
      layout: { default: 'split' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-slide]',
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false
          const layout = el.getAttribute('data-layout')
          return { layout: isSlideLayout(layout) ? layout : 'split' }
        },
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-slide': '',
        'data-layout': String(node.attrs.layout ?? 'split'),
      }),
      0,
    ]
  },
  parseMarkdown: (token, helpers) => {
    const layout = isSlideLayout((token as { layout?: unknown }).layout) ? (token as { layout: SlideLayout }).layout : 'split'
    const cells = Array.isArray((token as { cells?: unknown }).cells) ? (token as { cells: unknown[] }).cells : []
    const content = (cells.length ? cells : [[]]).map((tokens) =>
      helpers.createNode('slideCell', {}, helpers.parseChildren(Array.isArray(tokens) ? tokens : [])),
    )
    return helpers.createNode('slide', { layout }, content.length ? content : emptySlideJSON(layout).content)
  },
  renderMarkdown: (node, h) => {
    const layout = isSlideLayout(node.attrs?.layout) ? node.attrs.layout : 'split'
    const body = h.renderChildren(Array.isArray(node.content) ? node.content : [])
    return `:::slide {layout=${layout}}\n${String(body ?? '').trim()}\n:::`
  },
  markdownTokenizer: {
    name: 'slide',
    level: 'block',
    start(src) {
      return src.match(/^:::slide/m)?.index ?? -1
    },
    tokenize(src, _tokens, helpers) {
      const taken = takeSlideFence(src)
      if (!taken) return undefined
      const blockTokens = helpers && typeof helpers.blockTokens === 'function' ? helpers.blockTokens.bind(helpers) : null
      return {
        type: 'slide',
        raw: taken.raw,
        layout: taken.layout,
        cells: taken.cells.map((md) => (blockTokens ? blockTokens(md || '') : [])),
      }
    },
  },
  addCommands() {
    return {
      insertSlide:
        (layout = 'split') =>
        ({ commands }) =>
          commands.insertContent(emptySlideJSON(layout)),
      setSlideLayout:
        (layout) =>
        ({ state, tr, dispatch }) => {
          const slidePos = nearestSlidePos(state)
          if (slidePos < 0) return false
          const node = state.doc.nodeAt(slidePos)
          if (!node) return false
          const cells: unknown[] = []
          node.content.forEach((child) => cells.push(child.toJSON()))
          if (dispatch) {
            tr.setNodeMarkup(slidePos, undefined, { ...node.attrs, layout })
            const fitted = fitSlideCells(layout, cells)
            tr.replaceWith(slidePos + 1, slidePos + node.nodeSize - 1, fitted.map((item) => state.schema.nodeFromJSON(item)))
            dispatch(tr)
          }
          return true
        },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(SlideView)
  },
})

export const slideExtensions = [slide, slideCell]
