const OPEN = /^:::code(?:\s+\{([^}]*)\})?\s*(?:<!--.*?-->\s*)?$/
const CLOSE = /^:::\s*(?:<!--.*?-->\s*)?$/

export type CodeFence = { raw: string; language: string; id: string; body: string }

function attr(header: string, key: string) {
  return header.match(new RegExp(`\\b${key}=(?:"([^"]*)"|'([^']*)'|([^\\s}]+))`, 'i'))
}

export function parseCodeFenceMeta(header: string) {
  const lang = attr(header, 'lang') || attr(header, 'language')
  const id = attr(header, 'id')
  return {
    language: String(lang?.[1] ?? lang?.[2] ?? lang?.[3] ?? '').trim(),
    id: String(id?.[1] ?? id?.[2] ?? id?.[3] ?? '').trim(),
  }
}

function closeLooksOuter(lines: string[], closeAt: number) {
  let i = closeAt + 1
  while (i < lines.length && !String(lines[i] ?? '').trim()) i += 1
  if (i >= lines.length) return true
  return /^(:::((pageBlock|cell|slide|table|row|th|td|code)\b|$)|`{3,}|#{1,6}\s)/.test(String(lines[i] ?? ''))
}

export function takeCodeFence(src: string): CodeFence | null {
  const lines = src.split('\n')
  const head = OPEN.exec(lines[0] ?? '')
  if (!head) return null
  const closes: number[] = []
  for (let i = 1; i < lines.length; i += 1) {
    if (CLOSE.test(lines[i] ?? '')) closes.push(i)
  }
  if (!closes.length) return null
  const end = closes.find((index) => closeLooksOuter(lines, index)) ?? closes[closes.length - 1]
  const meta = parseCodeFenceMeta(head[1] ?? '')
  return {
    raw: lines.slice(0, end + 1).join('\n'),
    language: meta.language,
    id: meta.id,
    body: lines.slice(1, end).join('\n'),
  }
}

export function formatCodeFence(language: string, id: string, body: string) {
  const bits: string[] = []
  const lang = language.trim()
  if (lang) bits.push(`lang=${lang}`)
  if (id.trim()) bits.push(`id=${id.trim()}`)
  const open = bits.length ? `:::code {${bits.join(' ')}}` : ':::code'
  return `${open}\n${body}\n:::`
}

export function withCodeFenceId(firstLine: string, id: string) {
  const head = OPEN.exec(firstLine)
  if (!head) return null
  const meta = String(head[1] ?? '').trim()
  if (/\bid=/.test(meta)) return firstLine
  const next = meta ? `${meta} id=${id}` : `id=${id}`
  return `:::code {${next}}`
}
