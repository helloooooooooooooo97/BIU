import { test } from 'vitest'
import assert from 'node:assert/strict'
import { loadFacets, persistFacets } from './facet-catalog.ts'

test('persistFacets posts field remaps with the catalog', async () => {
  const originalFetch = globalThis.fetch
  let body = ''
  globalThis.fetch = (async (_input, init) => {
    body = String(init?.body ?? '')
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    await persistFacets([{ id: 'dp', label: '动态规划', fields: [{ key: '难度', type: 'string' }] }], undefined, {
      dp: { 复杂度: '难度' },
    })
    assert.match(body, /"remaps":\{"dp":\{"复杂度":"难度"\}\}/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

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
