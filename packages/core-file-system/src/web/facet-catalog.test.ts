import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createFacet, facetLabel, loadFacets, persistFacets } from './facet-catalog.ts'

test('persistFacets adopts catalog only after POST succeeds', async () => {
  let release!: (value: Response) => void
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method !== 'POST') {
      return new Response(JSON.stringify({ facets: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Promise<Response>((resolve) => {
      release = resolve
    })
  }) as typeof fetch
  try {
    const pending = persistFacets([{ id: 'wait-post', label: '等待写入', fields: [] }])
    assert.equal(loadFacets().some((item) => item.id === 'wait-post'), false)
    for (let i = 0; i < 20 && typeof release !== 'function'; i++) await Promise.resolve()
    release(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    await pending
    assert.equal(loadFacets().some((item) => item.id === 'wait-post'), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('persistFacets keeps the previous catalog when POST fails', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_url, init) => {
    if (String(init?.method ?? 'GET').toUpperCase() !== 'POST') {
      return new Response(JSON.stringify({ facets: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response('nope', { status: 500 })
  }) as typeof fetch
  try {
    await assert.rejects(() => persistFacets([{ id: 'no-post', label: '失败', fields: [] }]))
    assert.equal(loadFacets().some((item) => item.id === 'no-post'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('persistFacets merges the incoming pack into the server catalog', async () => {
  const originalFetch = globalThis.fetch
  let posted: unknown
  globalThis.fetch = (async (_url, init) => {
    if (String(init?.method ?? 'GET').toUpperCase() !== 'POST') {
      return new Response(
        JSON.stringify({ facets: [{ id: 'keep', label: '保留', fields: [] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    posted = JSON.parse(String(init?.body ?? '{}'))
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    await persistFacets([{ id: 'risk', label: '风险', fields: [] }])
    const facets = (posted as { facets: Array<{ id: string; label: string }> }).facets
    assert.equal(facets.some((item) => item.id === 'keep' && item.label === '保留'), true)
    assert.equal(facets.some((item) => item.id === 'risk' && item.label === '风险'), true)
    assert.equal(loadFacets().some((item) => item.id === 'keep' && item.label === '保留'), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('createFacet keeps the typed title as label and adopts the returned id', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        items: [{ value: { id: 'facet-3', title: '风险', fields: [] } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch
  try {
    const pack = await createFacet('风险')
    assert.equal(pack.id, 'facet-3')
    assert.equal(pack.label, '风险')
    assert.equal(facetLabel('facet-3'), '风险')
    assert.equal(loadFacets().some((item) => item.id === 'facet-3' && item.label === '风险'), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
