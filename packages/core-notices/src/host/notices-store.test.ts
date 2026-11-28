import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isAllocatedRecordId } from '@biu/type-file-system'
import { NoticesStore } from './notices-store.ts'

test('notices store dedupes unread source keys and marks read', () => {
  const store = new NoticesStore().open(':memory:')
  const first = store.push({ kind: 'task', title: '任务完成：A', sourceKey: 'task:a:done', href: '/database/tasks/record/a' })
  assert.equal(isAllocatedRecordId(first!.id), true)
  const again = store.push({ kind: 'task', title: '任务完成：A（改）', sourceKey: 'task:a:done' })
  assert.equal(first?.id, again?.id)
  assert.equal(store.list().length, 1)
  assert.equal(store.list()[0]?.title, '任务完成：A（改）')
  store.update(first!.id, { read: true })
  const next = store.push({ kind: 'task', title: '任务完成：A 再一次', sourceKey: 'task:a:done' })
  assert.notEqual(next?.id, first?.id)
  assert.equal(store.list().length, 2)
  assert.equal(store.markSourceRead('task:a:done'), 1)
  assert.equal(store.list().every((row) => row.read), true)
})

test('notice content stays off the summary and survives a refresh of the same source', () => {
  const store = new NoticesStore().open(':memory:')
  const files = [{ name: 'cover.png', href: '/api/db/file/cover.png', image: true }]
  const row = store.push({
    kind: 'session',
    title: '有 1 个附件没人用了',
    body: '页面和记录都不再用到下面这些文件。',
    sourceKey: 'asset-gc:candidates',
    content: files,
  })
  assert.equal(row?.body, '页面和记录都不再用到下面这些文件。')
  assert.deepEqual(row?.content, files)
  const again = store.push({
    kind: 'session',
    title: '有 2 个附件没人用了',
    body: '页面和记录都不再用到下面这些文件。',
    sourceKey: 'asset-gc:candidates',
    content: [...files, { name: 'notes.pdf', href: '/api/db/file/notes.pdf', image: false }],
  })
  assert.equal(again?.id, row?.id)
  assert.equal(Array.isArray(again?.content) && again.content.length, 2)
})

test('notices store clear drops every row', () => {
  const store = new NoticesStore().open(':memory:')
  store.push({ kind: 'task', title: 'A', sourceKey: 'task:a:done' })
  store.push({ kind: 'session', title: 'B', sourceKey: 'session:1' })
  assert.equal(store.clear(), 2)
  assert.equal(store.list().length, 0)
  assert.equal(store.clear(), 0)
})

test('notices store markAllRead preserves history and re-pushed unread floats to top', () => {
  const store = new NoticesStore().open(':memory:')
  const first = store.push({ kind: 'channel', title: '群 A 提及', sourceKey: 'channel-mention:a' })!
  first.createdAt = 1000
  first.updatedAt = 1000
  const second = store.push({ kind: 'channel', title: '群 B 提及', sourceKey: 'channel-mention:b' })!
  second.createdAt = 2000
  second.updatedAt = 2000
  assert.equal(store.list()[0]?.id, second.id)

  // 群 A 再次被 @，合并更新后按 updatedAt 浮到顶部
  store.push({ kind: 'channel', title: '群 A 新提及', sourceKey: 'channel-mention:a' })
  assert.equal(store.list()[0]?.id, first.id)

  // markAllRead 仅标为已读，不删除历史记录
  assert.equal(store.markAllRead(), 2)
  assert.equal(store.list().length, 2)
  assert.equal(store.list().every((row) => row.read), true)
  assert.equal(store.markAllRead(), 0)
})

test('notices service does not write on turn/end', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const src = readFileSync(resolve(import.meta.dirname, './notices-service.ts'), 'utf8')
  assert.doesNotMatch(src, /session\/event/)
  assert.doesNotMatch(src, /turn\/end/)
  assert.doesNotMatch(src, /回合结束/)
})

test('object notice content persists to disk and updateBySource updates all approvers for a workspace', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { runWithAccount, runWithRequestWorkspace } = await import('@biu/host-plugin-loader/data-dir')
  const dir = mkdtempSync(join(tmpdir(), 'biu-notices-ar-'))
  const file = join(dir, 'notices.json')
  try {
    const store = new NoticesStore().open(file)
    const payload = {
      type: 'access-request',
      requestId: 'areq_123',
      collection: '/pages',
      recordId: 'doc-1',
      recordTitle: '架构文档',
      requesterId: 'bob',
      requesterName: 'Bob',
      requesterEmail: 'bob@example.com',
      requestedRole: 'editor',
      note: '需要编辑',
      status: 'pending',
    }
    store.push({
      kind: 'approval',
      sourceKey: 'access-request:areq_123',
      title: 'Bob 申请权限',
      accountId: 'ada',
      workspaceId: 'ws-1',
      content: payload,
    })
    store.push({
      kind: 'approval',
      sourceKey: 'access-request:areq_123',
      title: 'Bob 申请权限',
      accountId: 'cara',
      workspaceId: 'ws-1',
      content: payload,
    })
    const touched = store.updateBySource('access-request:areq_123', 'ws-1', (prev) => ({
      read: true,
      content: { ...(prev.content as Record<string, unknown>), status: 'approved', grantedRole: 'viewer' },
    }))
    assert.equal(touched.length, 2)

    const reloaded = new NoticesStore().open(file)
    const adaList = runWithAccount('ada', () => runWithRequestWorkspace('ws-1', () => reloaded.list()))
    assert.equal(adaList.length, 1)
    assert.equal(adaList[0]?.read, true)
    assert.deepEqual((adaList[0]?.content as { status?: string; grantedRole?: string })?.status, 'approved')
    assert.deepEqual((adaList[0]?.content as { grantedRole?: string })?.grantedRole, 'viewer')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
