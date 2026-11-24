import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { openAndMigrateBiu, runWithAccount } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from './store.ts'
import type { Actor, ResourceRef } from './authorization.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-authz-'))
  dirs.push(dir)
  const store = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))
  const ada = store.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = store.register('', Date.now(), 'secret1', 'bob@example.com')
  const cara = store.register('', Date.now(), 'secret1', 'cara@example.com')
  const workspace = store.createWorkspace(ada.id, 'Product')
  store.addMemberByEmail(ada.id, workspace.id, bob.email)
  store.addMemberByEmail(ada.id, workspace.id, cara.email)
  store.setActive(ada.id, workspace.id)
  store.setActive(bob.id, workspace.id)
  store.setActive(cara.id, workspace.id)
  const actor = (accountId: string): Actor => ({ type: 'account', accountId, workspaceId: workspace.id })
  const page = (recordId: string): Extract<ResourceRef, { type: 'record' }> => ({
    type: 'record',
    workspaceId: workspace.id,
    collection: '/pages',
    recordId,
  })
  return { store, auth: store.authorization, ada, bob, cara, workspace, actor, page }
}

test('private resources require a direct grant and roles gate actions', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('private'), { accessMode: 'private' })
  assert.equal(auth.authorize(actor(ada.id), 'resource:update', page('private')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('private')).allowed, false)

  auth.grant(ada.id, page('private'), 'account', bob.id, 'viewer')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('private')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('private')).allowed, false)
})

test('workspace member directory is readable by members and managed by owners or admins', () => {
  const { store, auth, ada, bob, workspace, actor } = setup()
  const member = {
    type: 'record' as const,
    workspaceId: workspace.id,
    collection: '/workspace-members',
    recordId: bob.id,
  }
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', member).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', member).allowed, false)
  assert.equal(auth.authorize(actor(ada.id), 'resource:delete', member).allowed, true)
  store.updateMemberRole(ada.id, workspace.id, bob.id, 'admin')
  assert.equal(auth.authorize(actor(bob.id), 'resource:create', {
    type: 'collection',
    workspaceId: workspace.id,
    collection: '/workspace-members',
  }).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:delete', member).allowed, true)
})

test('workspace ownership can be transferred to another member', () => {
  const { store, ada, bob, workspace } = setup()
  store.updateMemberRole(ada.id, workspace.id, bob.id, 'owner')
  const members = store.members(bob.id, workspace.id)
  assert.equal(members.find((row) => row.id === bob.id)?.role, 'owner')
  assert.equal(members.find((row) => row.id === ada.id)?.role, 'admin')
  assert.equal(store.listWorkspaces(bob.id).find((row) => row.id === workspace.id)?.ownerId, bob.id)
})

test('saved views remain workspace system metadata for all members', () => {
  const { auth, bob, workspace, actor } = setup()
  const view = {
    type: 'record' as const,
    workspaceId: workspace.id,
    collection: '/views',
    recordId: 'sessions::recent',
  }
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', view).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', view).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:delete', view).allowed, true)
})

test('workspace viewers can only read resources made visible to them', () => {
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

  auth.attach(actor(ada.id), page('private-viewer'), { accessMode: 'private' })
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('private-viewer')).allowed, false)
})

test('a group grant applies dynamically to its workspace members', () => {
  const { store, auth, ada, bob, actor, page, workspace } = setup()
  auth.attach(actor(ada.id), page('roadmap'), { accessMode: 'restricted' })
  const product = store.createGroup(ada.id, workspace.id, '产品组')
  store.addGroupMemberByEmail(ada.id, workspace.id, product.id, bob.email)
  auth.grant(ada.id, page('roadmap'), 'group', product.id, 'editor')

  const decision = auth.authorize(actor(bob.id), 'resource:update', page('roadmap'))
  assert.equal(decision.allowed, true)
  if (decision.allowed) assert.equal(decision.source, 'group-grant')
})

test('a member-view grant evaluates its audience dynamically', () => {
  const { auth, ada, bob, cara, actor, page } = setup()
  auth.attach(actor(ada.id), page('dynamic'), { accessMode: 'private' })
  let matching = new Set([bob.id])
  auth.setMemberViewMatcher((_workspaceId, viewId, accountId) => viewId === 'product-view' && matching.has(accountId))
  auth.grant(ada.id, page('dynamic'), 'member_view', 'product-view', 'viewer')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('dynamic')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('dynamic')).allowed, false)
  matching = new Set([cara.id])
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('dynamic')).allowed, false)
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('dynamic')).allowed, true)
})

test('nested pages inherit, while a restricted child cuts inheritance', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('parent'), { accessMode: 'private' })
  auth.grant(ada.id, page('parent'), 'account', bob.id, 'editor')
  auth.attach(actor(ada.id), page('child'), {
    accessMode: 'inherit',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })
  auth.attach(actor(ada.id), page('secret-child'), {
    accessMode: 'restricted',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })

  const inherited = auth.authorize(actor(bob.id), 'resource:update', page('child'))
  assert.equal(inherited.allowed, true)
  if (inherited.allowed) assert.equal(inherited.source, 'inherited')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('secret-child')).allowed, false)
})

test('allow grants merge by union while explicit deny overrides stronger inherited grants', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('parent'), { accessMode: 'private' })
  auth.grant(ada.id, page('parent'), 'account', bob.id, 'editor')
  auth.attach(actor(ada.id), page('child'), {
    accessMode: 'inherit',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })
  // Adding a lower allow grant on child does NOT accidentally downgrade inherited editor (Allow union)
  auth.grant(ada.id, page('child'), 'account', bob.id, 'viewer')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('child')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('child')).allowed, true)

  // Explicit deny on editor caps Bob at commenter (can read & comment, cannot update)
  auth.deny(ada.id, page('child'), 'account', bob.id, 'editor')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('child')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:comment', page('child')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('child')).allowed, false)

  // Explicit deny on viewer blocks Bob completely
  auth.deny(ada.id, page('child'), 'account', bob.id, 'viewer')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('child')).allowed, false)
})

test('commenter role allows reading and commenting but blocks updates, and reconcileRecordScope preserves members/inherit', () => {
  const { store, auth, ada, bob, cara, workspace, actor, page } = setup()
  const ext = store.register('Ext3', 1, 'secret123', 'ext3@example.com')

  // commenter role check
  auth.attach(actor(ada.id), page('review-doc'), { accessMode: 'private' })
  auth.grant(ada.id, page('review-doc'), 'account', bob.id, 'commenter')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('review-doc')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:comment', page('review-doc')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('review-doc')).allowed, false)

  // Adding an external collaborator to a members-visible record must NOT wipe out workspace members' access
  runWithAccount(ada.id, () => {
    store.attach(workspace.id, '/pages', 'team-doc', 1, { accessMode: 'members', memberDefaultRole: 'editor' })
    store.shareWithEmail(ada.id, '/pages', 'team-doc', ext.email, 'viewer', 'external')
  })
  assert.equal(auth.authorize(actor(ext.id), 'resource:read', page('team-doc')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('team-doc')).allowed, true)

  // Adding a collaborator to an inherited child must NOT cut inheritance
  runWithAccount(ada.id, () => {
    store.attach(workspace.id, '/pages', 'root-doc', 1, { accessMode: 'members', memberDefaultRole: 'editor' })
    store.attach(workspace.id, '/pages', 'sub-doc', 1, {
      accessMode: 'inherit',
      parentCollection: '/pages',
      parentRecordId: 'root-doc',
    })
    store.shareWithEmail(ada.id, '/pages', 'sub-doc', ext.email, 'viewer', 'external')
  })
  assert.equal(auth.authorize(actor(ext.id), 'resource:read', page('sub-doc')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('sub-doc')).allowed, true)
})

test('collection scan preload matches live sqlite authorization', () => {
  const { store, auth, ada, bob, cara, actor, page, workspace } = setup()
  auth.attach(actor(ada.id), page('private'), { accessMode: 'private' })
  auth.attach(actor(ada.id), page('members'), { accessMode: 'members' })
  auth.attach(actor(ada.id), page('parent'), { accessMode: 'private' })
  auth.grant(ada.id, page('parent'), 'account', bob.id, 'editor')
  auth.attach(actor(ada.id), page('child'), {
    accessMode: 'inherit',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })
  const product = store.createGroup(ada.id, workspace.id, '产品组')
  store.addGroupMemberByEmail(ada.id, workspace.id, product.id, bob.email)
  auth.attach(actor(ada.id), page('roadmap'), { accessMode: 'restricted' })
  auth.grant(ada.id, page('roadmap'), 'group', product.id, 'editor')
  const matching = new Set([cara.id])
  auth.setMemberViewMatcher((_workspaceId, viewId, accountId) => viewId === 'product-view' && matching.has(accountId))
  auth.attach(actor(ada.id), page('dynamic'), { accessMode: 'private' })
  auth.grant(ada.id, page('dynamic'), 'member_view', 'product-view', 'viewer')

  const snapshot = () => {
    const actions = ['resource:read', 'resource:update', 'resource:delete'] as const
    const ids = ['private', 'members', 'parent', 'child', 'roadmap', 'dynamic']
    const people = [ada, bob, cara]
    return {
      decisions: people.flatMap((who) =>
        ids.flatMap((id) =>
          actions.map((action) => {
            const decision = auth.authorize(actor(who.id), action, page(id))
            return {
              who: who.email,
              id,
              action,
              allowed: decision.allowed,
              role: decision.allowed ? decision.effectiveRole : decision.reason,
              source: decision.allowed ? decision.source : undefined,
            }
          }),
        ),
      ),
      scopes: Object.fromEntries(
        people.map((who) => [
          who.email,
          Object.fromEntries(
            ids.map((id) => [id, runWithAccount(who.id, () => auth.scopeCurrent(page(id)))]),
          ),
        ]),
      ),
    }
  }

  const live = snapshot()
  auth.preloadCollection(workspace.id, '/pages', ada.id)
  auth.preloadCollection(workspace.id, '/pages', ada.id)
  auth.preloadCollection(workspace.id, '/pages', bob.id)
  assert.deepEqual(snapshot(), live)
  auth.releaseCollection(workspace.id, '/pages', ada.id)
  assert.deepEqual(snapshot(), live)
  auth.releaseCollection(workspace.id, '/pages', ada.id)
  auth.releaseCollection(workspace.id, '/pages', bob.id)
  assert.deepEqual(snapshot(), live)

  auth.preloadCollection(workspace.id, '/pages', ada.id)
  auth.grant(ada.id, page('private'), 'account', bob.id, 'viewer')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('private')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('private')).allowed, false)
  auth.releaseCollection(workspace.id, '/pages', ada.id)
})

test('grant notifies invalidators so list caches can drop', () => {
  const { auth, ada, bob, actor, page } = setup()
  let n = 0
  const stop = auth.onInvalidate(() => {
    n += 1
  })
  auth.attach(actor(ada.id), page('private'), { accessMode: 'private' })
  assert.ok(n >= 1)
  const afterAttach = n
  auth.attach(actor(ada.id), page('private'), { accessMode: 'private' })
  assert.equal(n, afterAttach)
  auth.grant(ada.id, page('private'), 'account', bob.id, 'viewer')
  assert.ok(n > afterAttach)
  const afterGrant = n
  auth.grant(ada.id, page('private'), 'account', bob.id, 'viewer')
  assert.equal(n, afterGrant)
  stop()
})

test('an agent has exactly the delegating account permissions', () => {
  const { auth, ada, bob, actor, page, workspace } = setup()
  auth.attach(actor(ada.id), page('agent-page'), { accessMode: 'private' })
  auth.grant(ada.id, page('agent-page'), 'account', bob.id, 'editor')
  const agent: Actor = {
    type: 'agent',
    accountId: bob.id,
    delegatedBy: bob.id,
    workspaceId: workspace.id,
    sessionId: 's1',
  }
  assert.equal(auth.authorize(agent, 'resource:update', page('agent-page')).allowed, true)
  assert.equal(auth.authorize(agent, 'resource:manage-permissions', page('agent-page')).allowed, false)
})

test('dataViewMatcher unifies view_grants inside AuthorizationService.authorize', () => {
  const { store, auth, ada, bob, actor, page, workspace } = setup()
  auth.attach(actor(ada.id), page('view-doc'), { accessMode: 'private' })
  store.grantViewMemberView(ada.id, '/pages', 'v-public', 'mv-team', 'editor')
  auth.setMemberViewMatcher((_ws, viewId, accountId) => viewId === 'mv-team' && accountId === bob.id)
  auth.setDataViewMatcher((_ws, _col, viewId, _recordId, ctx) => viewId === 'v-public' && ctx.record?.tag === 'public')

  const denied = auth.authorize(actor(bob.id), 'resource:read', { ...page('view-doc'), record: { tag: 'internal' } })
  assert.equal(denied.allowed, false)

  const allowed = auth.authorize(actor(bob.id), 'resource:update', { ...page('view-doc'), record: { tag: 'public' } })
  assert.deepEqual(allowed, { allowed: true, effectiveRole: 'editor', source: 'data-view-grant' })
})

test('setInheritanceMode toggles inherit vs custom while preserving parent link', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('parent'), { accessMode: 'private' })
  auth.grant(ada.id, page('parent'), 'account', bob.id, 'editor')
  auth.attach(actor(ada.id), page('child'), { parentRecordId: 'parent' })

  assert.equal(auth.inheritanceInfo(page('child')).mode, 'inherit')
  assert.equal(auth.inheritanceInfo(page('child')).hasParent, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('child')).allowed, true)

  // 断开继承后，Bob 失去访问权，但仍保留父级关系以便随时恢复
  auth.setInheritanceMode(actor(ada.id), page('child'), 'custom')
  assert.equal(auth.inheritanceInfo(page('child')).mode, 'custom')
  assert.equal(auth.inheritanceInfo(page('child')).hasParent, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('child')).allowed, false)

  // 重新开启继承后，Bob 恢复访问权
  auth.setInheritanceMode(actor(ada.id), page('child'), 'inherit')
  assert.equal(auth.inheritanceInfo(page('child')).mode, 'inherit')
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('child')).allowed, true)
})

test('preloadCollection caches memberViewMatcher and short-circuits unmatched actor view grants', () => {
  const { store, auth, ada, bob, actor, page, workspace } = setup()
  for (let i = 0; i < 30; i += 1) {
    auth.attach(actor(ada.id), page(`doc-${i}`), { accessMode: 'private' })
  }
  store.grantViewMemberView(ada.id, '/pages', 'v-public', 'mv-team', 'editor')

  let memberMatcherCalls = 0
  let dataMatcherCalls = 0
  auth.setMemberViewMatcher((_ws, viewId, accountId) => {
    memberMatcherCalls += 1
    return viewId === 'mv-team' && accountId === bob.id
  })
  auth.setDataViewMatcher((_ws, _col, viewId, _recordId, ctx) => {
    dataMatcherCalls += 1
    return viewId === 'v-public' && ctx.record?.tag === 'public'
  })

  // Bob 命中 mv-team：30 行扫描，memberViewMatcher 只算 1 次
  auth.preloadCollection(workspace.id, '/pages', bob.id)
  for (let i = 0; i < 30; i += 1) {
    auth.authorize(actor(bob.id), 'resource:read', { ...page(`doc-${i}`), record: { tag: 'public' } })
  }
  auth.releaseCollection(workspace.id, '/pages', bob.id)
  assert.equal(memberMatcherCalls, 1)
  assert.equal(dataMatcherCalls, 30)

  // Ada 不命中 mv-team：30 行扫描，dataViewMatcher 0 次调用（预过滤后 O(1) 短路）
  memberMatcherCalls = 0
  dataMatcherCalls = 0
  auth.preloadCollection(workspace.id, '/pages', ada.id)
  for (let i = 0; i < 30; i += 1) {
    auth.authorize(actor(ada.id), 'resource:read', { ...page(`doc-${i}`), record: { tag: 'public' } })
  }
  auth.releaseCollection(workspace.id, '/pages', ada.id)
  assert.equal(memberMatcherCalls, 1)
  assert.equal(dataMatcherCalls, 0)
})

test('external and guest collaborators are read-only on /views and policy-bound views are detected', () => {
  const { store, auth, ada, bob, workspace, actor, page } = setup()
  const external = store.register('Ext', 1, 'secret123', 'ext@example.com')
  runWithAccount(ada.id, () => {
    store.attach(workspace.id, '/pages', 'doc-1', 1)
    store.shareWithEmail(ada.id, '/pages', 'doc-1', 'ext@example.com', 'editor', 'external')
  })

  const viewRef = { type: 'record' as const, workspaceId: workspace.id, collection: '/views', recordId: 'pages::v1' }
  assert.equal(auth.authorize(actor(external.id), 'resource:read', viewRef).allowed, true)
  assert.equal(auth.authorize(actor(external.id), 'resource:update', viewRef).allowed, false)
  assert.equal(auth.authorize(actor(external.id), 'resource:delete', viewRef).allowed, false)

  runWithAccount(ada.id, () => {
    store.shareViewWithEmail(ada.id, '/pages', 'v-shared', 'bob@example.com', 'editor', 'internal')
  })
  assert.equal(auth.isViewPolicyBound(workspace.id, '/pages', 'v-shared'), true)
  assert.equal(auth.isViewPolicyBound(workspace.id, '/pages', 'v-other'), false)
  assert.equal(auth.canModifyPolicyLockedView(workspace.id, ada.id), true)
  assert.equal(auth.canModifyPolicyLockedView(workspace.id, bob.id), false)
  assert.equal(auth.canModifyPolicyLockedView(workspace.id, external.id), false)

  runWithAccount(ada.id, () => {
    store.grantMemberView(ada.id, '/pages', 'doc-1', 'mv-eng', 'viewer')
  })
  assert.equal(auth.isViewPolicyBound(workspace.id, '/workspace-members', 'mv-eng'), true)

  store.cleanupViewReferences(workspace.id, '/pages', 'v-shared')
  assert.equal(auth.isViewPolicyBound(workspace.id, '/pages', 'v-shared'), false)
  store.cleanupViewReferences(workspace.id, '/workspace-members', 'mv-eng')
  assert.equal(auth.isViewPolicyBound(workspace.id, '/workspace-members', 'mv-eng'), false)
  assert.equal(page('doc-1').recordId, 'doc-1')
})

test('memberActivity blocks external collaborators and filters private records and foreign grants', () => {
  const { store, auth, ada, bob, workspace, actor, page } = setup()
  const external = store.register('Ext', 1, 'secret123', 'ext2@example.com')
  runWithAccount(ada.id, () => {
    store.attach(workspace.id, '/pages', 'secret-doc', 1, { accessMode: 'private' })
    store.attach(workspace.id, '/pages', 'public-doc', 1, { accessMode: 'members', memberDefaultRole: 'editor' })
    store.shareWithEmail(ada.id, '/pages', 'public-doc', 'ext2@example.com', 'viewer', 'external')
    store.shareWithEmail(ada.id, '/pages', 'public-doc', bob.email, 'editor', 'internal')
    store.recordActivity({
      workspaceId: workspace.id,
      actorId: ada.id,
      category: 'data',
      action: 'record.update',
      collection: '/pages',
      recordId: 'secret-doc',
      recordTitle: 'Top Secret Salary',
    })
    store.recordActivity({
      workspaceId: workspace.id,
      actorId: ada.id,
      category: 'data',
      action: 'record.update',
      collection: '/pages',
      recordId: 'public-doc',
      recordTitle: 'Team Handbook',
    })
  })
  store.setActive(external.id, workspace.id)

  // External collaborator cannot call workspace-level endpoints
  assert.throws(() => runWithAccount(external.id, () => store.memberActivity(external.id, ada.id)), /外部协作者/)
  assert.throws(() => store.groups(external.id, workspace.id), /外部协作者/)
  assert.throws(() => store.externallySharedRecords(external.id, workspace.id), /外部协作者/)

  // Internal member Bob sees Ada's activity on public-doc, NOT secret-doc, and cannot see Ada's grants list
  const bobView = runWithAccount(bob.id, () => store.memberActivity(bob.id, ada.id))
  assert.equal(bobView.recent.some((item) => item.recordId === 'secret-doc'), false)
  assert.equal(bobView.recent.some((item) => item.recordId === 'public-doc'), true)
  assert.deepEqual(bobView.grants.records, [])
  assert.deepEqual(bobView.grants.views, [])

  // Owner Ada sees her own full activity and grants
  const adaView = runWithAccount(ada.id, () => store.memberActivity(ada.id, ada.id))
  assert.equal(adaView.recent.some((item) => item.recordId === 'secret-doc'), true)

  // Legacy record without resource_policies is never readable by external collaborator
  assert.equal(auth.authorize(actor(external.id), 'resource:read', page('unattached-legacy')).allowed, false)
})

test('updateMemberRole and addGroupMemberByEmail invalidate authorization caches', () => {
  const { store, auth, ada, bob, workspace } = setup()
  let invalidated = 0
  const dispose = auth.onInvalidate(() => {
    invalidated += 1
  })
  store.updateMemberRole(ada.id, workspace.id, bob.id, 'admin')
  assert.ok(invalidated >= 1)
  const beforeGroup = invalidated
  const grp = store.createGroup(ada.id, workspace.id, 'Eng')
  store.addGroupMemberByEmail(ada.id, workspace.id, grp.id, bob.email)
  assert.ok(invalidated > beforeGroup)
  dispose()
})

test('moving a private inherited record under a workspace-visible parent preserves privacy unless inheritOnExpand is set', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('private-folder'), { accessMode: 'private' })
  auth.attach(actor(ada.id), page('public-folder'), { accessMode: 'members', memberDefaultRole: 'editor' })
  auth.attach(actor(ada.id), page('secret-note'), {
    accessMode: 'inherit',
    parentCollection: '/pages',
    parentRecordId: 'private-folder',
  })

  // Before move: Bob cannot see secret-note
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('secret-note')).allowed, false)

  // Default move into public-folder preserves private scope (does NOT silently expose to Bob)
  const safeMove = auth.move(actor(ada.id), page('secret-note'), page('public-folder'))
  assert.equal(safeMove.preservedPrivate, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('secret-note')).allowed, false)

  // Explicit inherit toggle or inheritOnExpand exposes it as intended
  auth.setInheritanceMode(actor(ada.id), page('secret-note'), 'inherit')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('secret-note')).allowed, true)
})
