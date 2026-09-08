export type FindHit = { from: number; to: number }

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

export function findInPmDoc(doc: { descendants: (fn: (node: { isText?: boolean; text?: string | null }, pos: number) => void) => void }, query: string): FindHit[] {
  const needle = query.trim()
  if (!needle) return []
  const q = needle.toLowerCase()
  const hits: FindHit[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const hay = node.text.toLowerCase()
    let from = 0
    while (from <= hay.length - q.length) {
      const at = hay.indexOf(q, from)
      if (at < 0) break
      hits.push({ from: pos + at, to: pos + at + needle.length })
      from = at + Math.max(q.length, 1)
    }
  })
  return hits
}
