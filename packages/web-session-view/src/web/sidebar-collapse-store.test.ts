import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createSidebarCollapseStorage, parseSidebarCollapsePersisted } from './sidebar-collapse-store.ts'

test('parseSidebarCollapsePersisted migrates flat legacy map', () => {
  const migrated = parseSidebarCollapsePersisted(JSON.stringify({ '/tmp/a': true }))
  assert.ok(migrated)
  const parsed = JSON.parse(migrated!) as { state: { collapsed: Record<string, boolean> } }
  assert.deepEqual(parsed.state.collapsed, { '/tmp/a': true })
})

test('parseSidebarCollapsePersisted keeps zustand envelope', () => {
  const raw = JSON.stringify({ state: { collapsed: { x: true } }, version: 0 })
  assert.equal(parseSidebarCollapsePersisted(raw), raw)
})

test('parseSidebarCollapsePersisted ignores garbage', () => {
  assert.equal(parseSidebarCollapsePersisted(null), null)
  assert.equal(parseSidebarCollapsePersisted('not json'), null)
})

test('custom storage migrates on read and coalesces writes', async () => {
  const mem = new Map<string, string>()
  const base = {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mem.set(key, value)
    },
    removeItem: (key: string) => {
      mem.delete(key)
    },
  }
  const storage = createSidebarCollapseStorage(base)

  // 读：旧版扁平 `{ [key]: boolean }` 升级成 zustand persist 信封
  base.setItem('k', JSON.stringify({ '/tmp/legacy': true }))
  const migrated = JSON.parse(storage.getItem('k')!) as {
    state: { collapsed: Record<string, boolean> }
  }
  assert.equal(migrated.state.collapsed['/tmp/legacy'], true)

  // 写：连点多次只落盘最后一次
  storage.setItem('k', 'first')
  storage.setItem('k', 'second')
  assert.equal(mem.get('k'), JSON.stringify({ '/tmp/legacy': true }))
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(mem.get('k'), 'second')

  // 删：清掉待写
  storage.setItem('k', 'third')
  storage.removeItem('k')
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(mem.has('k'), false)
})
