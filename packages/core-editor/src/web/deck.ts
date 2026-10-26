import { mergeAttributes, Node } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { DeckView } from './deck-view.tsx'
import {
  DECK_LAYOUT_META,
  emptyDeckJSON,
  isDeckLayout,
  takeDeckFence,
  type DeckLayout,
} from './deck-md.ts'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    deck: {
      insertDeck: (layout?: DeckLayout) => ReturnType
      setDeckLayout: (layout: DeckLayout) => ReturnType
      addDeckSlide: () => ReturnType
      stepDeck: (delta: number) => ReturnType
    }
  }
}

function emptyCell() {
  return { type: 'deckCell', content: [{ type: 'paragraph' }] }
}

function emptySlide(layout: DeckLayout) {
  return {
    type: 'deckSlide',
    attrs: { layout },
    content: Array.from({ length: DECK_LAYOUT_META[layout].slots }, emptyCell),
  }
}

function fitSlideCells(layout: DeckLayout, cells: unknown[]) {
  const n = DECK_LAYOUT_META[layout].slots
  const next = cells.slice(0, n)
  while (next.length < n) next.push(emptyCell())
  return next
}

/** 选区在格子里、或刚插完停在 deck 后面，都能找到当前这页。 */
function nearestDeckPos(state: EditorState) {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'deck') return $from.before(d)
  }
  const around = $from.nodeAfter ?? $from.nodeBefore
  if (around?.type.name === 'deck') {
    return $from.nodeAfter?.type.name === 'deck' ? $from.pos : $from.pos - around.nodeSize
  }
  let found = -1
  state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.type.name === 'deck') found = pos
    return found < 0
  })
  return found
}

function currentSlidePos(state: EditorState) {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'deckSlide') return $from.before(d)
  }
  const deckPos = nearestDeckPos(state)
  if (deckPos < 0) return -1
  const deck = state.doc.nodeAt(deckPos)
  if (!deck || !deck.childCount) return -1
  const index = Math.min(Math.max(0, Number(deck.attrs.index) || 0), deck.childCount - 1)
  let pos = deckPos + 1
  for (let i = 0; i < index; i++) pos += deck.child(i).nodeSize
  return pos
}

export const deckCell = Node.create({
  name: 'deckCell',
  content: 'block+',
  isolating: true,
  defining: true,
  parseHTML() {
    return [{ tag: 'section[data-deck-cell]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-deck-cell': '' }), 0]
  },
  renderMarkdown: (node, h) => {
    const body = h.renderChildren(Array.isArray(node.content) ? node.content : [])
    return `:::cell\n${String(body ?? '').trim()}\n:::`
  },
})

export const deckSlide = Node.create({
  name: 'deckSlide',
  content: 'deckCell+',
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      layout: { default: 'split' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'article[data-deck-slide]',
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false
          const layout = el.getAttribute('data-layout')
          return { layout: isDeckLayout(layout) ? layout : 'split' }
        },
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'article',
      mergeAttributes(HTMLAttributes, {
        'data-deck-slide': '',
        'data-layout': String(node.attrs.layout ?? 'split'),
      }),
      0,
    ]
  },
  renderMarkdown: (node, h) => {
    const layout = isDeckLayout(node.attrs?.layout) ? node.attrs.layout : 'split'
    const body = h.renderChildren(Array.isArray(node.content) ? node.content : [])
    return `:::slide {layout=${layout}}\n${String(body ?? '').trim()}\n:::`
  },
})

export const deck = Node.create({
  name: 'deck',
  group: 'block',
  content: 'deckSlide+',
  isolating: true,
  defining: true,
  selectable: true,
  addAttributes() {
    return {
      index: { default: 0 },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-deck]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-deck': '' }), 0]
  },
  parseMarkdown: (token, helpers) => {
    const slides = Array.isArray((token as { slides?: unknown }).slides) ? (token as { slides: Array<{ layout?: string; cells?: unknown[] }> }).slides : []
    const content = slides.map((slide) => {
      const layout = isDeckLayout(slide.layout) ? slide.layout : 'split'
      const cells = Array.isArray(slide.cells) ? slide.cells : []
      return helpers.createNode(
        'deckSlide',
        { layout },
        (cells.length ? cells : [[]]).map((tokens) =>
          helpers.createNode('deckCell', {}, helpers.parseChildren(Array.isArray(tokens) ? tokens : [])),
        ),
      )
    })
    return helpers.createNode('deck', { index: Number((token as { index?: unknown }).index) || 0 }, content.length ? content : emptyDeckJSON().content)
  },
  renderMarkdown: (node, h) => {
    const index = Number(node.attrs?.index) || 0
    const body = h.renderChildren(Array.isArray(node.content) ? node.content : [])
    return `:::deck {index=${index}}\n${String(body ?? '').trim()}\n:::`
  },
  markdownTokenizer: {
    name: 'deck',
    level: 'block',
    start(src) {
      return src.match(/^:::deck/m)?.index ?? -1
    },
    tokenize(src, _tokens, helpers) {
      const taken = takeDeckFence(src)
      if (!taken) return undefined
      const blockTokens = helpers && typeof helpers.blockTokens === 'function' ? helpers.blockTokens.bind(helpers) : null
      return {
        type: 'deck',
        raw: taken.raw,
        index: taken.index,
        slides: taken.slides.map((slide) => ({
          layout: slide.layout,
          cells: slide.cells.map((md) => (blockTokens ? blockTokens(md || '') : [])),
        })),
      }
    },
  },
  addCommands() {
    return {
      insertDeck:
        (layout = 'split') =>
        ({ commands }) =>
          commands.insertContent(emptyDeckJSON(layout)),
      setDeckLayout:
        (layout) =>
        ({ state, tr, dispatch }) => {
          const slidePos = currentSlidePos(state)
          if (slidePos < 0) return false
          const slide = state.doc.nodeAt(slidePos)
          if (!slide) return false
          const cells: unknown[] = []
          slide.content.forEach((child) => cells.push(child.toJSON()))
          if (dispatch) {
            tr.setNodeMarkup(slidePos, undefined, { ...slide.attrs, layout })
            const fitted = fitSlideCells(layout, cells)
            tr.replaceWith(slidePos + 1, slidePos + slide.nodeSize - 1, fitted.map((item) => state.schema.nodeFromJSON(item)))
            dispatch(tr)
          }
          return true
        },
      addDeckSlide:
        () =>
        ({ state, tr, dispatch }) => {
          const deckPos = nearestDeckPos(state)
          if (deckPos < 0) return false
          const node = state.doc.nodeAt(deckPos)
          if (!node) return false
          if (dispatch) {
            const slide = state.schema.nodeFromJSON(emptySlide('split'))
            tr.insert(deckPos + node.nodeSize - 1, slide)
            tr.setNodeMarkup(deckPos, undefined, { ...node.attrs, index: node.childCount })
            dispatch(tr)
          }
          return true
        },
      stepDeck:
        (delta) =>
        ({ state, tr, dispatch }) => {
          const deckPos = nearestDeckPos(state)
          if (deckPos < 0) return false
          const node = state.doc.nodeAt(deckPos)
          if (!node) return false
          const next = Math.min(node.childCount - 1, Math.max(0, Number(node.attrs.index || 0) + delta))
          if (dispatch) dispatch(tr.setNodeMarkup(deckPos, undefined, { ...node.attrs, index: next }))
          return true
        },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(DeckView, { className: 'page-deck' })
  },
})

export const deckExtensions = [deck, deckSlide, deckCell]
