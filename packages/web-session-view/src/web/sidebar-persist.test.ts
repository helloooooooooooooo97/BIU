import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { getSidebarPersist, setSidebarPersist, takeLegacyFavCollapsed, SIDEBAR_PERSIST } from './sidebar-persist.ts'
import { createSidebarCollapseStorage, parseSidebarCollapsePersisted } from './sidebar-collapse-store.ts'

afterEach(() => {
  localStorage.clear()
})

test('getSidebarPersist migrates fsdb.viewsOpen into the unified key', async () => {
  localStorage.setItem('fsdb.viewsOpen:/pages', '0')
  const migrated = getSidebarPersist(SIDEBAR_PERSIST.viewsOpen('/pages'))
  assert.equal(migrated, '0')
  await new Promise((resolve) => setTimeout(resolve, 160))
  assert.equal(localStorage.getItem(SIDEBAR_PERSIST.viewsOpen('/pages')), '0')
})

test('takeLegacyFavCollapsed consumes fsdb.favOpen once', () => {
  localStorage.setItem('fsdb.favOpen', '0')
  assert.equal(takeLegacyFavCollapsed(), true)
  assert.equal(localStorage.getItem('fsdb.favOpen'), null)
  assert.equal(takeLegacyFavCollapsed(), null)
})

test('collapse storage merges fsdb.favOpen into fsdb.section.fav', () => {
  localStorage.setItem('fsdb.favOpen', '0')
  const storage = createSidebarCollapseStorage()
  const raw = storage.getItem('cordis.sidebar.projectCollapsed')
  const parsed = JSON.parse(raw!) as { state: { collapsed: Record<string, boolean> } }
  assert.equal(parsed.state.collapsed['fsdb.section.fav'], true)
  assert.equal(localStorage.getItem('fsdb.favOpen'), null)
})

test('setSidebarPersist coalesces writes', async () => {
  setSidebarPersist(SIDEBAR_PERSIST.collapsed, '1')
  setSidebarPersist(SIDEBAR_PERSIST.collapsed, '0')
  assert.equal(localStorage.getItem(SIDEBAR_PERSIST.collapsed), null)
  await new Promise((resolve) => setTimeout(resolve, 160))
  assert.equal(localStorage.getItem(SIDEBAR_PERSIST.collapsed), '0')
})

test('parseSidebarCollapsePersisted still wraps a flat map', () => {
  const migrated = parseSidebarCollapsePersisted(JSON.stringify({ '/tmp/a': true }))
  assert.ok(migrated)
})
