import { test } from 'vitest'
import assert from 'node:assert/strict'
import { persistPageWidth, getPageWidth, persistPagePrefs, getPagePrefs, hydratePagePrefs, SHARE_PAGE_PREFS, getWorkspaceProfile, resetWorkspaceProfileGet } from './page-width.ts'

function okFetch(handler?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (handler) return handler(input, init)
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

test('page width persists full and max', async () => {
  const restore = okFetch()
  try {
    await persistPageWidth('max')
    assert.equal(getPageWidth(), 'max')
    await persistPageWidth('full')
    assert.equal(getPageWidth(), 'full')
    await persistPageWidth('max')
    assert.equal(getPageWidth(), 'max')
  } finally {
    restore()
  }
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

test('page prefs store reading chrome and body scale', async () => {
  const restore = okFetch()
  try {
    await persistPagePrefs({
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
    const seen: string[] = []
    const onPrefs = () => {
      seen.push(document.documentElement.dataset.outlinePin ?? '')
    }
    window.addEventListener('biu:page-prefs', onPrefs)
    await persistPagePrefs({ outlinePin: false })
    window.removeEventListener('biu:page-prefs', onPrefs)
    assert.deepEqual(seen, ['0'])
    await persistPagePrefs({ outlinePin: true })
    await persistPagePrefs({
      wide: false,
      outlineExpand: true,
      outlinePin: false,
      navPin: false,
      bodySize: 'md',
      bodyGap: 'md',
    })
  } finally {
    restore()
  }
})

test('persistPagePrefs does not apply until the profile POST succeeds', async () => {
  const restoreOk = okFetch()
  try {
    await persistPagePrefs({
      wide: false,
      outlineExpand: true,
      outlinePin: false,
      navPin: false,
      bodySize: 'md',
      bodyGap: 'md',
    })
  } finally {
    restoreOk()
  }
  let release!: (value: Response) => void
  const restore = okFetch(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve
      }),
  )
  try {
    const pending = persistPagePrefs({ outlinePin: true })
    assert.equal(getPagePrefs().outlinePin, false)
    release(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    await pending
    assert.equal(getPagePrefs().outlinePin, true)
  } finally {
    restore()
    const restoreReset = okFetch()
    try {
      await persistPagePrefs({
        wide: false,
        outlineExpand: true,
        outlinePin: false,
        navPin: false,
        bodySize: 'md',
        bodyGap: 'md',
      })
    } finally {
      restoreReset()
    }
  }
})

test('hydratePagePrefs applies host profile and does not post when already stored', async () => {
  const restoreOk = okFetch()
  try {
    await persistPagePrefs({
      wide: false,
      outlineExpand: true,
      outlinePin: false,
      navPin: false,
      bodySize: 'md',
      bodyGap: 'md',
    })
  } finally {
    restoreOk()
  }
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
    const restore = okFetch()
    try {
      await persistPagePrefs({
        wide: false,
        outlineExpand: true,
        outlinePin: false,
        navPin: false,
        bodySize: 'md',
        bodyGap: 'md',
      })
    } finally {
      restore()
    }
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
    const restore = okFetch()
    try {
      await persistPagePrefs({
        wide: false,
        outlineExpand: true,
        outlinePin: false,
        navPin: false,
        bodySize: 'md',
        bodyGap: 'md',
      })
    } finally {
      restore()
    }
  }
})

test('hydratePagePrefs does not overwrite a newer local write', async () => {
  const restoreOk = okFetch()
  try {
    await persistPagePrefs({
      wide: false,
      outlineExpand: true,
      outlinePin: false,
      navPin: false,
      bodySize: 'md',
      bodyGap: 'md',
    })
  } finally {
    restoreOk()
  }
  resetWorkspaceProfileGet()
  let release!: () => void
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') {
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return new Response(
      JSON.stringify({
        pagePrefs: {
          wide: false,
          outlineExpand: true,
          outlinePin: false,
          navPin: false,
          bodySize: 'md',
          bodyGap: 'md',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  try {
    const pending = hydratePagePrefs()
    await persistPagePrefs({ outlinePin: true, navPin: true })
    release()
    await pending
    assert.equal(getPagePrefs().outlinePin, true)
    assert.equal(getPagePrefs().navPin, true)
    assert.equal(document.documentElement.dataset.outlinePin, '1')
    assert.equal(document.documentElement.dataset.navPin, '1')
  } finally {
    globalThis.fetch = originalFetch
    resetWorkspaceProfileGet()
    const restore = okFetch()
    try {
      await persistPagePrefs({
        wide: false,
        outlineExpand: true,
        outlinePin: false,
        navPin: false,
        bodySize: 'md',
        bodyGap: 'md',
      })
    } finally {
      restore()
    }
  }
})
