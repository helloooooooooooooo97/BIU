import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { DataSidebarSlot } from './data-sidebar-slot.tsx'
import { DataSidebarShell } from './data-sidebar-shell.tsx'
import { createDataSidebarHost, publishDataSidebar, resetDataSidebarLive } from './data-sidebar-host.ts'

afterEach(() => {
  resetDataSidebarLive()
  cleanup()
})

test('skeleton has bars and no live section titles', () => {
  const result = render(<DataSidebarShell />)
  assert.ok(result.container.querySelectorAll('.h-8').length >= 4)
  assert.equal(result.queryByText('核心数据'), null)
  assert.equal(result.queryByText('收藏'), null)
})

test('publish swaps the slot from skeleton to the live list', async () => {
  const result = render(<DataSidebarSlot renderSlot={() => null} />)
  assert.ok(result.container.querySelectorAll('.h-8').length >= 4)
  assert.equal(result.queryByText('核心数据'), null)

  await act(async () => {
    publishDataSidebar({
      tables: [{ id: 'pages', path: '/pages', kind: 'collection', label: '页面', view: null }],
      collectionPath: '/pages',
      title: '页面',
      views: [],
      activeViewId: null,
      onApplyView: () => undefined,
      onDeleteView: () => undefined,
      onAddView: () => undefined,
    })
  })

  await waitFor(() => {
    assert.ok(result.queryByText('核心数据'))
    assert.equal(result.container.querySelectorAll('.h-8.rounded-md').length, 0)
  })
})

test('sidebar host suppresses redundant renders on callback churn and avoids skeleton flash across remounts', async () => {
  const host = createDataSidebarHost()
  const tables = [{ id: 'pages', path: '/pages', kind: 'collection' as const, label: '页面', view: null }]
  const views: never[] = []
  let emits = 0
  const seen: string[] = []
  const off = host.subscribe(() => {
    emits += 1
  })
  try {
    host.publish({
      tables,
      collectionPath: '/pages',
      title: '页面',
      views,
      activeViewId: 'v1',
      onApplyView: () => seen.push('first'),
      onDeleteView: () => undefined,
      onAddView: () => undefined,
    })
    assert.equal(emits, 1)

    // Re-publish with identical data and new inline callbacks -> 0 extra notifications, latest callback invoked
    host.publish({
      tables,
      collectionPath: '/pages',
      title: '页面',
      views,
      activeViewId: 'v1',
      onApplyView: () => seen.push('second'),
      onDeleteView: () => undefined,
      onAddView: () => undefined,
    })
    assert.equal(emits, 1)
    host.getLive()?.onApplyView({} as never)
    assert.deepEqual(seen, ['second'])

    // Release followed by immediate re-publish (route switch) -> never flashes null
    host.release()
    assert.notEqual(host.getLive(), null)
    host.publish({
      tables,
      collectionPath: '/tasks',
      title: '任务',
      views,
      activeViewId: 'v2',
      onApplyView: () => undefined,
      onDeleteView: () => undefined,
      onAddView: () => undefined,
    })
    await Promise.resolve()
    assert.equal(host.getLive()?.collectionPath, '/tasks')

    // Standalone release clears after microtask
    host.release()
    await Promise.resolve()
    assert.equal(host.getLive(), null)
  } finally {
    off()
    host.reset()
  }
})
