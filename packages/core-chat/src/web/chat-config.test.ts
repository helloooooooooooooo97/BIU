import { test } from 'vitest'
import assert from 'node:assert/strict'
import { resetWorkspaceClientCaches } from '@biu/biu-ui/cache'
import { getChatConfig, resetChatConfigGet, seedChatConfig } from './chat-config.ts'

test('getChatConfig shares one in-flight GET', async () => {
  resetChatConfigGet()
  let hits = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    hits += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ configured: true, model: 'kimi' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([getChatConfig(), getChatConfig()])
    assert.equal(hits, 1)
    assert.equal(a?.model, 'kimi')
    assert.equal(b?.configured, true)
  } finally {
    globalThis.fetch = originalFetch
    resetChatConfigGet()
  }
})

test('seedChatConfig lets a later GET reuse the posted payload', async () => {
  resetChatConfigGet()
  let hits = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    hits += 1
    return new Response(JSON.stringify({ model: 'from-get' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    seedChatConfig({ model: 'from-post' })
    const data = await getChatConfig()
    assert.equal(hits, 0)
    assert.equal(data?.model, 'from-post')
    const fresh = await getChatConfig({ refresh: true })
    assert.equal(hits, 1)
    assert.equal(fresh?.model, 'from-get')
  } finally {
    globalThis.fetch = originalFetch
    resetChatConfigGet()
  }
})

test('resetWorkspaceClientCaches drops chat-config hold cache and non-ok responses are not held', async () => {
  resetChatConfigGet()
  let hits = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    hits += 1
    if (hits === 1) return new Response('err', { status: 500 })
    return new Response(JSON.stringify({ model: `m-${hits}` }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    assert.equal(await getChatConfig(), null)
    const ok = await getChatConfig()
    assert.equal(ok?.model, 'm-2')
    assert.equal(hits, 2)

    const held = await getChatConfig()
    assert.equal(held?.model, 'm-2')
    assert.equal(hits, 2)

    resetWorkspaceClientCaches()
    const afterReset = await getChatConfig()
    assert.equal(afterReset?.model, 'm-3')
    assert.equal(hits, 3)
  } finally {
    globalThis.fetch = originalFetch
    resetChatConfigGet()
  }
})
