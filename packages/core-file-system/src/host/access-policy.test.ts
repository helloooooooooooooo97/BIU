import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

function createPolicy(
  rules: NonNullable<WorkspaceFiles['listActiveAccessRulesForCollection']> extends (...args: never[]) => infer R ? R : never,
) {
  const store: WorkspaceFiles = {
    activeWorkspaceId: () => 'ws-1',
    membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
    attach: () => {},
    listActiveAccessRulesForCollection: () => rules,
    collectionRecordOwners: () => new Map([['rec-1', 'owner-1']]),
  }
  const authorization = {
    matchesMemberView: () => false,
    membershipKind: () => 'member' as const,
    scopeCurrent: () => 'workspace' as const,
    ownerTableOf: () => 'workspace' as string | null,
    currentActor: () => ({ type: 'account' as const, accountId: 'acc-1', workspaceId: 'ws-1' }),
    authorize: () => ({ allowed: true, effectiveRole: 'editor', source: 'access-rule' }),
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

describe('DatabaseAccessPolicy access_rules column whitelist', () => {
  it('enforces readable and writable column whitelist from active access_rules', () => {
    const policy = createPolicy([
      {
        id: 'rule-1',
        workspaceId: 'ws-1',
        collection: '/pages',
        name: '公开看板规则',
        createdBy: 'owner-1',
        ownerTable: 'workspace',
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

describe('DatabaseAccessPolicy K+1 strict scope binding', () => {
  function createScopePolicy(options: {
    actorId: string
    memberKind?: 'member' | 'external' | 'guest'
    ownerTables: Record<string, string>
  }) {
    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-1',
      membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
      attach: () => {},
      members: () => [{ id: options.actorId, member_kind: options.memberKind ?? 'member' }],
    }
    const authorization = {
      ownerTableOf: (ref: { recordId: string }) => options.ownerTables[ref.recordId] ?? null,
      currentActor: () => ({ type: 'account' as const, accountId: options.actorId, workspaceId: 'ws-1' }),
    }
    const host = {
      tags: { list: () => [] } as unknown as AccessPolicyHost['tags'],
      shares: { list: () => [] } as unknown as AccessPolicyHost['shares'],
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

  it('strictly separates workspace, my personal, and others shared personal records', () => {
    const policy = createScopePolicy({
      actorId: 'bob',
      ownerTables: {
        'ws-1': 'workspace',
        'bob-1': 'account:bob',
        'ada-shared': 'account:ada',
      },
    })
    const rows = [{ id: 'ws-1' }, { id: 'bob-1' }, { id: 'ada-shared' }]
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'workspace').map((r) => r.id), ['ws-1'])
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'personal').map((r) => r.id), ['bob-1'])
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'shared').map((r) => r.id), ['ada-shared'])
  })

  it('classifies workspace records as shared for external collaborators', () => {
    const policy = createScopePolicy({
      actorId: 'eve',
      memberKind: 'external',
      ownerTables: {
        'ws-1': 'workspace',
        'ada-shared': 'account:ada',
      },
    })
    const rows = [{ id: 'ws-1' }, { id: 'ada-shared' }]
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'workspace').map((r) => r.id), [])
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'personal').map((r) => r.id), [])
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'shared').map((r) => r.id), ['ws-1', 'ada-shared'])
  })
})
