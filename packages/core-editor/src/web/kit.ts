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
    const askLatex = (current: string) => {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return null
      return window.prompt('LaTeX 公式', current)
    }
    return [
      BlockMath.configure({
        katexOptions: { throwOnError: false, displayMode: true },
        onClick: (node, pos) => {
          const next = askLatex(String(node.attrs.latex ?? ''))
          if (next == null) return
          editorOf().chain().setNodeSelection(pos).updateBlockMath({ latex: next }).focus().run()
        },
      }),
      pageInlineMath.configure({
        katexOptions: { throwOnError: false, displayMode: false },
        onClick: (node, pos) => {
          const next = askLatex(String(node.attrs.latex ?? ''))
          if (next == null) return
          editorOf().chain().setNodeSelection(pos).updateInlineMath({ latex: next }).focus().run()
        },
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
