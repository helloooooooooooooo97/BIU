import { InputRule } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import { BlockMath, InlineMath, Mathematics } from '@tiptap/extension-mathematics'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { pageTextStyle, pageHighlight, Color } from './color-marks.ts'
import { headingSkin } from './heading-skin.ts'
import { pageBlock } from './page-block.ts'
import { pageFind } from './find-plugin.ts'
import { slashCommand } from './slash.ts'
import { openMathPop } from './math-pop.ts'

/** 上游 insertInlineMath 读的是旧 selection，斜杠删掉 `/` 后会插到段落外，插不进去。 */
const pageInlineMath = InlineMath.extend({
  addCommands() {
    const parent = this.parent?.() ?? {}
    return {
      ...parent,
      insertInlineMath:
        (options) =>
        ({ commands }) => {
          const latex = options.latex
          if (!latex) return false
          const content = { type: this.name, attrs: { latex } }
          return options.pos != null ? commands.insertContentAt(options.pos, content) : commands.insertContent(content)
        },
    }
  },
  addInputRules() {
    return [
      new InputRule({
        find: /(?<!\$)\$([^$\n]+)\$(?!\$)$/,
        handler: ({ state, range, match }) => {
          const latex = match[1].trim()
          if (!latex) return
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex }))
        },
      }),
    ]
  },
})

const pageMathematics = Mathematics.extend({
  addExtensions() {
    const editorOf = () => this.editor
    const editLatex = (kind: 'block' | 'inline', node: { attrs: Record<string, unknown> }, pos: number) => {
      const editor = editorOf()
      if (editor.isDestroyed) return
      const dom = editor.view.nodeDOM(pos)
      const anchor = dom instanceof Element ? dom : null
      if (!anchor) return
      editor.chain().setNodeSelection(pos).focus().run()
      const name = kind === 'block' ? 'blockMath' : 'inlineMath'
      openMathPop({
        anchor,
        latex: String(node.attrs.latex ?? ''),
        onCommit: (next) => {
          if (editor.isDestroyed) return
          const current = editor.state.doc.nodeAt(pos)
          if (!current || current.type.name !== name) return
          if (next === String(current.attrs.latex ?? '')) return
          const chain = editor.chain().setNodeSelection(pos)
          if (kind === 'block') chain.updateBlockMath({ latex: next }).focus().run()
          else chain.updateInlineMath({ latex: next }).focus().run()
        },
      })
    }
    return [
      BlockMath.configure({
        katexOptions: { throwOnError: false, displayMode: true },
        onClick: (node, pos) => editLatex('block', node, pos),
      }),
      pageInlineMath.configure({
        katexOptions: { throwOnError: false, displayMode: false },
        onClick: (node, pos) => editLatex('inline', node, pos),
      }),
    ]
  },
})

export function pageEditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Markdown,
    pageTextStyle,
    Color,
    pageHighlight,
    Image.configure({ inline: false, allowBase64: true }),
    TableKit.configure({
      table: { resizable: true, allowTableNodeSelection: true },
    }),
    pageMathematics,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return `标题 ${node.attrs.level}`
        return '输入 / 插入模块'
      },
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
      includeChildren: false,
    }),
    headingSkin,
    pageBlock,
    pageFind,
    slashCommand,
  ]
}
