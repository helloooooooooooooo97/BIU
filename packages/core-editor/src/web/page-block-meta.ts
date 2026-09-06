/** 文档里的块只认自己写下的插件 id，编辑器不猜、不查插件表。 */
export const ENABLE_PAGE_BLOCK_PLUGIN = 'biu:enable-page-block-plugin'

export function parsePageBlockMeta(raw: string) {
  const kind = raw.match(/\bkind=["']?([a-z0-9-]+)/i)?.[1] ?? 'card'
  const plugin = raw.match(/\bplugin=["']?([a-z][a-z0-9-]*)/i)?.[1] ?? ''
  return { kind, plugin }
}

export function formatPageBlockFence(kind: string, plugin: string, data: Record<string, unknown>) {
  const body = { ...data }
  delete body.cloneFrom
  const meta = plugin ? `{kind=${kind} plugin=${plugin}}` : `{kind=${kind}}`
  return `:::pageBlock ${meta}\n${JSON.stringify(body, null, 2)}\n:::`
}

export function requestEnablePageBlockPlugin(plugin: string, kind: string) {
  const id = plugin.trim()
  if (!id || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN, { detail: { plugin: id, kind } }))
}
