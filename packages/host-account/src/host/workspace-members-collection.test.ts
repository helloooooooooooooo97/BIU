import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { openAndMigrateBiu, runWithAccount } from '@biu/host-plugin-loader/data-dir'
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
