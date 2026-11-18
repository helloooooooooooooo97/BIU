import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createDataSidebarHost, type DataSidebarLive } from './data-sidebar-host.ts'

const sample = {
  tables: [],
  collectionPath: '/pages',
  title: '页面',
  views: [],
  activeViewId: null,
  onApplyView: () => undefined,
  onDeleteView: () => undefined,
  onAddView: () => undefined,
} as DataSidebarLive

test('createDataSidebarHost isolates live state', () => {
  const a = createDataSidebarHost()
  const b = createDataSidebarHost()
  a.publish(sample)
  assert.equal(a.getLive(), sample)
  assert.equal(b.getLive(), null)
  a.reset()
  assert.equal(a.getLive(), null)
})
