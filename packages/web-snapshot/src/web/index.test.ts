import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { resetWorkspaceEndpoint, setWorkspaceEndpoint } from '@biu/biu-ui/workspace-transport'
import * as snapshot from './index.ts'

test('未登录不请求 snapshot，登录后再拉', async () => {
  localStorage.removeItem('biu.account.token')
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input))
    return {
      ok: true,
      status: 200,
      json: async () => ({ plugins: [], pages: [], routes: [], events: [], services: [] }),
    } as Response
  }) as typeof fetch
  const ctx = new Context()
  await ctx.plugin(snapshot)
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(calls.some((url) => url.includes('/api/snapshot')), false)
  localStorage.setItem('biu.account.token', 'tok')
  window.dispatchEvent(new Event('biu:account-token'))
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(calls.some((url) => url.includes('/api/snapshot')), true)
  localStorage.removeItem('biu.account.token')
})

test('snapshot fetch carries the workspace even before the shell wraps fetch', async () => {
  const src = (await import('node:fs')).readFileSync(
    (await import('node:path')).resolve(import.meta.dirname, './index.ts'),
    'utf8',
  )
  assert.match(src, /function snapshotRequestHeaders/)
  assert.match(src, /x-biu-workspace-id/)
  assert.match(src, /(?:apiFetch|fetch)\('\/api\/snapshot', \{ headers: snapshotRequestHeaders\(\) \}\)/)
  assert.match(src, /bootGotSnapshot/)
  assert.match(src, /if \(this\.bootGotSnapshot\)/)
  assert.match(src, /ws\.onopen/)
})

test('switching workspace endpoint resets snapshot seq so lower-seq target host snapshots are accepted', async () => {
  resetWorkspaceEndpoint()
  localStorage.setItem('biu.account.token', 'tok')
  const originalFetch = globalThis.fetch
  let mode: 'cloud' | 'local' = 'cloud'
  setWorkspaceEndpoint({
    mode: 'cloud',
    origin: 'https://cloud.example.com',
    workspaceId: 'ws-cloud',
    token: 'tok-cloud',
  })
  globalThis.fetch = (async () => {
    const body =
      mode === 'cloud'
        ? { seq: 500, plugins: [{ id: 'cloud-plugin' }], pages: [], routes: [], events: [], services: [] }
        : { seq: 5, plugins: [{ id: 'local-plugin' }], pages: [], routes: [], events: [], services: [] }
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response
  }) as typeof fetch
  const ctx = new Context()
  const fork = ctx.plugin(snapshot)
  try {
    await fork
    await new Promise((resolve) => setTimeout(resolve, 40))
    const svc = ctx.get('snapshot') as snapshot.SnapshotService
    assert.equal(svc.get().seq, 500)
    assert.equal(svc.get().plugins[0]?.id, 'cloud-plugin')

    // Switch to local desktop host whose seq (5) is lower than cloud host's seq (500)
    mode = 'local'
    resetWorkspaceEndpoint()
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(svc.get().seq, 5)
    assert.equal(svc.get().plugins[0]?.id, 'local-plugin')
  } finally {
    await fork.dispose()
    globalThis.fetch = originalFetch
    resetWorkspaceEndpoint()
    localStorage.removeItem('biu.account.token')
  }
})
