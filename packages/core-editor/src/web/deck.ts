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
    }
  }
}

function emptyCell() {
  return { type: 'deckCell', content: [{ type: 'paragraph' }] }
}

function fitDeckCells(layout: DeckLayout, cells: unknown[]) {
  const n = DECK_LAYOUT_META[layout].slots
  const next = cells.slice(0, n)
  while (next.length < n) next.push(emptyCell())
  return next
}

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

export const deck = Node.create({
  name: 'deck',
  group: 'block',
  content: 'deckCell+',
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
        tag: 'div[data-deck]',
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
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-deck': '',
        'data-layout': String(node.attrs.layout ?? 'split'),
      }),
      0,
    ]
  },
  parseMarkdown: (token, helpers) => {
    const layout = isDeckLayout((token as { layout?: unknown }).layout) ? (token as { layout: DeckLayout }).layout : 'split'
    const cells = Array.isArray((token as { cells?: unknown }).cells) ? (token as { cells: unknown[] }).cells : []
    const content = (cells.length ? cells : [[]]).map((tokens) =>
      helpers.createNode('deckCell', {}, helpers.parseChildren(Array.isArray(tokens) ? tokens : [])),
    )
    return helpers.createNode('deck', { layout }, content.length ? content : emptyDeckJSON(layout).content)
  },
  renderMarkdown: (node, h) => {
    const layout = isDeckLayout(node.attrs?.layout) ? node.attrs.layout : 'split'
    const body = h.renderChildren(Array.isArray(node.content) ? node.content : [])
    return `:::deck {layout=${layout}}\n${String(body ?? '').trim()}\n:::`
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
        layout: taken.layout,
        cells: taken.cells.map((md) => (blockTokens ? blockTokens(md || '') : [])),
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
          const deckPos = nearestDeckPos(state)
          if (deckPos < 0) return false
          const node = state.doc.nodeAt(deckPos)
          if (!node) return false
          const cells: unknown[] = []
          node.content.forEach((child) => cells.push(child.toJSON()))
          if (dispatch) {
            tr.setNodeMarkup(deckPos, undefined, { ...node.attrs, layout })
            const fitted = fitDeckCells(layout, cells)
            tr.replaceWith(deckPos + 1, deckPos + node.nodeSize - 1, fitted.map((item) => state.schema.nodeFromJSON(item)))
            dispatch(tr)
          }
          return true
        },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(DeckView)
  },
})

export const deckExtensions = [deck, deckCell]
