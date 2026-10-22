import { test } from 'vitest'
import assert from 'node:assert/strict'
import { loadFacets, persistFacets } from './facet-catalog.ts'

test('persistFacets adopts catalog only after POST succeeds', async () => {
  let release!: (value: Response) => void
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Promise<Response>((resolve) => {
      release = resolve
    })) as typeof fetch
  try {
    const pending = persistFacets([{ id: 'wait-post', label: '等待写入', fields: [] }])
    assert.equal(loadFacets().some((item) => item.id === 'wait-post'), false)
    release(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    await pending
    assert.equal(loadFacets().some((item) => item.id === 'wait-post'), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('persistFacets keeps the previous catalog when POST fails', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch
  try {
    await assert.rejects(() => persistFacets([{ id: 'no-post', label: '失败', fields: [] }]))
    assert.equal(loadFacets().some((item) => item.id === 'no-post'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
