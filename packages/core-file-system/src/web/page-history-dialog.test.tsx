/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { PageHistoryDialog } from './page-history-dialog.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('PageHistoryDialog renders timeline, diff, preview, and two-step restore', async () => {
  const revisions = [
    {
      id: 20,
      recordId: 'pg-1',
      version: 2,
      op: 'mixed',
      actorKind: 'agent',
      actorId: 'sess-1',
      actorName: '架构助手',
      sessionId: 'sess-1',
      title: '架构文档 v2',
      changes: [{ field: 'title', label: '标题', before: '架构文档', after: '架构文档 v2' }],
      addedLines: 1,
      removedLines: 1,
      summary: '修改了标题 · 编辑了正文（+1 -1 行）',
      createdAt: 1795850000000,
      updatedAt: 1795850000000,
    },
    {
      id: 10,
      recordId: 'pg-1',
      version: 1,
      op: 'create',
      actorKind: 'user',
      actorId: 'u1',
      actorName: '97',
      sessionId: '',
      title: '架构文档',
      changes: [],
      addedLines: 2,
      removedLines: 0,
      summary: '创建了页面',
      createdAt: 1795840000000,
      updatedAt: 1795840000000,
    },
  ]

  const details: Record<number, unknown> = {
    20: {
      ...revisions[0],
      body: '第一段\n第二段（已润色）',
      prevBody: '第一段\n第二段',
      fields: { title: '架构文档 v2' },
      prevFields: { title: '架构文档' },
      prevVersion: 1,
    },
    10: {
      ...revisions[1],
      body: '第一段\n第二段',
      prevBody: '',
      fields: { title: '架构文档' },
      prevFields: {},
      prevVersion: null,
    },
    30: {
      ...revisions[0],
      id: 30,
      version: 3,
      op: 'restore',
      summary: '恢复到版本 #1',
      body: '第一段\n第二段',
      prevBody: '第一段\n第二段（已润色）',
      fields: { title: '架构文档' },
      prevFields: { title: '架构文档 v2' },
      prevVersion: 2,
    },
  }

  let restoreCalls = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/revisions/10/restore') && init?.method === 'POST') {
      restoreCalls += 1
      return new Response(JSON.stringify({ ok: true, revision: details[30] }), { status: 200 })
    }
    if (url.includes('/revisions/30')) {
      return new Response(JSON.stringify(details[30]), { status: 200 })
    }
    if (url.includes('/revisions/20')) {
      return new Response(JSON.stringify(details[20]), { status: 200 })
    }
    if (url.includes('/revisions/10')) {
      return new Response(JSON.stringify(details[10]), { status: 200 })
    }
    if (url.includes('/revisions')) {
      return new Response(JSON.stringify({ items: revisions, total: 2 }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)

  let restoredNotified = 0
  const view = render(
    <PageHistoryDialog
      recordId="pg-1"
      pageTitle="架构文档 v2"
      onClose={() => {}}
      onRestored={() => {
        restoredNotified += 1
      }}
    />,
  )

  await waitFor(() => {
    assert.equal(view.getAllByTestId('page-history-item').length, 2)
    assert.ok(view.getByTestId('page-history-field-changes'))
    assert.ok(view.getByTestId('page-history-diff'))
  })

  // 当前版本不显示恢复按钮
  assert.equal(view.queryByTestId('page-history-restore'), null)

  // 切换到完整预览
  await act(async () => {
    fireEvent.click(view.getByTestId('page-history-tab-preview'))
  })
  assert.match(view.getByTestId('page-history-preview').textContent ?? '', /第二段（已润色）/)

  // 选中历史版本 #1 并执行两步确认恢复
  await act(async () => {
    fireEvent.click(view.getAllByTestId('page-history-item')[1]!)
  })
  const restoreBtn = await waitFor(() => view.getByTestId('page-history-restore'))
  await act(async () => {
    fireEvent.click(restoreBtn)
  })
  const confirmBtn = await waitFor(() => view.getByTestId('page-history-restore-confirm'))
  await act(async () => {
    fireEvent.click(confirmBtn)
  })

  await waitFor(() => {
    assert.equal(restoreCalls, 1)
    assert.equal(restoredNotified, 1)
  })
})
