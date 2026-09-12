import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { runWithSession } from '@biu/host-sessions/scope'
import { ContentTurnService } from './content-turn-service.ts'

test('parallel recordEdit of five 你好 pages publishes every file', async () => {
  const published: Array<Array<{ path: string }>> = []
  const sessions = {
    peek: () => ({ events: [{ type: 'turn/start', turn: 1 }] }),
    append: async (_id: string, body: { files?: Array<{ path: string }> }) => {
      await new Promise((resolve) => setTimeout(resolve, 8))
      if (body.files) published.push(body.files)
    },
  }
  const ctx = new Context()
  const db = {
    content: async () => ({ value: '' }),
    writeContent: async () => undefined,
  }
  const service = new ContentTurnService(ctx, db).open(':memory:')
  const get = service.ctx.get.bind(service.ctx)
  service.ctx.get = ((name: string) => (name === 'sessions' ? sessions : get(name))) as typeof service.ctx.get
  await runWithSession('sess-hello', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((n) => service.recordEdit(`/pages/p${n}`, '', '你好', '你好')))
  })
  const last = published.at(-1)?.map((file) => file.path) ?? []
  assert.deepEqual(last.sort(), ['/pages/p1', '/pages/p2', '/pages/p3', '/pages/p4', '/pages/p5'])
  assert.equal(service.summaries('sess-hello', 1).length, 5)
})

test('revert writes the first before and rejects empty snapshots', async () => {
  const pages = new Map<string, string>([['/pages/p1', '你好']])
  const ctx = new Context()
  const sessions = {
    peek: () => ({ events: [{ type: 'turn/start', turn: 1 }] }),
    append: async () => undefined,
  }
  const db = {
    content: async (path: string) => ({ value: pages.get(path) ?? '' }),
    writeContent: async (path: string, value: unknown) => {
      pages.set(path, String(value ?? ''))
      return { value: pages.get(path) }
    },
  }
  const service = new ContentTurnService(ctx, db).open(':memory:')
  const get = service.ctx.get.bind(service.ctx)
  service.ctx.get = ((name: string) => (name === 'sessions' ? sessions : get(name))) as typeof service.ctx.get
  await runWithSession('sess-hello', async () => {
    await service.recordEdit('/pages/p1', '', '你好', '你好')
  })
  const miss = await service.revert('sess-hello', 9)
  assert.equal(miss.ok, false)
  assert.equal(miss.results[0]?.error, 'missing')
  const done = await service.revert('sess-hello', 1, '/pages/p1', 'content')
  assert.equal(done.ok, true)
  assert.equal(pages.get('/pages/p1'), '')
  assert.equal(service.summaries('sess-hello', 1)[0]?.reverted, true)
})

test('revert create/update/delete in reverse', async () => {
  const rows = new Map<string, Record<string, unknown>>([
    ['/pages/keep', { id: 'keep', title: 'keep', status: 'open' }],
  ])
  const created: string[] = []
  const ctx = new Context()
  const sessions = {
    peek: () => ({ events: [{ type: 'turn/start', turn: 1 }] }),
    append: async () => undefined,
  }
  const db = {
    content: async () => ({ value: '' }),
    writeContent: async () => undefined,
    read: async (path: string) => ({ value: rows.get(path) }),
    update: async (path: string, content: unknown) => {
      const patch = content as Record<string, unknown>
      const cur = rows.get(path)
      if (!cur) throw new Error('missing')
      rows.set(path, { ...cur, ...patch })
    },
    create: async (_path: string, records: unknown) => {
      const rec = (records as Record<string, unknown>[])[0]!
      created.push(String(rec.title ?? ''))
      rows.set('/pages/new', { id: 'new', ...rec })
    },
    remove: async (_path: string, query: { ids: string[] }) => {
      for (const id of query.ids) rows.delete(`/pages/${id}`)
    },
  }
  const service = new ContentTurnService(ctx, db).open(':memory:')
  const get = service.ctx.get.bind(service.ctx)
  service.ctx.get = ((name: string) => (name === 'sessions' ? sessions : get(name))) as typeof service.ctx.get
  await runWithSession('sess-ops', async () => {
    await service.recordCreate('/pages/made', 'made', { id: 'made', title: 'made' })
    rows.set('/pages/made', { id: 'made', title: 'made' })
    await service.recordUpdate('/pages/keep', 'keep', { status: 'open' }, { status: 'done' })
    rows.set('/pages/keep', { id: 'keep', title: 'keep', status: 'done' })
    await service.recordDelete('/pages/gone', 'gone', { id: 'gone', title: 'gone' })
    rows.delete('/pages/gone')
  })
  const done = await service.revert('sess-ops', 1)
  assert.equal(done.ok, true)
  assert.equal(rows.has('/pages/made'), false)
  assert.equal(rows.get('/pages/keep')?.status, 'open')
  assert.deepEqual(created, ['gone'])
})
