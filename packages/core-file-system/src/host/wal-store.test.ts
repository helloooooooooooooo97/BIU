import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WalStore, actorKey } from './wal-store.ts'

test('folds same actor content and keeps first before', () => {
  const store = new WalStore().open(':memory:')
  const actor = { kind: 'user' as const }
  store.append({ path: '/pages/p1', op: 'content', actor, title: '首页', beforeText: 'a\n', afterText: 'a\nb\n' })
  const second = store.append({ path: '/pages/p1', op: 'content', actor, title: '首页', beforeText: 'a\nb\n', afterText: 'a\nb\nc\n' })
  assert.equal(second?.folded, true)
  assert.equal(second?.seq, 1)
  assert.equal(store.getBlob(second?.beforeBlob), 'a\n')
  assert.equal(store.getBlob(second?.afterBlob), 'a\nb\nc\n')
})

test('does not fold when actor switches to an agent', () => {
  const store = new WalStore().open(':memory:')
  store.append({ path: '/pages/p1', op: 'content', actor: { kind: 'user' }, title: 'p', beforeText: '', afterText: '人' })
  store.append({
    path: '/pages/p1',
    op: 'content',
    actor: { kind: 'agent', sessionId: 's1', turn: 1 },
    title: 'p',
    beforeText: '人',
    afterText: '模型',
  })
  assert.equal(store.headSeq('/pages/p1'), 2)
  assert.equal(actorKey({ kind: 'user' }), 'user')
})

test('does not fold create or delete', () => {
  const store = new WalStore().open(':memory:')
  const actor = { kind: 'agent' as const, sessionId: 's', turn: 1 }
  store.append({ path: '/pages/a', op: 'create', actor, title: 'a', afterMeta: { title: 'a' } })
  store.append({ path: '/pages/a', op: 'create', actor, title: 'a', afterMeta: { title: 'a2' } })
  assert.equal(store.listTurn('s', 1).length, 2)
})

test('persists blobs beside the log file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wal-'))
  const file = join(dir, 'wal.json')
  const store = new WalStore().open(file)
  store.append({ path: '/pages/p1', op: 'content', actor: { kind: 'user' }, title: 'p', beforeText: '', afterText: '你好' })
  const again = new WalStore().open(file)
  const head = again.headEntry('/pages/p1')
  assert.equal(again.getBlob(head?.afterBlob), '你好')
  const raw = JSON.parse(await readFile(file, 'utf8')) as { entries: unknown[] }
  assert.equal(raw.entries.length, 1)
})
