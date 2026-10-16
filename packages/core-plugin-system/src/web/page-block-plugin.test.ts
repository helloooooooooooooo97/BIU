/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { clientLogSnapshot, resetClientLogs } from '@biu/web-event-log/log'
import { requestEnablePageBlockPlugin, setPageBlockPluginPhase } from '../../../core-editor/src/web/page-block-meta.ts'
import {
  ENABLE_PAGE_BLOCK_PLUGIN,
  listenEnablePageBlockPlugin,
  pageBlockPluginFromEvent,
  pluginRecordHref,
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
  assert.match(listen, /reportPhase\(plugin, 'failed'\)/)
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
  const fetchMock = stubFetch(() => ({ status: 404, body: { error: 'not found' } }))
  try {
    await assert.rejects(() => startStorePlugin('page-missing'), /unknown plugin/)
  } finally {
    fetchMock.restore()
  }
  assert.equal(fetchMock.calls.some((call) => call.method === 'POST'), false)
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
