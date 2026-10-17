import { test } from 'vitest'
import assert from 'node:assert/strict'
import { persistPageWidth, getPageWidth, persistPagePrefs, getPagePrefs, hydratePagePrefs, SHARE_PAGE_PREFS, getWorkspaceProfile, resetWorkspaceProfileGet } from './page-width.ts'

test('page width persists full and max', () => {
  persistPageWidth('max')
  assert.equal(getPageWidth(), 'max')
  persistPageWidth('full')
  assert.equal(getPageWidth(), 'full')
  persistPageWidth('max')
  assert.equal(getPageWidth(), 'max')
})

test('share pages default to wide layout with pinned outline and pager', () => {
  assert.deepEqual(SHARE_PAGE_PREFS, {
    wide: true,
    outlineExpand: true,
    outlinePin: true,
    navPin: true,
    bodySize: 'md',
    bodyGap: 'md',
  })
})

test('page prefs store reading chrome and body scale', () => {
  persistPagePrefs({
    wide: true,
    outlineExpand: false,
    outlinePin: true,
    navPin: true,
    bodySize: 'lg',
    bodyGap: 'sm',
  })
  assert.deepEqual(getPagePrefs(), {
    wide: true,
    outlineExpand: false,
    outlinePin: true,
    navPin: true,
    bodySize: 'lg',
    bodyGap: 'sm',
  })
  assert.equal(document.documentElement.dataset.outlinePin, '1')
  assert.equal(document.documentElement.dataset.bodySize, 'lg')
  persistPagePrefs({
    wide: false,
    outlineExpand: true,
    outlinePin: false,
    navPin: false,
    bodySize: 'md',
    bodyGap: 'md',
  })
})

test('hydratePagePrefs applies host profile and does not post when already stored', async () => {
  persistPagePrefs({
    wide: false,
    outlineExpand: true,
    outlinePin: false,
    navPin: false,
    bodySize: 'md',
    bodyGap: 'md',
  })
  const calls: string[] = []
  const originalFetch = globalThis.fetch
  resetWorkspaceProfileGet()
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`)
    return new Response(
      JSON.stringify({
        pagePrefs: {
          wide: true,
          outlineExpand: false,
          outlinePin: true,
          navPin: true,
          bodySize: 'lg',
          bodyGap: 'sm',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  try {
    await hydratePagePrefs()
    assert.equal(getPagePrefs().wide, true)
    assert.equal(getPagePrefs().bodySize, 'lg')
    assert.equal(document.documentElement.dataset.navPin, '1')
    assert.equal(calls.some((item) => item.startsWith('POST')), false)
  } finally {
    globalThis.fetch = originalFetch
    resetWorkspaceProfileGet()
    persistPagePrefs({
      wide: false,
      outlineExpand: true,
      outlinePin: false,
      navPin: false,
      bodySize: 'md',
      bodyGap: 'md',
    })
  }
})

test('getWorkspaceProfile shares one in-flight GET', async () => {
  resetWorkspaceProfileGet()
  let hits = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    hits += 1
    return new Response(JSON.stringify({ theme: 'dark', pagePrefs: { wide: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([getWorkspaceProfile(), getWorkspaceProfile()])
    assert.equal(hits, 1)
    assert.equal(a?.theme, 'dark')
    assert.equal(b?.theme, 'dark')
    await hydratePagePrefs()
    assert.equal(hits, 1)
    assert.equal(getPagePrefs().wide, true)
  } finally {
    globalThis.fetch = originalFetch
    resetWorkspaceProfileGet()
    persistPagePrefs({
      wide: false,
      outlineExpand: true,
      outlinePin: false,
      navPin: false,
      bodySize: 'md',
      bodyGap: 'md',
    })
  }
})
