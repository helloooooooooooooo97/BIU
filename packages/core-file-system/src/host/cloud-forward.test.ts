import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import * as http from '@biu/host-http'
import * as account from '@biu/host-account'
import * as tools from '@biu/host-tools'
import { apply as applyFileSystem } from './index.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

type Captured = { method: string; url: string; workspaceId: string; body: Record<string, unknown> }

function readBody(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      } catch {
        resolve({})
      }
    })
  })
}

test('desktop cloud writes send the workspace header and forward bulk delete, restore, content, and shares', async () => {
  const previousOnline = process.env.BIU_ONLINE
  const previousOrigin = process.env.BIU_REMOTE_ORIGIN
  process.env.BIU_ONLINE = '0'
  const captured: Captured[] = []
  const remote = createServer(async (req, res) => {
    const url = req.url ?? ''
    const workspaceId = String(req.headers['x-biu-workspace-id'] ?? '')
    const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req)
    captured.push({ method: req.method ?? 'GET', url, workspaceId, body })
    res.setHeader('content-type', 'application/json')
    if (url === '/api/account/login') {
      res.end(JSON.stringify({ id: 'remote-ada', name: 'ada@example.com', token: 'remote-token', workspaceId: 'cloud-ws' }))
      return
    }
    if (url === '/api/account/workspaces') {
      res.end(JSON.stringify({ workspaces: [{ id: 'cloud-ws', name: '云端空间', role: 'owner' }] }))
      return
    }
    if (url === '/api/db/create') {
      res.end(JSON.stringify({ items: [{ value: { id: 'p1', title: '云端页' } }] }))
      return
    }
    if (url.startsWith('/api/db/content')) {
      res.end(JSON.stringify({ kind: 'content', path: '/pages/p1', value: 'from-cloud', version: 2 }))
      return
    }
    if (url === '/api/db/delete' || url === '/api/db/restore' || url === '/api/db/shares' || url.startsWith('/api/db/shares?')) {
      res.end(JSON.stringify({ ok: true, share: url.includes('shares') ? { token: 's1', url: '/share/s1' } : undefined }))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise<void>((resolve, reject) => {
    remote.once('error', reject)
    remote.listen(0, '127.0.0.1', () => resolve())
  })
  const remoteAddress = remote.address()
  assert.ok(remoteAddress && typeof remoteAddress !== 'string')
  process.env.BIU_REMOTE_ORIGIN = `http://127.0.0.1:${remoteAddress.port}`
  const dir = mkdtempSync(join(tmpdir(), 'biu-cloud-forward-'))
  dirs.push(dir)
  const previousHome = process.env.BIU_HOME
  process.env.BIU_HOME = dir
  const publicDir = join(dir, 'public')
  mkdirSync(publicDir)
  writeFileSync(join(publicDir, 'index.html'), '<html></html>')
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  const httpFiber = await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir, sharePort: 0 })
  const accountFiber = await ctx.plugin(account, { sqlitePath: join(dir, 'local.sqlite') })
  await ctx.plugin(tools)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  const port = await ready
  const origin = `http://127.0.0.1:${port}`
  try {
    const registered = (await fetch(`${origin}/api/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret1' }),
    }).then((res) => res.json())) as { token: string }
    const auth = {
      authorization: `Bearer ${registered.token}`,
      'content-type': 'application/json',
    }
    assert.equal((await fetch(`${origin}/api/account/cloud/login`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret1' }),
    })).status, 200)
    await fetch(`${origin}/api/account/workspaces`, { headers: auth })
    assert.equal((await fetch(`${origin}/api/account/active`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ workspaceId: 'cloud-ws' }),
    })).status, 200)
    const headers = { ...auth, 'x-biu-workspace-id': 'cloud-ws' }

    captured.length = 0
    const created = await fetch(`${origin}/api/db/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: '/pages', records: [{ title: '云端页' }] }),
    })
    assert.equal(created.status, 200)
    const createHit = captured.find((item) => item.url === '/api/db/create')
    assert.equal(createHit?.workspaceId, 'cloud-ws')
    assert.equal(createHit?.method, 'POST')

    captured.length = 0
    const written = await fetch(`${origin}/api/db/content`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: '/pages/p1', value: 'hello' }),
    })
    assert.equal(written.status, 200)
    assert.equal(captured.some((item) => item.url === '/api/db/content' && item.workspaceId === 'cloud-ws'), true)

    captured.length = 0
    const read = await fetch(`${origin}/api/db/content?path=${encodeURIComponent('/pages/p1')}`, { headers })
    assert.equal(read.status, 200)
    assert.equal(captured.some((item) => item.url.includes('/api/db/content') && item.method === 'GET' && item.workspaceId === 'cloud-ws'), true)

    captured.length = 0
    const deleted = await fetch(`${origin}/api/db/delete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: '/pages', ids: ['p1', 'p2'] }),
    })
    assert.equal(deleted.status, 200)
    const deleteHit = captured.find((item) => item.url === '/api/db/delete')
    assert.equal(deleteHit?.workspaceId, 'cloud-ws')
    assert.deepEqual(deleteHit?.body.ids, ['p1', 'p2'])

    captured.length = 0
    const restored = await fetch(`${origin}/api/db/restore`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: '/pages', ids: ['p1'] }),
    })
    assert.equal(restored.status, 200)
    assert.equal(captured.some((item) => item.url === '/api/db/restore' && item.workspaceId === 'cloud-ws'), true)

    captured.length = 0
    const listed = await fetch(`${origin}/api/db/shares?collection=/pages&kind=record&recordId=p1`, { headers })
    assert.equal(listed.status, 200)
    assert.equal(captured.some((item) => item.url.includes('/api/db/shares') && item.method === 'GET' && item.workspaceId === 'cloud-ws'), true)

    captured.length = 0
    const revoked = await fetch(`${origin}/api/db/shares`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'record', collection: '/pages', recordId: 'p1', enabled: false }),
    })
    assert.equal(revoked.status, 200)
    assert.equal(captured.some((item) => item.url === '/api/db/shares' && item.body.enabled === false && item.workspaceId === 'cloud-ws'), true)
  } finally {
    await accountFiber.dispose()
    await httpFiber.dispose()
    await new Promise<void>((resolve, reject) => remote.close((error) => (error ? reject(error) : resolve())))
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
    if (previousOrigin === undefined) delete process.env.BIU_REMOTE_ORIGIN
    else process.env.BIU_REMOTE_ORIGIN = previousOrigin
    if (previousHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = previousHome
  }
})
