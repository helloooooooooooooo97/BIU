import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
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
