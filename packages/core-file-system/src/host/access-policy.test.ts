import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { builtinAllViewId } from '../catalog-views.ts'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

function createPolicy(
  rules: NonNullable<WorkspaceFiles['listActiveAccessRulesForCollection']> extends (...args: never[]) => infer R ? R : never,
  viewGrants: NonNullable<WorkspaceFiles['viewGrantsFor']> extends (...args: never[]) => infer R ? R : never = [],
) {
  const store: WorkspaceFiles = {
    activeWorkspaceId: () => 'ws-1',
    membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
    attach: () => {},
    viewGrantsFor: () => viewGrants,
    listActiveAccessRulesForCollection: () => rules,
    collectionRecordOwners: () => new Map([['rec-1', 'owner-1']]),
  }
  const authorization = {
    matchesMemberView: () => false,
    membershipKind: () => 'member' as const,
    scopeCurrent: () => 'workspace' as const,
    currentActor: () => ({ type: 'account' as const, accountId: 'acc-1', workspaceId: 'ws-1' }),
    authorize: () => ({ allowed: true, effectiveRole: 'editor', source: 'access-rule' }),
    hasDataViewMatcher: () => false,
    canGrantorShareRecord: () => true,
  }
  const host = {
    tags: {} as AccessPolicyHost['tags'],
    shares: {} as AccessPolicyHost['shares'],
    collabStore: () => store,
    authorization: () => authorization as unknown as ReturnType<AccessPolicyHost['authorization']>,
    deviceWorkspace: () => false,
    markDeviceRecord: () => {},
    collection: () => undefined,
    schemaFor: () => ({ fields: {} }) as ReturnType<AccessPolicyHost['schemaFor']>,
    applyTagOverlay: (_spec: unknown, row: Record<string, unknown>) => row,
    viewCatalog: { viewsFor: () => [] },
  } as unknown as AccessPolicyHost
  return new DatabaseAccessPolicy(host)
}

describe('DatabaseAccessPolicy access_rules column whitelist & view_grants isolation', () => {
  const allViewId = builtinAllViewId('/pages')

  it('view_grants never grants data record roles via viewGrantRole', () => {
    const policy = createPolicy([], [
      {
        view_id: allViewId,
        subject_type: 'account',
        subject_id: 'acc-1',
        role: 'editor',
        granted_by: 'owner-1',
      },
    ])
    assert.equal(policy.viewGrantRole('ws-1', '/pages', { id: 'rec-1' }, 'acc-1'), null)
    assert.equal(policy.allowsViaView('/pages', { id: 'rec-1' }, 'resource:update'), false)
  })

  it('enforces readable and writable column whitelist from active access_rules', () => {
    const policy = createPolicy([
      {
        id: 'rule-1',
        workspaceId: 'ws-1',
        collection: '/pages',
        name: '公开看板规则',
        createdBy: 'owner-1',
        filterTree: { kind: 'group', id: 'root', combinator: 'and', children: [] },
        columns: ['title', 'status'],
        enabled: true,
        grants: [
          {
            id: 'rg-1',
            subjectType: 'account',
            subjectId: 'acc-1',
            role: 'editor',
          },
        ],
      },
    ])
    assert.equal(policy.hasColumnRestrictions('/pages'), true)
    const projected = policy.projectRecord('/pages', {
      id: 'rec-1',
      title: 'Deal',
      status: 'open',
      salary: 99999,
      cost: 5000,
    })
    assert.deepEqual(projected, { id: 'rec-1', title: 'Deal', status: 'open' })
    assert.doesNotThrow(() => policy.assertWritablePatch('/pages', { id: 'rec-1' }, { status: 'done' }))
    assert.throws(() => policy.assertWritablePatch('/pages', { id: 'rec-1' }, { salary: 1 }), /FIELD_FORBIDDEN/)
  })
})
