import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { test } from 'vitest'
import { Context } from 'cordis'
import { HttpService, maxBodyBytesForPath, PayloadTooLargeError, readBody } from './index.ts'

function fakeRequest(chunks: Buffer[]): IncomingMessage {
  const emitter = new EventEmitter() as IncomingMessage
  emitter.resume = () => emitter
  queueMicrotask(() => {
    for (const chunk of chunks) emitter.emit('data', chunk)
    emitter.emit('end')
  })
  return emitter
}

function fakeSocket() {
  const sent: string[] = []
  let closed: { code: number; reason: string } | null = null
  const sock = {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => sent.push(data),
    close: (code: number, reason: string) => {
      closed = { code, reason }
      sock.readyState = 3
    },
    terminate: () => {
      sock.readyState = 3
    },
    ping: () => {},
  }
  return { sock, sent, getClosed: () => closed }
}

test('readBody enforces maxBytes and rejects with PayloadTooLargeError (413)', async () => {
  const ok = await readBody(fakeRequest([Buffer.from('hello '), Buffer.from('world')]), 32)
  assert.equal(ok.toString('utf8'), 'hello world')

  await assert.rejects(
    () => readBody(fakeRequest([Buffer.alloc(64, 'a'), Buffer.alloc(64, 'b')]), 100),
    (err: unknown) => err instanceof PayloadTooLargeError && err.status === 413 && err.maxBytes === 100,
  )
})

test('maxBodyBytesForPath grants higher cap to upload/asset routes', () => {
  const prev = process.env.BIU_HTTP_MAX_BODY_BYTES
  delete process.env.BIU_HTTP_MAX_BODY_BYTES
  try {
    assert.equal(maxBodyBytesForPath('/api/chat/config'), 10 * 1024 * 1024)
    assert.equal(maxBodyBytesForPath('/api/agents/123/artifacts'), 50 * 1024 * 1024)
    assert.equal(maxBodyBytesForPath('/api/assets/upload'), 50 * 1024 * 1024)
  } finally {
    if (prev !== undefined) process.env.BIU_HTTP_MAX_BODY_BYTES = prev
  }
})

test('broadcast uses tenant indexes with zero synchronous SQLite lookups on hot path', () => {
  const ctx = new Context()
  let dbCalls = 0
  ;(ctx as unknown as { account: unknown }).account = {
    store: {
      accountByToken: () => {
        dbCalls += 1
        return null
      },
      isMember: () => {
        dbCalls += 1
        return true
      },
    },
  }
  const http = new HttpService(ctx, {
    port: 0,
    host: '127.0.0.1',
    publicDir: '',
    fallbackPort: true,
    sharePort: 0,
    shareHost: '127.0.0.1',
  })

  const alice = fakeSocket()
  const bob = fakeSocket()
  const carol = fakeSocket()
  const reg = (http as unknown as {
    registerSocket: (s: unknown, meta: { accountId: string; workspaceId: string; token: string }) => void
  }).registerSocket.bind(http)

  reg(alice.sock, { accountId: 'acct-a', workspaceId: 'ws-1', token: 'tok-a' })
  reg(bob.sock, { accountId: 'acct-b', workspaceId: 'ws-1', token: 'tok-b' })
  reg(carol.sock, { accountId: 'acct-c', workspaceId: 'ws-2', token: 'tok-c' })

  // Session event targets only Alice (ws-1 + acct-a), zero DB queries
  http.broadcast('session', { sessionId: 's1', event: { type: 'assistant/chunk' } }, 'ws-1', 'acct-a')
  assert.equal(alice.sent.length, 1)
  assert.equal(bob.sent.length, 0)
  assert.equal(carol.sent.length, 0)
  assert.equal(dbCalls, 0)

  // Database event targets all members of ws-1 (Alice + Bob), not Carol, zero DB queries
  http.broadcast('database', { changed: true }, 'ws-1', 'acct-a')
  assert.equal(alice.sent.length, 2)
  assert.equal(bob.sent.length, 1)
  assert.equal(carol.sent.length, 0)
  assert.equal(dbCalls, 0)

  // disconnectTenant closes only Bob's ws-1 socket
  http.disconnectTenant('acct-b', 'ws-1')
  assert.deepEqual(bob.getClosed(), { code: 4403, reason: 'membership revoked' })
  assert.equal(alice.getClosed(), null)
  assert.equal(carol.getClosed(), null)
})
