import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  getActiveWorkspaceScope,
  getRegisteredWorkspaceCaches,
  registerWorkspaceCache,
  resetWorkspaceClientCaches,
  setActiveWorkspaceScope,
} from './workspace-client-store.ts'
import { loadViews, rememberViews } from './view-storage.ts'
import { listCache } from './browser-list-cache.ts'

test('WorkspaceClientStore resets all registered frontend caches atomically on workspace switch', () => {
  const path = '/pages-ws-isolation'
  rememberViews(path, [
    { id: 'v1', name: '视图', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'] },
  ])
  listCache.set(path, {
    items: [{ id: 'r1', title: '记录' }],
    stat: null,
    total: 1,
    listLimit: 20,
  })

  assert.equal(loadViews(path).length, 1)
  assert.equal(listCache.has(path), true)
  const registered = getRegisteredWorkspaceCaches()
  assert.ok(registered.includes('view-storage'))
  assert.ok(registered.includes('browser-list-cache'))

  let customCleared = 0
  const unregister = registerWorkspaceCache('test-custom', () => {
    customCleared += 1
  })
  try {
    const changed = setActiveWorkspaceScope('ws-alpha')
    assert.equal(changed, true)
    assert.equal(getActiveWorkspaceScope(), 'ws-alpha')
    assert.equal(customCleared, 1)
    assert.equal(loadViews(path).length, 0)
    assert.equal(listCache.has(path), false)

    // Same workspace ID is a no-op
    assert.equal(setActiveWorkspaceScope('ws-alpha'), false)
    assert.equal(customCleared, 1)

    // Explicit reset always clears
    const cleared = resetWorkspaceClientCaches()
    assert.ok(cleared.includes('view-storage'))
    assert.ok(cleared.includes('browser-list-cache'))
    assert.equal(customCleared, 2)
  } finally {
    unregister()
  }
})
