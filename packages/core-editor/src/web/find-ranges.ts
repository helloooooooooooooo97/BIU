export type FindHit = { from: number; to: number; node?: boolean }

type TextPiece = { flatFrom: number; pos: number; text: string }

export function wrapFindIndex(index: number, total: number) {
  if (total <= 0) return 0
  return ((index % total) + total) % total
}

export function findRanges(text: string, query: string): FindHit[] {
  const needle = query.trim()
  if (!needle) return []
  const hay = text.toLowerCase()
  const q = needle.toLowerCase()
  const hits: FindHit[] = []
  let from = 0
  while (from <= hay.length - q.length) {
    const at = hay.indexOf(q, from)
    if (at < 0) break
    hits.push({ from: at, to: at + needle.length })
    from = at + Math.max(q.length, 1)
  }
  return hits
}

/** HTML 块预览里能看见的字：去掉标签，留给 TipTap 搜索。 */
export function htmlVisibleText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function pageBlockHtmlText(node: {
  type?: { name?: string }
  attrs?: { kind?: unknown; data?: unknown }
}) {
  if (node.type?.name !== 'pageBlock') return ''
  const kind = String(node.attrs?.kind ?? '')
  if (kind !== 'html' && kind !== 'htmlframe') return ''
  const data = node.attrs?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const html = (data as { html?: unknown }).html
  return typeof html === 'string' ? htmlVisibleText(html) : ''
}

function posFromFlat(pieces: TextPiece[], offset: number) {
  if (!pieces.length) return 0
  if (offset <= 0) return pieces[0]!.pos
  for (const piece of pieces) {
    const end = piece.flatFrom + piece.text.length
    if (offset <= end) return piece.pos + (offset - piece.flatFrom)
  }
  const last = pieces[pieces.length - 1]!
  return last.pos + last.text.length
}

/** 在同一段落内跨 mark 搜可见文字；HTML / htmlframe 块只看整块是否含关键字。 */
export function findInPmDoc(
  doc: {
    descendants: (
      fn: (
        node: {
          isTextblock?: boolean
          nodeSize?: number
          type?: { name?: string }
          attrs?: { kind?: unknown; data?: unknown }
          forEach?: (cb: (child: { isText?: boolean; text?: string | null }, offset: number) => void) => void
        },
        pos: number,
      ) => boolean | void,
    ) => void
  },
  query: string,
): FindHit[] {
  const needle = query.trim()
  if (!needle) return []
  const q = needle.toLowerCase()
  const hits: FindHit[] = []
  doc.descendants((node, pos) => {
    const htmlText = pageBlockHtmlText(node)
    if (htmlText) {
      if (htmlText.toLowerCase().includes(q)) {
        const size = node.nodeSize ?? 1
        hits.push({ from: pos, to: pos + size, node: true })
      }
      return false
    }
    if (!node.isTextblock || typeof node.forEach !== 'function') return
    const pieces: TextPiece[] = []
    let flat = ''
    node.forEach((child, offset) => {
      if (!child.isText || !child.text) return
      pieces.push({ flatFrom: flat.length, pos: pos + 1 + offset, text: child.text })
      flat += child.text
    })
    if (!flat) return false
    const hay = flat.toLowerCase()
    let from = 0
    while (from <= hay.length - q.length) {
      const at = hay.indexOf(q, from)
      if (at < 0) break
      hits.push({
        from: posFromFlat(pieces, at),
        to: posFromFlat(pieces, at + needle.length),
      })
      from = at + Math.max(q.length, 1)
    }
    return false
  })
  return hits
}
