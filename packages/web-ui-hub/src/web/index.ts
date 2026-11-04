import type { Context, Fiber, Plugin } from 'cordis'
import { clientLog, clientLogErrorText } from '@biu/web-event-log/log'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import * as BiuUi from '@biu/biu-ui'
import * as ReUI from '@biu/reui'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { uiPackageLoaders } from 'virtual:cordis-ui-loaders'

export const name = 'ui-hub'
export const inject = ['slots', 'snapshot']

/** 商店包的 web 入口是已编译 ESM 的 URL，不在 Vite 虚拟表里。 */
export function isRuntimeWebModule(web: string) {
  return web.startsWith('/') || /^https?:\/\//.test(web)
}

/** snapshot 已经带 ?v=codeVersion。没有版本号才补时间戳，避免每次刷新都重新拉 8MB 的 web.js。 */
export function runtimeWebModuleHref(web: string, origin?: string) {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1')
  const href = web.startsWith('/') ? new URL(web, base).href : web
  try {
    if (new URL(href).searchParams.has('v')) return href
  } catch {
    if (/[?&]v=/.test(href)) return href
  }
  return href.includes('?') ? `${href}&v=${Date.now()}` : `${href}?v=${Date.now()}`
}

export function isStoreWebPlugin(plugin: { packageName?: string; web?: string }) {
  return Boolean(plugin.packageName?.startsWith('store:') && plugin.web && isRuntimeWebModule(plugin.web))
}

/** 页面记录才需要商店页块的 web.js。任务表、会话、MCP 刷新不必先拉 excalidraw。 */
export function pageRouteNeedsStoreWeb(pathname: string) {
  return /\/pages\/record\//.test(pathname)
}

/** 只挂当前页面请求启用的商店包，不把 snapshot 里其余 web.js 一起拉下来。 */
export function storeWebPluginRequested(
  row: { id: string; packageName?: string },
  requested: Iterable<string>,
) {
  const want = new Set([...requested].map((id) => id.trim()).filter(Boolean))
  if (want.has(row.id)) return true
  const pack = String(row.packageName ?? '')
  if (pack.startsWith('store:') && want.has(pack.slice('store:'.length))) return true
  return false
}

/** 动态 import 得到的是模块命名空间；不要只用 default，否则会丢掉 inject / name。 */
export function runtimeWebPlugin(loaded: unknown): Plugin | undefined {
  if (loaded == null) return undefined
  if (typeof loaded === 'function') return loaded as Plugin
  if (typeof loaded !== 'object') return undefined
  const mod = loaded as { default?: unknown; apply?: unknown; inject?: unknown; name?: unknown }
  const def = mod.default
  const hasMeta = typeof mod.apply === 'function' || Array.isArray(mod.inject) || typeof mod.name === 'string'
  if (typeof def === 'function' && hasMeta) {
    return {
      ...(typeof mod.name === 'string' ? { name: mod.name } : {}),
      ...(Array.isArray(mod.inject) ? { inject: mod.inject as string[] } : {}),
      apply: (typeof mod.apply === 'function' ? mod.apply : def) as Plugin['apply']
    } as Plugin
  }
  if (def && typeof def === 'object') return def as Plugin
  if (typeof def === 'function') return def as Plugin
  return loaded as Plugin
}

/** 会话输入框在这两块挂上之后就能画。其余界面（文件库、编辑器）再加载。 */
export const SESSION_UI_FIRST = ['core-pick', 'core-chat'] as const

export function orderUiPlugins<T extends { id: string }>(rows: T[]): T[] {
  const rank = (id: string) => {
    const first = SESSION_UI_FIRST.indexOf(id as (typeof SESSION_UI_FIRST)[number])
    if (first >= 0) return first
    if (id === 'core-file-system') return SESSION_UI_FIRST.length
    return SESSION_UI_FIRST.length + 1
  }
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row.id) - rank(b.row.id) || a.index - b.index)
    .map((item) => item.row)
}

export function apply(ctx: Context) {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as typeof globalThis & {
      React?: typeof React
      ReactDOM?: typeof ReactDOM & { createRoot: typeof createRoot; hydrateRoot: typeof hydrateRoot }
      ReactJSXRuntime?: typeof ReactJSXRuntime
      BiuUi?: typeof BiuUi
      ReUI?: typeof ReUI
    }
    g.React = React
    g.ReactDOM = { ...ReactDOM, createRoot, hydrateRoot, flushSync }
    g.ReactJSXRuntime = ReactJSXRuntime
    g.BiuUi = BiuUi
    g.ReUI = ReUI
    ReUI.installReUIStyles()
  }

  const forks = new Map<string, Fiber>()
  // 记录每个 fork 挂载时用的 web 入口 URL。
  // 打包后 URL 会带上新的版本号（?v=mtime），据此判断是否需要重新加载，
  // 否则插件的 fork 一旦建立就永远不会更新，改代码看不到效果。
  const forkWebs = new Map<string, string>()
  let pending = false
  let running = false
  const storeWebRequested = new Set<string>()

  function shouldLoadStoreWeb() {
    return storeWebRequested.size > 0
  }

  async function resolvePlugin(_id: string, web?: string): Promise<Plugin | undefined> {
    if (!web) return undefined
    const loader = uiPackageLoaders[web]
    if (loader) return loader()
    if (isRuntimeWebModule(web)) {
      try {
        return await import(/* @vite-ignore */ runtimeWebModuleHref(web))
      } catch (error) {
        clientLog('error', 'ui-hub', `${_id} web 加载失败: ${clientLogErrorText(error)}`, web)
        return undefined
      }
    }
    return undefined
  }

  async function mountLoaded(row: { id: string; web?: string }, loaded: Plugin | undefined) {
    if (forks.has(row.id) || !loaded) return
    const plugin = runtimeWebPlugin(loaded)
    if (!plugin) {
      clientLog('error', 'ui-hub', `${row.id} 的 web.js 没有 apply`)
      return
    }
    const fiber = ctx.plugin(plugin)
    forks.set(row.id, fiber)
    forkWebs.set(row.id, row.web ?? '')
    try {
      await fiber
    } catch (error) {
      clientLog('error', 'ui-hub', `${row.id} 挂载失败: ${clientLogErrorText(error)}`)
      forks.delete(row.id)
      forkWebs.delete(row.id)
      await fiber.dispose().catch(() => undefined)
      return
    }
    if (row.web && isRuntimeWebModule(row.web)) clientLog('info', 'ui-hub', `${row.id} 的 web.js 已挂上`)
  }

  async function mountRow(row: { id: string; web?: string }) {
    if (forks.has(row.id)) return
    if (row.web && isRuntimeWebModule(row.web)) clientLog('info', 'ui-hub', `加载 ${row.id} 的 web.js`, row.web)
    await mountLoaded(row, await resolvePlugin(row.id, row.web))
  }

  async function sync() {
    if (running) {
      pending = true
      return
    }
    running = true
    try {
      const rows = ctx.snapshot.get().plugins
      const enabledRows = rows
        .filter((plugin) => {
          if (!plugin.web) return false
          if (plugin.enabled) return true
          return plugin.state === 'pending' || plugin.state === 'loading' || plugin.state === 'active'
        })
      const orderedRows = orderUiPlugins(enabledRows)
      const enabledIds = new Set(enabledRows.map((plugin) => plugin.id))

      const webOf = new Map(enabledRows.map((plugin) => [plugin.id, plugin.web]))

      for (const [id, fiber] of [...forks.entries()]) {
        const stillEnabled = enabledIds.has(id)
        // web 入口变了（例如重打包后带上新的 ?v= 版本号）也要重挂。
        const sameWeb = forkWebs.get(id) === webOf.get(id)
        if (stillEnabled && sameWeb) continue
        await fiber.dispose()
        forks.delete(id)
        forkWebs.delete(id)
      }

      const coreRows = orderedRows.filter((row) => !isStoreWebPlugin(row))
      const storeRows = orderedRows.filter((row) => isStoreWebPlugin(row))

      let yieldForComposer = false
      for (const row of coreRows) {
        if (yieldForComposer && !SESSION_UI_FIRST.includes(row.id as (typeof SESSION_UI_FIRST)[number])) {
          yieldForComposer = false
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
        await mountRow(row)
        if (SESSION_UI_FIRST.includes(row.id as (typeof SESSION_UI_FIRST)[number])) yieldForComposer = true
      }

      if (shouldLoadStoreWeb()) {
        const pendingStore = storeRows.filter((row) => !forks.has(row.id) && storeWebPluginRequested(row, storeWebRequested))
        // import() 必须逐个来：缓存命中时 Promise.all 会把多份 web.js 的求值叠进同一个 long task。
        for (const [index, row] of pendingStore.entries()) {
          await mountRow(row)
          if (index < pendingStore.length - 1) await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }

      const fsUi = rows.some(
        (plugin) =>
          plugin.id === 'core-file-system' &&
          plugin.web &&
          (plugin.enabled || plugin.state === 'pending' || plugin.state === 'loading' || plugin.state === 'active'),
      )
      if (!fsUi) {
        const appModules = ctx.get('appModules') as { markNavReady?: () => void } | undefined
        appModules?.markNavReady?.()
      }
    } finally {
      running = false
      if (pending) {
        pending = false
        await sync()
      }
    }
  }

  const mountKey = () =>
    ctx.snapshot
      .get()
      .plugins.filter((plugin) => plugin.web)
      .map((plugin) => `${plugin.id}\0${plugin.web}\0${plugin.enabled}\0${plugin.state}`)
      .sort()
      .join('|')
  let lastMountKey = ''
  ctx.snapshot.subscribe(() => {
    const key = mountKey()
    if (key === lastMountKey) return
    lastMountKey = key
    void sync()
  })
  lastMountKey = mountKey()
  if (typeof window !== 'undefined') {
    window.addEventListener('biu:enable-page-block-plugin', (event) => {
      const detail = (event as CustomEvent<{ plugin?: unknown; force?: unknown }>).detail
      const plugin = String(detail?.plugin ?? '').trim()
      if (plugin) storeWebRequested.add(plugin)
      void sync()
    })
  }
  return sync()
}
