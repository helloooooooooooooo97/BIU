/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { DbRecord } from '@biu/type-file-system'
import { useSidebarCollapseStore } from '@biu/web-session-view'
import { invalidateListReads } from './db-client.ts'
import { getInspectorDbPath, resetInspectorDbPathMemory, snapshotInspectorDbPaths } from './inspector-db-route.ts'
import { docScopeOf, groupDocsByScope, SidebarDocsSection } from './sidebar-docs-section.tsx'

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location-probe">{loc.pathname}</div>
}

beforeEach(() => {
  localStorage.clear()
  invalidateListReads()
  resetInspectorDbPathMemory()
  useSidebarCollapseStore.setState({ collapsed: {} })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('docScopeOf and groupDocsByScope split pages into 个人 / 共享 / 空间', () => {
  const rows: DbRecord[] = [
    { id: 'p1', title: '个人笔记', shareScope: '私人' },
    { id: 'p2', title: '协作方案', shareScope: '共享' },
    { id: 'p3', title: '团队规范', shareScope: '空间' },
    { id: 'p4', title: '默认归属' },
  ]
  assert.equal(docScopeOf(rows[0]!), 'personal')
  assert.equal(docScopeOf(rows[1]!), 'shared')
  assert.equal(docScopeOf(rows[2]!), 'workspace')
  assert.equal(docScopeOf(rows[3]!), 'personal')

  const grouped = groupDocsByScope(rows)
  assert.deepEqual(grouped.personal.map((r) => r.id), ['p1', 'p4'])
  assert.deepEqual(grouped.shared.map((r) => r.id), ['p2'])
  assert.deepEqual(grouped.workspace.map((r) => r.id), ['p3'])
})

test('SidebarDocsSection renders 个人/共享/空间 scopes with tree hierarchy, navigation, and scoped creation', async () => {
  const createdRequests: Array<Record<string, unknown>> = []
  const samplePages: DbRecord[] = [
    { id: 'root-p', title: '个人根目录', shareScope: '私人' },
    { id: 'child-p', title: '个人子文档', parentId: 'root-p', shareScope: '私人' },
    { id: 'shared-1', title: '他人共享文档', shareScope: '共享' },
    { id: 'ws-root', title: '空间知识库', shareScope: '空间' },
    { id: 'ws-orphan', title: '跨级子页', parentId: 'root-p', shareScope: '空间' },
  ]

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/db/list')) {
        return new Response(JSON.stringify({ items: samplePages, total: samplePages.length }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === '/api/db/create') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        createdRequests.push(body)
        return new Response(
          JSON.stringify({
            items: [{ value: { id: 'new-ws-doc', title: '未命名页面', shareScope: '空间' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )

  const view = render(
    <MemoryRouter initialEntries={['/agents/s1']}>
      <SidebarDocsSection />
      <LocationProbe />
    </MemoryRouter>,
  )

  await waitFor(() => {
    assert.ok(view.queryByTestId('sidebar-doc-open-root-p'))
  })

  // 三个级别按 个人 -> 共享 -> 空间 顺序渲染
  const personal = view.getByTestId('sidebar-docs-scope-personal')
  const shared = view.getByTestId('sidebar-docs-scope-shared')
  const workspace = view.getByTestId('sidebar-docs-scope-workspace')
  assert.equal(Boolean(personal.compareDocumentPosition(shared) & Node.DOCUMENT_POSITION_FOLLOWING), true)
  assert.equal(Boolean(shared.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING), true)

  // 树形层级：子文档嵌套在父文档的 .fsdb-record-kids 内
  const kidsContainer = view.getByTestId('sidebar-doc-kids-root-p')
  assert.equal(kidsContainer.contains(view.getByTestId('sidebar-doc-open-child-p')), true)
  // 跨作用域孤儿节点直接作为本作用域根节点展示
  assert.equal(workspace.contains(view.getByTestId('sidebar-doc-open-ws-orphan')), true)

  // 每个文档行都携带 data-biu-kind="page" / data-biu-id / data-biu-label，支持 Pick 点击与框选
  const rootRow = view.getByTestId('sidebar-doc-node-root-p').querySelector('.chat-session-row')
  assert.equal(rootRow?.getAttribute('data-biu-kind'), 'page')
  assert.equal(rootRow?.getAttribute('data-biu-id'), 'root-p')
  assert.equal(rootRow?.getAttribute('data-biu-label'), '个人根目录')

  // 展开子文档并点击：只在右侧边栏（检查器）打开，不离开当前会话路由
  fireEvent.click(view.getByTestId('sidebar-doc-toggle-root-p'))
  assert.equal(view.getByTestId('sidebar-doc-toggle-root-p').getAttribute('aria-expanded'), 'true')
  fireEvent.click(view.getByTestId('sidebar-doc-open-child-p'))
  assert.equal(view.getByTestId('location-probe').textContent, '/agents/s1')
  assert.equal(getInspectorDbPath('database:/pages'), '/database/pages/record/child-p')

  // 在空间下点击 + 新建文档应携带 scope: 'workspace' 并在右侧边栏打开
  fireEvent.click(view.getByTestId('sidebar-docs-create-workspace'))
  await waitFor(() => {
    assert.equal(Object.values(snapshotInspectorDbPaths()).includes('/database/pages/record/new-ws-doc'), true)
  })
  assert.equal(view.getByTestId('location-probe').textContent, '/agents/s1')
  assert.equal(createdRequests.length, 1)
  assert.equal(createdRequests[0]?.scope, 'workspace')
})
