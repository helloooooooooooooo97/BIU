import { Extension, mergeAttributes, Node } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { moveSlideCellSelection, selectionFromSlideClick, selectionInSlide } from './slide-nav.ts'
import { SlideView } from './slide-view.tsx'
import {
  SLIDE_LAYOUT_META,
  emptySlideJSON,
  isSlideLayout,
  parseSlideBg,
  slideFenceOpen,
  takeSlideFence,
  type SlideLayout,
} from './slide-md.ts'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    slide: {
      insertSlide: (layout?: SlideLayout) => ReturnType
      setSlideLayout: (layout: SlideLayout) => ReturnType
      setSlideBg: (bg: string) => ReturnType
    }
  }
}

function emptyCell() {
  return { type: 'slideCell', content: [{ type: 'paragraph' }] }
}

function endOfTextblockSafe(view: { endOfTextblock: (dir: 'up' | 'down') => boolean }, dir: 'up' | 'down') {
  try {
    return view.endOfTextblock(dir)
  } catch {
    return true
  }
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
  allowGapCursor: false,
  parseHTML() {
    return [{ tag: 'section[data-slide-cell]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-slide-cell': '' }), 0]
  },
  renderMarkdown: (node, h) => {
    const body = h.renderChildren(Array.isArray(node.content) ? node.content : [], '\n\n')
    return `:::cell\n${String(body ?? '').trim()}\n:::\n`
  },
})

export const slide = Node.create({
  name: 'slide',
  group: 'block',
  content: 'slideCell+',
  isolating: true,
  defining: true,
  selectable: false,
  allowGapCursor: false,
  addAttributes() {
    return {
      layout: { default: 'split' },
      bg: {
        default: '',
        parseHTML: (el) => parseSlideBg(el.getAttribute('data-bg')),
        renderHTML: (attrs) => {
          const bg = parseSlideBg(attrs.bg)
          return bg ? { 'data-bg': bg } : {}
        },
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-slide]',
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false
          const layout = el.getAttribute('data-layout')
          return { layout: isSlideLayout(layout) ? layout : 'split', bg: parseSlideBg(el.getAttribute('data-bg')) }
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
        ...(parseSlideBg(node.attrs.bg) ? { 'data-bg': parseSlideBg(node.attrs.bg) } : {}),
      }),
      0,
    ]
  },
  parseMarkdown: (token, helpers) => {
    const layout = isSlideLayout((token as { layout?: unknown }).layout) ? (token as { layout: SlideLayout }).layout : 'split'
    const bg = parseSlideBg((token as { bg?: unknown }).bg)
    const cells = Array.isArray((token as { cells?: unknown }).cells) ? (token as { cells: unknown[] }).cells : []
    const content = (cells.length ? cells : [[]]).map((tokens) => {
      const kids = helpers.parseChildren(Array.isArray(tokens) ? tokens : [])
      return helpers.createNode('slideCell', {}, kids.length ? kids : [{ type: 'paragraph' }])
    })
    return helpers.createNode('slide', { layout, bg }, content.length ? content : emptySlideJSON(layout, bg).content)
  },
  renderMarkdown: (node, h) => {
    const layout = isSlideLayout(node.attrs?.layout) ? node.attrs.layout : 'split'
    const cells = Array.isArray(node.content) ? node.content : []
    const body = cells
      .map((cell) => {
        const inner = h.renderChildren(
          Array.isArray((cell as { content?: unknown }).content) ? (cell as { content: unknown[] }).content : [],
          '\n\n',
        )
        return `:::cell\n${String(inner ?? '').trim()}\n:::`
      })
      .join('\n\n')
    return `${slideFenceOpen(layout, node.attrs?.bg)}\n${body}\n:::`
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
        bg: taken.bg,
        cells: taken.cells.map((md) => (blockTokens ? blockTokens(md || '') : [])),
      }
    },
  },
  addCommands() {
    return {
      insertSlide:
        (layout = 'split') =>
        ({ chain }) =>
          chain()
            .insertContent(emptySlideJSON(layout))
            .command(({ state, dispatch }) => {
              const slidePos = nearestSlidePos(state)
              if (slidePos < 0) return false
              const node = state.doc.nodeAt(slidePos)
              if (!node) return false
              if (dispatch) dispatch(selectionInSlide(state, slidePos, node, 'first'))
              return true
            })
            .run(),
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
      setSlideBg:
        (bg) =>
        ({ state, tr, dispatch }) => {
          const slidePos = nearestSlidePos(state)
          if (slidePos < 0) return false
          const node = state.doc.nodeAt(slidePos)
          if (!node) return false
          if (dispatch) {
            tr.setNodeMarkup(slidePos, undefined, { ...node.attrs, bg: parseSlideBg(bg) })
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

const slideNavKey = new PluginKey('slide-nav')

export const slideNav = Extension.create({
  name: 'slideNav',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: slideNavKey,
        appendTransaction(_trs, _old, state) {
          const empty: number[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'slideCell' && node.childCount === 0) empty.push(pos)
          })
          if (!empty.length) return null
          const paragraph = state.schema.nodes.paragraph
          if (!paragraph) return null
          let tr = state.tr
          for (const pos of empty.reverse()) tr = tr.insert(pos + 1, paragraph.create())
          return tr
        },
        props: {
          handleKeyDown(view, event) {
            if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false
            const dir = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
            if (!dir) return false
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !endOfTextblockSafe(view, event.key === 'ArrowDown' ? 'down' : 'up')) {
              return false
            }
            const tr = moveSlideCellSelection(view.state, dir as 1 | -1)
            if (!tr) return false
            event.preventDefault()
            view.dispatch(tr.scrollIntoView())
            return true
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const tr = selectionFromSlideClick(view, event)
              if (!tr) return false
              view.focus()
              view.dispatch(tr.scrollIntoView())
              return true
            },
          },
        },
      }),
    ]
  },
})

export const slideExtensions = [slide, slideCell, slideNav]
