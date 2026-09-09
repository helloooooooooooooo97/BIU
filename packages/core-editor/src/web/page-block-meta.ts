/** 文档里的块只认自己写下的插件 id，编辑器不猜、不查插件表。 */
export const ENABLE_PAGE_BLOCK_PLUGIN = 'biu:enable-page-block-plugin'

const HTML_KINDS = new Set(['html', 'htmlframe'])

export function parsePageBlockMeta(raw: string) {
  const kind = raw.match(/\bkind=["']?([a-z0-9-]+)/i)?.[1] ?? 'card'
  const plugin = raw.match(/\bplugin=["']?([a-z][a-z0-9-]*)/i)?.[1] ?? ''
  const extras: Record<string, unknown> = {}
  const deck = raw.match(/\bdeck=(true|false|1|0)\b/i)?.[1]
  if (deck) extras.deck = /^(true|1)$/i.test(deck)
  const height = raw.match(/\bheight=(\d+)\b/i)?.[1]
  if (height) extras.height = Number(height)
  return { kind, plugin, extras }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const data = JSON.parse(trimmed) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

/** HTML / iframe 块：围栏里直接写 HTML；deck / height 写在 :::pageBlock {…} 上。旧 JSON 体仍能读。 */
export function parsePageBlockData(kind: string, raw: string, extras: Record<string, unknown> = {}) {
  const json = parseJsonObject(raw)
  if (json) return { ...json, ...extras }
  if (HTML_KINDS.has(kind)) return { ...extras, html: raw.trim() }
  return { ...extras }
}

function formatMeta(kind: string, plugin: string, extras: string[]) {
  const parts = [`kind=${kind}`]
  if (plugin) parts.push(`plugin=${plugin}`)
  parts.push(...extras)
  return `{${parts.join(' ')}}`
}

function htmlFenceExtras(data: Record<string, unknown>) {
  const extras: string[] = []
  if (typeof data.deck === 'boolean') extras.push(`deck=${data.deck}`)
  if (typeof data.height === 'number' && Number.isFinite(data.height)) extras.push(`height=${Math.round(data.height)}`)
  return extras
}

export function formatPageBlockFence(kind: string, plugin: string, data: Record<string, unknown>) {
  const body = { ...data }
  delete body.cloneFrom
  if (HTML_KINDS.has(kind)) {
    const html = typeof body.html === 'string' ? body.html : ''
    const extras = htmlFenceExtras(body)
    return `:::pageBlock ${formatMeta(kind, plugin, extras)}\n${html}\n:::`
  }
  const meta = formatMeta(kind, plugin, [])
  return `:::pageBlock ${meta}\n${JSON.stringify(body, null, 2)}\n:::`
}

export function requestEnablePageBlockPlugin(plugin: string, kind: string) {
  const id = plugin.trim()
  if (!id || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN, { detail: { plugin: id, kind } }))
}
