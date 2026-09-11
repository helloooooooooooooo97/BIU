import { test } from 'vitest'
import assert from 'node:assert/strict'
import { NoticesStore } from './notices-store.ts'
import { noticesCollection } from './notices-collection.ts'

test('notices store dedupes unread source keys and marks read', () => {
  const store = new NoticesStore().open(':memory:')
  const first = store.push({ kind: 'task', title: '任务完成：A', sourceKey: 'task:a:done', href: '/database/tasks/record/a' })
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

test('notices collection exposes an agent blurb and writable read flag', async () => {
  const store = new NoticesStore().open(':memory:')
  store.push({ kind: 'approval', title: '需要审批：bash', sourceKey: 'approval:1' })
  const spec = noticesCollection(store)
  assert.equal(spec.path, '/notices')
  assert.match(String(spec.view?.blurb), /db_list \/notices/)
  assert.doesNotMatch(String(spec.view?.blurb), /回合结束/)
  assert.equal(spec.view?.inspector, false)
  const rows = await spec.list()
  assert.equal(rows[0]?.read, false)
  const updated = await spec.update!(String(rows[0]!.id), { read: true })
  assert.equal(updated.read, true)
})

test('notices service does not write on turn/end', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const src = readFileSync(resolve(import.meta.dirname, './notices-service.ts'), 'utf8')
  assert.doesNotMatch(src, /session\/event/)
  assert.doesNotMatch(src, /turn\/end/)
  assert.doesNotMatch(src, /回合结束/)
})
