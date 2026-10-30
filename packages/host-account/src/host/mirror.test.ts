import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { Context } from 'cordis'
import { Service } from 'cordis'
import type { SessionRecord } from '@biu/type-session'
import { applySnapshot, exchangeSnapshot, takeSnapshot } from './mirror.ts'

test('cache keeps local sessions and replaces cloud sessions', async () => {
  const ctx = new Context()
  const saved: SessionRecord[] = []
  const rows = new Map<string, { id: string; updatedAt: number; title: string }>([
    ['local', { id: 'local', updatedAt: 50, title: 'keep' }],
    ['cloud', { id: 'cloud', updatedAt: 10, title: 'old-cloud' }],
    ['gone', { id: 'gone', updatedAt: 10, title: 'deleted-on-cloud' }],
  ])
  const remote = new Set(['/agents\tcloud', '/agents\tgone'])
  class Places extends Service {
    constructor(ctx: Context) {
      super(ctx, 'account')
    }
    isRemote(collection: string, id: string) {
      return remote.has(`${collection}\t${id}`)
    }
    markRemote(collection: string, id: string) {
      remote.add(`${collection}\t${id}`)
    }
    clearPlace(collection: string, id: string) {
      remote.delete(`${collection}\t${id}`)
    }
    remoteIds(collection: string) {
      return [...remote].filter((key) => key.startsWith(`${collection}\t`)).map((key) => key.split('\t')[1]!)
    }
  }
  class Store extends Service {
    constructor(ctx: Context) {
      super(ctx, 'sessionStore')
    }
    listSummaries() {
      return Promise.resolve([...rows.values()])
    }
    load(id: string) {
      const row = rows.get(id)
      if (!row) return Promise.resolve(null)
      return Promise.resolve({
        id,
        version: 1,
        events: [{ type: 'session/open', version: 1, seq: 0, ts: row.updatedAt }],
        config: { title: row.title },
      } as SessionRecord)
    }
    save(record: SessionRecord & { updatedAt?: number }) {
      saved.push(record)
      rows.set(record.id, {
        id: record.id,
        updatedAt: Number(record.updatedAt) || 0,
        title: record.config?.title || record.id,
      })
      return Promise.resolve()
    }
    delete(id: string) {
      rows.delete(id)
      return Promise.resolve()
    }
  }
  await ctx.plugin(Places)
  await ctx.plugin(Store)
  await applySnapshot(ctx, {
    sessions: [
      { id: 'local', version: 1, updatedAt: 80, events: [], config: { title: 'should-not-win' } },
      { id: 'cloud', version: 1, updatedAt: 30, events: [], config: { title: 'from-cloud' } },
      { id: 'fresh', version: 1, updatedAt: 20, events: [], config: { title: 'new-cloud' } },
    ],
    collections: [],
  }, 'cache')
  assert.deepEqual(saved.map((item) => item.id), ['cloud', 'fresh'])
  assert.equal(rows.get('local')?.title, 'keep')
  assert.equal(rows.get('cloud')?.title, 'from-cloud')
  assert.equal(rows.has('gone'), false)
  const snapshot = await takeSnapshot(ctx)
  assert.equal(snapshot.sessions.find((item) => item.id === 'fresh')?.config?.title, 'new-cloud')
})

test('desktop caches cloud rows but does not copy local records onto the cloud', () => {
  const mirror = readFileSync(resolve(import.meta.dirname, './mirror.ts'), 'utf8')
  const account = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(mirror, /markRemote/)
  assert.match(mirror, /isRemote/)
  assert.doesNotMatch(mirror, /publishToCloud/)
  assert.doesNotMatch(mirror, /cloudCopyId/)
  assert.doesNotMatch(account, /record_cloud_copy/)
  assert.match(mirror, /workspaceLocation/)
})

test('replica snapshot exchange does not run without a cloud workspace', async () => {
  const previous = globalThis.fetch
  let called = 0
  globalThis.fetch = (async () => {
    called += 1
    return new Response('{}')
  }) as typeof fetch
  try {
    await exchangeSnapshot(new Context(), 'http://127.0.0.1:9', 'token', 'ada', '')
    assert.equal(called, 0)
  } finally {
    globalThis.fetch = previous
  }
})
