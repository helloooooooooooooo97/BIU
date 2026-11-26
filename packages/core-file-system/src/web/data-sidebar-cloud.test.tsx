import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import type { CollectionInfo } from '@biu/type-file-system'
import { DataSidebar } from './data-sidebar.tsx'

const TABLES: CollectionInfo[] = [
  { id: 'pages', path: '/pages', kind: 'collection', label: '页面', view: { moduleId: 'pages', route: '/pages', title: '页面' } },
  { id: 'tasks', path: '/tasks', kind: 'collection', label: '任务', view: { moduleId: 'tasks', route: '/tasks', title: '任务' } },
  { id: 'workspace-members', path: '/workspace-members', kind: 'collection', label: '成员', view: { moduleId: 'workspace-members', route: '/workspace-members', title: '成员' } },
  { id: 'trash', path: '/trash', kind: 'collection', label: '回收站', view: { moduleId: 'trash', route: '/trash', title: '回收站' } },
]

function mockCloudFetch(memberKind: 'member' | 'external') {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/api/account/me')) {
      return json({ id: 'alice', name: 'Alice', online: true })
    }
    if (url.includes('/api/account/active')) {
      return json({ workspaceId: 'ws-cloud' })
    }
    if (url.includes('/api/account/workspaces')) {
      return json({ workspaces: [{ id: 'ws-cloud', location: 'cloud', memberKind }] })
    }
    if (url.includes('/api/db/list')) {
      return json({ items: [], total: 0 })
    }
    return json({})
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

test('cloud sidebar renders 空间数据 -> 共享数据 -> 个人数据 -> 系统数据 and opens domain views on click', async () => {
  mockCloudFetch('member')
  const opened: Array<{ path: string; viewId?: string }> = []
  const result = render(
    <DataSidebar
      tables={TABLES}
      collectionPath="/pages"
      title="页面"
      views={[]}
      activeViewId="default:workspace:/pages"
      onOpenTable={(path, viewId) => opened.push({ path, viewId })}
      onApplyView={() => undefined}
      onDeleteView={() => undefined}
      onAddView={() => undefined}
    />,
  )

  await waitFor(() => {
    assert.ok(result.queryByTestId('sidebar-workspace-home'))
    assert.ok(result.queryByTestId('sidebar-shared-home'))
    assert.ok(result.queryByTestId('sidebar-personal-home'))
    assert.ok(result.queryByTestId('sidebar-system-collections'))
  })

  // 云端不再展示本地模式的「核心数据」「能力数据」
  assert.equal(result.queryByText('核心数据'), null)
  assert.equal(result.queryByText('能力数据'), null)

  // 从上到下顺序校验：空间数据 -> 共享数据 -> 个人数据 -> 系统数据
  const bodyText = result.container.textContent ?? ''
  const wsPos = bodyText.indexOf('空间数据')
  const sharedPos = bodyText.indexOf('共享数据')
  const personalPos = bodyText.indexOf('个人数据')
  const sysPos = bodyText.indexOf('系统数据')
  assert.ok(wsPos >= 0 && sharedPos > wsPos && personalPos > sharedPos && sysPos > personalPos)

  // 系统数据对内部成员显示「成员」
  const sysSection = result.getByTestId('sidebar-system-collections')
  assert.ok(within(sysSection).queryByText('成员'))

  // 点击三个分区的「页面」，分别打开 workspace / shared / account:alice 视图
  fireEvent.click(within(result.getByTestId('sidebar-domain-workspace-/pages')).getByRole('button', { name: '页面' }))
  fireEvent.click(within(result.getByTestId('sidebar-domain-shared-/pages')).getByRole('button', { name: '页面' }))
  fireEvent.click(within(result.getByTestId('sidebar-domain-personal-/pages')).getByRole('button', { name: '页面' }))

  assert.deepEqual(opened, [
    { path: '/pages', viewId: 'default:workspace:/pages' },
    { path: '/pages', viewId: 'default:shared:/pages' },
    { path: '/pages', viewId: 'default:account:alice:/pages' },
  ])
})

test('external collaborator only sees 共享数据 and 系统数据 (without 成员)', async () => {
  mockCloudFetch('external')
  const result = render(
    <DataSidebar
      tables={TABLES}
      collectionPath="/pages"
      title="页面"
      views={[]}
      activeViewId="default:shared:/pages"
      onOpenTable={() => undefined}
      onApplyView={() => undefined}
      onDeleteView={() => undefined}
      onAddView={() => undefined}
    />,
  )

  await waitFor(() => {
    assert.ok(result.queryByTestId('sidebar-shared-home'))
    assert.equal(result.queryByTestId('sidebar-workspace-home'), null)
    assert.equal(result.queryByTestId('sidebar-personal-home'), null)
  })

  const sysSection = result.getByTestId('sidebar-system-collections')
  assert.equal(within(sysSection).queryByText('成员'), null)
  assert.ok(within(sysSection).queryByText('回收站'))
})
