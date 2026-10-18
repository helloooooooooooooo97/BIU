import { test } from 'vitest'
import assert from 'node:assert/strict'
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
