import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  getSessionTurns,
  getSessionsList,
  resetSessionsListGet,
  seedHomeSessionFetches,
  SESSION_LOAD_TURNS,
} from './sessions-list.ts'

test('getSessionsList shares one in-flight GET', async () => {
  resetSessionsListGet()
  let hits = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    hits += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ sessions: [{ id: 's1', title: 'a', eventCount: 1, updatedAt: 1 }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([getSessionsList(), getSessionsList()])
    assert.equal(hits, 1)
    assert.equal(a?.[0]?.id, 's1')
    assert.equal(b?.[0]?.id, 's1')
  } finally {
    globalThis.fetch = originalFetch
    resetSessionsListGet()
  }
})

test('getSessionTurns shares one in-flight GET', async () => {
  resetSessionsListGet()
  let hits = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    hits += 1
    assert.match(String(input), new RegExp(`turns=${SESSION_LOAD_TURNS}`))
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ id: 's1', events: [], hasMore: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([getSessionTurns('s1'), getSessionTurns('s1')])
    assert.equal(hits, 1)
    assert.equal(a?.status, 200)
    assert.equal((b?.body as { id?: string }).id, 's1')
  } finally {
    globalThis.fetch = originalFetch
    resetSessionsListGet()
  }
})

test('seedHomeSessionFetches pulls the list then the latest turns', async () => {
  resetSessionsListGet()
  localStorage.setItem('biu.account.token', 'tok')
  const calls: string[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/api/agents')) {
      return new Response(
        JSON.stringify({
          sessions: [
            { id: 'old', updatedAt: 1 },
            { id: 'new', updatedAt: 9 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify({ id: 'new', events: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    seedHomeSessionFetches()
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(calls.filter((url) => url.endsWith('/api/agents')).length, 1)
    assert.equal(calls.some((url) => url.includes('/api/agents/new?turns=100')), true)
    assert.equal(calls.some((url) => url.includes('/api/agents/old?turns=')), false)
  } finally {
    globalThis.fetch = originalFetch
    resetSessionsListGet()
    localStorage.removeItem('biu.account.token')
  }
})
