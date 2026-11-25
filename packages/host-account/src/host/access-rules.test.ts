import { describe, expect, test } from 'vitest'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from './store.ts'

function setupStore() {
  const db = openAndMigrateBiu(':memory:')
  const store = new CollabStore(db)
  const owner = store.register('Owner')
  const ws = store.createWorkspace(owner.id, 'Team')
  const alice = store.register('Alice')
  const bob = store.register('Bob')
  const viewer = store.register('Viewer')
  store.addMember(owner.id, ws.id, alice.id)
  store.addMember(owner.id, ws.id, bob.id)
  store.addMember(owner.id, ws.id, viewer.id)
  store.updateMemberRole(owner.id, ws.id, viewer.id, 'viewer')
  return { db, store, ws, owner, alice, bob, viewer }
}

describe('access_rules store CRUD, ownership isolation, and offboarding', () => {
  test('creator can create, list, update, grant/revoke subjects, and delete own rules', () => {
    const { store, ws, alice, bob } = setupStore()
    const created = store.createAccessRule(alice.id, ws.id, {
      collection: '/pages',
      name: 'Q3 客户资料',
      filterTree: { op: 'and', rules: [{ field: 'status', op: 'eq', value: 'published' }] },
      columns: ['title', 'status'],
      displaySnapshot: { mode: 'board', groupBy: 'status' },
      grants: [{ subjectType: 'account', subjectId: bob.id, role: 'viewer' }],
    })

    expect(created.createdBy).toBe(alice.id)
    expect(created.enabled).toBe(true)
    expect(created.columns).toEqual(['title', 'status'])
    expect(created.displaySnapshot).toEqual({ mode: 'board', groupBy: 'status' })
    expect(created.grants).toHaveLength(1)
    expect(created.grants[0]?.subjectId).toBe(bob.id)
    expect(created.grants[0]?.subjectName).toBe('Bob')

    expect(store.listAccessRulesForOwner(alice.id, ws.id, '/pages')).toHaveLength(1)
    expect(store.listAccessRulesForOwner(bob.id, ws.id, '/pages')).toHaveLength(0)
    expect(store.listActiveAccessRulesForCollection(ws.id, '/pages')).toHaveLength(1)

    const updated = store.updateAccessRule(alice.id, ws.id, created.id, {
      name: 'Q3 客户资料（已更新）',
      columns: ['title'],
      enabled: false,
    })
    expect(updated.name).toBe('Q3 客户资料（已更新）')
    expect(updated.columns).toEqual(['title'])
    expect(updated.enabled).toBe(false)
    expect(store.listActiveAccessRulesForCollection(ws.id, '/pages')).toHaveLength(0)

    const withWs = store.grantAccessRuleSubject(alice.id, ws.id, created.id, {
      subjectType: 'workspace',
      subjectId: ws.id,
      role: 'editor',
    })
    expect(withWs.grants).toHaveLength(2)

    const afterRevoke = store.revokeAccessRuleSubject(alice.id, ws.id, created.id, 'account', bob.id)
    expect(afterRevoke.grants).toHaveLength(1)
    expect(afterRevoke.grants[0]?.subjectType).toBe('workspace')

    store.deleteAccessRule(alice.id, ws.id, created.id)
    expect(store.getAccessRule(ws.id, created.id)).toBeNull()
  })

  test('non-creators (even workspace owner) cannot mutate or delete another member rule, and viewers cannot create rules', () => {
    const { store, ws, owner, alice, bob, viewer } = setupStore()
    const rule = store.createAccessRule(alice.id, ws.id, {
      collection: '/pages',
      name: 'Alice Only',
    })

    expect(() => store.updateAccessRule(owner.id, ws.id, rule.id, { name: 'Hijacked' })).toThrow(/只有规则创建者/)
    expect(() => store.deleteAccessRule(owner.id, ws.id, rule.id)).toThrow(/只有规则创建者/)
    expect(() =>
      store.grantAccessRuleSubject(bob.id, ws.id, rule.id, { subjectType: 'account', subjectId: bob.id, role: 'manager' }),
    ).toThrow(/只有规则创建者/)
    expect(() => store.createAccessRule(viewer.id, ws.id, { collection: '/pages', name: 'Viewer Rule' })).toThrow(/只读成员/)
  })

  test('removeMember auto-disables departed member rules by default and supports optional transfer', () => {
    const { store, ws, owner, alice, bob } = setupStore()
    const aliceRule = store.createAccessRule(alice.id, ws.id, {
      collection: '/pages',
      name: 'Alice Rule',
      grants: [{ subjectType: 'account', subjectId: bob.id, role: 'viewer' }],
    })
    const bobRule = store.createAccessRule(bob.id, ws.id, {
      collection: '/pages',
      name: 'Bob Rule',
      grants: [{ subjectType: 'account', subjectId: alice.id, role: 'editor' }],
    })

    // Default offboarding: auto-disable Alice's rules & strip Alice from other rules' grants
    store.removeMember(owner.id, ws.id, alice.id)
    expect(store.getAccessRule(ws.id, aliceRule.id)?.enabled).toBe(false)
    expect(store.getAccessRule(ws.id, bobRule.id)?.grants).toHaveLength(0)

    // Offboarding with transferAccessRules: true transfers Bob's rule to owner and keeps it enabled
    store.removeMember(owner.id, ws.id, bob.id, { transferToAccountId: owner.id, transferAccessRules: true })
    const transferred = store.getAccessRule(ws.id, bobRule.id)
    expect(transferred?.createdBy).toBe(owner.id)
    expect(transferred?.enabled).toBe(true)
  })
})
