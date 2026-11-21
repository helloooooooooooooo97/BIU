/** @vitest-environment jsdom */
import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FSDB_CHANGE_EVENT, parseFsdbChange } from '@biu/type-file-system'
import { CommentPanel, layoutRailCards } from './comment-panel.tsx'
import { apiUpdateComment, sortCommentThreadsByPosition, type CommentThread } from './comment-store.ts'

afterEach(() => {
  cleanup()
})

const THREADS: CommentThread[] = [
  {
    root: {
      id: 'cmt_1',
      body: '这里建议改成升序默认',
      targetPath: '/pages/p1',
      threadId: 'cmt_1',
      parentId: '',
      status: 'open',
      anchor: {
        blockId: 'blk1',
        quote: '默认按手动排序',
        originalQuote: '默认按手动排序',
        prefix: '',
        suffix: '',
        offset: 0,
      },
      author: 'Alice',
      createdAt: 1795160000000,
      updatedAt: 1795160000000,
    },
    replies: [
      {
        id: 'cmt_2',
        body: '收到，马上调整',
        targetPath: '/pages/p1',
        threadId: 'cmt_1',
        parentId: 'cmt_1',
        status: 'open',
        anchor: null,
        author: 'Bob',
        createdAt: 1795160060000,
        updatedAt: 1795160060000,
      },
    ],
  },
  {
    root: {
      id: 'cmt_3',
      body: '已修复的旧批注',
      targetPath: '/pages/p1',
      threadId: 'cmt_3',
      parentId: '',
      status: 'resolved',
      anchor: {
        blockId: 'blk2',
        quote: '旧文案',
        prefix: '',
        suffix: '',
        offset: 0,
      },
      author: 'Alice',
      createdAt: 1795150000000,
      updatedAt: 1795150000000,
    },
    replies: [],
  },
]

test('CommentPanel creates thread, replies, respects filter prop, shows detached tag, and resolves', async () => {
  const created: string[] = []
  const replied: Array<{ id: string; body: string }> = []
  const statuses: Array<{ id: string; status: string }> = []
  const asked: string[] = []

  const props = {
    threads: THREADS,
    activeId: 'cmt_1',
    detachedIds: new Set(['cmt_1']),
    draftAnchor: { blockId: 'blk1', quote: '选中原文', prefix: '', suffix: '', offset: 0 },
    onCancelDraft: () => undefined,
    onCreateThread: (body: string) => { created.push(body) },
    onReplyThread: (id: string, body: string) => { replied.push({ id, body }) },
    onSetStatus: (id: string, status: 'open' | 'resolved') => { statuses.push({ id, status }) },
    onDelete: () => undefined,
    onSelectThread: () => undefined,
    onAskAi: (thread: CommentThread) => { asked.push(thread.root.id) },
  }

  const { rerender } = render(<CommentPanel {...props} filter="open" />)

  // No header/tab bar inside the rail
  assert.equal(screen.queryByRole('tablist'), null)

  // Detached tag is shown when thread is in detachedIds
  assert.ok(screen.getByText('原文已变更或删除'))

  // Create new comment from draft composer: Shift+Enter keeps editing, Enter submits directly
  const textarea = screen.getByPlaceholderText(/输入批注内容/)
  fireEvent.change(textarea, { target: { value: '新增一条批注' } })
  await act(async () => {
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
  })
  assert.deepEqual(created, [])
  await act(async () => {
    fireEvent.keyDown(textarea, { key: 'Enter' })
  })
  assert.deepEqual(created, ['新增一条批注'])

  // Reply to existing thread
  const replyInput = screen.getByLabelText('回复批注')
  fireEvent.change(replyInput, { target: { value: '补充一条回复' } })
  await act(async () => {
    fireEvent.keyDown(replyInput, { key: 'Enter' })
  })
  assert.deepEqual(replied, [{ id: 'cmt_1', body: '补充一条回复' }])

  // Ask AI & Resolve
  fireEvent.click(screen.getByLabelText('交给 AI 处理'))
  assert.deepEqual(asked, ['cmt_1'])
  fireEvent.click(screen.getByLabelText('解决批注'))
  assert.deepEqual(statuses, [{ id: 'cmt_1', status: 'resolved' }])

  // Empty state (no visible threads and no draftAnchor) renders nothing
  rerender(<CommentPanel {...props} threads={[]} draftAnchor={null} filter="open" />)
  assert.equal(screen.queryByTestId('editor-comment-panel'), null)

  // Controlled filter prop shows resolved thread
  rerender(<CommentPanel {...props} filter="resolved" draftAnchor={null} />)
  assert.ok(screen.getByText('已修复的旧批注'))
})

test('apiUpdateComment posts status update under content payload and emits scoped /comments change', async () => {
  const original = globalThis.fetch
  const calls: Array<{ url: string; body: unknown }> = []
  const changes: Array<ReturnType<typeof parseFsdbChange>> = []
  const onChange = (event: Event) => {
    changes.push(parseFsdbChange(event))
  }
  window.addEventListener(FSDB_CHANGE_EVENT, onChange)
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as typeof fetch
  try {
    const ok = await apiUpdateComment('cmt_1', { status: 'resolved' })
    assert.equal(ok, true)
    assert.deepEqual(calls, [
      {
        url: '/api/db/update',
        body: { path: '/comments/cmt_1', content: { status: 'resolved' } },
      },
    ])
    assert.deepEqual(changes, [{ scope: 'records', path: '/comments' }])
  } finally {
    window.removeEventListener(FSDB_CHANGE_EVENT, onChange)
    globalThis.fetch = original
  }
})

test('sortCommentThreadsByPosition orders threads by document start pos, detached last', () => {
  const mk = (id: string, createdAt: number): CommentThread => ({
    root: {
      id,
      body: id,
      targetPath: '/pages/p1',
      threadId: id,
      parentId: '',
      status: 'open',
      anchor: null,
      author: 'Alice',
      createdAt,
      updatedAt: createdAt,
    },
    replies: [],
  })
  const threads = [mk('later_in_doc', 100), mk('detached', 50), mk('earlier_in_doc', 300), mk('same_start_longer', 200)]
  const positions = new Map([
    ['later_in_doc', { from: 40, to: 50 }],
    ['earlier_in_doc', { from: 10, to: 15 }],
    ['same_start_longer', { from: 10, to: 25 }],
  ])
  const sorted = sortCommentThreadsByPosition(threads, positions)
  assert.deepEqual(
    sorted.map((t) => t.root.id),
    ['earlier_in_doc', 'same_start_longer', 'later_in_doc', 'detached'],
  )
})

test('layoutRailCards aligns cards to anchor lines and prevents vertical overlap', () => {
  const { tops, totalHeight } = layoutRailCards(
    [
      { id: 'c1', desiredTop: 100, height: 120 },
      { id: 'c2', desiredTop: 150, height: 100 }, // collides with c1 (ends at 220) -> pushed to 230
      { id: 'c3', desiredTop: 500, height: 90 }, // far below -> stays at 500
      { id: 'c4', desiredTop: null, height: 80 }, // detached -> stacks after c3 at 600
    ],
    34,
    10,
  )
  assert.equal(tops.get('c1'), 100)
  assert.equal(tops.get('c2'), 230)
  assert.equal(tops.get('c3'), 500)
  assert.equal(tops.get('c4'), 600)
  assert.equal(totalHeight, 690)
})
