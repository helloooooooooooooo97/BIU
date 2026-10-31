export type PageOutlineItem = {
  id: string
  level: 1 | 2 | 3
  text: string
  body: string
}

export function parsePageOutline(markdown: string): PageOutlineItem[] {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const items: PageOutlineItem[] = []
  let current: PageOutlineItem | null = null
  const flush = () => {
    if (!current) return
    current.body = current.body.trim()
    items.push(current)
    current = null
  }
  for (const line of lines) {
    const hit = /^(#{1,3})\s+(.+?)\s*$/.exec(line)
    if (hit) {
      flush()
      const level = hit[1]!.length as 1 | 2 | 3
      current = { id: `outline-${items.length}`, level, text: hit[2]!.trim(), body: '' }
      continue
    }
    if (current) current.body += (current.body ? '\n' : '') + line
  }
  flush()
  return items
}

export function filterPageOutline(
  items: PageOutlineItem[],
  query: string,
  levels: Array<1 | 2 | 3>,
  sort: 'doc' | 'title',
) {
  const q = query.trim().toLowerCase()
  const allowed = new Set(levels)
  const next = items.filter((item) => {
    if (!allowed.has(item.level)) return false
    if (!q) return true
    return item.text.toLowerCase().includes(q) || item.body.toLowerCase().includes(q)
  })
  if (sort === 'title') return [...next].sort((a, b) => a.text.localeCompare(b.text, 'zh'))
  return next
}
