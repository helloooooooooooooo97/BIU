import { describe, expect, test } from 'vitest'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from './store.ts'

function setup() {
  const db = openAndMigrateBiu(':memory:')
  const store = new CollabStore(db)
  const owner = store.register('Owner')
  const ws = store.createWorkspace(owner.id, 'Team')
  const alice = store.register('Alice')
  const bob = store.register('Bob')
  const charlie = store.register('Charlie')
  const viewer = store.register('Viewer')
  store.addMember(owner.id, ws.id, alice.id)
  store.addMember(owner.id, ws.id, bob.id)
  store.addMember(owner.id, ws.id, charlie.id)
  store.addMember(owner.id, ws.id, viewer.id)
  store.updateMemberRole(owner.id, ws.id, viewer.id, 'viewer')

  // Wire a simple filterTree matcher mirroring viewShareListFilter eq rules
  store.authorization.setAccessRuleMatcher((_wsId, _col, filterTreeJson, _recordId, ctx) => {
    const rec = ctx.record ?? {}
    const parsed = JSON.parse(filterTreeJson) as { rules?: Array<{ field?: string; op?: string; value?: unknown }> }
    const rules = parsed.rules ?? []
    for (const r of rules) {
      if (r.field && r.op === 'eq' && rec[r.field] !== r.value) return false
    }
    return true
  })

  // Records:
  // p_alice: owned by Alice (private), status=published
  // p_alice_draft: owned by Alice (private), status=draft
  // p_charlie: owned by Charlie (private), status=published
  // p_readonly: owned by Charlie, Alice has viewer grant only, status=published
  const user = (accountId: string) => ({ type: 'account' as const, accountId, workspaceId: ws.id })
  const page = (recordId: string) => ({ type: 'record' as const, workspaceId: ws.id, collection: '/pages', recordId })
  store.authorization.attach(user(alice.id), page('p_alice'), { accessMode: 'private' })
  store.authorization.attach(user(alice.id), page('p_alice_draft'), { accessMode: 'private' })
  store.authorization.attach(user(charlie.id), page('p_charlie'), { accessMode: 'private' })
  store.authorization.attach(user(charlie.id), page('p_readonly'), { accessMode: 'private' })
  store.authorization.grant(charlie.id, page('p_readonly'), 'account', alice.id, 'viewer')

  return { store, ws, owner, alice, bob, charlie, viewer }
}

describe('AuthorizationService access_rules evaluation', () => {
  test('enforces scope isolation: rule only covers records where creator has owner/manager authority', () => {
    const { store, ws, alice, bob } = setup()
    store.createAccessRule(alice.id, ws.id, {
      collection: '/pages',
      name: 'Published by Alice',
      filterTree: { op: 'and', rules: [{ field: 'status', op: 'eq', value: 'published' }] },
      grants: [{ subjectType: 'account', subjectId: bob.id, role: 'editor' }],
    })

    const bobActor = { type: 'account' as const, accountId: bob.id, workspaceId: ws.id }

    // 1. Alice's published record -> ALLOWED via access-rule as editor
    const d1 = store.authorization.authorize(bobActor, 'resource:update', {
      type: 'record',
      workspaceId: ws.id,
      collection: '/pages',
      recordId: 'p_alice',
      record: { id: 'p_alice', status: 'published' },
    })
    expect(d1).toEqual({ allowed: true, effectiveRole: 'editor', source: 'access-rule' })

    // 2. Alice's draft record -> does not match filterTree -> DENIED
    const d2 = store.authorization.authorize(bobActor, 'resource:read', {
      type: 'record',
      workspaceId: ws.id,
      collection: '/pages',
      recordId: 'p_alice_draft',
      record: { id: 'p_alice_draft', status: 'draft' },
    })
    expect(d2.allowed).toBe(false)

    // 3. Charlie's published private record -> Alice has no authority -> DENIED
    const d3 = store.authorization.authorize(bobActor, 'resource:read', {
      type: 'record',
      workspaceId: ws.id,
      collection: '/pages',
      recordId: 'p_charlie',
      record: { id: 'p_charlie', status: 'published' },
    })
    expect(d3.allowed).toBe(false)

    // 4. Record where Alice only has viewer grant -> Alice cannot share -> DENIED
    const d4 = store.authorization.authorize(bobActor, 'resource:read', {
      type: 'record',
      workspaceId: ws.id,
      collection: '/pages',
      recordId: 'p_readonly',
      record: { id: 'p_readonly', status: 'published' },
    })
    expect(d4.allowed).toBe(false)
  })

  test('enforces single-hop No-Amplification: rule-granted manager cannot re-share via own access_rule', () => {
    const { store, ws, alice, bob, charlie } = setup()
    store.createAccessRule(alice.id, ws.id, {
      collection: '/pages',
      name: 'Alice gives Bob manager',
      filterTree: { op: 'and', rules: [] },
      grants: [{ subjectType: 'account', subjectId: bob.id, role: 'manager' }],
    })
    store.createAccessRule(bob.id, ws.id, {
      collection: '/pages',
      name: 'Bob tries to re-share to Charlie',
      filterTree: { op: 'and', rules: [] },
      grants: [{ subjectType: 'account', subjectId: charlie.id, role: 'viewer' }],
    })

    const bobActor = { type: 'account' as const, accountId: bob.id, workspaceId: ws.id }
    const charlieActor = { type: 'account' as const, accountId: charlie.id, workspaceId: ws.id }

    expect(
      store.authorization.authorize(bobActor, 'resource:read', {
        type: 'record',
        workspaceId: ws.id,
        collection: '/pages',
        recordId: 'p_alice',
        record: { id: 'p_alice' },
      }).allowed,
    ).toBe(true)

    expect(
      store.authorization.authorize(charlieActor, 'resource:read', {
        type: 'record',
        workspaceId: ws.id,
        collection: '/pages',
        recordId: 'p_alice',
        record: { id: 'p_alice' },
      }).allowed,
    ).toBe(false)
  })

  test('workspace subject grants internal members, clamps workspace viewer ceiling, and matches preload scan', () => {
    const { store, ws, alice, bob, viewer } = setup()
    store.createAccessRule(alice.id, ws.id, {
      collection: '/pages',
      name: 'Team Shared',
      filterTree: { op: 'and', rules: [] },
      grants: [{ subjectType: 'workspace', subjectId: ws.id, role: 'editor' }],
    })

    const bobActor = { type: 'account' as const, accountId: bob.id, workspaceId: ws.id }
    const viewerActor = { type: 'account' as const, accountId: viewer.id, workspaceId: ws.id }

    store.authorization.preloadCollection(ws.id, '/pages', bob.id)
    const bobDecision = store.authorization.authorize(bobActor, 'resource:update', {
      type: 'record',
      workspaceId: ws.id,
      collection: '/pages',
      recordId: 'p_alice',
      record: { id: 'p_alice' },
    })
    store.authorization.releaseCollection(ws.id, '/pages', bob.id)
    expect(bobDecision).toEqual({ allowed: true, effectiveRole: 'editor', source: 'access-rule' })

    const viewerRead = store.authorization.authorize(viewerActor, 'resource:read', {
      type: 'record',
      workspaceId: ws.id,
      collection: '/pages',
      recordId: 'p_alice',
      record: { id: 'p_alice' },
    })
    expect(viewerRead).toEqual({ allowed: true, effectiveRole: 'viewer', source: 'access-rule' })

    const viewerWrite = store.authorization.authorize(viewerActor, 'resource:update', {
      type: 'record',
      workspaceId: ws.id,
      collection: '/pages',
      recordId: 'p_alice',
      record: { id: 'p_alice' },
    })
    expect(viewerWrite.allowed).toBe(false)
  })

  test('disabling rule or removing creator immediately revokes rule access', () => {
    const { store, ws, owner, alice, bob } = setup()
    const rule = store.createAccessRule(alice.id, ws.id, {
      collection: '/pages',
      name: 'Temp Rule',
      filterTree: { op: 'and', rules: [] },
      grants: [{ subjectType: 'account', subjectId: bob.id, role: 'viewer' }],
    })

    const bobActor = { type: 'account' as const, accountId: bob.id, workspaceId: ws.id }
    const ref = {
      type: 'record' as const,
      workspaceId: ws.id,
      collection: '/pages',
      recordId: 'p_alice',
      record: { id: 'p_alice' },
    }
    expect(store.authorization.authorize(bobActor, 'resource:read', ref).allowed).toBe(true)

    store.updateAccessRule(alice.id, ws.id, rule.id, { enabled: false })
    expect(store.authorization.authorize(bobActor, 'resource:read', ref).allowed).toBe(false)

    store.updateAccessRule(alice.id, ws.id, rule.id, { enabled: true })
    expect(store.authorization.authorize(bobActor, 'resource:read', ref).allowed).toBe(true)

    store.removeMember(owner.id, ws.id, alice.id)
    expect(store.authorization.authorize(bobActor, 'resource:read', ref).allowed).toBe(false)
  })
})
