export type PageImageAlign = 'left' | 'center' | 'right'

export function pageImageAlign(value: unknown): PageImageAlign {
  return value === 'center' || value === 'right' ? value : 'left'
}

export function clampImageWidth(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(Math.min(1600, Math.max(80, n)))
}

export function imageCaptionFromFile(name: string) {
  return name.replace(/^.*[/\\]/, '').trim() || 'image.png'
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function pageImageMarkdown(attrs: Record<string, unknown>) {
  const src = String(attrs.src ?? '')
  const alt = String(attrs.alt ?? '')
  const title = String(attrs.title ?? '')
  const width = clampImageWidth(attrs.width)
  const align = pageImageAlign(attrs.align)
  if (width || align !== 'left') {
    const bits = [`src="${escapeAttr(src)}"`, `alt="${escapeAttr(alt)}"`]
    if (title) bits.push(`title="${escapeAttr(title)}"`)
    if (width) bits.push(`width="${width}"`)
    if (align !== 'left') bits.push(`data-align="${align}"`)
    return `<img ${bits.join(' ')}>`
  }
  const suffix = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
  return `![${alt.replace(/]/g, '\\]')}](${src}${suffix})`
}
