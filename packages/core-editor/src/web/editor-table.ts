import { Table, TableCell, TableHeader, renderTableToMarkdown } from '@tiptap/extension-table'
import { formatCellFenceAttrs, tableNeedsFence, takeTableFence, type TableFenceCellAttrs } from './table-md.ts'

const CELL_STYLE_ATTRS = {
  background: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-cell-bg') || el.style.backgroundColor || null,
    renderHTML: (attrs: { background?: string | null }) =>
      attrs.background ? { 'data-cell-bg': attrs.background, style: `background-color: ${attrs.background}` } : {},
  },
  align: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-cell-align') || el.style.textAlign || null,
    renderHTML: (attrs: { align?: string | null }) =>
      attrs.align ? { 'data-cell-align': attrs.align, style: `text-align: ${attrs.align}` } : {},
  },
}

export const pageTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...CELL_STYLE_ATTRS,
    }
  },
})

export const pageTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...CELL_STYLE_ATTRS,
    }
  },
})

function emptyPara() {
  return { type: 'paragraph' }
}

function parseGfmTable(
  token: { header?: { tokens?: unknown; align?: unknown }[]; rows?: { tokens?: unknown; align?: unknown }[][]; align?: unknown[] },
  h: { createNode: (type: string, attrs: Record<string, unknown> | undefined, content: unknown[]) => unknown; parseInline: (tokens: unknown) => unknown },
) {
  const rows: unknown[] = []
  const alignments = Array.isArray(token.align) ? token.align : []
  if (token.header) {
    rows.push(
      h.createNode(
        'tableRow',
        {},
        token.header.map((cell, index) =>
          h.createNode('tableHeader', alignments[index] ? { align: alignments[index] } : {}, [
            { type: 'paragraph', content: h.parseInline(cell.tokens) },
          ]),
        ),
      ),
    )
  }
  for (const row of token.rows ?? []) {
    rows.push(
      h.createNode(
        'tableRow',
        {},
        row.map((cell, index) =>
          h.createNode('tableCell', alignments[index] ? { align: alignments[index] } : {}, [
            { type: 'paragraph', content: h.parseInline(cell.tokens) },
          ]),
        ),
      ),
    )
  }
  return h.createNode('table', undefined, rows)
}

export const pageTable = Table.extend({
  parseMarkdown: (token, h) => {
    const fenceRows = (token as { fenceRows?: { kind: 'th' | 'td'; tokens: unknown[]; attrs?: TableFenceCellAttrs }[][] }).fenceRows
    if (Array.isArray(fenceRows)) {
      const rows = fenceRows.map((row) =>
        h.createNode(
          'tableRow',
          {},
          row.map((cell) => {
            const kids = h.parseChildren(cell.tokens)
            return h.createNode(
              cell.kind === 'th' ? 'tableHeader' : 'tableCell',
              cell.attrs ?? {},
              kids.length ? kids : [emptyPara()],
            )
          }),
        ),
      )
      return h.createNode('table', undefined, rows.length ? rows : [h.createNode('tableRow', {}, [h.createNode('tableCell', {}, [emptyPara()])])])
    }
    return parseGfmTable(token as never, h)
  },
  renderMarkdown: (node, h) => {
    if (!tableNeedsFence(node)) return renderTableToMarkdown(node, h)
    const rows = Array.isArray(node.content) ? node.content : []
    const body = rows
      .map((row) => {
        const cells = Array.isArray((row as { content?: unknown }).content) ? (row as { content: unknown[] }).content : []
        const inner = cells
          .map((cell) => {
            const rec = cell as { type?: string; attrs?: Record<string, unknown>; content?: unknown }
            const kind = rec.type === 'tableHeader' ? 'th' : 'td'
            const attrText = formatCellFenceAttrs(rec.attrs)
            const md = h.renderChildren(Array.isArray(rec.content) ? rec.content : [], '\n\n')
            return `:::${kind}${attrText}\n${String(md ?? '').trim()}\n:::`
          })
          .join('\n\n')
        return `:::row\n\n${inner}\n\n:::`
      })
      .join('\n\n')
    return `:::table\n\n${body}\n\n:::`
  },
  markdownTokenizer: {
    name: 'table',
    level: 'block',
    start(src) {
      return src.match(/^:::table/m)?.index ?? -1
    },
    tokenize(src, _tokens, helpers) {
      const taken = takeTableFence(src)
      if (!taken) return undefined
      const blockTokens = helpers && typeof helpers.blockTokens === 'function' ? helpers.blockTokens.bind(helpers) : null
      return {
        type: 'table',
        raw: taken.raw,
        fenceRows: taken.rows.map((row) =>
          row.cells.map((cell) => ({
            kind: cell.kind,
            tokens: blockTokens ? blockTokens(cell.md || '') : [],
            ...(cell.attrs ? { attrs: cell.attrs } : {}),
          })),
        ),
      }
    },
  },
})
