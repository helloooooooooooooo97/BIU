import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { openAndMigrateBiu, runWithAccount } from '@biu/host-plugin-loader/data-dir'
import { apply as applyAccount, type AccountService } from './index.ts'
import { CollabStore } from './store.ts'
import { workspaceMembersCollection } from './workspace-members-collection.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('workspace members collection lists and manages only the active workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-members-collection-'))
  dirs.push(dir)
  const store = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))
  const ada = store.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = store.register('', Date.now(), 'secret1', 'bob@example.com')
  const cara = store.register('', Date.now(), 'secret1', 'cara@example.com')
  const workspace = store.createWorkspace(ada.id, 'Product')
  store.addMemberByEmail(ada.id, workspace.id, bob.email)
  store.setActive(ada.id, workspace.id)
  store.setActive(bob.id, workspace.id)
  store.setActive(bob.id, workspace.id)
  const collection = workspaceMembersCollection(store)
  assert.equal(collection.view?.inspector, true)
  assert.equal(collection.records?.update, true)
  assert.equal(typeof collection.update, 'function')
  assert.deepEqual(collection.schema.fields.role.enumLabels, {
    owner: '所有者',
    admin: '管理者',
    member: '编辑者',
    viewer: '查看者',
  })
  assert.equal(collection.schema.fields.email.writable, undefined)

  const before = await runWithAccount(ada.id, () => collection.list())
  assert.deepEqual(before.map((row) => row.email).sort(), ['ada@example.com', 'bob@example.com'])

  const created = await runWithAccount(ada.id, () => collection.create!([{ email: cara.email }]))
  assert.equal(created[0]?.email, cara.email)
  store.setActive(cara.id, workspace.id)
  assert.deepEqual(
    (await runWithAccount(cara.id, () => collection.list())).map((row) => row.email).sort(),
    ['ada@example.com', 'bob@example.com', 'cara@example.com'],
  )

  const promoted = await runWithAccount(ada.id, () => collection.update!(bob.id, { role: 'admin' }))
  assert.equal(promoted.role, 'admin')
  const viewer = await runWithAccount(ada.id, () => collection.update!(bob.id, { role: 'viewer' }))
  assert.equal(viewer.role, 'viewer')
  await assert.rejects(
    async () => runWithAccount(bob.id, () => collection.update!(cara.id, { role: 'admin' })),
    /只有所有者可以这样做/,
  )
  await assert.rejects(
    async () => runWithAccount(bob.id, () => collection.remove!({ ids: [cara.id] })),
    /所有者或管理员/,
  )
  assert.notEqual(await runWithAccount(ada.id, () => collection.get(cara.id)), null)
})

test('a device-only workspace lists the owner and LAN visitors, but not email invites', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-local-members-collection-'))
  dirs.push(dir)
  const store = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))
  const ada = store.register('', Date.now(), 'secret1', 'local-ada@example.com')
  const workspace = store.createWorkspace(ada.id, 'Private device')
  store.setActive(ada.id, workspace.id)
  const collection = workspaceMembersCollection(store, () => false, true)

  assert.equal(collection.view?.title, '成员')
  const listed = await runWithAccount(ada.id, () => collection.list())
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, ada.id)
  await assert.rejects(
    async () => runWithAccount(ada.id, () => collection.create!([{ email: 'nobody@example.com' }])),
    /邮箱邀请/,
  )
  const guest = store.rememberLanMember(workspace.id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.equal(guest?.id.startsWith('lan_'), true)
  const again = store.rememberLanMember(workspace.id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.equal(again?.id, guest?.id)
  const withLan = await runWithAccount(ada.id, () => collection.list())
  assert.equal(withLan.length, 2)
  assert.ok(withLan.some((row) => row.id === guest?.id))
})

test('member activity aggregates heatmap, coalesces rapid updates, and is transparent to workspace members', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-member-activity-'))
  dirs.push(dir)
  const store = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const ada = store.register('Ada', now - 10 * dayMs, 'secret1', 'ada-act@example.com')
  const bob = store.register('Bob', now - 10 * dayMs, 'secret2', 'bob-act@example.com')
  const workspace = store.createWorkspace(ada.id, 'Team', now - 10 * dayMs)
  store.addMemberByEmail(ada.id, workspace.id, bob.email)
  store.setActive(ada.id, workspace.id)
  store.setActive(bob.id, workspace.id)

  // 昨天 1 次创建
  store.recordActivity({
    workspaceId: workspace.id,
    actorId: ada.id,
    category: 'data',
    action: 'record.create',
    collection: '/pages',
    recordId: 'p1',
    recordTitle: '周报',
    now: now - dayMs,
  })
  // 今天 5 分钟内连续编辑同一记录 3 次 -> 自动合并为 1 条（count = 3）
  store.recordActivity({
    workspaceId: workspace.id,
    actorId: ada.id,
    category: 'data',
    action: 'record.update',
    collection: '/pages',
    recordId: 'p1',
    recordTitle: '周报',
    now: now - 60_000,
  })
  store.recordActivity({
    workspaceId: workspace.id,
    actorId: ada.id,
    category: 'data',
    action: 'record.update',
    collection: '/pages',
    recordId: 'p1',
    recordTitle: '周报 v2',
    now: now - 30_000,
  })
  store.recordActivity({
    workspaceId: workspace.id,
    actorId: ada.id,
    category: 'data',
    action: 'record.update',
    collection: '/pages',
    recordId: 'p1',
    recordTitle: '周报 v3',
    now: now - 10_000,
  })
  // 今天 1 次 MCP 工具调用
  store.recordActivity({
    workspaceId: workspace.id,
    actorId: ada.id,
    via: 'mcp',
    category: 'automation',
    action: 'mcp.call',
    detail: '调用 MCP 工具 db_create',
    now,
  })

  // Bob 作为普通空间成员可以透明查看 Ada 的活动统计与热力图
  const summary = store.memberActivity(bob.id, ada.id, { days: 14, now })
  assert.equal(summary.member.status, 'online')
  assert.equal(summary.stats.totalEvents, 5)
  assert.equal(summary.stats.activeDays, 2)
  assert.equal(summary.stats.currentStreak, 2)
  assert.equal(summary.stats.byCategory.data, 4)
  assert.equal(summary.stats.byCategory.automation, 1)
  assert.equal(summary.stats.byVia.mcp, 1)
  assert.equal(summary.heatmap.length, 14)
  assert.equal(summary.heatmap[summary.heatmap.length - 1]?.count, 4)
  assert.equal(summary.heatmap[summary.heatmap.length - 2]?.count, 1)
  // 连续编辑已合并，recent 共 3 条（MCP + 合并后的编辑 + 昨天的创建）
  assert.equal(summary.recent.length, 3)
  assert.equal(summary.recent[1]?.count, 3)
  assert.equal(summary.recent[1]?.recordTitle, '周报 v3')

  // 成员列表带上 status 和 lastActiveAt
  const collection = workspaceMembersCollection(store)
  const listed = await runWithAccount(bob.id, () => collection.list())
  const adaRow = listed.find((row) => row.id === ada.id)
  assert.equal(adaRow?.status, 'online')
  assert.ok(Number(adaRow?.lastActiveAt) >= now - 1000)
})

test('GET /api/account/member-activity resolves grant record titles via $ids filter including untitled and trashed records', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-member-grants-'))
  dirs.push(dir)
  const sqlitePath = join(dir, 'biu.sqlite')
  const routes = new Map<string, (route: Record<string, unknown>) => Promise<void>>()
  const listCalls: Array<{ path: string; filter?: Record<string, unknown>; page?: Record<string, unknown> }> = []

  const ctx = new Context()
  ctx.provide('http')
  ctx.set('http', {
    route(method: string, path: string, handler: (route: Record<string, unknown>) => Promise<void>) {
      routes.set(`${method} ${path}`, handler)
    },
    broadcast() {},
    disconnectRevokedSessions() {},
  })
  ctx.provide('database')
  ctx.set('database', {
    register() { return () => {} },
    collection(path: string) {
      return path === '/pages' ? { label: '页面', schema: { labelField: 'title' } } : undefined
    },
    async list(path: string, filter?: Record<string, unknown>, page?: Record<string, unknown>) {
      listCalls.push({ path, filter, page })
      const ids = Array.isArray(filter?.$ids) ? (filter.$ids as string[]) : []
      if (filter?.deleted) {
        return {
          items: ids.includes('pg_trash') ? [{ id: 'pg_trash', title: '已归档方案' }] : [],
        }
      }
      const rows: Array<Record<string, unknown>> = []
      if (ids.includes('pg_named')) rows.push({ id: 'pg_named', title: '常用业务系统集成' })
      if (ids.includes('pg_empty')) rows.push({ id: 'pg_empty', title: '' })
      return { items: rows }
    },
  })
  applyAccount(ctx, { sqlitePath })
  try {
    const account = ctx.get('account') as AccountService
    const ada = account.store.register('Ada', Date.now(), 'secret1', 'ada-grants@example.com')
    const workspace = account.store.createWorkspace(ada.id, 'Main')
    account.store.setActive(ada.id, workspace.id)
    const db = openAndMigrateBiu(sqlitePath)
    const now = Date.now()
    for (const [idx, recId] of (['pg_named', 'pg_empty', 'pg_trash'] as const).entries()) {
      account.store.attach(workspace.id, '/pages', recId, now)
      db.prepare(
        `INSERT INTO record_grants (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
         VALUES (?, '/pages', ?, 'account', ?, 'owner', ?, ?)`,
      ).run(workspace.id, recId, ada.id, ada.id, now - idx)
    }
    db.close()
    const session = account.store.login('ada-grants@example.com', 'secret1')

    const handler = routes.get('GET /api/account/member-activity')
    assert.ok(handler)
    let status = 0
    let body: Record<string, unknown> = {}
    await handler({
      req: { headers: { authorization: `Bearer ${session.token}` }, method: 'GET' },
      res: { setHeader() {} },
      query: new URLSearchParams({ memberId: ada.id }),
      send(code: number, payload: Record<string, unknown>) {
        status = code
        body = payload
      },
    })

    assert.equal(status, 200)
    assert.equal(listCalls.length, 2)
    assert.deepEqual(listCalls[0]?.filter, { $ids: ['pg_named', 'pg_empty', 'pg_trash'] })
    assert.deepEqual(listCalls[1]?.filter, { $ids: ['pg_trash'], deleted: true })
    const records = (body.grants as { records: Array<{ recordId: string; title: string; collectionLabel: string }> }).records
    const byId = new Map(records.map((item) => [item.recordId, item]))
    assert.equal(byId.get('pg_named')?.title, '常用业务系统集成')
    assert.equal(byId.get('pg_named')?.collectionLabel, '页面')
    assert.equal(byId.get('pg_empty')?.title, '未命名页面')
    assert.equal(byId.get('pg_trash')?.title, '已归档方案')
  } finally {
    ctx.emit('dispose')
  }
})

test('PATCH /api/account/workspaces/:id renames a cloud workspace directly in online runtime without requiring cloud_connections', async () => {
  const prevOnline = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  const dir = mkdtempSync(join(tmpdir(), 'biu-online-rename-'))
  dirs.push(dir)
  const sqlitePath = join(dir, 'biu.sqlite')
  const routes = new Map<string, (route: Record<string, unknown>) => Promise<void>>()
  const ctx = new Context()
  ctx.provide('http')
  ctx.set('http', {
    route(method: string, path: string, handler: (route: Record<string, unknown>) => Promise<void>) {
      routes.set(`${method} ${path}`, handler)
    },
    broadcast() {},
    disconnectRevokedSessions() {},
  })
  applyAccount(ctx, { sqlitePath })
  try {
    const account = ctx.get('account') as AccountService
    const ada = account.store.register('Ada', Date.now(), 'secret1', 'ada-online@example.com')
    const workspace = account.store.createWorkspace(ada.id, '云端空间')
    account.store.setActive(ada.id, workspace.id)
    const session = account.store.login('ada-online@example.com', 'secret1')

    const handler = routes.get('PATCH /api/account/workspaces/:id')
    assert.ok(handler)
    let status = 0
    let body: Record<string, unknown> = {}
    await handler({
      req: { headers: { authorization: `Bearer ${session.token}` }, method: 'PATCH' },
      res: { setHeader() {} },
      params: { id: workspace.id },
      async json() {
        return { name: '云213端空间' }
      },
      send(code: number, payload: Record<string, unknown>) {
        status = code
        body = payload
      },
    })

    assert.equal(status, 200)
    assert.equal(body.id, workspace.id)
    assert.equal(body.name, '云213端空间')
  } finally {
    ctx.emit('dispose')
    if (prevOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = prevOnline
  }
})
