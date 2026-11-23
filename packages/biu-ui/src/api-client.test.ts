import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  abortApiScope,
  apiFetch,
  ApiHttpError,
  apiJson,
  invalidateApiInflight,
} from './api-client.ts'

test('apiJson deduplicates concurrent GET requests and throws ApiHttpError on non-2xx', async () => {
  invalidateApiInflight()
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls += 1
    const url = String(input)
    if (url.includes('/fail')) {
      return new Response(JSON.stringify({ error: 'denied', code: 'FORBIDDEN' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: true, calls }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const [a, b] = await Promise.all([
      apiJson<{ ok: boolean; calls: number }>('/api/test-dedupe', undefined, { dedupeHoldMs: 50 }),
      apiJson<{ ok: boolean; calls: number }>('/api/test-dedupe', undefined, { dedupeHoldMs: 50 }),
    ])
    assert.equal(calls, 1)
    assert.deepEqual(a, { ok: true, calls: 1 })
    assert.deepEqual(b, { ok: true, calls: 1 })

    await assert.rejects(
      () => apiJson('/api/fail', undefined, { fresh: true }),
      (err: unknown) => err instanceof ApiHttpError && err.status === 403 && err.body.code === 'FORBIDDEN',
    )
  } finally {
    invalidateApiInflight()
    globalThis.fetch = original
  }
})

test('abortApiScope aborts active scoped apiFetch requests', async () => {
  const original = globalThis.fetch
  let sawAbort = false
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        sawAbort = true
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    })) as typeof fetch

  try {
    const p = apiFetch('/api/slow', { scoped: true })
    const count = abortApiScope('test-reset')
    assert.equal(count, 1)
    await assert.rejects(() => p, /aborted/)
    assert.equal(sawAbort, true)
  } finally {
    globalThis.fetch = original
  }
})
