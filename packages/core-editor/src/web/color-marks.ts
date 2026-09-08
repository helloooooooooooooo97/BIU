import { TextStyle, Color } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** 颜色写进 Markdown 的 HTML，避免 ==高亮== 丢掉色值。 */
export const pageTextStyle = TextStyle.extend({
  renderMarkdown: (node, h) => {
    const color = typeof node.attrs?.color === 'string' ? node.attrs.color : ''
    const inner = h.renderChildren(node)
    if (!color) return inner
    return `<span style="color: ${escapeAttr(color)}">${inner}</span>`
  },
})

export const pageHighlight = Highlight.extend({
  renderMarkdown: (node, h) => {
    const color = typeof node.attrs?.color === 'string' ? node.attrs.color : ''
    const inner = h.renderChildren(node)
    if (!color) return `==${inner}==`
    return `<mark data-color="${escapeAttr(color)}">${inner}</mark>`
  },
}).configure({ multicolor: true })

export { Color }
