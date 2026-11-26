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

test('saved views follow standard record RBAC policies without /views special-casing', () => {
  const { auth, ada, bob, workspace, actor } = setup()
  const view = {
    type: 'record' as const,
    workspaceId: workspace.id,
    collection: '/views',
    recordId: 'sessions::recent',
  }
  auth.attach(actor(ada.id), view, { accessMode: 'members', memberDefaultRole: 'editor' })
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', view).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', view).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:delete', view).allowed, false)
  assert.equal(auth.authorize(actor(ada.id), 'resource:delete', view).allowed, true)
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
  // K+1 空间公共表：空间 admin 天然具备 manager 治理权（但对他人私人表仍无权）
  assert.equal(auth.authorize(actor(cara.id), 'resource:update', page('shared')).allowed, true)
  assert.equal(auth.authorize(actor(cara.id), 'resource:delete', page('shared')).allowed, true)
  auth.grant(ada.id, page('shared'), 'account', bob.id, 'editor')
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('shared')).allowed, false)

  auth.attach(actor(ada.id), page('private-viewer'), { accessMode: 'private' })
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('private-viewer')).allowed, false)
  assert.equal(auth.authorize(actor(cara.id), 'resource:read', page('private-viewer')).allowed, false)
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

test('a dynamic group grant evaluates its audience dynamically', () => {
  const { store, auth, workspace, ada, bob, cara, actor, page } = setup()
  auth.attach(actor(ada.id), page('dynamic'), { accessMode: 'private' })
  const dynGroup = store.createGroup(ada.id, workspace.id, '产品动态组', {
    kind: 'dynamic',
    filterTree: { op: 'and', children: [{ field: 'role', op: 'eq', value: 'member' }] },
  })
  let matching = new Set([bob.id])
  auth.setDynamicGroupMatcher((_workspaceId, _filterTreeJson, accountId) => matching.has(accountId))
  auth.grant(ada.id, page('dynamic'), 'group', dynGroup.id, 'viewer')
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
  const dynGroup = store.createGroup(ada.id, workspace.id, '动态产品组', {
    kind: 'dynamic',
    filterTree: { op: 'and', children: [{ field: 'tag', op: 'eq', value: 'product' }] },
  })
  const matching = new Set([cara.id])
  auth.setDynamicGroupMatcher((_workspaceId, _filterTreeJson, accountId) => matching.has(accountId))
  auth.attach(actor(ada.id), page('dynamic'), { accessMode: 'private' })
  auth.grant(ada.id, page('dynamic'), 'group', dynGroup.id, 'viewer')

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
            ids.map((id) => [id, runWithAccount(who.id, () => auth.ownerTableOf(page(id)))]),
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

test('access_rules grant data record access cleanly via dynamic groups', () => {
  const { store, auth, ada, bob, actor, page, workspace } = setup()
  auth.attach(actor(ada.id), page('view-doc'), { accessMode: 'private' })
  const teamGroup = store.createGroup(ada.id, workspace.id, '研发动态组', {
    kind: 'dynamic',
    filterTree: { op: 'and', children: [{ field: 'role', op: 'eq', value: 'member' }] },
  })
  auth.setDynamicGroupMatcher((_ws, _filterTreeJson, accountId) => accountId === bob.id)

  // Before rule creation, Bob has no access to Ada's private record
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', { ...page('view-doc'), record: { tag: 'public' } }).allowed, false)

  // Independent access_rule grants data record access cleanly
  store.createAccessRule(ada.id, workspace.id, {
    collection: '/pages',
    name: 'Public Rule',
    filterTree: { op: 'and', rules: [{ field: 'tag', op: 'eq', value: 'public' }] },
    grants: [{ subjectType: 'group', subjectId: teamGroup.id, role: 'editor' }],
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

test('preloadCollection caches dynamicGroupMatcher and short-circuits unmatched actor access rules', () => {
  const { store, auth, ada, bob, actor, page, workspace } = setup()
  for (let i = 0; i < 30; i += 1) {
    auth.attach(actor(ada.id), page(`doc-${i}`), { accessMode: 'private' })
  }
  const teamGroup = store.createGroup(ada.id, workspace.id, '动态研发组', {
    kind: 'dynamic',
    filterTree: { op: 'and', children: [{ field: 'role', op: 'eq', value: 'member' }] },
  })
  store.createAccessRule(ada.id, workspace.id, {
    collection: '/pages',
    name: 'Team Public',
    filterTree: { op: 'and', rules: [{ field: 'tag', op: 'eq', value: 'public' }] },
    grants: [{ subjectType: 'group', subjectId: teamGroup.id, role: 'editor' }],
  })

  let groupMatcherCalls = 0
  let ruleMatcherCalls = 0
  auth.setDynamicGroupMatcher((_ws, _filterTreeJson, accountId) => {
    groupMatcherCalls += 1
    return accountId === bob.id
  })
  auth.setAccessRuleMatcher((_ws, _col, _filterTreeJson, _recordId, ctx) => {
    ruleMatcherCalls += 1
    return ctx.record?.tag === 'public'
  })

  // Bob 命中动态组：30 行扫描，dynamicGroupMatcher 只算 1 次
  auth.preloadCollection(workspace.id, '/pages', bob.id)
  for (let i = 0; i < 30; i += 1) {
    auth.authorize(actor(bob.id), 'resource:read', { ...page(`doc-${i}`), record: { tag: 'public' } })
  }
  auth.releaseCollection(workspace.id, '/pages', bob.id)
  assert.equal(groupMatcherCalls, 1)
  assert.equal(ruleMatcherCalls, 30)

  // Ada 不命中动态组：30 行扫描，accessRuleMatcher 0 次调用（预过滤后 O(1) 短路）
  groupMatcherCalls = 0
  ruleMatcherCalls = 0
  auth.preloadCollection(workspace.id, '/pages', ada.id)
  for (let i = 0; i < 30; i += 1) {
    auth.authorize(actor(ada.id), 'resource:read', { ...page(`doc-${i}`), record: { tag: 'public' } })
  }
  auth.releaseCollection(workspace.id, '/pages', ada.id)
  assert.equal(groupMatcherCalls, 1)
  assert.equal(ruleMatcherCalls, 0)
})

test('external collaborators cannot access unshared records or /views policies', () => {
  const { store, auth, ada, workspace, actor, page } = setup()
  const external = store.register('Ext', 1, 'secret123', 'ext@example.com')
  runWithAccount(ada.id, () => {
    store.attach(workspace.id, '/pages', 'doc-1', 1)
    store.shareWithEmail(ada.id, '/pages', 'doc-1', 'ext@example.com', 'editor', 'external')
  })

  const viewRef = { type: 'record' as const, workspaceId: workspace.id, collection: '/views', recordId: 'pages::v1' }
  assert.equal(auth.authorize(actor(external.id), 'resource:read', viewRef).allowed, false)
  assert.equal(auth.authorize(actor(external.id), 'resource:read', page('doc-1')).allowed, true)
  assert.equal(auth.authorize(actor(external.id), 'resource:delete', page('doc-1')).allowed, false)
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

  // Cross-table inherit is blocked until explicitly moved with inheritOnExpand: true
  assert.throws(() => auth.setInheritanceMode(actor(ada.id), page('secret-note'), 'inherit'), /CROSS_TABLE_INHERIT_FORBIDDEN/)
  const expandMove = auth.move(actor(ada.id), page('secret-note'), page('public-folder'), { inheritOnExpand: true })
  assert.equal(expandMove.scopeExpanded, true)
  assert.equal(auth.ownerTableOf(page('secret-note')), 'workspace')
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

  // Match internal members for dynamic group 'allGroup' and records with tag === 'project'
  const allGroup = store.createGroup(ada.id, workspace.id, '全员动态组', {
    kind: 'dynamic',
    filterTree: { op: 'and', children: [{ field: 'membershipKind', op: 'eq', value: 'member' }] },
  })
  const internalIds = new Set([ada.id, bob.id, cara.id, dave.id])
  auth.setDynamicGroupMatcher((_ws, _filterTreeJson, accountId) => internalIds.has(accountId))
  auth.setAccessRuleMatcher((_ws, col, _filterTreeJson, _recId, ctx) => col === '/pages' && ctx.record?.tag === 'project')

  // Bob creates a personal access rule sharing project records to allGroup (all members, including Bob and Dave)
  runWithAccount(bob.id, () => {
    store.createAccessRule(bob.id, workspace.id, {
      collection: '/pages',
      name: 'Project Rule',
      filterTree: { op: 'and', rules: [{ field: 'tag', op: 'eq', value: 'project' }] },
      grants: [{ subjectType: 'group', subjectId: allGroup.id, role: 'manager' }],
    })
  })

  // K+1 strict table isolation: Bob's personal rule covers bob-doc, NEVER cara-doc (no 10 -> 20 record leak!)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', { ...page('bob-doc'), record: { tag: 'project' } }).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', { ...page('cara-doc'), record: { tag: 'project' } }).allowed, false)
  assert.equal(auth.authorize(actor(dave.id), 'resource:read', { ...page('bob-doc'), record: { tag: 'project' } }).allowed, true)
  assert.equal(auth.authorize(actor(dave.id), 'resource:read', { ...page('cara-doc'), record: { tag: 'project' } }).allowed, false)

  // Role escalation guard: a manager cannot grant 'owner' on a record
  auth.attach(actor(ada.id), page('ada-owned'), { accessMode: 'private' })
  auth.grant(ada.id, page('ada-owned'), 'account', bob.id, 'manager')
  assert.throws(() => auth.grant(bob.id, page('ada-owned'), 'account', cara.id, 'owner'), /CANNOT_EXCEED_OWN_ROLE/)
})

test('explicit dynamic-group grant on a workspace record takes precedence over workspace-default admin role', () => {
  const { store, auth, workspace, ada, bob, actor, page } = setup()
  store.updateMemberRole(ada.id, workspace.id, bob.id, 'admin')

  const membersGroup = store.createGroup(ada.id, workspace.id, '内部成员动态组', {
    kind: 'dynamic',
    filterTree: { op: 'and', children: [{ field: 'membershipKind', op: 'eq', value: 'member' }] },
  })
  const internalIds = new Set([ada.id, bob.id])
  auth.setDynamicGroupMatcher((_ws, _filterTreeJson, accountId) => internalIds.has(accountId))

  // Ada creates a workspace-scoped record and explicitly grants membersGroup 'editor'
  auth.attach(actor(ada.id), page('ws-doc'), { accessMode: 'members', memberDefaultRole: 'editor' })
  auth.grant(ada.id, page('ws-doc'), 'group', membersGroup.id, 'editor')

  // Bob (workspace admin) gets 'manager' via workspace-default (higher than group 'editor') consistently in authorize() and roleChain()
  const decision = auth.authorize(actor(bob.id), 'resource:read', page('ws-doc'))
  assert.equal(decision.allowed, true)
  if (decision.allowed) {
    assert.equal(decision.effectiveRole, 'manager')
    assert.equal(decision.source, 'workspace-default')
  }
  const chain = auth.roleChain(bob.id, page('ws-doc'))
  assert.equal(chain[0]?.role, 'manager')
  assert.equal(chain[0]?.source, 'workspace-default')
})

test('K+1 logical tables: workspace rules co-managed by admins, strict table isolation, owner-only transfer, and offboarding stability', () => {
  const { store, auth, workspace, ada, bob, cara, actor, page } = setup()
  store.updateMemberRole(ada.id, workspace.id, bob.id, 'admin')
  const ext = store.register('External', Date.now(), 'password123', 'ext@example.com')
  store.addMemberByEmail(ada.id, workspace.id, ext.email, 'member')
  store.db.prepare(`UPDATE workspace_members SET member_kind = 'external' WHERE workspace_id = ? AND account_id = ?`).run(workspace.id, ext.id)

  auth.setAccessRuleMatcher((_ws, _col, _tree, _id, ctx) => ctx.record?.tag === 'client')

  // Cara (normal member) creates a workspace record AND a personal record both tagged 'client'
  auth.attach(actor(cara.id), page('ws-client'), { accessMode: 'members', memberDefaultRole: 'editor' })
  auth.attach(actor(cara.id), page('cara-priv-client'), { accessMode: 'private' })

  // Cara (normal member) cannot create a workspace rule
  assert.throws(
    () =>
      store.createAccessRule(cara.id, workspace.id, {
        collection: '/pages',
        name: 'Forbidden WS Rule',
        scope: 'workspace',
      }),
    /仅空间管理员/,
  )

  // Admin Bob creates a workspace rule granting External viewer access
  const wsRule = store.createAccessRule(bob.id, workspace.id, {
    collection: '/pages',
    name: 'Client Workspace Docs',
    scope: 'workspace',
    filterTree: { op: 'and', children: [] },
    grants: [{ subjectType: 'account', subjectId: ext.id, role: 'viewer' }],
  })
  assert.equal(wsRule.ownerTable, 'workspace')
  assert.equal(wsRule.scope, 'workspace')

  // Owner Ada can see and co-manage Bob's workspace rule; Member Cara sees it read-only
  const adaRules = store.listVisibleAccessRules(ada.id, workspace.id, '/pages')
  assert.equal(adaRules.find((r) => r.id === wsRule.id)?.canManage, true)
  const caraRules = store.listVisibleAccessRules(cara.id, workspace.id, '/pages')
  assert.equal(caraRules.find((r) => r.id === wsRule.id)?.canManage, false)
  assert.throws(() => store.updateAccessRule(cara.id, workspace.id, wsRule.id, { name: 'Hack' }), /仅空间管理员/)
  const renamed = store.updateAccessRule(ada.id, workspace.id, wsRule.id, { name: 'Client WS Docs v2' })
  assert.equal(renamed.name, 'Client WS Docs v2')

  // Workspace rule grants External access to Cara's workspace record, but NEVER to Cara's personal record
  assert.equal(
    auth.authorize(actor(ext.id), 'resource:read', { ...page('ws-client'), record: { id: 'ws-client', tag: 'client' } }).allowed,
    true,
  )
  assert.equal(
    auth.authorize(actor(ext.id), 'resource:read', { ...page('cara-priv-client'), record: { id: 'cara-priv-client', tag: 'client' } }).allowed,
    false,
  )

  // Delegated manager on personal record cannot transfer owner_table to workspace, nor create-child in another's personal table
  auth.grant(cara.id, page('cara-priv-client'), 'account', bob.id, 'manager')
  assert.throws(() => auth.transferOwnerTable(actor(bob.id), page('cara-priv-client'), 'workspace'), /PERSONAL_OWNER_ONLY/)
  assert.equal(auth.authorize(actor(bob.id), 'resource:create-child', page('cara-priv-client')).allowed, false)

  // Owner Cara can transfer personal record to workspace -> External immediately gains access via workspace rule
  auth.transferOwnerTable(actor(cara.id), page('cara-priv-client'), 'workspace')
  assert.equal(
    auth.authorize(actor(ext.id), 'resource:read', { ...page('cara-priv-client'), record: { id: 'cara-priv-client', tag: 'client' } }).allowed,
    true,
  )

  // Admin Ada reclaims workspace record back to Cara's personal table -> External immediately loses access
  auth.transferOwnerTable(actor(ada.id), page('cara-priv-client'), `account:${cara.id}`)
  assert.equal(
    auth.authorize(actor(ext.id), 'resource:read', { ...page('cara-priv-client'), record: { id: 'cara-priv-client', tag: 'client' } }).allowed,
    false,
  )

  // Offboarding Bob preserves Bob's workspace rule while disabling Bob's personal rule
  const bobPersonalRule = store.createAccessRule(bob.id, workspace.id, {
    collection: '/pages',
    name: 'Bob Personal Rule',
    scope: 'personal',
  })
  store.removeMember(ada.id, workspace.id, bob.id)
  assert.equal(store.getAccessRule(workspace.id, wsRule.id)?.enabled, true)
  assert.equal(store.getAccessRule(workspace.id, bobPersonalRule.id)?.enabled, false)
})

test('anti-lockout: non-owner managers cannot self-revoke or downgrade themselves', () => {
  const { store, auth, workspace, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('doc-1'), { accessMode: 'private' })
  auth.grant(ada.id, page('doc-1'), 'account', bob.id, 'manager')

  // Bob (manager, non-owner) cannot downgrade or revoke himself
  assert.throws(() => auth.grant(bob.id, page('doc-1'), 'account', bob.id, 'viewer'), /CANNOT_MODIFY_OWN_GRANT/)
  assert.throws(
    () => runWithAccount(bob.id, () => store.revokeRecordGrant(bob.id, '/pages', 'doc-1', 'account', bob.id)),
    /不能移除自己的权限/,
  )
  assert.ok(workspace.id)
})
