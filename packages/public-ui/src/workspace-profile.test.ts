import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  hydrateWorkspaceProfile,
  resetWorkspaceProfileHydrate,
  writeWorkspaceProfile,
} from './workspace-profile.ts'

test('hydrateWorkspaceProfile shares one in-flight GET', async () => {
  resetWorkspaceProfileHydrate()
  writeWorkspaceProfile({ name: '', avatar: '' })
  const memory: Record<string, string> = { 'biu.account.token': 'tok' }
  const originalStorage = (globalThis as { localStorage?: unknown }).localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory[key] ?? null,
      setItem: (key: string, value: string) => {
        memory[key] = value
      },
      removeItem: (key: string) => {
        delete memory[key]
      },
    },
  })
  let hits = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    hits += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ name: 'Ada', avatar: '' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const [a, b] = await Promise.all([hydrateWorkspaceProfile(), hydrateWorkspaceProfile()])
    assert.equal(hits, 1)
    assert.equal(a.name, 'Ada')
    assert.equal(b.name, 'Ada')
  } finally {
    globalThis.fetch = originalFetch
    resetWorkspaceProfileHydrate()
    if (originalStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalStorage,
      })
    }
    writeWorkspaceProfile({ name: '', avatar: '' })
  }
})
