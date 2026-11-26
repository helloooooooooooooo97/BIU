import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { openAndMigrateBiu, runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { CollabError, CollabStore, registerBuiltinPluginLookup } from './store.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function store() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-account-'))
  dirs.push(dir)
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  return new CollabStore(db)
}

test('builtin plugin records are not claimed by a workspace', () => {
  const stop = registerBuiltinPluginLookup((id) => id === 'page-sandbox')
  try {
    const collab = store()
    const ada = collab.register('Ada')
    const home = collab.createWorkspace(ada.id, 'A')
    const local = collab.createWorkspace(ada.id, 'B')
    runWithAccount(ada.id, () => {
      collab.attach(home.id, '/plugins', 'page-sandbox')
      collab.attach(local.id, '/plugins', 'page-sandbox')
    })
    assert.equal(collab.recordIds(home.id, '/plugins').has('page-sandbox'), false)
    assert.equal(collab.recordIds(local.id, '/plugins').has('page-sandbox'), false)
  } finally {
    stop()
  }
})

test('online mode denies record reads without an account context', () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const collab = store()
    assert.equal(collab.canReadRecord('/pages', 'hidden'), false)
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})

test('an online instance seeds the env super admin with the default password', () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const collab = store()
    const admin = collab.login('97@biu.com', '123456')
    assert.equal(admin.email, '97@biu.com')
    assert.equal(admin.mustChangePassword, false)
    assert.equal(collab.isSuperAdmin(admin.id), true)
    collab.changePassword(admin.id, '123456', 'new-secret', admin.token)
    assert.throws(() => collab.login('97@biu.com', '123456'), /密码不正确/)
    const db = (collab as unknown as { db: import('node:sqlite').DatabaseSync }).db
    const restarted = new CollabStore(db)
    assert.throws(() => restarted.login('97@biu.com', '123456'), /密码不正确/)
    assert.equal(restarted.login('97@biu.com', 'new-secret').id, admin.id)
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})

test('online startup adds the env super admin to a database that already has accounts', () => {
  const previous = process.env.BIU_ONLINE
  delete process.env.BIU_ONLINE
  try {
    const collab = store()
    const ada = collab.register('Ada')
    const db = (collab as unknown as { db: import('node:sqlite').DatabaseSync }).db
    process.env.BIU_ONLINE = '1'
    const online = new CollabStore(db)
    const admin = online.login('97@biu.com', '123456')
    assert.notEqual(admin.id, ada.id)
    assert.equal(online.isSuperAdmin(admin.id), true)
    assert.equal(online.isSuperAdmin(ada.id), false)
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})

test('owners and managers can rename a workspace but regular members cannot', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const cara = collab.register('Cara')
  const workspace = collab.createWorkspace(ada.id, 'Notes')
  collab.addMember(ada.id, workspace.id, bob.id)
  collab.addMember(ada.id, workspace.id, cara.id)
  collab.updateMemberRole(ada.id, workspace.id, bob.id, 'admin')

  assert.equal(collab.renameWorkspace(ada.id, workspace.id, '团队空间').name, '团队空间')
  assert.equal(collab.renameWorkspace(bob.id, workspace.id, '项目空间').name, '项目空间')
  assert.throws(() => collab.renameWorkspace(cara.id, workspace.id, '不能修改'), /管理员/)
  assert.throws(() => collab.renameWorkspace(ada.id, workspace.id, '  '), /不能为空/)
})

test('deleting a workspace requires its exact name and hard-deletes its data', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const workspace = collab.createWorkspace(ada.id, '本地空间')
  const other = collab.createWorkspace(ada.id, '留下')
  collab.addMember(ada.id, workspace.id, bob.id)
  collab.setActive(ada.id, workspace.id)
  const db = (collab as unknown as { db: import('node:sqlite').DatabaseSync }).db
  db.prepare('INSERT INTO pages (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run('page-1', '笔记', 1, 1)
  collab.attach(workspace.id, '/pages', 'page-1', 1)
  db.prepare(
    `INSERT INTO editor_content (collection, record_id, body, updated_at, version) VALUES ('/pages', 'page-1', '正文', 1, 1)`,
  ).run()

  assert.throws(() => collab.deleteWorkspace(bob.id, workspace.id, '本地空间'), /所有者/)
  assert.throws(() => collab.deleteWorkspace(ada.id, workspace.id, '本地'), /空间名称/)
  const deleted = collab.deleteWorkspace(ada.id, workspace.id, '本地空间')
  assert.equal(deleted.deleted, true)
  assert.equal(deleted.activeWorkspaceId, other.id)
  assert.equal(db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspace.id), undefined)
  assert.equal(db.prepare('SELECT id FROM pages WHERE id = ?').get('page-1'), undefined)
  assert.equal(db.prepare('SELECT body FROM editor_content WHERE record_id = ?').get('page-1'), undefined)
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ?').get(workspace.id) as { n: number }).n,
    0,
  )
  assert.equal(collab.listWorkspaces(ada.id).some((row) => row.id === other.id), true)
})

test('plugin packages record without instance roles', () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const collab = store()
    const ada = collab.register('Ada')
    const bob = collab.register('Bob')
    const workspace = collab.createWorkspace(ada.id, 'Notes')
    collab.addMember(ada.id, workspace.id, bob.id)
    const input = {
      id: 'brand',
      version: '1',
      packageHash: 'abc',
      packagePath: '/tmp/brand',
      sourceKind: 'sandbox',
      trustState: 'approved',
      tenantMode: 'assigned',
      hasWeb: true,
      hasHost: false,
      manifest: { id: 'brand' },
    }
    collab.recordPluginPackage(bob.id, input)
    runWithAccount(bob.id, () => runWithRequestWorkspace(workspace.id, () => collab.removePluginPackage(bob.id, 'brand')))
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})

test('each member loads plugins for themselves', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const cara = collab.register('Cara')
  const workspaceA = collab.createWorkspace(ada.id, 'A')
  const workspaceB = collab.createWorkspace(bob.id, 'B')
  collab.addMember(ada.id, workspaceA.id, bob.id)
  assert.equal(collab.canAccessPlugin(bob.id, workspaceA.id, 'page-sandbox'), false)
  collab.setPluginLoad(bob.id, workspaceA.id, 'page-sandbox', true)
  assert.equal(collab.canAccessPlugin(bob.id, workspaceA.id, 'page-sandbox'), true)
  assert.equal(collab.canAccessPlugin(ada.id, workspaceA.id, 'page-sandbox'), false)
  assert.equal(collab.canAccessPlugin(cara.id, workspaceA.id, 'page-sandbox'), false)
  assert.equal(collab.canAccessPlugin(bob.id, workspaceB.id, 'page-sandbox'), false)
  assert.deepEqual(collab.loadedPluginIds(), ['page-sandbox'])
  collab.forgetPluginLoads('page-sandbox')
  assert.deepEqual(collab.loadedPluginIds(), [])
  assert.equal(collab.canAccessPlugin(bob.id, workspaceA.id, 'page-sandbox'), false)
  collab.setPluginLoad(bob.id, workspaceA.id, 'page-sandbox', true)
  collab.setPluginLoad(bob.id, workspaceA.id, 'page-sandbox', false)
  assert.equal(collab.hasPluginLoad(bob.id, workspaceA.id, 'page-sandbox'), false)
})

test('presence drops a heartbeat older than the stale window', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const workspace = collab.createWorkspace(ada.id, 'Notes')
  collab.pulse(ada.id, workspace.id, '/pages', 'p1', 10_000)
  assert.equal(collab.presence(ada.id, workspace.id, 10_000).length, 1)
  assert.equal(collab.presence(ada.id, workspace.id, 10_000 + 30_001).length, 0)
})

test('login accepts the password set at register and rejects the rest', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'Ada@Example.com')
  const signed = collab.login('ada@example.com', 'secret1')
  assert.equal(signed.id, ada.id)
  assert.equal(signed.email, 'ada@example.com')
  assert.notEqual(signed.token, ada.token)
  assert.equal(collab.accountByToken(signed.token)?.id, ada.id)
  const workspaceId = collab.enter(ada.id)
  assert.equal(collab.activeWorkspaceId(), workspaceId)
  assert.equal(collab.listWorkspaces(ada.id)[0]?.name, '我的工作区')
  assert.equal(collab.enter(ada.id), workspaceId)
  assert.doesNotThrow(() => collab.assertPassword(ada.id, 'secret1'))
  assert.throws(() => collab.assertPassword(ada.id, 'wrong'), /当前密码不对/)
  const saved = collab.saveWorkspaceProfile(ada.id, { name: '蓝团', avatar: '' })
  assert.equal(saved.name, '蓝团')
  assert.equal(saved.email, 'ada@example.com')
  const directoryEntry = collab.members(ada.id, workspaceId).find((row) => row.id === ada.id)
  assert.equal(directoryEntry?.name, '蓝团')
  assert.equal(directoryEntry?.display_name, '蓝团')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const bobWorkspace = collab.createWorkspace(bob.id, 'Bob')
  collab.setActive(bob.id, bobWorkspace.id)
  assert.equal(collab.saveWorkspaceProfile(bob.id, { name: '蓝团', avatar: '' }).name, '蓝团')
  collab.setActive(ada.id, workspaceId)
  assert.equal(collab.workspaceProfile(ada.id).name, '蓝团')
  const other = collab.createWorkspace(ada.id, '另一区')
  collab.setActive(ada.id, other.id)
  assert.equal(collab.workspaceProfile(ada.id).name, '')
  collab.setActive(ada.id, workspaceId)
  assert.equal(collab.workspaceProfile(ada.id).name, '蓝团')
  assert.throws(() => collab.login('ada@example.com', 'wrong'), /密码不正确/)
  assert.throws(() => collab.login('nobody@example.com', 'secret1'), /账号不存在/)
  assert.throws(() => collab.register('', Date.now(), 'secret2', 'ada@example.com'), CollabError)
  assert.throws(() => collab.register('', Date.now(), '123', 'short@example.com'), CollabError)
})

test('logged-in accounts only see records in their own workspace', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const adaWs = collab.enter(ada.id)
  const bobWs = collab.enter(bob.id)
  assert.notEqual(adaWs, bobWs)
  collab.attach(adaWs, '/pages', 'p-ada')
  collab.attach(bobWs, '/agents', 's-bob')
  const adaView = runWithAccount(ada.id, () => collab.membership())
  const bobView = runWithAccount(bob.id, () => collab.membership())
  assert.equal(adaView.strict, true)
  assert.equal(adaView.mine.has('/pages\tp-ada'), true)
  assert.equal(adaView.mine.has('/agents\ts-bob'), false)
  assert.equal(bobView.mine.has('/agents\ts-bob'), true)
  assert.equal(bobView.mine.has('/pages\tp-ada'), false)
  assert.equal(runWithAccount(ada.id, () => collab.activeWorkspaceId()), adaWs)
  assert.equal(runWithAccount(bob.id, () => collab.activeWorkspaceId()), bobWs)
})

test('a private record stays hidden until the owner shares it with a workspace member', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const workspaceId = collab.enter(ada.id)
  collab.addMemberByEmail(ada.id, workspaceId, 'bob@example.com')
  collab.setActive(bob.id, workspaceId)
  runWithAccount(ada.id, () => collab.attach(workspaceId, '/pages', 'secret'))
  assert.equal(runWithAccount(ada.id, () => collab.canReadRecord('/pages', 'secret')), true)
  assert.equal(runWithAccount(bob.id, () => collab.canReadRecord('/pages', 'secret')), false)
  const shared = runWithAccount(ada.id, () =>
    collab.shareWithEmail(ada.id, '/pages', 'secret', 'bob@example.com', 'editor', 'internal'),
  )
  assert.equal(shared.people.some((row) => row.email === 'bob@example.com'), true)
  assert.equal(runWithAccount(bob.id, () => collab.canReadRecord('/pages', 'secret')), true)
  assert.throws(() => runWithAccount(bob.id, () => collab.shareWithEmail(bob.id, '/pages', 'other', 'ada@example.com')), CollabError)
})

test('sharing with a registered outsider adds an external member limited to explicit grants', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'external-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'external-bob@example.com')
  const workspaceId = collab.enter(ada.id)
  collab.enter(bob.id)
  runWithAccount(ada.id, () => collab.attach(workspaceId, '/pages', 'private-external'))
  runWithAccount(ada.id, () =>
    collab.shareWithEmail(ada.id, '/pages', 'private-external', bob.email, 'editor'),
  )
  const external = collab.members(ada.id, workspaceId).find((row) => row.id === bob.id)
  assert.equal(external?.member_kind, 'external')
  collab.setActive(bob.id, workspaceId)
  assert.equal(runWithAccount(bob.id, () => collab.canReadRecord('/pages', 'private-external')), true)
})

test('collaborators move a record between personal, workspace, and shared scopes', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'scope-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'scope-bob@example.com')
  const cara = collab.register('', Date.now(), 'secret1', 'scope-cara@example.com')
  const workspaceId = collab.enter(ada.id)
  collab.enter(bob.id)
  collab.enter(cara.id)
  collab.addMemberByEmail(ada.id, workspaceId, bob.email)

  const asAda = <T>(op: () => T) =>
    runWithAccount(ada.id, () => runWithRequestWorkspace(workspaceId, op))
  asAda(() => collab.attach(workspaceId, '/pages', 'scope-page'))
  assert.equal(asAda(() => collab.recordAccess(ada.id, '/pages', 'scope-page')).scope, 'personal')
  assert.equal(asAda(() => collab.recordAccess(ada.id, '/data', 'pages::scope-page')).scope, 'personal')
  assert.throws(
    () => asAda(() => collab.shareWithEmail(ada.id, '/pages', 'scope-page', bob.email, 'editor', 'external')),
    /已经是内部空间成员/,
  )
  assert.throws(
    () => asAda(() => collab.shareWithEmail(ada.id, '/pages', 'scope-page', cara.email, 'editor', 'internal')),
    /必须先加入当前空间/,
  )

  const internalShared = asAda(() =>
    collab.shareWithEmail(ada.id, '/pages', 'scope-page', bob.email, 'editor', 'internal'),
  )
  // K+1 模型：个人表记录分享给空间内成员 -> shared（共享），不改变归属为空间表
  assert.equal(internalShared.scope, 'shared')
  assert.equal(internalShared.people.find((row) => row.id === bob.id)?.memberKind, 'member')

  const externalShared = asAda(() =>
    collab.shareWithEmail(ada.id, '/pages', 'scope-page', cara.email, 'viewer', 'external'),
  )
  // 分享给外部协作者 -> external（外部）
  assert.equal(externalShared.scope, 'external')
  assert.equal(externalShared.people.find((row) => row.id === cara.id)?.memberKind, 'external')
  assert.deepEqual(collab.externallySharedRecords(ada.id, workspaceId), [
    { collection: '/pages', record_id: 'scope-page' },
  ])

  const backToInternalShared = asAda(() =>
    collab.revokeRecordGrant(ada.id, '/pages', 'scope-page', 'account', cara.id),
  )
  assert.equal(backToInternalShared.scope, 'shared')
  assert.equal(collab.members(ada.id, workspaceId).some((row) => row.id === cara.id), false)

  const backToPersonal = asAda(() =>
    collab.revokeRecordGrant(ada.id, '/pages', 'scope-page', 'account', bob.id),
  )
  assert.equal(backToPersonal.scope, 'personal')
  assert.equal(backToPersonal.private, true)
})

test('collection ownership reports personal, workspace, shared, and external records', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'own-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'own-bob@example.com')
  const cara = collab.register('', Date.now(), 'secret1', 'own-cara@example.com')
  const workspaceId = collab.enter(ada.id)
  collab.enter(bob.id)
  collab.enter(cara.id)
  collab.addMemberByEmail(ada.id, workspaceId, bob.email)
  const asAda = <T>(op: () => T) => runWithAccount(ada.id, () => runWithRequestWorkspace(workspaceId, op))
  asAda(() => collab.attach(workspaceId, '/pages', 'only-ada'))
  asAda(() => collab.attach(workspaceId, '/pages', 'with-bob'))
  asAda(() => collab.attach(workspaceId, '/pages', 'with-cara'))
  asAda(() => collab.attach(workspaceId, '/pages', 'ws-doc', Date.now(), { accessMode: 'members' }))
  asAda(() => collab.attach(workspaceId, '/pages', 'ws-ext-doc', Date.now(), { accessMode: 'members' }))
  asAda(() => collab.shareWithEmail(ada.id, '/pages', 'with-bob', bob.email, 'viewer', 'internal'))
  asAda(() => collab.shareWithEmail(ada.id, '/pages', 'with-cara', cara.email, 'viewer', 'external'))
  asAda(() => collab.shareWithEmail(ada.id, '/pages', 'ws-ext-doc', cara.email, 'viewer', 'external'))
  const scopes = asAda(() => collab.collectionOwnership(workspaceId, '/pages'))
  assert.equal(scopes.get('only-ada'), 'personal')
  assert.equal(scopes.get('with-bob'), 'shared')
  assert.equal(scopes.get('with-cara'), 'external')
  assert.equal(scopes.get('ws-doc'), 'workspace')
  assert.equal(scopes.get('ws-ext-doc'), 'external')
})

test('an account can join as a workspace member through a one-use invite link', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'invite-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'invite-bob@example.com')
  const workspaceId = collab.enter(ada.id)
  collab.enter(bob.id)
  const invite = collab.createWorkspaceInvite(ada.id, workspaceId, 'viewer')
  const accepted = collab.acceptWorkspaceInvite(bob.id, invite.token)
  assert.equal(accepted.workspaceId, workspaceId)
  const member = collab.members(ada.id, workspaceId).find((row) => row.id === bob.id)
  assert.equal(member?.role, 'viewer')
  assert.equal(member?.member_kind, 'member')
  assert.throws(() => collab.acceptWorkspaceInvite(bob.id, invite.token), /已过期或已使用/)
})

test('a temporary guest gets an expiring identity scoped to one record', () => {
  const collab = store()
  const now = Date.now()
  const ada = collab.register('', now, 'secret1', 'guest-ada@example.com')
  const workspaceId = collab.enter(ada.id)
  runWithAccount(ada.id, () => {
    collab.attach(workspaceId, '/pages', 'guest-page')
    collab.attach(workspaceId, '/pages', 'other-page', now, {
      accessMode: 'members',
    })
  })
  const invite = runWithAccount(ada.id, () =>
    collab.createGuestInvite(ada.id, '/pages', 'guest-page', 'viewer', 1, now),
  )
  const guest = collab.acceptGuestInvite(invite.token, '小访客', now + 1)
  assert.equal(collab.accountByToken(guest.token)?.name, '小访客')
  assert.equal(collab.accountByToken(guest.token, invite.expiresAt + 1), null)
  const member = collab.members(ada.id, workspaceId).find((row) => row.id === guest.id)
  assert.equal(member?.member_kind, 'guest')
  assert.equal(runWithAccount(guest.id, () => collab.canReadRecord('/pages', 'guest-page')), true)
  assert.equal(runWithAccount(guest.id, () => collab.canReadRecord('/pages', 'other-page')), false)
  assert.throws(() => collab.acceptGuestInvite(invite.token), /已过期或已使用/)
})

test('login sessions are hashed and can be revoked', () => {
  const collab = store()
  const registered = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  assert.equal(collab.accountByToken(registered.token), null)
  if (previous === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = previous
  const loggedIn = collab.login('ada@example.com', 'secret1')
  assert.equal(collab.accountByToken(loggedIn.token)?.id, loggedIn.id)
  const active = collab.listSessions(loggedIn.id).find((row) => row.revoked_at == null)
  assert.ok(active?.expires_at && active.expires_at > Date.now())
  collab.revokeSession(loggedIn.token)
  assert.equal(collab.accountByToken(loggedIn.token), null)
})

test('mcp credentials stay inside one workspace and die with membership', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const spaceA = collab.createWorkspace(ada.id, 'A')
  const spaceB = collab.createWorkspace(bob.id, 'B')
  collab.addMemberByEmail(ada.id, spaceA.id, 'bob@example.com')
  collab.updateMemberRole(ada.id, spaceA.id, bob.id, 'viewer')
  const adaToken = collab.issueMcpCredential(ada.id, spaceA.id, { allowedTools: ['db_list'] })
  const bobToken = collab.issueMcpCredential(bob.id, spaceA.id)
  const issuedAt = Date.now()
  const shortLived = collab.issueMcpCredential(ada.id, spaceA.id, { expiresAt: issuedAt + 1_000 }, issuedAt)
  assert.equal(collab.resolveMcpCredential(adaToken.token)?.workspaceId, spaceA.id)
  assert.deepEqual(collab.resolveMcpCredential(adaToken.token)?.allowedTools, ['db_list'])
  assert.ok(adaToken.expiresAt > Date.now())
  assert.equal(collab.listMcpCredentials(ada.id, spaceA.id).length, 2)
  collab.auditMcp(collab.resolveMcpCredential(adaToken.token)!, 'db_list', true)
  assert.equal(collab.listMcpAudit(ada.id, spaceA.id)[0]?.tool_name, 'db_list')
  assert.equal(collab.resolveMcpCredential(bobToken.token)?.role, 'viewer')
  assert.equal(collab.resolveMcpCredential(shortLived.token, issuedAt + 1_001), null)
  assert.throws(() => collab.issueMcpCredential(ada.id, spaceB.id), CollabError)
  collab.removeMember(ada.id, spaceA.id, bob.id)
  assert.equal(collab.resolveMcpCredential(bobToken.token), null)
  assert.equal(collab.resolveMcpCredential(adaToken.token)?.accountId, ada.id)
  collab.revokeMcpCredential(ada.id, adaToken.id)
  assert.equal(collab.resolveMcpCredential(adaToken.token), null)
})

test('cross-workspace matrix denies strangers, viewers who write, and revoked sessions', () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const collab = store()
    const now = Date.now()
    const ada = collab.register('', now, 'secret1', 'ada@example.com')
    const bob = collab.register('', now, 'secret1', 'bob@example.com')
    const cara = collab.register('', now, 'secret1', 'cara@example.com')
    const spaceA = collab.createWorkspace(ada.id, 'A')
    const spaceB = collab.createWorkspace(bob.id, 'B')
    collab.addMemberByEmail(ada.id, spaceA.id, 'bob@example.com')
    collab.updateMemberRole(ada.id, spaceA.id, bob.id, 'viewer')
    runWithAccount(ada.id, () =>
      runWithRequestWorkspace(spaceA.id, () => {
        collab.attach(spaceA.id, '/pages', 'shared-page', now, { accessMode: 'members' })
        collab.attach(spaceA.id, '/agents', 'session-a', now)
      }),
    )
    assert.deepEqual(collab.tenantForRecord('/agents', 'session-a'), { workspaceId: spaceA.id, accountId: ada.id })
    const read = (accountId: string, workspaceId: string) =>
      runWithAccount(accountId, () => runWithRequestWorkspace(workspaceId, () => collab.canReadRecord('/pages', 'shared-page')))
    const update = (accountId: string, workspaceId: string) =>
      runWithAccount(accountId, () =>
        runWithRequestWorkspace(workspaceId, () =>
          collab.authorization.authorize(
            { type: 'account', accountId, workspaceId },
            'resource:update',
            { type: 'record', workspaceId, collection: '/pages', recordId: 'shared-page' },
          ).allowed,
        ),
      )
    assert.equal(collab.canReadRecord('/pages', 'shared-page'), false)
    assert.equal(read(ada.id, spaceA.id), true)
    assert.equal(update(ada.id, spaceA.id), true)
    assert.equal(read(bob.id, spaceA.id), true)
    assert.equal(update(bob.id, spaceA.id), false)
    assert.equal(read(bob.id, spaceB.id), false)
    assert.equal(read(cara.id, spaceA.id), false)
    const first = collab.openSession(ada.id, 'phone')
    const second = collab.openSession(ada.id, 'laptop', now - 1)
    assert.equal(collab.accountByToken(second.token), null)
    collab.changePassword(ada.id, 'secret1', 'secret2', first.token)
    assert.equal(collab.accountByToken(first.token)?.id, ada.id)
    assert.throws(() => collab.login('ada@example.com', 'secret1'), CollabError)
    assert.equal(collab.login('ada@example.com', 'secret2').id, ada.id)
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})

test('authorization uses the member workspace selected by the current request', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'request-ada@example.com')
  const active = collab.enter(ada.id)
  const requested = collab.createWorkspace(ada.id, 'Requested')
  collab.setActive(ada.id, active)

  const actor = runWithAccount(ada.id, () =>
    runWithRequestWorkspace(requested.id, () => collab.authorization.currentActor()),
  )
  assert.deepEqual(actor, { type: 'account', accountId: ada.id, workspaceId: requested.id })
  assert.equal(
    runWithAccount(ada.id, () =>
      runWithRequestWorkspace('ws_not_a_member', () => collab.authorization.currentActor()?.workspaceId),
    ),
    active,
  )
})

test('LAN visitors reuse the same localStorage device code as a guest member', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'lan-ada@example.com')
  const workspace = collab.createWorkspace(ada.id, '本地空间')
  collab.setActive(ada.id, workspace.id)
  const first = collab.rememberLanMember(workspace.id, '11111111-2222-3333-4444-555555555555')
  const second = collab.rememberLanMember(workspace.id, '11111111-2222-3333-4444-555555555555')
  assert.equal(first?.id, second?.id)
  assert.equal(first?.name.startsWith('局域网 '), true)
  const other = collab.rememberLanMember(workspace.id, 'lanmwh8waaaaaaaa')
  const clash = collab.rememberLanMember(workspace.id, 'lanmwh8wbbbbbbbb')
  assert.notEqual(other?.name, clash?.name)
  assert.equal(collab.rememberLanMember(workspace.id, 'nope'), null)
  const listed = collab.members(ada.id, workspace.id)
  assert.equal(listed.some((row) => row.id === first?.id && row.member_kind === 'guest'), true)
  assert.equal(listed.some((row) => row.id === ada.id), true)
})

test('activeLocalActor tracks the latest logged-in account and workspacePerson respects request workspace', () => {
  const collab = store()
  const ada = collab.register('Ada', 1000, 'secret1', 'local-ada@example.com')
  const adaWs = collab.createWorkspace(ada.id, 'Ada空间', 1001)
  const sharedWs = collab.createWorkspace(ada.id, '协作空间', 1002)
  const bob = collab.register('Bob', 1003, 'secret1', 'local-bob@example.com')
  const bobWs = collab.createWorkspace(bob.id, 'Bob空间', 1004)
  collab.setActive(ada.id, adaWs.id)
  collab.setActive(bob.id, bobWs.id)
  collab.addMember(ada.id, sharedWs.id, bob.id)
  runWithAccount(bob.id, () =>
    runWithRequestWorkspace(sharedWs.id, () => {
      collab.saveWorkspaceProfile(bob.id, { name: 'Bob(协作)' })
    }),
  )

  // Before any login, falls back to the active workspace owner
  assert.equal(collab.activeLocalActor()?.accountId, bob.id)

  // Login as Ada -> activeLocalActor resolves Ada
  const adaLogin = collab.login('local-ada@example.com', 'secret1')
  assert.equal(collab.activeLocalActor()?.accountId, ada.id)

  // Switch to Bob via login -> activeLocalActor resolves Bob
  const bobLogin = collab.login('local-bob@example.com', 'secret1')
  assert.equal(collab.activeLocalActor()?.accountId, bob.id)
  assert.equal(collab.activeLocalActor()?.workspaceId, bobWs.id)
  assert.equal(collab.activeLocalActor(sharedWs.id)?.workspaceId, sharedWs.id)

  // workspacePerson respects currentRequestWorkspaceId when actor is a member
  const inShared = runWithAccount(bob.id, () =>
    runWithRequestWorkspace(sharedWs.id, () => collab.workspacePerson(bob.id)),
  )
  assert.deepEqual(inShared, { accountId: bob.id, workspaceId: sharedWs.id, name: 'Bob(协作)' })

  // Revoking Bob's session falls back to Ada's live session
  collab.revokeSession(bobLogin.token)
  assert.equal(collab.activeLocalActor()?.accountId, ada.id)
  collab.revokeSession(adaLogin.token)
})

test('saveAccountProfile updates custom account name and avatar independently of email', () => {
  const collab = store()
  const ada = collab.register('', 1000, 'secret1', 'ada@example.com')
  assert.equal(ada.name, 'ada@example.com')
  assert.equal(ada.avatar, '')

  const session = collab.login('ada@example.com', 'secret1')
  const updated = collab.saveAccountProfile(ada.id, {
    name: 'Ada Lovelace',
    avatar: 'data:image/png;base64,iVBORw0KGgo=',
  })
  assert.equal(updated.name, 'Ada Lovelace')
  assert.equal(updated.email, 'ada@example.com')
  assert.equal(updated.avatar, 'data:image/png;base64,iVBORw0KGgo=')

  const fetched = collab.accountByToken(session.token)
  assert.equal(fetched?.name, 'Ada Lovelace')
  assert.equal(fetched?.avatar, 'data:image/png;base64,iVBORw0KGgo=')

  const resetAvatar = collab.saveAccountProfile(ada.id, { avatar: '' })
  assert.equal(resetAvatar.avatar, '')
  assert.equal(resetAvatar.name, 'Ada Lovelace')

  assert.throws(() => collab.saveAccountProfile(ada.id, { name: '   ' }), /账号名不能为空/)
  assert.throws(() => collab.saveAccountProfile(ada.id, { avatar: 'https://evil.example/a.png' }), /头像格式不对/)
})

test('workspacePrefs isolates starredViews, starredRecords, pinnedAgents, and theme/accent/pagePrefs by (workspaceId, accountId)', () => {
  const collab = store()
  const ada = collab.register('Ada', 1000, 'secret1', 'ada-prefs@example.com')
  const bob = collab.register('Bob', 1001, 'secret1', 'bob-prefs@example.com')
  const ws1 = collab.createWorkspace(ada.id, 'WS1', 1002)
  const ws2 = collab.createWorkspace(ada.id, 'WS2', 1003)
  collab.addMemberByEmail(ada.id, ws1.id, bob.email)
  collab.setActive(ada.id, ws1.id)
  collab.setActive(bob.id, ws1.id)

  // Ada stars a view, pins an agent, and sets dark/purple theme in ws1
  collab.saveWorkspacePrefs(
    ada.id,
    {
      starredViews: [{ path: '/pages', viewId: 'v1', name: '重要页面' }],
      starredRecords: [{ path: '/pages', recordId: 'p1', label: '首页' }],
      theme: 'dark',
      accent: 'purple',
      pagePrefs: { wide: true },
    },
    ws1.id,
  )
  collab.setAgentPinned(ada.id, 'agent_1', true, ws1.id)

  // Bob in the SAME workspace ws1 sees completely empty prefs (isolated per account)
  const bobWs1 = collab.workspacePrefs(bob.id, ws1.id)
  assert.deepEqual(bobWs1.starredViews, [])
  assert.deepEqual(bobWs1.starredRecords, [])
  assert.deepEqual(bobWs1.pinnedAgents, [])
  assert.equal(bobWs1.theme, undefined)
  assert.equal(bobWs1.accent, undefined)

  // Ada in a DIFFERENT workspace ws2 sees completely empty prefs (isolated per workspace)
  const adaWs2 = collab.workspacePrefs(ada.id, ws2.id)
  assert.deepEqual(adaWs2.starredViews, [])
  assert.deepEqual(adaWs2.pinnedAgents, [])
  assert.equal(adaWs2.theme, undefined)

  // Ada in ws1 still has all saved prefs and can unpin agent_1
  const adaWs1 = collab.workspacePrefs(ada.id, ws1.id)
  assert.equal(adaWs1.starredViews.length, 1)
  assert.equal(adaWs1.starredViews[0]?.viewId, 'v1')
  assert.deepEqual(adaWs1.pinnedAgents, ['agent_1'])
  assert.equal(adaWs1.theme, 'dark')
  assert.equal(adaWs1.accent, 'purple')
  assert.equal(adaWs1.pagePrefs?.wide, true)

  collab.setAgentPinned(ada.id, 'agent_1', false, ws1.id)
  assert.deepEqual(collab.workspacePrefs(ada.id, ws1.id).pinnedAgents, [])
})

test('single workspace identity: nickname and avatar stay isolated per workspace without duplicate account fallback', () => {
  const collab = store()
  const ada = collab.register('GlobalAda', Date.now(), 'secret1', 'single-ada@example.com')
  const bob = collab.register('GlobalBob', Date.now(), 'secret1', 'single-bob@example.com')
  collab.saveAccountProfile(ada.id, { avatar: 'data:image/png;base64,legacyGlobalAvatar' })
  const ws1 = collab.createWorkspace(ada.id, 'Space 1')
  const ws2 = collab.createWorkspace(ada.id, 'Space 2')
  collab.addMemberByEmail(ada.id, ws1.id, bob.email)

  collab.setActive(ada.id, ws1.id)
  collab.saveWorkspaceProfile(ada.id, {
    name: 'Space1Ada',
    avatar: 'data:image/png;base64,ws1Avatar',
  })
  collab.setActive(ada.id, ws2.id)
  collab.saveWorkspaceProfile(ada.id, {
    name: 'Space2Ada',
    avatar: 'data:image/png;base64,ws2Avatar',
  })

  // Clearing ws1 avatar must NOT clear ws2 avatar or revive legacy global avatar
  collab.setActive(ada.id, ws1.id)
  collab.saveWorkspaceProfile(ada.id, { avatar: '' })
  const ws1Member = collab.members(ada.id, ws1.id).find((m) => m.id === ada.id)
  assert.equal(ws1Member?.name, 'Space1Ada')
  assert.equal(ws1Member?.display_name, 'Space1Ada')
  assert.equal(ws1Member?.avatar, '')

  const ws2Member = collab.members(ada.id, ws2.id).find((m) => m.id === ada.id)
  assert.equal(ws2Member?.name, 'Space2Ada')
  assert.equal(ws2Member?.avatar, 'data:image/png;base64,ws2Avatar')

  // Presence and access rules both reflect workspace nickname/avatar (never '未设置' or stale account name)
  collab.pulse(bob.id, ws1.id, '/pages', 'p1')
  const present = collab.presence(ada.id, ws1.id)
  assert.equal(present.find((p) => p.accountId === bob.id)?.name, 'GlobalBob')

  const rule = collab.createAccessRule(ada.id, ws1.id, {
    collection: '/pages',
    name: 'Rule 1',
    scope: 'workspace',
    filterTree: { op: 'and', children: [] },
    grants: [{ subjectType: 'account', subjectId: ada.id, role: 'editor' }],
  })
  assert.equal(rule.createdByName, 'Space1Ada')
  assert.equal(rule.grants[0]?.subjectName, 'Space1Ada')
  assert.equal(rule.grants[0]?.subjectAvatar, undefined)
})
