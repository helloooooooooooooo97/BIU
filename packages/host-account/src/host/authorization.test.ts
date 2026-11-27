import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openAndMigrateBiu, runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from './store.ts'

const dirs: string[] = []

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-authz-'))
  dirs.push(dir)
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  const store = new CollabStore(db)
  const ada = store.register('Ada', 100, 'secret1', 'ada@example.com')
  const bob = store.register('Bob', 101, 'secret1', 'bob@example.com')
  const cara = store.register('Cara', 102, 'secret1', 'cara@example.com')
  const workspace = store.createWorkspace(ada.id, 'Studio', 103)
  store.addMember(ada.id, workspace.id, bob.id, 104)
  store.addMember(ada.id, workspace.id, cara.id, 105)
  const auth = store.authorization
  const actor = (accountId: string, workspaceId = workspace.id) => ({
    type: 'account' as const,
    accountId,
    workspaceId,
  })
  const page = (recordId: string, workspaceId = workspace.id) => ({
    type: 'record' as const,
    workspaceId,
    collection: '/pages',
    recordId,
  })
  return { db, store, auth, ada, bob, cara, workspace, actor, page }
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

test('private records are visible only to their owner until explicitly granted', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('secret'), { accessMode: 'private' })

  assert.deepEqual(auth.authorize(actor(ada.id), 'resource:delete', page('secret')), {
    allowed: true,
    effectiveRole: 'owner',
    source: 'ownership',
  })
  assert.deepEqual(auth.authorize(actor(bob.id), 'resource:read', page('secret')), {
    allowed: false,
    reason: 'PRIVATE_RESOURCE',
  })

  auth.grant(ada.id, page('secret'), 'account', bob.id, 'viewer')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('secret')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('secret')).allowed, false)
})

test('workspace viewers are capped at read/comment even if directly granted editor', () => {
  const { store, auth, ada, bob, cara, workspace, actor, page } = setup()
  store.updateMemberRole(ada.id, workspace.id, bob.id, 'viewer')
  const collection = { type: 'collection' as const, workspaceId: workspace.id, collection: '/pages' }
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', collection).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:create', collection).allowed, false)

  auth.attach(actor(ada.id), page('shared'), { accessMode: 'members' })
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('shared')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('shared')).allowed, false)
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('shared')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:delete', page('shared')).allowed, false)

  store.updateMemberRole(ada.id, workspace.id, cara.id, 'admin')
  assert.equal(auth.authorize(actor(cara.id), 'resource:delete', page('shared')).allowed, true)

  auth.grant(ada.id, page('shared'), 'account', bob.id, 'editor')
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('shared')).allowed, false)

  auth.attach(actor(ada.id), page('private-doc'), { accessMode: 'private' })
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('private-doc')).allowed, false)
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('private-doc')).allowed, false)
})

test('locked member_view grants evaluate dynamically with cache invalidation and lock enforcement', () => {
  const { auth, ada, bob, cara, actor, page } = setup()
  auth.attach(actor(ada.id), page('dynamic'), { accessMode: 'private' })
  const lockedIds = new Set(['mv_eng'])
  auth.setMemberViewLockChecker((_ws, viewId) => lockedIds.has(viewId))

  assert.throws(
    () => auth.grant(ada.id, page('dynamic'), 'member_view', 'v_unlocked', 'viewer'),
    /LOCKED_MEMBER_VIEW_REQUIRED/,
  )

  let matching = new Set([bob.id])
  let calls = 0
  auth.setMemberViewMatcher((_ws, viewId, accountId) => {
    calls += 1
    return viewId === 'mv_eng' && matching.has(accountId)
  })

  auth.grant(ada.id, page('dynamic'), 'member_view', 'mv_eng', 'editor')
  const firstBob = auth.authorize(actor(bob.id), 'resource:update', page('dynamic'))
  assert.equal(firstBob.allowed, true)
  if (firstBob.allowed) assert.equal(firstBob.source, 'member-view-grant')
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('dynamic')).allowed, false)

  // Cached hit does not re-invoke matcher
  const callsBefore = calls
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('dynamic')).allowed, true)
  assert.equal(calls, callsBefore)

  // After invalidation, dynamic audience updates immediately
  matching = new Set([cara.id])
  auth.invalidateAll()
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('dynamic')).allowed, false)
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('dynamic')).allowed, true)
})

test('nested pages inherit, while a private child cuts inheritance cleanly', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('parent'), { accessMode: 'private' })
  auth.grant(ada.id, page('parent'), 'account', bob.id, 'editor')
  auth.attach(actor(ada.id), page('child'), {
    accessMode: 'inherit',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })
  auth.attach(actor(ada.id), page('secret-child'), {
    accessMode: 'private',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })

  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('child')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('secret-child')).allowed, false)
})

test('Notion orthogonal slots: private <-> shared <-> workspace lossless transitions', () => {
  const { store, auth, workspace, ada, bob, cara, actor, page } = setup()
  const asAda = <T>(op: () => T) => runWithAccount(ada.id, () => runWithRequestWorkspace(workspace.id, op))
  asAda(() => store.attach(workspace.id, '/pages', 'doc', 110, { accessMode: 'private' }))

  assert.equal(asAda(() => store.recordAccess(ada.id, '/pages', 'doc')).scope, 'personal')

  // Private -> Shared (add Bob as manager)
  asAda(() => store.shareWithEmail(ada.id, '/pages', 'doc', bob.email, 'manager', 'internal'))
  assert.equal(asAda(() => store.recordAccess(ada.id, '/pages', 'doc')).scope, 'shared')
  assert.equal(auth.authorize(actor(bob.id), 'resource:manage-permissions', page('doc')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('doc')).allowed, false)

  // Shared -> Workspace (enable workspace members viewer; Bob keeps manager!)
  asAda(() => store.setRecordAccessMode(ada.id, '/pages', 'doc', 'members', 'viewer'))
  const wsAccess = asAda(() => store.recordAccess(ada.id, '/pages', 'doc'))
  assert.equal(wsAccess.scope, 'workspace')
  assert.equal(wsAccess.accessMode, 'members')
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('doc')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('doc')).allowed, false)
  assert.equal(auth.authorize(actor(bob.id), 'resource:manage-permissions', page('doc')).allowed, true)

  // Workspace -> Shared (disable workspace members; Bob is still preserved!)
  asAda(() => store.setRecordAccessMode(ada.id, '/pages', 'doc', 'private'))
  const backShared = asAda(() => store.recordAccess(ada.id, '/pages', 'doc'))
  assert.equal(backShared.scope, 'shared')
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('doc')).allowed, false)
  assert.equal(auth.authorize(actor(bob.id), 'resource:manage-permissions', page('doc')).allowed, true)

  // Shared -> Private (remove Bob)
  asAda(() => store.revokeRecordGrant(ada.id, '/pages', 'doc', 'account', bob.id))
  const backPrivate = asAda(() => store.recordAccess(ada.id, '/pages', 'doc'))
  assert.equal(backPrivate.scope, 'personal')
  assert.equal(backPrivate.private, true)
})

test('collection scan preload matches live sqlite authorization including locked member views', () => {
  const { auth, workspace, ada, bob, cara, actor, page } = setup()
  auth.attach(actor(ada.id), page('own'), { accessMode: 'private' })
  auth.attach(actor(ada.id), page('shared'), { accessMode: 'members' })
  auth.attach(actor(ada.id), page('mv'), { accessMode: 'private' })
  auth.setMemberViewLockChecker((_ws, viewId) => viewId === 'mv_team')
  auth.setMemberViewMatcher((_ws, viewId, accountId) => viewId === 'mv_team' && accountId === bob.id)
  auth.grant(ada.id, page('mv'), 'member_view', 'mv_team', 'editor')

  auth.preloadCollection(workspace.id, '/pages', bob.id)
  try {
    assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('own')).allowed, false)
    assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('shared')).allowed, true)
    assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('mv')).allowed, true)
  } finally {
    auth.releaseCollection(workspace.id, '/pages', bob.id)
  }
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('mv')).allowed, false)
})

test('moving a private record under a workspace parent preserves privacy unless inheritOnExpand is set', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('ws-parent'), { accessMode: 'members' })
  auth.attach(actor(ada.id), page('my-note'), { accessMode: 'private' })

  const safeMove = auth.move(actor(ada.id), page('my-note'), page('ws-parent'))
  assert.equal(safeMove.preservedPrivate, true)
  assert.equal(safeMove.scopeExpanded, false)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('my-note')).allowed, false)

  const expanded = auth.move(actor(ada.id), page('my-note'), page('ws-parent'), { inheritOnExpand: true })
  assert.equal(expanded.scopeExpanded, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('my-note')).allowed, true)
})

test('move detects parent cycles and requires move + create-child permissions', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('a'), { accessMode: 'private' })
  auth.attach(actor(ada.id), page('b'), { accessMode: 'inherit', parentCollection: '/pages', parentRecordId: 'a' })
  assert.throws(() => auth.move(actor(ada.id), page('a'), page('b')), /cycle/)
  assert.throws(() => auth.move(actor(bob.id), page('b'), null), /permission denied/)
})

test('anti-self-lock and anti-role-escalation protect record grants', () => {
  const { auth, ada, bob, cara, actor, page } = setup()
  auth.attach(actor(ada.id), page('doc'), { accessMode: 'private' })
  auth.grant(ada.id, page('doc'), 'account', bob.id, 'manager')

  assert.throws(
    () => auth.grant(bob.id, page('doc'), 'account', bob.id, 'viewer'),
    /CANNOT_MODIFY_OWN_GRANT/,
  )
  assert.throws(
    () => auth.grant(bob.id, page('doc'), 'account', cara.id, 'owner'),
    /CANNOT_EXCEED_OWN_ROLE/,
  )
  auth.grant(bob.id, page('doc'), 'account', cara.id, 'manager')
  assert.equal(auth.authorize(actor(cara.id), 'resource:manage-permissions', page('doc')).allowed, true)
})

test('single-transaction batch permissions only modify manageable records and skip unmanageable ones', () => {
  const { store, auth, workspace, ada, bob, cara, actor, page } = setup()
  const asAda = <T>(op: () => T) => runWithAccount(ada.id, () => runWithRequestWorkspace(workspace.id, op))
  const asBob = <T>(op: () => T) => runWithAccount(bob.id, () => runWithRequestWorkspace(workspace.id, op))

  asAda(() => store.attach(workspace.id, '/pages', 'p1', 110, { accessMode: 'private' }))
  asAda(() => store.attach(workspace.id, '/pages', 'p2', 111, { accessMode: 'private' }))
  asBob(() => store.attach(workspace.id, '/pages', 'p3', 112, { accessMode: 'private' }))
  // Bob can only edit p2 (not manage), can manage p1 (via manager grant), and owns p3
  asAda(() => store.shareWithEmail(ada.id, '/pages', 'p1', bob.email, 'manager', 'internal'))
  asAda(() => store.shareWithEmail(ada.id, '/pages', 'p2', bob.email, 'editor', 'internal'))

  const preview = asBob(() => store.previewBatchRecordPermissions(bob.id, '/pages', ['p1', 'p2', 'p3']))
  assert.equal(preview.totalCount, 3)
  assert.equal(preview.manageableCount, 2)
  assert.equal(preview.skippedCount, 1)
  assert.deepEqual(preview.manageableIds.sort(), ['p1', 'p3'])

  const granted = asBob(() =>
    store.batchUpdateRecordPermissions(bob.id, {
      collection: '/pages',
      recordIds: ['p1', 'p2', 'p3'],
      mode: 'grant',
      subjects: [{ subjectType: 'account', subjectId: cara.id }],
      role: 'editor',
    }),
  )
  assert.equal(granted.updatedCount, 2)
  assert.equal(granted.skippedCount, 1)
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('p1')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('p2')).allowed, false)
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('p3')).allowed, true)

  // Batch switch to workspace members
  const madeWs = asBob(() =>
    store.batchUpdateRecordPermissions(bob.id, {
      collection: '/pages',
      recordIds: ['p1', 'p2', 'p3'],
      mode: 'access_mode',
      accessMode: 'members',
      memberDefaultRole: 'viewer',
    }),
  )
  assert.equal(madeWs.updatedCount, 2)
  assert.equal(auth.effectiveAccessMode(page('p1')), 'members')
  assert.equal(auth.effectiveAccessMode(page('p2')), 'private')
  assert.equal(auth.effectiveAccessMode(page('p3')), 'members')
})

test('freezeMemberViewGrants and revokeAllMemberViewGrants guard locked view unlock/delete', () => {
  const { store, auth, workspace, ada, bob, cara, actor, page } = setup()
  const asAda = <T>(op: () => T) => runWithAccount(ada.id, () => runWithRequestWorkspace(workspace.id, op))
  asAda(() => store.attach(workspace.id, '/pages', 'p1', 110, { accessMode: 'private' }))
  asAda(() => store.attach(workspace.id, '/pages', 'p2', 111, { accessMode: 'private' }))
  auth.setMemberViewLockChecker((_ws, viewId) => viewId === 'mv_rd' || viewId === 'mv_ops')
  asAda(() => store.grantMemberView(ada.id, '/pages', 'p1', 'mv_rd', 'editor'))
  asAda(() => store.grantMemberView(ada.id, '/pages', 'p2', 'mv_rd', 'viewer'))

  assert.equal(store.memberViewGrantCount(workspace.id, 'mv_rd'), 2)

  // Freeze converts dynamic member_view grants into static account grants for current members
  const frozen = store.freezeMemberViewGrants(ada.id, workspace.id, 'mv_rd', [bob.id, cara.id])
  assert.equal(frozen.frozenRecords, 2)
  assert.equal(store.memberViewGrantCount(workspace.id, 'mv_rd'), 0)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('p1')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('p2')).allowed, true)

  // Revoke removes dynamic member_view grants directly
  asAda(() => store.grantMemberView(ada.id, '/pages', 'p1', 'mv_ops', 'viewer'))
  assert.equal(store.memberViewGrantCount(workspace.id, 'mv_ops'), 1)
  const revoked = store.revokeAllMemberViewGrants(ada.id, workspace.id, 'mv_ops')
  assert.equal(revoked.revokedRecords, 1)
  assert.equal(store.memberViewGrantCount(workspace.id, 'mv_ops'), 0)
})

test('Agent and MCP actors intersect delegatedBy, invokerId, and ActorScopeRule ceilings', () => {
  const { auth, workspace, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('doc'), { accessMode: 'private' })
  auth.grant(ada.id, page('doc'), 'account', bob.id, 'viewer')
  auth.setActorScope(workspace.id, 'agent', 'ses_1', ada.id, {
    allowedCollections: ['/pages'],
    maxRole: 'editor',
  })

  const agentByAda = {
    type: 'agent' as const,
    accountId: ada.id,
    delegatedBy: ada.id,
    workspaceId: workspace.id,
    sessionId: 'ses_1',
  }
  assert.equal(auth.authorize(agentByAda, 'resource:update', page('doc')).allowed, true)
  assert.equal(auth.authorize(agentByAda, 'resource:delete', page('doc')).allowed, false)

  // When invoked by Bob (viewer), effective permission attenuates to viewer
  const agentInvokedByBob = { ...agentByAda, invokerId: bob.id }
  assert.equal(auth.authorize(agentInvokedByBob, 'resource:read', page('doc')).allowed, true)
  assert.equal(auth.authorize(agentInvokedByBob, 'resource:update', page('doc')).allowed, false)
})

test('removeMember transfers owned records to recipient and clears direct grants and scopes', () => {
  const { store, auth, workspace, ada, bob, cara, actor, page } = setup()
  const asBob = <T>(op: () => T) => runWithAccount(bob.id, () => runWithRequestWorkspace(workspace.id, op))
  asBob(() => store.attach(workspace.id, '/pages', 'bob-private', 110, { accessMode: 'private' }))
  auth.setActorScope(workspace.id, 'mcp', 'mcp_1', bob.id, { maxRole: 'editor' })

  const res = store.removeMember(ada.id, workspace.id, bob.id, { transferToAccountId: cara.id })
  assert.equal(res.transferredTo, cara.id)
  assert.equal(auth.authorize(actor(cara.id), 'resource:delete', page('bob-private')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('bob-private')).allowed, false)
  assert.ok(auth.getActorScope(workspace.id, 'mcp', 'mcp_1')?.revokedAt)
})

test('isLockedMemberView fails closed when no lock checker is registered', () => {
  const { auth, workspace, ada } = setup()
  const page = (id: string) => ({ type: 'record' as const, workspaceId: workspace.id, collection: '/pages', recordId: id })
  const actor = (id: string) => ({ type: 'account' as const, accountId: id, workspaceId: workspace.id })

  auth.attach(actor(ada.id), page('p1'), { accessMode: 'private' })
  assert.equal(auth.isLockedMemberView(workspace.id, 'mv-any'), false)
  assert.throws(
    () => auth.grant(ada.id, page('p1'), 'member_view', 'mv-any', 'viewer'),
    /LOCKED_MEMBER_VIEW_REQUIRED/,
  )
})

test('notices stays personal-only while mcp supports standard 3-state sharing', () => {
  const { store, auth, workspace, ada, bob, actor } = setup()
  const asAda = <T>(op: () => T) => runWithAccount(ada.id, () => runWithRequestWorkspace(workspace.id, op))

  // /notices stays strictly personal-only (tenant-scoped without resource_policies rows)
  const ownNotice = {
    type: 'record' as const,
    workspaceId: workspace.id,
    collection: '/notices',
    recordId: 'n1',
    record: { id: 'n1', accountId: ada.id },
  }
  assert.equal(auth.authorize(actor(ada.id), 'resource:read', ownNotice).allowed, true)
  assert.equal(auth.authorize(actor(ada.id), 'resource:update', ownNotice).allowed, true)
  assert.equal(auth.authorize(actor(ada.id), 'resource:share', ownNotice).allowed, false)
  assert.equal(auth.authorize(actor(ada.id), 'resource:manage-permissions', ownNotice).allowed, false)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', ownNotice).allowed, false)
  assert.throws(() => asAda(() => store.shareWithEmail(ada.id, '/notices', 'n1', bob.email, 'viewer')), /不支持分享/)
  assert.throws(() => asAda(() => store.setRecordAccessMode(ada.id, '/notices', 'n1', 'members', 'viewer')), /不支持分享/)
  assert.throws(() => asAda(() => store.createGuestInvite(ada.id, '/notices', 'n1', 'viewer')), /不支持分享/)
  assert.throws(
    () =>
      asAda(() =>
        store.batchUpdateRecordPermissions(ada.id, {
          collection: '/notices',
          recordIds: ['n1'],
          mode: 'grant',
          subjects: [{ subjectType: 'account', subjectId: bob.id }],
          role: 'viewer',
        }),
      ),
    /不支持分享/,
  )

  // /mcp supports standard 3-state sharing (private -> shared -> workspace)
  const mcpRec = { type: 'record' as const, workspaceId: workspace.id, collection: '/mcp', recordId: 'srv-1' }
  auth.attach(actor(ada.id), mcpRec, { accessMode: 'private' })
  assert.equal(auth.authorize(actor(ada.id), 'resource:share', mcpRec).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', mcpRec).allowed, false)

  asAda(() => store.shareWithEmail(ada.id, '/mcp', 'srv-1', bob.email, 'viewer', 'internal'))
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', mcpRec).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', mcpRec).allowed, false)

  asAda(() => store.setRecordAccessMode(ada.id, '/mcp', 'srv-1', 'members', 'editor'))
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', mcpRec).allowed, true)
})

test('agents clamp non-owner sharing to read-only viewer role', () => {
  const { store, auth, workspace, ada, bob, actor } = setup()
  const asAda = <T>(op: () => T) => runWithAccount(ada.id, () => runWithRequestWorkspace(workspace.id, op))
  const agentRec = { type: 'record' as const, workspaceId: workspace.id, collection: '/agents', recordId: 'ag-1' }

  auth.attach(actor(ada.id), agentRec, { accessMode: 'private' })
  // Even if caller requests editor role via shareWithEmail or members mode, /agents clamps to viewer
  asAda(() => store.shareWithEmail(ada.id, '/agents', 'ag-1', bob.email, 'editor', 'internal'))
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', agentRec).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', agentRec).allowed, false)
  assert.equal(auth.authorize(actor(bob.id), 'resource:delete', agentRec).allowed, false)
  assert.equal(auth.authorize(actor(ada.id), 'resource:update', agentRec).allowed, true)

  asAda(() => store.setRecordAccessMode(ada.id, '/agents', 'ag-1', 'members', 'editor'))
  const decision = auth.authorize(actor(bob.id), 'resource:read', agentRec)
  assert.equal(decision.allowed, true)
  assert.equal(decision.effectiveRole, 'viewer')
})
