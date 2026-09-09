function asTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
}

export function contentToMarkdown(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>
    if (typeof rec.body === 'string') return rec.body
  }
  return String(value)
}

function yamlTags(tags: string[]) {
  if (!tags.length) return 'tags: []'
  return `tags:\n${tags.map((tag) => `  - ${JSON.stringify(tag)}`).join('\n')}`
}

export function recordToMarkdown(row: Record<string, unknown>, body: string): string {
  const title = String(row.title ?? '').trim()
  const lines = [
    `id: ${JSON.stringify(String(row.id ?? ''))}`,
    ...(title ? [`title: ${JSON.stringify(title)}`] : []),
    yamlTags(asTagList(row.tags)),
  ]
  return `---\n${lines.join('\n')}\n---\n${body.replace(/^\n/, '')}`
}

export function packMarkdownDocs(docs: string[]) {
  return docs.filter(Boolean).join('\n\n')
}
