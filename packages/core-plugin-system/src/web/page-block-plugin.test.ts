/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { clientLogSnapshot, resetClientLogs } from '@biu/web-event-log/log'
import { requestEnablePageBlockPlugin, setPageBlockPluginPhase } from '../../../core-editor/src/web/page-block-meta.ts'
import { filterSlashItems } from '../../../core-editor/src/web/slash.ts'
import { resetSlashCatalog, setListedPluginIds } from '../../../core-editor/src/web/slash-memory.ts'
import {
  ENABLE_PAGE_BLOCK_PLUGIN,
  listenEnablePageBlockPlugin,
  pageBlockPluginFromEvent,
  pluginRecordHref,
  refreshInstalledPageBlocks,
  runningWindowPluginNeedsWeb,
  startStorePlugin,
} from './page-block-plugin.ts'

test('page block enable href is the plugin record, not guessed from kind', () => {
  assert.equal(pluginRecordHref('page-excalidraw'), '/database/plugins/record/page-excalidraw')
  assert.equal(
    pageBlockPluginFromEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN, { detail: { plugin: 'page-excalidraw', kind: 'excalidraw' } })),
    'page-excalidraw',
  )
})

test('enabling a page block starts the plugin and stays on the page', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-block-plugin.ts'), 'utf8')
  const listen = src.slice(src.indexOf('export function listenEnablePageBlockPlugin'))
  assert.match(listen, /startStorePlugin\(plugin\)/)
  assert.match(listen, /reportPhase\(plugin, 'ready'\)/)
  assert.match(listen, /isMissingPlugin\(error\) \? 'missing' : 'failed'/)
  assert.match(listen, /pendingEnableIds/)
  assert.doesNotMatch(listen, /pushState/)
  assert.doesNotMatch(listen, /pluginRecordHref/)
})

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; method: string; action?: string }> = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    let action: string | undefined
    if (typeof init?.body === 'string') {
      action = (JSON.parse(init.body) as { action?: string }).action
    }
    calls.push({ url, method, action })
    const result = handler(url, init)
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

test('already running plugin is left alone so start does not 400', async () => {
  resetClientLogs()
  const fetchMock = stubFetch(() => ({ status: 200, body: { value: { installed: true, running: true } } }))
  try {
    await startStorePlugin('page-running')
  } finally {
    fetchMock.restore()
  }
  assert.match(clientLogSnapshot().map((item) => item.message).join('\n'), /page-running 已在运行，跳过 start/)
  assert.deepEqual(
    fetchMock.calls.map((call) => call.method),
    ['GET'],
  )
  assert.equal(fetchMock.calls.some((call) => call.action), false)
})

test('installed plugin that is not running is started', async () => {
  const fetchMock = stubFetch((url) => {
    if (url.includes('/api/db/read')) return { status: 200, body: { value: { installed: true } } }
    return { status: 200, body: { ok: true } }
  })
  try {
    await startStorePlugin('page-installed')
  } finally {
    fetchMock.restore()
  }
  assert.deepEqual(
    fetchMock.calls.map((call) => call.action).filter(Boolean),
    ['start'],
  )
})

test('sandbox plugin is packed before start', async () => {
  const fetchMock = stubFetch((url) => {
    if (url.includes('/api/db/read')) return { status: 200, body: { value: { sandbox: true } } }
    return { status: 200, body: { ok: true } }
  })
  try {
    await startStorePlugin('page-sandbox')
  } finally {
    fetchMock.restore()
  }
  assert.deepEqual(
    fetchMock.calls.map((call) => call.action).filter(Boolean),
    ['pack', 'start'],
  )
})

test('missing plugin does not post an action', async () => {
  resetClientLogs()
  const fetchMock = stubFetch(() => ({ status: 404, body: { error: 'not found' } }))
  try {
    await assert.rejects(() => startStorePlugin('page-missing'), /unknown plugin/)
  } finally {
    fetchMock.restore()
  }
  assert.equal(fetchMock.calls.some((call) => call.method === 'POST'), false)
  assert.doesNotMatch(clientLogSnapshot().map((item) => item.message).join('\n'), /启用失败/)
})

test('listed-unknown plugin skips the 404 read', async () => {
  resetClientLogs()
  resetSlashCatalog()
  setListedPluginIds(['page-toc'])
  const fetchMock = stubFetch(() => ({ status: 200, body: { value: { installed: true } } }))
  try {
    await assert.rejects(() => startStorePlugin('page-geo-calc'), /unknown plugin/)
  } finally {
    fetchMock.restore()
    resetSlashCatalog()
  }
  assert.equal(fetchMock.calls.length, 0)
  assert.doesNotMatch(clientLogSnapshot().map((item) => item.message).join('\n'), /启用失败/)
})

test('unknown plugin reports missing without a loading flash', async () => {
  setPageBlockPluginPhase('page-geo', 'idle')
  const phases: string[] = []
  const onPhase = (event: Event) => {
    const detail = (event as CustomEvent<{ plugin?: string; phase?: string }>).detail
    if (detail?.plugin === 'page-geo' && detail.phase) phases.push(String(detail.phase))
  }
  window.addEventListener('biu:page-block-plugin-phase', onPhase)
  const fetchMock = stubFetch(() => ({ status: 404, body: { error: 'not found' } }))
  const stop = listenEnablePageBlockPlugin()
  requestEnablePageBlockPlugin('page-geo', 'geo', { force: true })
  try {
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(phases, ['missing'])
    assert.equal(fetchMock.calls.some((call) => call.method === 'POST'), false)
  } finally {
    stop()
    fetchMock.restore()
    window.removeEventListener('biu:page-block-plugin-phase', onPhase)
    setPageBlockPluginPhase('page-geo', 'idle')
  }
})

test('refreshing installed page blocks lists headless web plugins and does not start them', async () => {
  resetSlashCatalog()
  const fetchMock = stubFetch((url) => {
    if (url.includes('/api/db/list')) {
      return {
        status: 200,
        body: {
          items: [
            { id: 'page-toc', title: '目录', installed: true, hasWeb: true, headless: true, tags: ['page'] },
            { id: 'headless-tool', title: '工具', installed: true, hasWeb: true, headless: true, tags: ['dev'] },
            { id: 'arena-rogue', title: 'Arena', installed: true, hasWeb: true, tags: ['game'] },
            { id: 'sandbox-only', sandbox: true, hasWeb: true, headless: true, tags: ['page'] },
          ],
          total: 4,
        },
      }
    }
    return { status: 500, body: { error: 'unexpected' } }
  })
  try {
    await refreshInstalledPageBlocks()
  } finally {
    fetchMock.restore()
  }
  assert.equal(fetchMock.calls.some((call) => call.method === 'POST'), false)
  assert.equal(fetchMock.calls.every((call) => call.url.includes('/api/db/list')), true)
  assert.equal(filterSlashItems('').some((item) => item.id === 'page-toc'), true)
  assert.equal(filterSlashItems('').some((item) => item.id === 'arena-rogue'), false)
  assert.equal(filterSlashItems('').some((item) => item.id === 'headless-tool'), false)
  resetSlashCatalog()
})

test('running window plugins ask ui-hub for web.js, page blocks do not', () => {
  assert.equal(runningWindowPluginNeedsWeb({
    id: 'arena-rogue',
    running: true,
    hasWeb: true,
    tags: ['game'],
  }), true)
  assert.equal(runningWindowPluginNeedsWeb({
    id: 'page-excalidraw',
    running: true,
    hasWeb: true,
    tags: ['page', 'excalidraw'],
  }), false)
  assert.equal(runningWindowPluginNeedsWeb({
    id: 'page-toc',
    running: true,
    hasWeb: true,
    headless: true,
    tags: ['page'],
  }), false)
  assert.equal(runningWindowPluginNeedsWeb({
    id: 'arena-rogue',
    running: false,
    hasWeb: true,
    tags: ['game'],
  }), false)
  const src = readFileSync(resolve(import.meta.dirname, './page-block-plugin.ts'), 'utf8')
  const web = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const browser = readFileSync(resolve(process.cwd(), 'packages/core-file-system/src/web/browser.tsx'), 'utf8')
  assert.match(src, /export function watchRunningWindowPlugins/)
  assert.match(src, /ENABLE_PAGE_BLOCK_PLUGIN/)
  assert.match(src, /fsdb:change/)
  assert.doesNotMatch(src, /setInterval\(tick/)
  assert.match(web, /watchRunningWindowPlugins\(\)/)
  assert.match(browser, /action\.id === 'start'/)
  assert.match(browser, /biu:enable-page-block-plugin/)
})

test('installed page-block watcher never starts plugins', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-block-plugin.ts'), 'utf8')
  const watch = src.slice(src.indexOf('export function watchInstalledPageBlocks'))
  assert.match(watch, /refreshInstalledPageBlocks/)
  assert.match(watch, /fsdb:change/)
  assert.doesNotMatch(watch, /startStorePlugin/)
})

test('listener catches page blocks that asked to start before it mounted', async () => {
  setPageBlockPluginPhase('page-late', 'idle')
  const fetchMock = stubFetch((url) => {
    if (url.includes('/api/db/read')) return { status: 200, body: { value: { installed: true, running: true } } }
    return { status: 200, body: { ok: true } }
  })
  requestEnablePageBlockPlugin('page-late', 'toc')
  const stop = listenEnablePageBlockPlugin()
  try {
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(fetchMock.calls.some((call) => decodeURIComponent(call.url).includes('/plugins/page-late')), true)
    assert.equal(fetchMock.calls.some((call) => call.action === 'start'), false)
  } finally {
    stop()
    fetchMock.restore()
    setPageBlockPluginPhase('page-late', 'idle')
  }
})
