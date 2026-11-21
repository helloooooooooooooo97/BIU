import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CommentsStore } from './comments-store.ts'

test('CommentsStore persists threads, replies, status updates, and cascades root delete', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-comments-'))
  try {
    const file = join(dir, 'comments.json')
    const store = new CommentsStore().open(file)
    const root = store.create({
      body: '这里需要补充边界说明',
      targetPath: '/pages/p1',
      anchor: {
        blockId: 'blk12345',
        quote: '按天分组',
        originalQuote: '按天分组',
        prefix: '支持',
        suffix: '和按月分组',
        offset: 2,
      },
      author: 'Alice',
    })
    assert.equal(root.threadId, root.id)
    assert.equal(root.status, 'open')
    assert.equal(root.anchor?.quote, '按天分组')

    const reply = store.create({
      body: '好的，我来补上',
      targetPath: '/pages/p1',
      threadId: root.id,
      parentId: root.id,
      author: 'Bob',
    })
    assert.equal(reply.threadId, root.id)
    assert.equal(reply.parentId, root.id)

    store.update(root.id, { status: 'resolved' })

    // Re-open from disk
    const reloaded = new CommentsStore().open(file)
    assert.equal(reloaded.list('/pages/p1').length, 2)
    assert.equal(reloaded.get(root.id)?.status, 'resolved')

    // Deleting root cascades to replies
    assert.equal(reloaded.remove(root.id), true)
    assert.equal(reloaded.list('/pages/p1').length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CommentsStore filters by targetPath cleanly', () => {
  const store = new CommentsStore()
  store.create({ body: '批注 A', targetPath: '/pages/a' })
  store.create({ body: '批注 B', targetPath: '/pages/b' })
  const listA = store.list('/pages/a')
  assert.equal(listA.length, 1)
  assert.equal(listA[0]!.body, '批注 A')
})
