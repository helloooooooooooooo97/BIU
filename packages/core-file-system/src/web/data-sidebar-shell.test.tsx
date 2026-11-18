import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { DataSidebarSlot } from './data-sidebar-slot.tsx'
import { DataSidebarShell } from './data-sidebar-shell.tsx'
import { publishDataSidebar, resetDataSidebarLive } from './data-sidebar-host.ts'

afterEach(() => {
  resetDataSidebarLive()
  cleanup()
})

test('skeleton has bars and no live section titles', () => {
  const result = render(<DataSidebarShell />)
  assert.ok(result.container.querySelectorAll('.h-7').length >= 4)
  assert.equal(result.queryByText('核心数据'), null)
  assert.equal(result.queryByText('收藏'), null)
})

test('publish swaps the slot from skeleton to the live list', async () => {
  const result = render(<DataSidebarSlot />)
  assert.ok(result.container.querySelectorAll('.h-7').length >= 4)
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
    assert.equal(result.container.querySelectorAll('.h-7.rounded-md').length, 0)
  })
})
