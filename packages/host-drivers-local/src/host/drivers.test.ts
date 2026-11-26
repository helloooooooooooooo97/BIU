import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { openSqlite } from '@biu/host-plugin-loader'
import { getBlobPort, getRealtimePort, getStoragePort, getTaskDispatchPort } from '@biu/host-plugin-loader/ports'
import * as realtimePlugin from './realtime-memory.ts'
import * as blobPlugin from './blob-fs.ts'
import * as storagePlugin from './storage-sqlite.ts'
import * as taskDispatchPlugin from './task-dispatch-local.ts'
import { wrapSqliteDatabase } from './storage-sqlite.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('MemoryRealtimeDriver supports pub/sub, single-use WS tickets, rate limits, ephemeral KV, and locks', async () => {
  const ctx = new Context()
  await ctx.plugin(realtimePlugin, { nodeId: 'node-test-1' })
  const realtime = getRealtimePort(ctx)
  assert.ok(realtime)
  assert.equal(realtime.driver, 'memory')
  assert.equal(realtime.nodeId, 'node-test-1')

  const received: unknown[] = []
  const unsub = realtime.subscribe('biu:test', (msg) => {
    received.push({ payload: msg.payload, originNodeId: msg.originNodeId })
  })
  await realtime.publish('biu:test', { hello: 'world' })
  unsub()
  await realtime.publish('biu:test', { ignored: true })
  assert.deepEqual(received, [{ payload: { hello: 'world' }, originNodeId: 'node-test-1' }])

  const now = 1_700_000_000_000
  const issued = await realtime.issueWsTicket({
    accountId: 'acc-1',
    workspaceId: 'ws-1',
    sessionToken: 'tok-1',
    ttlMs: 10_000,
    now,
  })
  assert.equal(issued.workspaceId, 'ws-1')
  const consumed = await realtime.consumeWsTicket(issued.ticket, now + 1000)
  assert.deepEqual(consumed, { accountId: 'acc-1', workspaceId: 'ws-1', sessionToken: 'tok-1', exp: now + 10_000 })
  assert.equal(await realtime.consumeWsTicket(issued.ticket, now + 1000), null, 'ticket must be single-use')

  const r1 = await realtime.checkRateLimit('login:1.2.3.4', { windowMs: 60_000, maxAttempts: 2, now })
  const r2 = await realtime.checkRateLimit('login:1.2.3.4', { windowMs: 60_000, maxAttempts: 2, now: now + 100 })
  const r3 = await realtime.checkRateLimit('login:1.2.3.4', { windowMs: 60_000, maxAttempts: 2, now: now + 200 })
  assert.equal(r1.allowed, true)
  assert.equal(r2.allowed, true)
  assert.equal(r3.allowed, false)
  assert.ok(r3.retryAfterSec >= 1)

  await realtime.setEphemeral('presence:ws-1:u-1', 'online', 5_000)
  assert.equal(await realtime.getEphemeral('presence:ws-1:u-1'), 'online')
  await realtime.deleteEphemeral('presence:ws-1:u-1')
  assert.equal(await realtime.getEphemeral('presence:ws-1:u-1'), null)

  assert.equal(await realtime.acquireLock('edit:p1', 'user-a', 5_000), true)
  assert.equal(await realtime.acquireLock('edit:p1', 'user-b', 5_000), false)
  assert.equal(await realtime.releaseLock('edit:p1', 'user-b'), false)
  assert.equal(await realtime.releaseLock('edit:p1', 'user-a'), true)
  assert.equal(await realtime.acquireLock('edit:p1', 'user-b', 5_000), true)
})

test('LocalFsBlobDriver supports CRUD, CAS dedup, path traversal guard, and signed asset tickets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-blob-driver-'))
  dirs.push(dir)
  const ctx = new Context()
  await ctx.plugin(blobPlugin, { rootDir: dir })
  const blob = getBlobPort(ctx)
  assert.ok(blob)
  assert.equal(blob.driver, 'local-fs')

  const meta = await blob.put('docs/hello.txt', 'hello biu')
  assert.equal(meta.key, 'docs/hello.txt')
  assert.equal(meta.size, 9)
  assert.equal((await blob.get('docs/hello.txt'))?.toString('utf8'), 'hello biu')
  assert.deepEqual(await blob.list('docs/'), ['docs/hello.txt'])

  await assert.rejects(() => blob.get('../etc/passwd'), /invalid blob key/)

  const cas1 = await blob.putCas(Buffer.from('same-bytes'), { ext: '.png' })
  const cas2 = await blob.putCas(Buffer.from('same-bytes'), { ext: '.png' })
  assert.equal(cas1.name, cas2.name)
  assert.equal(cas1.hash, cas2.hash)
  assert.equal((await blob.getCas(cas1.name))?.toString('utf8'), 'same-bytes')

  const now = 1_700_000_000_000
  const ticket = blob.signAssetTicket({ accountId: 'u1', workspaceId: 'ws1', ttlMs: 60_000, now })
  const url = blob.resolveDownloadUrl(cas1.name, ticket)
  const parsed = new URL(`http://localhost${url}`)
  assert.deepEqual(blob.verifyAssetTicket(parsed.searchParams, now + 1000), { accountId: 'u1', workspaceId: 'ws1' })
  assert.equal(blob.verifyAssetTicket(parsed.searchParams, now + 60_001), null)

  assert.equal(await blob.delete('docs/hello.txt'), true)
  assert.equal(await blob.head('docs/hello.txt'), null)
})

test('SqliteStorageDriver wraps node:sqlite as async SqlExecutor with transaction and savepoint rollback', async () => {
  const ctx = new Context()
  await ctx.plugin(storagePlugin)
  const storage = getStoragePort(ctx)
  assert.ok(storage)
  assert.equal(storage.driver, 'sqlite')
  assert.equal(storage.dialect, 'sqlite')

  const rawDb = openSqlite(':memory:')
  const exec = wrapSqliteDatabase(rawDb, true)
  await exec.exec('CREATE TABLE items (id TEXT PRIMARY KEY, val TEXT)')
  await exec.exec('INSERT INTO items (id, val) VALUES (?, ?)', ['a', '1'])
  assert.deepEqual(await exec.get('SELECT * FROM items WHERE id = ?', ['a']), { id: 'a', val: '1' })

  await exec.transaction(async (tx) => {
    await tx.exec('INSERT INTO items (id, val) VALUES (?, ?)', ['b', '2'])
    await assert.rejects(
      tx.transaction(async (nested) => {
        await nested.exec('INSERT INTO items (id, val) VALUES (?, ?)', ['c', '3'])
        throw new Error('rollback nested')
      }),
      /rollback nested/,
    )
  })
  const rows = await exec.query<{ id: string }>('SELECT id FROM items ORDER BY id')
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b'])
  await exec.close()
})

test('LocalTaskDispatchDriver dispatches tasks to registered workers and enforces exclusive leases', async () => {
  const ctx = new Context()
  await ctx.plugin(taskDispatchPlugin)
  const dispatcher = getTaskDispatchPort(ctx)
  assert.ok(dispatcher)
  assert.equal(dispatcher.driver, 'local-in-process')

  const handled: string[] = []
  const done = new Promise<void>((resolve) => {
    dispatcher.registerWorker('agent.turn', (task) => {
      handled.push(`${task.workspaceId}:${task.sessionId}`)
      resolve()
    })
  })

  const res = await dispatcher.dispatch({
    kind: 'agent.turn',
    workspaceId: 'ws-1',
    accountId: 'u-1',
    sessionId: 'sess-1',
    payload: { prompt: 'hi' },
  })
  assert.equal(res.accepted, true)
  await done
  assert.deepEqual(handled, ['ws-1:sess-1'])

  const unrouted = await dispatcher.dispatch({
    kind: 'unknown.kind',
    workspaceId: 'ws-1',
    accountId: 'u-1',
    payload: {},
  })
  assert.equal(unrouted.accepted, false)

  const lease = await dispatcher.acquireLease('sess-1', 'worker-a', 5_000)
  assert.ok(lease)
  assert.equal(await dispatcher.acquireLease('sess-1', 'worker-b', 5_000), null)
  assert.equal(await dispatcher.renewLease('sess-1', 'worker-a', 10_000), true)
  assert.equal(await dispatcher.releaseLease('sess-1', 'worker-b'), false)
  assert.equal(await dispatcher.releaseLease('sess-1', 'worker-a'), true)
  assert.ok(await dispatcher.acquireLease('sess-1', 'worker-b', 5_000))
})
