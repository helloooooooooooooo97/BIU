import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import * as tools from '@biu/host-tools'
import { runWithSession } from '@biu/host-sessions/scope'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { DatabaseService, apply as applyFileSystem } from './index.ts'
import { ContentTurnService } from './content-turn-service.ts'
import { asContentText } from './content-edit.ts'
import { WAL_MAX_ENTRIES, WalStore } from './wal-store.ts'

function pagesDb() {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const turns = new ContentTurnService(ctx, db).open(':memory:')
  const rows = new Map<string, Record<string, unknown>>()
  db.register({
    id: 'pages',
    path: '/pages',
    schema: {
      contentField: 'notes',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        status: { type: 'string', writable: true },
        notes: { type: 'file', writable: true },
      },
    },
    records: { update: true, create: true, delete: true },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
    create: async (records) => {
      const out = []
      for (const fields of records) {
        const id = typeof fields.id === 'string' && fields.id ? String(fields.id) : `p${rows.size + 1}`
        const row = { title: '', notes: '', status: 'open', ...fields, id }
        rows.set(id, row)
        out.push(row as { id: string })
      }
      return out
    },
    remove: async (query) => {
      for (const id of query.ids ?? []) rows.delete(id)
      return query.ids ?? []
    },
  })
  const sessions = {
    peek: (id: string) => ({ events: id ? [{ type: 'turn/start', turn: 1 }] : [] }),
    append: async () => undefined,
  }
  const get = turns.ctx.get.bind(turns.ctx)
  turns.ctx.get = ((name: string) => (name === 'sessions' ? sessions : get(name))) as typeof turns.ctx.get
  return { db, turns, rows, sessions }
}

test('wal store folds updates with first before and latest after', () => {
  const store = new WalStore().open(':memory:')
  const actor = { kind: 'user' as const }
  store.append({ path: '/pages/p1', op: 'update', actor, title: 'p', beforeMeta: { status: 'open' }, afterMeta: { status: 'doing' } })
  const folded = store.append({
    path: '/pages/p1',
    op: 'update',
    actor,
    title: 'p',
    beforeMeta: { status: 'doing' },
    afterMeta: { status: 'done' },
  })
  assert.equal(folded?.folded, true)
  assert.deepEqual(folded?.beforeMeta, { status: 'open' })
  assert.deepEqual(folded?.afterMeta, { status: 'done' })
})

test('wal store reuses blob hash and skips empty path', () => {
  const store = new WalStore().open(':memory:')
  const actor = { kind: 'user' as const }
  const a = store.append({ path: '/pages/a', op: 'content', actor, title: 'a', beforeText: '', afterText: '同' })
  const b = store.append({ path: '/pages/b', op: 'content', actor, title: 'b', beforeText: '', afterText: '同' })
  assert.equal(a?.afterBlob, b?.afterBlob)
  assert.equal(store.append({ path: '  ', op: 'content', actor, title: 'x', afterText: 'y' }), null)
})

test('different paths and different turns do not fold', () => {
  const store = new WalStore().open(':memory:')
  store.append({ path: '/pages/a', op: 'content', actor: { kind: 'user' }, title: 'a', beforeText: '', afterText: '1' })
  store.append({ path: '/pages/b', op: 'content', actor: { kind: 'user' }, title: 'b', beforeText: '', afterText: '1' })
  store.append({
    path: '/pages/a',
    op: 'content',
    actor: { kind: 'agent', sessionId: 's', turn: 1 },
    title: 'a',
    beforeText: '1',
    afterText: '2',
  })
  store.append({
    path: '/pages/a',
    op: 'content',
    actor: { kind: 'agent', sessionId: 's', turn: 2 },
    title: 'a',
    beforeText: '2',
    afterText: '3',
  })
  assert.equal(store.listAll().length, 4)
  assert.equal(store.headSeq('/pages/a'), 4)
})

test('markReverted moves head back; a new write after both reverted starts a new seq', () => {
  const store = new WalStore().open(':memory:')
  const actor = { kind: 'user' as const }
  store.append({ path: '/pages/p1', op: 'content', actor, title: 'p', beforeText: '', afterText: '一' })
  store.append({
    path: '/pages/p1',
    op: 'content',
    actor: { kind: 'agent', sessionId: 's', turn: 1 },
    title: 'p',
    beforeText: '一',
    afterText: '二',
  })
  store.markReverted(2)
  assert.equal(store.headSeq('/pages/p1'), 1)
  store.markReverted(1)
  assert.equal(store.headSeq('/pages/p1'), null)
  const next = store.append({ path: '/pages/p1', op: 'content', actor, title: 'p', beforeText: '一', afterText: '三' })
  assert.equal(next?.seq, 3)
  assert.equal(next?.folded, undefined)
})

test('trim drops oldest entries past the cap', () => {
  const store = new WalStore().open(':memory:')
  const actor = { kind: 'user' as const }
  for (let i = 0; i < WAL_MAX_ENTRIES + 5; i += 1) {
    store.append({ path: `/pages/p${i}`, op: 'content', actor, title: String(i), beforeText: '', afterText: `v${i}` })
  }
  assert.equal(store.listAll().length, WAL_MAX_ENTRIES)
  assert.equal(store.headEntry('/pages/p0'), null)
  assert.ok(store.headEntry(`/pages/p${WAL_MAX_ENTRIES + 4}`))
})

test('human writeContent folds; agent overwrite then human revert of agent diverges', async () => {
  const { db, turns, rows } = pagesDb()
  rows.set('p1', { id: 'p1', title: '页', notes: '', status: 'open' })
  await db.writeContent('/pages/p1', '人1')
  await db.writeContent('/pages/p1', '人2')
  assert.equal(turns.store.listAll().length, 1)
  assert.equal(turns.store.headEntry('/pages/p1')?.actor.kind, 'user')
  await runWithSession('agent-a', async () => {
    await db.writeContent('/pages/p1', '模型')
  })
  assert.equal(turns.store.listAll().length, 2)
  await db.writeContent('/pages/p1', '人又改了')
  const blocked = await turns.revert('agent-a', 1, '/pages/p1', 'content')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.results[0]?.error, 'diverged')
  assert.equal(asContentText((await db.content('/pages/p1')).value), '人又改了')
})

test('agent content revert accepts CRLF vs LF as the same snapshot', async () => {
  const { db, turns, rows } = pagesDb()
  rows.set('p1', { id: 'p1', title: '页', notes: '旧', status: 'open' })
  await runWithSession('agent-a', async () => {
    await db.writeContent('/pages/p1', '新\r\n行')
  })
  rows.set('p1', { ...rows.get('p1')!, notes: '新\n行' })
  const done = await turns.revert('agent-a', 1, '/pages/p1', 'content')
  assert.equal(done.ok, true)
  assert.equal(asContentText((await db.content('/pages/p1')).value), '旧')
})

test('create update delete through DatabaseService round-trip on revert', async () => {
  const { db, turns, rows } = pagesDb()
  rows.set('keep', { id: 'keep', title: 'keep', notes: '', status: 'open' })
  await runWithSession('agent-a', async () => {
    await db.create('/pages', [{ title: 'made', notes: '新页正文' }])
    await db.update('/pages/keep', { status: 'done', title: 'keep' })
    await db.remove('/pages', { ids: ['keep'] })
  })
  const made = [...rows.keys()].find((id) => id !== 'keep')
  assert.ok(made)
  const done = await turns.revert('agent-a', 1)
  assert.equal(done.ok, true, JSON.stringify(done.results))
  assert.equal(rows.has(made!), false)
  assert.equal(rows.get('keep')?.status, 'open')
  assert.equal(rows.get('keep')?.id, 'keep')
  assert.equal(asContentText((await db.content('/pages/keep')).value), '')
})

test('revert does not append new wal rows', async () => {
  const { db, turns, rows } = pagesDb()
  await runWithSession('agent-a', async () => {
    await db.create('/pages', [{ title: 'x', notes: 'body' }])
  })
  const before = turns.store.listAll().length
  const done = await turns.revert('agent-a', 1)
  assert.equal(done.ok, true)
  assert.equal(turns.store.listAll().length, before)
  assert.equal(turns.store.listAll()[0]?.reverted, true)
  assert.equal(rows.size, 0)
})

test('two sessions keep separate turns; reverting one does not touch the other path', async () => {
  const { db, turns, rows, sessions } = pagesDb()
  rows.set('a', { id: 'a', title: 'a', notes: 'A0', status: 'open' })
  rows.set('b', { id: 'b', title: 'b', notes: 'B0', status: 'open' })
  sessions.peek = (id: string) => ({ events: [{ type: 'turn/start', turn: id === 's2' ? 2 : 1 }] })
  await runWithSession('s1', async () => {
    await db.writeContent('/pages/a', 'A1')
  })
  await runWithSession('s2', async () => {
    await db.writeContent('/pages/b', 'B1')
  })
  const one = await turns.revert('s1', 1)
  assert.equal(one.ok, true)
  assert.equal(asContentText((await db.content('/pages/a')).value), 'A0')
  assert.equal(asContentText((await db.content('/pages/b')).value), 'B1')
})

test('same-title pages keep distinct wal rows', async () => {
  const { db, turns } = pagesDb()
  await runWithSession('agent-a', async () => {
    await db.create('/pages', [
      { title: '你好', notes: '1' },
      { title: '你好', notes: '2' },
      { title: '你好', notes: '3' },
    ])
  })
  const files = turns.summaries('agent-a', 1)
  assert.equal(files.filter((row) => row.kind === 'create').length, 3)
  assert.equal(new Set(files.map((row) => row.path)).size, 3)
})

test('db_content tool records wal and revert writes the page back', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
    broadcast() {}
  }
  new HttpStub(ctx)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  const db = ctx.get('database') as DatabaseService
  const turns = ctx.get('contentTurns') as ContentTurnService
  const rows = new Map<string, Record<string, unknown>>([
    ['p1', { id: 'p1', title: '页', notes: '旧稿' }],
  ])
  db.register({
    id: 'pages',
    path: '/pages',
    schema: {
      contentField: 'notes',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        notes: { type: 'file', writable: true },
      },
    },
    records: { update: true, create: true, delete: true },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
    create: async () => [],
    remove: async (query) => query.ids ?? [],
  })
  const sessions = {
    peek: () => ({ events: [{ type: 'turn/start', turn: 4 }] }),
    append: async () => undefined,
  }
  const get = turns.ctx.get.bind(turns.ctx)
  turns.ctx.get = ((name: string) => (name === 'sessions' ? sessions : get(name))) as typeof turns.ctx.get
  await runWithSession('tool-sess', async () => {
    await ctx.tools.invoke('db_content', { path: '/pages/p1', command: 'write', value: '工具写的' })
  })
  assert.equal(asContentText((await db.content('/pages/p1')).value), '工具写的')
  const done = await turns.revert('tool-sess', 4, '/pages/p1', 'content')
  assert.equal(done.ok, true, JSON.stringify(done.results))
  assert.equal(asContentText((await db.content('/pages/p1')).value), '旧稿')
})
