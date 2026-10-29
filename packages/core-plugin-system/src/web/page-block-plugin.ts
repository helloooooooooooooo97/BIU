import { buildAppPath } from '@biu/web-session-view'
import { clientLog, clientLogErrorText } from '@biu/web-event-log/log'
import {
  installedPageBlocksFromRows,
  listedPluginKnown,
  onSlashCatalogOpen,
  setInstalledPageBlocks,
  setListedPluginIds,
} from '../../../core-editor/src/web/slash-memory.ts'

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

function missingPluginError(id: string) {
  const error = new Error(`unknown plugin: ${id}`)
  error.name = 'PageBlockPluginMissing'
  return error
}

function isMissingPlugin(error: unknown) {
  return error instanceof Error && (error.name === 'PageBlockPluginMissing' || error.message.startsWith('unknown plugin:'))
}

async function enableStorePlugin(id: string) {
  try {
    if (listedPluginKnown(id) === false) throw missingPluginError(id)
    const row = await readPluginFlags(id)
    if (!row) throw missingPluginError(id)
    window.dispatchEvent(new CustomEvent(PAGE_BLOCK_PLUGIN_PHASE, { detail: { plugin: id, phase: 'loading' } }))
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
    if (!isMissingPlugin(error)) {
      clientLog('error', 'page-block', `${id} 启用失败: ${clientLogErrorText(error)}`)
    }
    throw error
  }
}

export function pageBlockPluginFromEvent(event: Event) {
  const detail = (event as CustomEvent<{ plugin?: unknown; kind?: unknown }>).detail
  const plugin = typeof detail?.plugin === 'string' ? detail.plugin.trim() : ''
  return plugin
}

function reportPhase(plugin: string, phase: 'ready' | 'failed' | 'missing' | 'loading') {
  window.dispatchEvent(new CustomEvent(PAGE_BLOCK_PLUGIN_PHASE, { detail: { plugin, phase } }))
}

const PENDING_PAGE_BLOCK_ENABLES = '__biuPendingPageBlockEnables'

function pendingEnableIds() {
  const map = (globalThis as typeof globalThis & { [PENDING_PAGE_BLOCK_ENABLES]?: Map<string, string> })[PENDING_PAGE_BLOCK_ENABLES]
  return map ? [...map.keys()] : []
}

export function listenEnablePageBlockPlugin() {
  const run = (plugin: string) => {
    void startStorePlugin(plugin)
      .then(() => reportPhase(plugin, 'ready'))
      .catch((error) => reportPhase(plugin, isMissingPlugin(error) ? 'missing' : 'failed'))
  }
  const onEnable = (event: Event) => {
    const plugin = pageBlockPluginFromEvent(event)
    if (!plugin) return
    run(plugin)
  }
  window.addEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  // 页面块的 layout effect 往往比插件系统的 effect 更早，事件已经丢了。
  for (const plugin of pendingEnableIds()) run(plugin)
  return () => window.removeEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
}

const PAGE_BLOCK_LIST_COLUMNS = 'id,title,blurb,tags,installed,hasWeb,headless'

/** 只刷新斜杠安装态，不 start / 不预热窗口插件。 */
export async function refreshInstalledPageBlocks() {
  try {
    const rows: Record<string, unknown>[] = []
    let offset = 0
    const limit = 200
    for (;;) {
      const params = new URLSearchParams({
        path: '/plugins',
        limit: String(limit),
        offset: String(offset),
        columns: PAGE_BLOCK_LIST_COLUMNS,
      })
      const res = await fetch(`/api/db/list?${params}`)
      const body = (await res.json().catch(() => ({}))) as {
        items?: Record<string, unknown>[]
        total?: number
        error?: string
      }
      if (!res.ok) throw new Error(body.error || res.statusText)
      const items = Array.isArray(body.items) ? body.items : []
      rows.push(...items)
      setListedPluginIds(rows.map((row) => String(row.id ?? '')))
      const total = typeof body.total === 'number' ? body.total : rows.length
      offset += items.length
      if (!items.length || offset >= total) break
    }
    setInstalledPageBlocks(installedPageBlocksFromRows(rows))
  } catch (error) {
    clientLog('error', 'page-block', `斜杠安装态刷新失败: ${clientLogErrorText(error)}`)
  }
}

function pluginTags(row: Record<string, unknown>) {
  return Array.isArray(row.tags) ? row.tags.map(String) : []
}

/** 有窗口的商店插件：运行中才拉 web.js。带 page 标签的仍走页面块按需加载。 */
export function runningWindowPluginNeedsWeb(row: Record<string, unknown>) {
  if (!flag(row.running) || !flag(row.hasWeb) || flag(row.headless)) return false
  return !pluginTags(row).includes('page')
}

const WINDOW_PLUGIN_LIST_COLUMNS = 'id,running,hasWeb,headless,tags'

/** 运行中的窗口插件要让 ui-hub 加载 web.js，否则「运行」后没有 extras 窗口。启动时拉一次，之后跟 fsdb:change（插件 start 会 broadcast）。 */
export function watchRunningWindowPlugins() {
  const requested = new Set<string>()
  let cancelled = false
  const tick = async () => {
    try {
      const params = new URLSearchParams({
        path: '/plugins',
        limit: '200',
        columns: WINDOW_PLUGIN_LIST_COLUMNS,
      })
      const res = await fetch(`/api/db/list?${params}`)
      const body = (await res.json().catch(() => ({}))) as { items?: Record<string, unknown>[] }
      if (cancelled) return
      const live = new Set<string>()
      for (const item of Array.isArray(body.items) ? body.items : []) {
        if (!runningWindowPluginNeedsWeb(item)) continue
        const id = String(item.id ?? '').trim()
        if (!id) continue
        live.add(id)
        if (requested.has(id)) continue
        requested.add(id)
        window.dispatchEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN, { detail: { plugin: id } }))
      }
      for (const id of [...requested]) {
        if (!live.has(id)) requested.delete(id)
      }
    } catch (error) {
      clientLog('error', 'page-block', `窗口插件加载态刷新失败: ${clientLogErrorText(error)}`)
    }
  }
  void tick()
  const onChange = () => {
    void tick()
  }
  window.addEventListener('fsdb:change', onChange)
  return () => {
    cancelled = true
    window.removeEventListener('fsdb:change', onChange)
  }
}

export function watchInstalledPageBlocks() {
  void refreshInstalledPageBlocks()
  const onChange = () => {
    void refreshInstalledPageBlocks()
  }
  window.addEventListener('fsdb:change', onChange)
  const offOpen = onSlashCatalogOpen(() => {
    void refreshInstalledPageBlocks()
  })
  return () => {
    window.removeEventListener('fsdb:change', onChange)
    offOpen()
  }
}
