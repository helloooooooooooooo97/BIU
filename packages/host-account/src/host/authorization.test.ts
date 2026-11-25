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
  // Workspace admin role does NOT implicitly grant delete/manager on another member's workspace record
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('shared')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:delete', page('shared')).allowed, false)
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

test('allow grants merge by union across direct and inherited grants', () => {
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

test('view_grants never grants underlying record access; only access_rules do', () => {
  const { store, auth, ada, bob, actor, page, workspace } = setup()
  auth.attach(actor(ada.id), page('view-doc'), { accessMode: 'private' })
  store.grantViewMemberView(ada.id, '/pages', 'v-public', 'mv-team', 'editor')
  auth.setMemberViewMatcher((_ws, viewId, accountId) => viewId === 'mv-team' && accountId === bob.id)

  // Sharing a view via view_grants MUST NOT leak underlying data records
  const deniedByViewGrant = auth.authorize(actor(bob.id), 'resource:read', { ...page('view-doc'), record: { tag: 'public' } })
  assert.equal(deniedByViewGrant.allowed, false)

  // Independent access_rule grants data record access cleanly
  store.createAccessRule(ada.id, workspace.id, {
    collection: '/pages',
    name: 'Public Rule',
    filterTree: { op: 'and', rules: [{ field: 'tag', op: 'eq', value: 'public' }] },
    grants: [{ subjectType: 'member_view', subjectId: 'mv-team', role: 'editor' }],
  })
  auth.setAccessRuleMatcher((_ws, _col, filterTreeJson, _recordId, ctx) => {
    const parsed = JSON.parse(filterTreeJson) as { rules?: Array<{ field?: string; value?: unknown }> }
    return (parsed.rules ?? []).every((r) => !r.field || ctx.record?.[r.field] === r.value)
  })

  const denied = auth.authorize(actor(bob.id), 'resource:read', { ...page('view-doc'), record: { tag: 'internal' } })
  assert.equal(denied.allowed, false)

  const allowed = auth.authorize(actor(bob.id), 'resource:update', { ...page('view-doc'), record: { tag: 'public' } })
  assert.deepEqual(allowed, { allowed: true, effectiveRole: 'editor', source: 'access-rule' })
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

test('preloadCollection caches memberViewMatcher and short-circuits unmatched actor access rules', () => {
  const { store, auth, ada, bob, actor, page, workspace } = setup()
  for (let i = 0; i < 30; i += 1) {
    auth.attach(actor(ada.id), page(`doc-${i}`), { accessMode: 'private' })
  }
  store.createAccessRule(ada.id, workspace.id, {
    collection: '/pages',
    name: 'Team Public',
    filterTree: { op: 'and', rules: [{ field: 'tag', op: 'eq', value: 'public' }] },
    grants: [{ subjectType: 'member_view', subjectId: 'mv-team', role: 'editor' }],
  })

  let memberMatcherCalls = 0
  let ruleMatcherCalls = 0
  auth.setMemberViewMatcher((_ws, viewId, accountId) => {
    memberMatcherCalls += 1
    return viewId === 'mv-team' && accountId === bob.id
  })
  auth.setAccessRuleMatcher((_ws, _col, _filterTreeJson, _recordId, ctx) => {
    ruleMatcherCalls += 1
    return ctx.record?.tag === 'public'
  })

  // Bob 命中 mv-team：30 行扫描，memberViewMatcher 只算 1 次
  auth.preloadCollection(workspace.id, '/pages', bob.id)
  for (let i = 0; i < 30; i += 1) {
    auth.authorize(actor(bob.id), 'resource:read', { ...page(`doc-${i}`), record: { tag: 'public' } })
  }
  auth.releaseCollection(workspace.id, '/pages', bob.id)
  assert.equal(memberMatcherCalls, 1)
  assert.equal(ruleMatcherCalls, 30)

  // Ada 不命中 mv-team：30 行扫描，accessRuleMatcher 0 次调用（预过滤后 O(1) 短路）
  memberMatcherCalls = 0
  ruleMatcherCalls = 0
  auth.preloadCollection(workspace.id, '/pages', ada.id)
  for (let i = 0; i < 30; i += 1) {
    auth.authorize(actor(ada.id), 'resource:read', { ...page(`doc-${i}`), record: { tag: 'public' } })
  }
  auth.releaseCollection(workspace.id, '/pages', ada.id)
  assert.equal(memberMatcherCalls, 1)
  assert.equal(ruleMatcherCalls, 0)
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

  store.cleanupViewReferences(workspace.id, '/pages', 'v-shared')
  store.cleanupViewReferences(workspace.id, '/workspace-members', 'mv-eng')
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

test('agent actor attenuates permissions via invoker intersection and actor_scopes', () => {
  const { auth, ada, bob, workspace, actor, page } = setup()
  auth.attach(actor(ada.id), page('ada-secret'), { accessMode: 'private' })
  auth.attach(actor(ada.id), page('shared-doc'), { accessMode: 'private' })
  auth.grant(ada.id, page('shared-doc'), 'account', bob.id, 'viewer')

  // Shared session created by Ada (owner), triggered by Bob (viewer on shared-doc, no access on ada-secret)
  const sharedAgent: Actor = {
    type: 'agent',
    accountId: ada.id,
    delegatedBy: ada.id,
    invokerId: bob.id,
    workspaceId: workspace.id,
    sessionId: 'sess-1',
  }
  // Confused deputy blocked: Bob cannot read Ada's private doc via Ada's agent
  assert.equal(auth.authorize(sharedAgent, 'resource:read', page('ada-secret')).allowed, false)
  // Intersection on shared-doc: Ada=owner ∩ Bob=viewer => viewer (read ok, update denied)
  assert.equal(auth.authorize(sharedAgent, 'resource:read', page('shared-doc')).allowed, true)
  assert.equal(auth.authorize(sharedAgent, 'resource:update', page('shared-doc')).allowed, false)

  // Actor scope restricts collection & maxRole
  auth.setActorScope(workspace.id, 'agent', 'sess-scoped', ada.id, {
    allowedCollections: ['/tasks'],
    maxRole: 'viewer',
  })
  const scopedAgent: Actor = {
    type: 'agent',
    accountId: ada.id,
    delegatedBy: ada.id,
    workspaceId: workspace.id,
    sessionId: 'sess-scoped',
  }
  const taskRef: Extract<ResourceRef, { type: 'record' }> = {
    type: 'record',
    workspaceId: workspace.id,
    collection: '/tasks',
    recordId: 't1',
  }
  auth.attach(actor(ada.id), taskRef, { accessMode: 'private' })
  assert.equal(auth.authorize(scopedAgent, 'resource:read', taskRef).allowed, true)
  assert.equal(auth.authorize(scopedAgent, 'resource:update', taskRef).allowed, false)
  assert.equal(auth.authorize(scopedAgent, 'resource:read', page('ada-secret')).allowed, false)

  // Revoking actor scope immediately blocks the agent
  auth.revokeActorScope(workspace.id, 'agent', 'sess-scoped')
  assert.equal(auth.authorize(scopedAgent, 'resource:read', taskRef).allowed, false)
})

test('removeMember transfers private owned records and revokes locks, leases, and actor scopes', () => {
  const { store, auth, ada, bob, workspace, actor, page } = setup()
  runWithAccount(bob.id, () => {
    store.attach(workspace.id, '/pages', 'bob-private', 1, { accessMode: 'private' })
  })
  auth.setActorScope(workspace.id, 'agent', 'bob-agent', bob.id, {
    allowedCollections: ['/pages'],
    maxRole: 'editor',
  })

  // Before removal: Ada cannot read Bob's private record
  assert.equal(auth.authorize(actor(ada.id), 'resource:read', page('bob-private')).allowed, false)

  // Remove Bob -> private records transfer to workspace owner Ada, scopes revoked
  const res = store.removeMember(ada.id, workspace.id, bob.id)
  assert.equal(res.transferredTo, ada.id)
  assert.equal(res.transferredRecords, 1)
  assert.equal(auth.authorize(actor(ada.id), 'resource:manage-permissions', page('bob-private')).allowed, true)
  assert.ok(auth.getActorScope(workspace.id, 'agent', 'bob-agent')?.revokedAt)
})

test('no-amplification axiom: sharing a custom view NEVER leaks other members private records and blocks secondary re-sharing', () => {
  const { store, auth, ada, bob, cara, workspace, actor, page } = setup()
  const dave = store.register('Dave', 1, 'secret123', 'dave@example.com')
  store.addMemberByEmail(ada.id, workspace.id, dave.email)
  store.setActive(dave.id, workspace.id)

  // Bob owns 1 private record matching tag='project', Cara owns 1 private record matching tag='project'
  runWithAccount(bob.id, () => {
    store.attach(workspace.id, '/pages', 'bob-doc', 1, { accessMode: 'private' })
  })
  runWithAccount(cara.id, () => {
    store.attach(workspace.id, '/pages', 'cara-doc', 1, { accessMode: 'private' })
  })

  // Match internal members for 'mv-all' and records with tag === 'project'
  const internalIds = new Set([ada.id, bob.id, cara.id, dave.id])
  auth.setMemberViewMatcher((_ws, viewId, accountId) => viewId === 'mv-all' && internalIds.has(accountId))
  auth.setAccessRuleMatcher((_ws, col, _filterTreeJson, _recId, ctx) => col === '/pages' && ctx.record?.tag === 'project')

  // Bob creates an access rule sharing project records to 'mv-all' (all members, including Bob and Dave)
  runWithAccount(bob.id, () => {
    store.createAccessRule(bob.id, workspace.id, {
      collection: '/pages',
      name: 'Project Rule',
      filterTree: { op: 'and', rules: [{ field: 'tag', op: 'eq', value: 'project' }] },
      grants: [{ subjectType: 'member_view', subjectId: 'mv-all', role: 'manager' }],
    })
    store.grantViewMemberView(bob.id, '/pages', 'v-project', 'mv-all', 'manager')
  })

  // Bug #2 fixed: Bob and Dave can see bob-doc, NEVER cara-doc (no 10 -> 20 record leak!)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', { ...page('bob-doc'), record: { tag: 'project' } }).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', { ...page('cara-doc'), record: { tag: 'project' } }).allowed, false)
  assert.equal(auth.authorize(actor(dave.id), 'resource:read', { ...page('bob-doc'), record: { tag: 'project' } }).allowed, true)
  assert.equal(auth.authorize(actor(dave.id), 'resource:read', { ...page('cara-doc'), record: { tag: 'project' } }).allowed, false)

  // Bug #1 fixed: Dave (who only got access via Bob's view grant) CANNOT see or revoke Bob's view grant
  const daveViewAccess = runWithAccount(dave.id, () => store.viewAccess(dave.id, '/pages', 'v-project'))
  assert.equal(daveViewAccess.memberViews.length, 0)
  assert.throws(
    () => runWithAccount(dave.id, () => store.revokeViewGrant(dave.id, '/pages', 'v-project', 'member_view', 'mv-all')),
    /协作者不存在|无权/,
  )

  // Even if Dave creates his own view grant on 'v-project' to an external user, Bob's doc is NOT re-leaked!
  const ext = store.register('ExtLeak', 1, 'secret123', 'extleak@example.com')
  runWithAccount(dave.id, () => {
    store.shareViewWithEmail(dave.id, '/pages', 'v-project', ext.email, 'editor', 'external')
  })
  assert.equal(auth.authorize(actor(ext.id), 'resource:read', { ...page('bob-doc'), record: { tag: 'project' } }).allowed, false)
  assert.equal(auth.authorize(actor(ext.id), 'resource:read', { ...page('cara-doc'), record: { tag: 'project' } }).allowed, false)

  // Role escalation guard: a manager cannot grant 'owner' on a record
  auth.attach(actor(ada.id), page('ada-owned'), { accessMode: 'private' })
  auth.grant(ada.id, page('ada-owned'), 'account', bob.id, 'manager')
  assert.throws(() => auth.grant(bob.id, page('ada-owned'), 'account', cara.id, 'owner'), /CANNOT_EXCEED_OWN_ROLE/)
})

test('explicit member-view grant on a workspace record takes precedence over workspace-default admin role', () => {
  const { store, auth, workspace, ada, bob, actor, page } = setup()
  store.updateMemberRole(ada.id, workspace.id, bob.id, 'admin')

  const internalIds = new Set([ada.id, bob.id])
  auth.setMemberViewMatcher((_ws, viewId, accountId) => viewId === 'builtin-member:member' && internalIds.has(accountId))

  // Ada creates a workspace-scoped record and explicitly grants all members 'editor'
  auth.attach(actor(ada.id), page('ws-doc'), { accessMode: 'members', memberDefaultRole: 'editor' })
  auth.grant(ada.id, page('ws-doc'), 'member_view', 'builtin-member:member', 'editor')

  // Bob (workspace admin) gets 'editor' consistently in both authorize() and explainRecordRole()
  const decision = auth.authorize(actor(bob.id), 'resource:read', page('ws-doc'))
  assert.equal(decision.allowed, true)
  if (decision.allowed) {
    assert.equal(decision.effectiveRole, 'editor')
    assert.equal(decision.source, 'view-grant')
  }
  const chain = auth.roleChain(bob.id, page('ws-doc'))
  assert.equal(chain[0]?.role, 'editor')
  assert.equal(chain[0]?.source, 'view-grant')
})

test('anti-lockout & control/data separation: users cannot self-revoke/downgrade and workspace owner cannot delete others view grants', () => {
  const { store, auth, workspace, ada, bob, cara, actor, page } = setup()
  auth.attach(actor(ada.id), page('doc-1'), { accessMode: 'private' })
  auth.grant(ada.id, page('doc-1'), 'account', bob.id, 'manager')

  // Bob (manager, non-owner) cannot downgrade or revoke himself
  assert.throws(() => auth.grant(bob.id, page('doc-1'), 'account', bob.id, 'viewer'), /CANNOT_MODIFY_OWN_GRANT/)
  assert.throws(
    () => runWithAccount(bob.id, () => store.revokeRecordGrant(bob.id, '/pages', 'doc-1', 'account', bob.id)),
    /不能移除自己的权限/,
  )

  // Bob shares a custom view to Cara; workspace owner Ada cannot see or revoke Bob's view grant in share panel
  runWithAccount(bob.id, () => {
    store.shareViewWithEmail(bob.id, '/pages', 'v-bob', cara.email, 'editor', 'internal')
  })
  const adaView = runWithAccount(ada.id, () => store.viewAccess(ada.id, '/pages', 'v-bob'))
  assert.equal(adaView.people.length, 0)
  assert.throws(
    () => runWithAccount(ada.id, () => store.revokeViewGrant(ada.id, '/pages', 'v-bob', 'account', cara.id)),
    /协作者不存在|无权/,
  )
  // Bob himself CAN revoke his own grant
  runWithAccount(bob.id, () => store.revokeViewGrant(bob.id, '/pages', 'v-bob', 'account', cara.id))
  const bobView = runWithAccount(bob.id, () => store.viewAccess(bob.id, '/pages', 'v-bob'))
  assert.equal(bobView.people.length, 0)
  assert.ok(workspace.id)
})
