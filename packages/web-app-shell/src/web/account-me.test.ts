import { test } from 'vitest'
import assert from 'node:assert/strict'
import { getAccountMe, resetAccountMeGet } from './shell-chrome.tsx'

test('getAccountMe shares one in-flight GET', async () => {
  resetAccountMeGet()
  let hits = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    hits += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ email: 'ada@example.com', name: 'Ada', online: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([getAccountMe('tok'), getAccountMe('tok')])
    assert.equal(hits, 1)
    assert.equal(a.email, 'ada@example.com')
    assert.equal(b.name, 'Ada')
  } finally {
    globalThis.fetch = originalFetch
    resetAccountMeGet()
  }
})
