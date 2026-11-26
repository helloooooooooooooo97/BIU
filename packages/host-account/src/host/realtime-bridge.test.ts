import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import * as realtimePlugin from '@biu/host-drivers-local/realtime'
import * as http from '@biu/host-http'
import { getRealtimePort } from '@biu/host-plugin-loader/ports'
import * as account from './index.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('host-account bridges authorization invalidation over RealtimeBusPort and omits desktop cloud-link mutations in cloud mode', async () => {
  const prevOnline = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  const dir = mkdtempSync(join(tmpdir(), 'biu-account-realtime-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'public'))
  writeFileSync(join(dir, 'public', 'index.html'), '<html></html>')

  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(realtimePlugin, { nodeId: 'node-a' })
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir: join(dir, 'public'), sharePort: 0 })
  await ctx.plugin(account, { sqlitePath: join(dir, 'biu.sqlite') })
  const port = await ready
  const origin = `http://127.0.0.1:${port}`

  try {
    const realtime = getRealtimePort(ctx)!
    const published: number[] = []
    const unsub = realtime.subscribe('biu:authz:invalidate', () => published.push(Date.now()))

    const accountSvc = ctx.get('account' as never) as unknown as account.AccountService
    accountSvc.store.authorization.invalidateAll()
    assert.equal(published.length, 1, 'local invalidation must publish to RealtimeBusPort')

    // Cloud mode returns lightweight available=false stub and does NOT mount desktop-only cloud mutation routes
    const cloudProbe = await fetch(`${origin}/api/account/cloud`)
    assert.equal(cloudProbe.status, 200)
    assert.deepEqual(await cloudProbe.json(), { available: false, connected: false, configuredOrigin: '' })

    const desktopMutation = await fetch(`${origin}/api/account/cloud/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'pw' }),
    })
    assert.equal(desktopMutation.status, 404, 'cloud-api must not register desktop cloud-link mutation routes')

    unsub()
  } finally {
    await ctx.fiber.dispose()
    if (prevOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = prevOnline
  }
})
