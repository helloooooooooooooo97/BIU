import { buildAppPath } from '@biu/web-session-view'
import { clientLog, clientLogErrorText } from '@biu/web-event-log/log'

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

type PluginFlags = { installed: boolean; running: boolean; sandbox: boolean }

const starting = new Map<string, Promise<void>>()

function flag(value: unknown) {
  return value === true || value === 'true'
}

async function readPluginFlags(id: string): Promise<PluginFlags | null> {
  const res = await fetch(`/api/db/read?path=${encodeURIComponent(`/plugins/${id}`)}`)
  if (res.status === 404) return null
  const body = (await res.json().catch(() => ({}))) as { error?: string; value?: Record<string, unknown> }
  if (!res.ok) throw new Error(body.error || res.statusText)
  const value = body.value ?? {}
  return { installed: flag(value.installed), running: flag(value.running), sandbox: flag(value.sandbox) }
}

async function postPluginAction(id: string, action: 'pack' | 'start') {
  const res = await fetch('/api/db/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/plugins/${id}`, action }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
}

/**
 * 页面里把插件跑起来。start 的 when 是「已安装且未运行」：
 * 已经在跑再调会 400，纯沙箱要先 pack。先看记录，只发能成功的动作。
 */
export function startStorePlugin(id: string) {
  const pending = starting.get(id)
  if (pending) return pending
  const job = enableStorePlugin(id).finally(() => {
    if (starting.get(id) === job) starting.delete(id)
  })
  starting.set(id, job)
  return job
}

async function enableStorePlugin(id: string) {
  try {
    const row = await readPluginFlags(id)
    if (!row) throw new Error(`unknown plugin: ${id}`)
    clientLog('info', 'page-block', `${id} installed=${row.installed} running=${row.running} sandbox=${row.sandbox}`)
    if (row.running) {
      clientLog('info', 'page-block', `${id} 已在运行，跳过 start。页面要等 web.js 登记块之后才离开源码`)
      return
    }
    if (!row.installed) {
      if (!row.sandbox) throw new Error(`plugin not installed: ${id}`)
      clientLog('info', 'page-block', `${id} 还是沙箱，先 pack 再 start`)
      await postPluginAction(id, 'pack')
    } else {
      clientLog('info', 'page-block', `${id} 已安装但未运行，调用 start`)
    }
    await postPluginAction(id, 'start')
    clientLog('info', 'page-block', `${id} start 已完成`)
  } catch (error) {
    clientLog('error', 'page-block', `${id} 启用失败: ${clientLogErrorText(error)}`)
    throw error
  }
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
