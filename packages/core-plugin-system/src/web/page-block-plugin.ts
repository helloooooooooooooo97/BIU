import { buildAppPath } from '@biu/web-session-view'

export const ENABLE_PAGE_BLOCK_PLUGIN = 'biu:enable-page-block-plugin'
export const PAGE_BLOCK_PLUGIN_PHASE = 'biu:page-block-plugin-phase'

export function pluginRecordHref(id: string) {
  return buildAppPath({
    kind: 'record',
    moduleId: 'database',
    path: '/database',
    collection: '/plugins',
    recordId: id,
  })
}

export async function startStorePlugin(id: string) {
  const res = await fetch('/api/db/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/plugins/${id}`, action: 'start' }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
}

export function pageBlockPluginFromEvent(event: Event) {
  const detail = (event as CustomEvent<{ plugin?: unknown; kind?: unknown }>).detail
  const plugin = typeof detail?.plugin === 'string' ? detail.plugin.trim() : ''
  return plugin
}

function reportPhase(plugin: string, phase: 'ready' | 'failed') {
  window.dispatchEvent(new CustomEvent(PAGE_BLOCK_PLUGIN_PHASE, { detail: { plugin, phase } }))
}

export function listenEnablePageBlockPlugin() {
  const onEnable = (event: Event) => {
    const plugin = pageBlockPluginFromEvent(event)
    if (!plugin) return
    void startStorePlugin(plugin)
      .then(() => reportPhase(plugin, 'ready'))
      .catch(() => reportPhase(plugin, 'failed'))
  }
  window.addEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  return () => window.removeEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
}
