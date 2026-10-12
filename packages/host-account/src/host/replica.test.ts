import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import * as http from '@biu/host-http'
import * as account from './index.ts'
import { CollabStore } from './store.ts'
import { httpRemote, RecordReplica, storeRemote } from './replica.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function sqlite() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-replica-'))
  dirs.push(dir)
  return openAndMigrateBiu(join(dir, 'biu.sqlite'))
}

function pair() {
  const remote = new CollabStore(sqlite())
  const localDb = sqlite()
  const replica = new RecordReplica(localDb, storeRemote(remote))
  const ada = remote.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = remote.register('', Date.now(), 'secret1', 'bob@example.com')
  const cara = remote.register('', Date.now(), 'secret1', 'cara@example.com')
  const workspace = remote.createWorkspace(ada.id, 'Notes')
  remote.addMember(ada.id, workspace.id, bob.id)
  remote.addMember(ada.id, workspace.id, cara.id)
  replica.remember({ accountId: ada.id, workspaceId: workspace.id, token: ada.token })
  return { remote, replica, ada, bob, cara, workspace }
}

function page(workspaceId: string, recordId: string) {
  return { type: 'record' as const, workspaceId, collection: '/pages', recordId }
}

test('desktop push then matches the server version and body', async () => {
  const { remote, replica, ada, workspace } = pair()
  replica.enqueue({
    accountId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'local',
  })
  assert.equal(remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body'), null)
  await replica.flush()
  const server = remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body')
  const local = replica.read(workspace.id, '/pages', 'p1', 'body')
  assert.equal(server?.value, 'local')
  assert.equal(local?.value, 'local')
  assert.equal(local?.version, server?.version)
  assert.equal(local?.dirty, false)
})

test('offline edits stay local until flush', async () => {
  const { remote, replica, ada, workspace } = pair()
  replica.enqueue({
    accountId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'queued',
  })
  assert.equal(replica.read(workspace.id, '/pages', 'p1', 'body')?.dirty, true)
  assert.equal(remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body'), null)
  await replica.flush()
  assert.equal(remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body')?.value, 'queued')
})

test('server edit is pulled onto the desktop', async () => {
  const { remote, replica, ada, workspace } = pair()
  remote.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'from-server',
    expectedVersion: 0,
  })
  await replica.pull()
  const local = replica.read(workspace.id, '/pages', 'p1', 'body')
  assert.equal(local?.value, 'from-server')
  assert.equal(local?.version, 1)
})

test('conflicting edits keep both copies', async () => {
  const { remote, replica, ada, workspace } = pair()
  remote.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'server',
    expectedVersion: 0,
  })
  replica.enqueue({
    accountId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'desktop',
  })
  await replica.flush()
  const local = replica.read(workspace.id, '/pages', 'p1', 'body')
  assert.equal(local?.value, 'desktop')
  assert.equal(local?.conflict, 'server')
  assert.equal(remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body')?.value, 'server')
})

test('pull does not cover an unpushed local edit', async () => {
  const { remote, replica, ada, workspace } = pair()
  replica.enqueue({
    accountId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'desktop',
  })
  remote.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p2',
    field: 'body',
    value: 'other',
    expectedVersion: 0,
  })
  remote.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'title',
    value: 'remote-title',
    expectedVersion: 0,
  })
  await replica.pull()
  assert.equal(replica.read(workspace.id, '/pages', 'p1', 'body')?.value, 'desktop')
  assert.equal(replica.read(workspace.id, '/pages', 'p1', 'title')?.value, 'remote-title')
  assert.equal(replica.read(workspace.id, '/pages', 'p2', 'body')?.value, 'other')
})

test('desktop keeps only records the signed-in accounts can read', async () => {
  const { remote, replica, ada, bob, cara, workspace } = pair()
  remote.authorization.attach(
    { type: 'account', accountId: cara.id, workspaceId: workspace.id },
    page(workspace.id, 'cara-private'),
    { ownership: 'personal', accessMode: 'private' },
  )
  remote.sync({
    actorId: cara.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'cara-private',
    field: 'body',
    value: 'secret-cara',
    expectedVersion: 0,
  })
  remote.authorization.attach(
    { type: 'account', accountId: bob.id, workspaceId: workspace.id },
    page(workspace.id, 'shared'),
    { ownership: 'personal', accessMode: 'private' },
  )
  remote.authorization.grant(bob.id, page(workspace.id, 'shared'), 'account', ada.id, 'viewer')
  remote.sync({
    actorId: bob.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'shared',
    field: 'body',
    value: 'for-ada',
    expectedVersion: 0,
  })
  await replica.pull()
  assert.equal(replica.read(workspace.id, '/pages', 'cara-private', 'body'), null)
  assert.equal(replica.read(workspace.id, '/pages', 'shared', 'body')?.value, 'for-ada')

  replica.remember({ accountId: bob.id, workspaceId: workspace.id, token: bob.token })
  await replica.pull()
  assert.equal(replica.read(workspace.id, '/pages', 'cara-private', 'body'), null)
  assert.equal(replica.devices().map((item) => item.accountId).sort().join(), [ada.id, bob.id].sort().join())
})

test('secrets and plugin directories are not queued', async () => {
  const { replica, ada, workspace } = pair()
  assert.equal(
    replica.enqueue({
      accountId: ada.id,
      workspaceId: workspace.id,
      collection: '/pages',
      recordId: 'p1',
      field: 'secret',
      value: 'nope',
    }),
    null,
  )
  assert.equal(
    replica.enqueue({
      accountId: ada.id,
      workspaceId: workspace.id,
      collection: '/.plugin',
      recordId: 'page-terminal',
      field: 'body',
      value: 'nope',
    }),
    null,
  )
  assert.equal(replica.read(workspace.id, '/pages', 'p1', 'secret'), null)
})

test('local account requests keep the linked cloud credential', async () => {
  const previousOnline = process.env.BIU_ONLINE
  const previousOrigin = process.env.BIU_REMOTE_ORIGIN
  process.env.BIU_ONLINE = '0'
  process.env.BIU_REMOTE_ORIGIN = 'http://127.0.0.1:9'
  const dir = mkdtempSync(join(tmpdir(), 'biu-cloud-link-'))
  dirs.push(dir)
  const ctx = new Context()
  const service = new account.AccountService(ctx, { sqlitePath: join(dir, 'biu.sqlite') })
  try {
    const ada = service.store.register('', Date.now(), 'secret1', 'linked-ada@example.com')
    service.saveCloudConnection({
      localAccountId: ada.id,
      origin: 'http://cloud.example',
      remoteAccountId: 'remote-ada',
      remoteName: 'Ada',
      remoteEmail: 'linked-ada@example.com',
      token: 'cloud-token',
    })
    service.replica?.remember({ accountId: ada.id, workspaceId: 'cloud-ws', token: 'cloud-token' })
    ctx.emit('account/request', { accountId: ada.id, token: 'local-session-token' })
    assert.equal(service.replica?.active()?.token, 'cloud-token')
    assert.equal(service.replica?.active()?.workspaceId, 'cloud-ws')
  } finally {
    ctx.emit('dispose')
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
    if (previousOrigin === undefined) delete process.env.BIU_REMOTE_ORIGIN
    else process.env.BIU_REMOTE_ORIGIN = previousOrigin
  }
})

test('restart resumes a saved cloud link without asking for the password again', async () => {
  const previousOnline = process.env.BIU_ONLINE
  const previousOrigin = process.env.BIU_REMOTE_ORIGIN
  process.env.BIU_ONLINE = '0'
  process.env.BIU_REMOTE_ORIGIN = 'http://127.0.0.1:9'
  const dir = mkdtempSync(join(tmpdir(), 'biu-cloud-resume-'))
  dirs.push(dir)
  const sqlitePath = join(dir, 'biu.sqlite')
  const first = new Context()
  const saved = new account.AccountService(first, { sqlitePath })
  const ada = saved.store.register('', Date.now(), 'secret1', 'resume-ada@example.com')
  saved.saveCloudConnection({
    localAccountId: ada.id,
    origin: 'http://127.0.0.1:9',
    remoteAccountId: 'remote-ada',
    remoteName: 'Ada',
    remoteEmail: 'resume-ada@example.com',
    token: 'cloud-token',
  })
  saved.replica?.remember({ accountId: ada.id, workspaceId: 'cloud-ws', token: 'cloud-token' })
  first.emit('dispose')

  const second = new Context()
  const resumed = new account.AccountService(second, { sqlitePath })
  try {
    assert.equal(resumed.cloudConnection(ada.id)?.token, 'cloud-token')
    assert.equal(resumed.replica?.active()?.token, 'cloud-token')
    assert.equal(resumed.replica?.active()?.workspaceId, 'cloud-ws')
  } finally {
    second.emit('dispose')
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
    if (previousOrigin === undefined) delete process.env.BIU_REMOTE_ORIGIN
    else process.env.BIU_REMOTE_ORIGIN = previousOrigin
  }
})

test('a finished session is queued and a second account is not required', async () => {
  const { replica, ada, workspace } = pair()
  const queued = replica.enqueueFinishedSession({
    accountId: ada.id,
    workspaceId: workspace.id,
    sessionId: 's1',
    text: 'done',
  })
  assert.equal(queued?.value, 'done')
  assert.equal(queued?.dirty, true)
})

test('http sync keeps the desktop and server copies aligned', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-replica-http-'))
  dirs.push(dir)
  const publicDir = join(dir, 'public')
  mkdirSync(publicDir)
  writeFileSync(join(publicDir, 'index.html'), '<html></html>')
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  const httpFiber = await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir, sharePort: 0 })
  const accountFiber = await ctx.plugin(account, { sqlitePath: join(dir, 'server.sqlite') })
  const port = await ready
  try {
    const origin = `http://127.0.0.1:${port}`
    const registered = (await fetch(`${origin}/api/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret1' }),
    }).then((res) => res.json())) as { id: string; token: string; workspaceId: string }
    const localDb = sqlite()
    const replica = new RecordReplica(localDb, httpRemote(origin))
    replica.remember({ accountId: registered.id, workspaceId: registered.workspaceId, token: registered.token })
    replica.enqueue({
      accountId: registered.id,
      workspaceId: registered.workspaceId,
      collection: '/pages',
      recordId: 'p1',
      field: 'body',
      value: 'over-http',
    })
    await replica.flush()
    const listed = (await fetch(
      `${origin}/api/account/sync?workspaceId=${registered.workspaceId}&after=0&visible=1`,
      { headers: { authorization: `Bearer ${registered.token}` } },
    ).then((res) => res.json())) as { ops: Array<{ value: unknown; version: number }> }
    await replica.pull()
    const local = replica.read(registered.workspaceId, '/pages', 'p1', 'body')
    assert.equal(listed.ops.at(-1)?.value, 'over-http')
    assert.equal(local?.value, 'over-http')
    assert.equal(local?.version, listed.ops.at(-1)?.version)
  } finally {
    await accountFiber.dispose()
    await httpFiber.dispose()
  }
})

test('a local account can create or reuse the matching cloud identity', async () => {
  const previousOnline = process.env.BIU_ONLINE
  const previousOrigin = process.env.BIU_REMOTE_ORIGIN
  process.env.BIU_ONLINE = '0'
  let registerConflict = false
  const actions: string[] = []
  const passwords: string[] = []
  const remote = createServer((req, res) => {
    const path = req.url ?? ''
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk as Buffer))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as { password?: string }
      res.setHeader('content-type', 'application/json')
      if (path === '/api/account/register' || path === '/api/account/login') passwords.push(String(body.password ?? ''))
      if (path === '/api/account/register') {
        actions.push('register')
        if (registerConflict) {
          res.statusCode = 409
          res.end(JSON.stringify({ error: '这个邮箱已经注册过' }))
        } else {
          res.statusCode = 201
          res.end(JSON.stringify({ id: 'remote-ada', name: 'ada@example.com', token: 'remote-token', workspaceId: 'cloud-ws' }))
        }
        return
      }
      if (path === '/api/account/login') {
        actions.push('login')
        res.end(JSON.stringify({ id: 'remote-ada', name: 'ada@example.com', token: 'remote-token', workspaceId: 'cloud-ws' }))
        return
      }
      if (path === '/api/account/workspaces') {
        res.end(JSON.stringify({ workspaces: [{ id: 'cloud-ws', name: '在线空间', role: 'owner' }] }))
        return
      }
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'not found' }))
    })
  })
  await new Promise<void>((resolve, reject) => {
    remote.once('error', reject)
    remote.listen(0, '127.0.0.1', () => resolve())
  })
  const remoteAddress = remote.address()
  assert.ok(remoteAddress && typeof remoteAddress !== 'string')
  process.env.BIU_REMOTE_ORIGIN = `http://127.0.0.1:${remoteAddress.port}`

  const dir = mkdtempSync(join(tmpdir(), 'biu-cloud-sync-create-'))
  dirs.push(dir)
  const publicDir = join(dir, 'public')
  mkdirSync(publicDir)
  writeFileSync(join(publicDir, 'index.html'), '<html></html>')
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  const httpFiber = await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir, sharePort: 0 })
  const accountFiber = await ctx.plugin(account, { sqlitePath: join(dir, 'local.sqlite') })
  const port = await ready
  const origin = `http://127.0.0.1:${port}`
  try {
    const registered = (await fetch(`${origin}/api/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret1' }),
    }).then((res) => res.json())) as { token: string }
    const headers = { authorization: `Bearer ${registered.token}`, 'content-type': 'application/json' }

    const created = await fetch(`${origin}/api/account/cloud/sync-create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    assert.equal(created.status, 201)
    assert.equal(((await created.json()) as { created: boolean }).created, true)
    assert.deepEqual(actions, ['register'])
    assert.deepEqual(passwords, ['secret1'])

    await fetch(`${origin}/api/account/cloud`, { method: 'DELETE', headers })
    registerConflict = true
    const reused = await fetch(`${origin}/api/account/cloud/sync-create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    assert.equal(reused.status, 200)
    assert.equal(((await reused.json()) as { created: boolean }).created, false)
    assert.deepEqual(actions, ['register', 'register', 'login'])
    assert.deepEqual(passwords, ['secret1', 'secret1', 'secret1'])
  } finally {
    await accountFiber.dispose()
    await httpFiber.dispose()
    await new Promise<void>((resolve, reject) => remote.close((error) => (error ? reject(error) : resolve())))
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
    if (previousOrigin === undefined) delete process.env.BIU_REMOTE_ORIGIN
    else process.env.BIU_REMOTE_ORIGIN = previousOrigin
  }
})

test('the cloud server creates an online workspace for the signed-in account', async () => {
  const previousOnline = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  const dir = mkdtempSync(join(tmpdir(), 'biu-cloud-workspace-'))
  dirs.push(dir)
  const publicDir = join(dir, 'public')
  mkdirSync(publicDir)
  writeFileSync(join(publicDir, 'index.html'), '<html></html>')
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  const httpFiber = await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir, sharePort: 0 })
  const accountFiber = await ctx.plugin(account, { sqlitePath: join(dir, 'cloud.sqlite') })
  const port = await ready
  const origin = `http://127.0.0.1:${port}`
  try {
    const registered = (await fetch(`${origin}/api/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret1' }),
    }).then((res) => res.json())) as { token: string }
    const created = await fetch(`${origin}/api/account/workspaces`, {
      method: 'POST',
      headers: { authorization: `Bearer ${registered.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '在线空间', location: 'cloud' }),
    })
    assert.equal(created.status, 201)
    const body = (await created.json()) as { id?: string; name?: string; location?: string; error?: string }
    assert.equal(body.error, undefined)
    assert.equal(body.name, '在线空间')
    assert.equal(body.location, 'cloud')
    assert.ok(body.id)
  } finally {
    await accountFiber.dispose()
    await httpFiber.dispose()
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
  }
})

test('disconnecting the cloud hides its workspaces from the desktop list', async () => {
  const previousOnline = process.env.BIU_ONLINE
  const previousOrigin = process.env.BIU_REMOTE_ORIGIN
  process.env.BIU_ONLINE = '0'
  const remote = createServer((req, res) => {
    const path = req.url ?? ''
    res.setHeader('content-type', 'application/json')
    if (path === '/api/account/login') {
      res.end(JSON.stringify({ id: 'remote-ada', name: 'ada@example.com', token: 'remote-token', workspaceId: 'cloud-ws' }))
      return
    }
    if (path === '/api/account/workspaces') {
      res.end(JSON.stringify({ workspaces: [{ id: 'cloud-ws', name: '在线空间', role: 'owner' }] }))
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
  const dir = mkdtempSync(join(tmpdir(), 'biu-cloud-hidden-'))
  dirs.push(dir)
  const publicDir = join(dir, 'public')
  mkdirSync(publicDir)
  writeFileSync(join(publicDir, 'index.html'), '<html></html>')
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  const httpFiber = await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir, sharePort: 0 })
  const accountFiber = await ctx.plugin(account, { sqlitePath: join(dir, 'local.sqlite') })
  const port = await ready
  const origin = `http://127.0.0.1:${port}`
  try {
    const registered = (await fetch(`${origin}/api/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret1' }),
    }).then((res) => res.json())) as { token: string }
    const headers = { authorization: `Bearer ${registered.token}`, 'content-type': 'application/json' }
    assert.equal((await fetch(`${origin}/api/account/cloud/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret1' }),
    })).status, 200)
    const connected = (await fetch(`${origin}/api/account/workspaces`, { headers }).then((res) => res.json())) as {
      workspaces: Array<{ location: string; name: string }>
    }
    assert.equal(connected.workspaces.some((workspace) => workspace.location === 'cloud' && workspace.name === '在线空间'), true)
    assert.equal((await fetch(`${origin}/api/account/cloud`, { method: 'DELETE', headers })).status, 200)
    const hidden = (await fetch(`${origin}/api/account/workspaces`, { headers }).then((res) => res.json())) as {
      workspaces: Array<{ location: string }>
      cloudConnected: boolean
    }
    assert.equal(hidden.cloudConnected, false)
    assert.equal(hidden.workspaces.some((workspace) => workspace.location === 'cloud'), false)
    assert.equal(hidden.workspaces.some((workspace) => workspace.location === 'device'), true)
  } finally {
    await accountFiber.dispose()
    await httpFiber.dispose()
    await new Promise<void>((resolve, reject) => remote.close((error) => (error ? reject(error) : resolve())))
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
    if (previousOrigin === undefined) delete process.env.BIU_REMOTE_ORIGIN
    else process.env.BIU_REMOTE_ORIGIN = previousOrigin
  }
})

test('saved cloud accounts stay after disconnect and can be selected again', async () => {
  const previousOnline = process.env.BIU_ONLINE
  const previousOrigin = process.env.BIU_REMOTE_ORIGIN
  process.env.BIU_ONLINE = '0'
  process.env.BIU_REMOTE_ORIGIN = 'http://127.0.0.1:9'
  const dir = mkdtempSync(join(tmpdir(), 'biu-cloud-many-'))
  dirs.push(dir)
  const ctx = new Context()
  const service = new account.AccountService(ctx, { sqlitePath: join(dir, 'biu.sqlite') })
  try {
    const ada = service.store.register('', Date.now(), 'secret1', 'local@example.com')
    const link = (remoteAccountId: string, email: string, token: string) =>
      service.saveCloudConnection({
        localAccountId: ada.id,
        origin: 'http://127.0.0.1:9',
        remoteAccountId,
        remoteName: email,
        remoteEmail: email,
        token,
      })
    link('remote-a', 'a@example.com', 'token-a')
    link('remote-b', 'b@example.com', 'token-b')
    assert.equal(service.cloudConnection(ada.id)?.remoteAccountId, 'remote-b')
    assert.deepEqual(
      service.listCloudConnections(ada.id).map((item) => item.remoteEmail),
      ['b@example.com', 'a@example.com'],
    )
    service.disconnectCloud(ada.id)
    assert.equal(service.cloudConnection(ada.id), null)
    assert.equal(service.listCloudConnections(ada.id).length, 2)
    service.activateCloud(ada.id, 'http://127.0.0.1:9', 'remote-a')
    assert.equal(service.cloudConnection(ada.id)?.token, 'token-a')
    assert.equal(service.listCloudConnections(ada.id).find((item) => item.remoteAccountId === 'remote-a')?.active, true)
  } finally {
    ctx.emit('dispose')
    if (previousOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previousOnline
    if (previousOrigin === undefined) delete process.env.BIU_REMOTE_ORIGIN
    else process.env.BIU_REMOTE_ORIGIN = previousOrigin
  }
})
