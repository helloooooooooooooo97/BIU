import { test } from 'vitest'
import assert from 'node:assert/strict'
import { resetWorkspaceProfileGet } from '@biu/core-file-system/page-width'
import { applyTheme, hydrateTheme, persistTheme, readTheme } from './theme.ts'

test('readTheme follows the document class and persistTheme posts the profile', async () => {
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add('light')
  applyTheme('light')
  assert.equal(readTheme(), 'light')
  const calls: string[] = []
  let release!: (value: Response) => void
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)} ${String(init?.body ?? '')}`)
    return new Promise<Response>((resolve) => {
      release = resolve
    })
  }) as typeof fetch
  try {
    const pending = persistTheme('dark')
    assert.equal(readTheme(), 'light')
    release(new Response('{}', { status: 200 }))
    await pending
    assert.equal(readTheme(), 'dark')
    assert.equal(document.documentElement.classList.contains('dark'), true)
    assert.equal(document.documentElement.classList.contains('light'), false)
    assert.equal(sessionStorage.getItem('biu.theme.bootstrap'), 'dark')
    assert.match(calls[0] ?? '', /POST \/api\/profile.*"theme":"dark"/)
    applyTheme('light')
    assert.equal(document.documentElement.classList.contains('light'), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('hydrateTheme applies the host profile without localStorage', async () => {
  document.documentElement.classList.remove('dark')
  document.documentElement.classList.add('light')
  applyTheme('light')
  resetWorkspaceProfileGet()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ theme: 'dark' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
  try {
    assert.equal(await hydrateTheme(), 'dark')
    assert.equal(readTheme(), 'dark')
    assert.equal(document.documentElement.classList.contains('dark'), true)
    assert.equal(localStorage.getItem('biu.theme'), null)
  } finally {
    globalThis.fetch = originalFetch
    resetWorkspaceProfileGet()
  }
})
