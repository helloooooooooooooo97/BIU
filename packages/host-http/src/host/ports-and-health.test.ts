import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { WebSocket } from 'ws'
import * as realtimePlugin from '@biu/host-drivers-local/realtime'
import * as blobPlugin from '@biu/host-drivers-local/blob'
import { getRealtimePort } from '@biu/host-plugin-loader/ports'
import * as http from './index.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('host-http exposes /healthz and /readyz and transitions /readyz to 503 on beginDrain()', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-http-health-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'public'))
  writeFileSync(join(dir, 'public', 'index.html'), '<html></html>')

  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(realtimePlugin)
  await ctx.plugin(blobPlugin, { rootDir: join(dir, 'assets') })
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir: join(dir, 'public'), sharePort: 0 })
  const port = await ready
  const origin = `http://127.0.0.1:${port}`

  try {
    const h1 = await fetch(`${origin}/healthz`)
    assert.equal(h1.status, 200)
    assert.deepEqual(await h1.json(), { ok: true, draining: false })

    const r1 = await fetch(`${origin}/readyz`)
    assert.equal(r1.status, 200)
    assert.deepEqual(await r1.json(), { ok: true, ready: true, draining: false })

    ctx.http.beginDrain()

    const h2 = await fetch(`${origin}/healthz`)
    assert.equal(h2.status, 200)
    assert.deepEqual(await h2.json(), { ok: true, draining: true })

    const r2 = await fetch(`${origin}/readyz`)
    assert.equal(r2.status, 503)
    assert.deepEqual(await r2.json(), { ok: false, ready: false, draining: true })
  } finally {
    await ctx.fiber.dispose()
  }
})

test('host-http routes WS broadcast and WS tickets through RealtimeBusPort', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-http-realtime-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'public'))
  writeFileSync(join(dir, 'public', 'index.html'), '<html></html>')

  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(realtimePlugin)
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir: join(dir, 'public'), sharePort: 0 })
  const port = await ready

  const realtime = getRealtimePort(ctx)!
  const published: unknown[] = []
  const unsub = realtime.subscribe('biu:ws:broadcast', (msg) => published.push(msg.payload))

  const ticket = realtime.issueWsTicket({
    accountId: 'acc-ws',
    workspaceId: 'ws-ws',
    sessionToken: '',
  }) as { ticket: string }

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?wsTicket=${encodeURIComponent(ticket.ticket)}`)
  const messages: Array<{ type: string; payload: unknown }> = []
  await new Promise<void>((resolve, reject) => {
    ws.once('error', reject)
    ws.on('message', (raw) => {
      const parsed = JSON.parse(String(raw))
      messages.push(parsed)
      if (parsed.type === 'hello') resolve()
    })
  })

  try {
    const receivedDatabase = new Promise<void>((resolve) => {
      ws.on('message', (raw) => {
        const parsed = JSON.parse(String(raw))
        if (parsed.type === 'database') resolve()
      })
    })
    ctx.http.broadcast('database', { ts: 123, workspaceId: 'ws-ws' }, 'ws-ws', 'acc-ws')
    await receivedDatabase
    assert.equal(published.length, 1)
    assert.equal(realtime.consumeWsTicket(ticket.ticket), null, 'ws ticket should be consumed on handshake')
  } finally {
    unsub()
    ws.close()
    await ctx.fiber.dispose()
  }
})
