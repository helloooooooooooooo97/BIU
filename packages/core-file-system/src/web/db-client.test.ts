import { test } from 'vitest'
import assert from 'node:assert/strict'
import { apiJson } from '@biu/biu-ui/api-client'
import { invalidateListReads, listCollection, readJson } from './db-client.ts'

test('listCollection shares identical in-flight requests', async () => {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ items: [{ id: 'n1' }], total: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([
      listCollection({ path: '/notes', limit: 20 }),
      listCollection({ path: '/notes', limit: 20 }),
    ])
    assert.equal(calls, 1)
    assert.equal(a.total, 1)
    assert.equal(b.items[0]?.id, 'n1')
  } finally {
    globalThis.fetch = original
  }
})

test('listCollection keeps the last page briefly so a remount does not refetch', async () => {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(JSON.stringify({ items: [{ id: 'n1' }], total: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    await listCollection({ path: '/notes', limit: 20, query: 'hold' })
    await listCollection({ path: '/notes', limit: 20, query: 'hold' })
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = original
  }
})

test('listCollection shares in-flight fresh requests so grouped reloads do not fan out', async () => {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ items: [{ id: 'n1' }], total: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([
      listCollection({ path: '/pages', limit: 50, filters: { $scope: 'personal' }, fresh: true }),
      listCollection({ path: '/pages', limit: 50, filters: { $scope: 'personal' }, fresh: true }),
    ])
    assert.equal(calls, 1)
    assert.equal(a.items[0]?.id, 'n1')
    assert.equal(b.total, 1)
  } finally {
    globalThis.fetch = original
  }
})

test('listCollection fresh skips the brief hold so a write can refetch', async () => {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(JSON.stringify({ items: [{ id: `n${calls}` }], total: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const first = await listCollection({ path: '/notes', limit: 20, query: 'fresh-hold' })
    const second = await listCollection({ path: '/notes', limit: 20, query: 'fresh-hold', fresh: true })
    assert.equal(calls, 2)
    assert.equal(first.items[0]?.id, 'n1')
    assert.equal(second.items[0]?.id, 'n2')
  } finally {
    globalThis.fetch = original
  }
})

test('invalidateListReads drops the brief list hold so a write can refetch', async () => {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(JSON.stringify({ items: [{ id: `n${calls}` }], total: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const first = await listCollection({ path: '/notes', limit: 20, query: 'after-write' })
    invalidateListReads()
    const second = await listCollection({ path: '/notes', limit: 20, query: 'after-write' })
    assert.equal(calls, 2)
    assert.equal(first.items[0]?.id, 'n1')
    assert.equal(second.items[0]?.id, 'n2')
  } finally {
    globalThis.fetch = original
  }
})

test('readJson shares identical in-flight GET requests', async () => {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ schema: { fields: {} } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([
      readJson<{ schema: { fields: object } }>('/api/db/stat?path=/tasks'),
      readJson<{ schema: { fields: object } }>('/api/db/stat?path=/tasks'),
    ])
    assert.equal(calls, 1)
    assert.ok(a.schema)
    assert.ok(b.schema)
  } finally {
    globalThis.fetch = original
  }
})

test('view reads recover once from empty or truncated JSON without sharing a failed response', async () => {
  const original = globalThis.fetch
  const options: Array<RequestInit | undefined> = []
  globalThis.fetch = (async (_path, init) => {
    options.push(init)
    return new Response(options.length === 1 ? '' : JSON.stringify({ items: [{ id: 'recovered' }], total: 1 }), { status: 200 })
  }) as typeof fetch
  try {
    invalidateListReads()
    const [a, b] = await Promise.all([
      listCollection({ path: '/pages', limit: 20, query: 'empty-response-retry' }),
      listCollection({ path: '/pages', limit: 20, query: 'empty-response-retry' }),
    ])
    assert.equal(options.length, 2)
    assert.equal(options[1]?.cache, 'no-store')
    assert.equal(a.items[0].id, 'recovered')
    assert.equal(b.items[0].id, 'recovered')
  } finally { globalThis.fetch = original; invalidateListReads() }
})

test('persistent malformed JSON reports the endpoint and status after one read retry', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => { calls++; return new Response('{"items":', { status: 200 }) }) as typeof fetch
  try {
    await assert.rejects(readJson('/api/db/list?path=/pages', undefined, { fresh: true }), error => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /\/api\/db\/list/)
      assert.match(error.message, /HTTP 200/)
      assert.equal((error as { body?: { code?: string } }).body?.code, 'INVALID_JSON_RESPONSE')
      return true
    })
    assert.equal(calls, 2)
  } finally { globalThis.fetch = original }
})

test('invalid write responses and HTTP errors are never retried automatically', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => { calls++; return new Response('', { status: 200 }) }) as typeof fetch
  try {
    await assert.rejects(readJson('/api/db/update', { method: 'POST', body: '{}' }))
    assert.equal(calls, 1)
    globalThis.fetch = (async () => { calls++; return new Response('upstream unavailable', { status: 503 }) }) as typeof fetch
    await assert.rejects(readJson('/api/db/list', undefined, { fresh: true }), error => {
      assert.equal((error as { status?: number }).status, 503)
      return true
    })
    assert.equal(calls, 2)
  } finally { globalThis.fetch = original }
})

test('431 responses identify an oversized request instead of a JSON parsing failure', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => { calls++; return new Response('', { status: 431 }) }) as typeof fetch
  try {
    await assert.rejects(readJson('/api/db/list?path=/pages', undefined, { fresh: true }), error => {
      assert.match((error as Error).message, /请求头或查询地址过大/)
      assert.equal((error as { body?: { code?: string } }).body?.code, 'REQUEST_HEADERS_TOO_LARGE')
      return true
    })
    assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})

test('invalidateListReads also clears apiJson brief GET hold cache', async () => {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(JSON.stringify({ v: calls }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    invalidateListReads()
    const first = await apiJson<{ v: number }>('/api/db/stat?path=/sync-hold-test')
    invalidateListReads()
    const second = await apiJson<{ v: number }>('/api/db/stat?path=/sync-hold-test')
    assert.equal(calls, 2)
    assert.equal(first.v, 1)
    assert.equal(second.v, 2)
  } finally {
    invalidateListReads()
    globalThis.fetch = original
  }
})
