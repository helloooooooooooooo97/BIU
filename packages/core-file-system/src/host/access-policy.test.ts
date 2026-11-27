import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

describe('DatabaseAccessPolicy Notion 3-state visibility & orthogonal external access', () => {
  function createScopePolicy(options: {
    actorId: string
    memberKind?: 'member' | 'external' | 'guest'
    ownership: Record<string, 'personal' | 'workspace' | 'shared'>
    owners?: Record<string, string>
    externalCollaborators?: string[]
    publicShareIds?: string[]
  }) {
    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-1',
      membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
      attach: () => {},
      collectionOwnership: () => new Map(Object.entries(options.ownership)),
      collectionRecordOwners: () => new Map(Object.entries(options.owners ?? {})),
      collectionExternalCollaborators: () => new Set(options.externalCollaborators ?? []),
      members: () => [{ id: options.actorId, member_kind: options.memberKind ?? 'member' }],
    }
    const authorization = {
      membershipKind: () => options.memberKind ?? ('member' as const),
      currentActor: () => ({ type: 'account' as const, accountId: options.actorId, workspaceId: 'ws-1' }),
    }
    const host = {
      tags: { list: () => [] } as unknown as AccessPolicyHost['tags'],
      shares: {
        listRecords: () => (options.publicShareIds ?? []).map((recordId) => ({ recordId })),
      } as unknown as AccessPolicyHost['shares'],
      collabStore: () => store,
      authorization: () => authorization as unknown as ReturnType<AccessPolicyHost['authorization']>,
      deviceWorkspace: () => false,
    } as unknown as AccessPolicyHost
    return new DatabaseAccessPolicy(host)
  }

  it('strictly separates workspace, personal, and shared records for internal members', () => {
    const policy = createScopePolicy({
      actorId: 'bob',
      ownership: {
        'ws-1': 'workspace',
        'bob-1': 'personal',
        'ada-shared': 'shared',
      },
      owners: {
        'ws-1': 'ada',
        'bob-1': 'bob',
        'ada-shared': 'ada',
      },
    })
    const rows = [{ id: 'ws-1' }, { id: 'bob-1' }, { id: 'ada-shared' }]
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'workspace').map((r) => r.id), ['ws-1'])
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'personal').map((r) => r.id), ['bob-1'])
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'shared').map((r) => r.id), ['ada-shared'])
  })

  it('keeps public links and external collaborators orthogonal to internal 3-state shareScope', () => {
    const policy = createScopePolicy({
      actorId: 'ada',
      ownership: {
        'ws-pub': 'workspace',
        'priv-pub': 'personal',
        'shared-ext': 'shared',
        'priv-only': 'personal',
      },
      owners: {
        'ws-pub': 'ada',
        'priv-pub': 'ada',
        'shared-ext': 'ada',
        'priv-only': 'ada',
      },
      publicShareIds: ['ws-pub', 'priv-pub'],
      externalCollaborators: ['shared-ext'],
    })
    assert.equal(policy.shareScopeLabel('/pages', 'ws-pub', { id: 'ws-pub' }, 'workspace'), '空间')
    assert.equal(policy.hasExternalAccess('/pages', 'ws-pub'), true)

    assert.equal(policy.shareScopeLabel('/pages', 'priv-pub', { id: 'priv-pub' }, 'personal'), '私人')
    assert.equal(policy.hasExternalAccess('/pages', 'priv-pub'), true)

    assert.equal(policy.shareScopeLabel('/pages', 'shared-ext', { id: 'shared-ext' }, 'shared'), '共享')
    assert.equal(policy.hasExternalAccess('/pages', 'shared-ext'), true)

    assert.equal(policy.shareScopeLabel('/pages', 'priv-only', { id: 'priv-only' }, 'personal'), '私人')
    assert.equal(policy.hasExternalAccess('/pages', 'priv-only'), false)
  })

  it('classifies workspace records as shared for external collaborators', () => {
    const policy = createScopePolicy({
      actorId: 'eve',
      memberKind: 'external',
      ownership: {
        'ws-1': 'workspace',
        'ada-shared': 'shared',
      },
      owners: {
        'ws-1': 'ada',
        'ada-shared': 'ada',
      },
    })
    const rows = [{ id: 'ws-1' }, { id: 'ada-shared' }]
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'workspace').map((r) => r.id), [])
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'personal').map((r) => r.id), [])
    assert.deepEqual(policy.recordsInScope('/pages', rows, 'shared').map((r) => r.id), ['ws-1', 'ada-shared'])
  })

  it('propagates inherited public shares to hasExternalAccess while keeping personal shareScope orthogonal', () => {
    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-1',
      membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
      attach: () => {},
      collectionOwnership: () => new Map([['parent', 'personal'], ['child', 'personal'], ['detached', 'personal']]),
      collectionRecordOwners: () => new Map([['parent', 'ada'], ['child', 'ada'], ['detached', 'ada']]),
      collectionExternalCollaborators: () => new Set(),
      collectionInheritedSources: (_ws, _col, directKeys) => {
        const out = new Map<string, { collection: string; recordId: string }>()
        if (directKeys.has('/pages\tparent')) {
          out.set('child', { collection: '/pages', recordId: 'parent' })
        }
        return out
      },
      members: () => [{ id: 'ada', member_kind: 'member' }],
    }
    const authorization = {
      membershipKind: () => 'member' as const,
      currentActor: () => ({ type: 'account' as const, accountId: 'ada', workspaceId: 'ws-1' }),
    }
    const host = {
      tags: { list: () => [] } as unknown as AccessPolicyHost['tags'],
      shares: {
        list: () => [{ kind: 'record', collection: '/pages', recordId: 'parent', workspaceId: 'ws-1' }],
        listRecords: () => [{ kind: 'record', collection: '/pages', recordId: 'parent', workspaceId: 'ws-1' }],
      } as unknown as AccessPolicyHost['shares'],
      collabStore: () => store,
      authorization: () => authorization as unknown as ReturnType<AccessPolicyHost['authorization']>,
      deviceWorkspace: () => false,
    } as unknown as AccessPolicyHost
    const policy = new DatabaseAccessPolicy(host)

    // Public-only parent & inheriting child stay '私人' (orthogonal!) with hasExternalAccess = true; detached is false
    assert.equal(policy.shareScopeLabel('/pages', 'parent', { id: 'parent' }, 'personal'), '私人')
    assert.equal(policy.hasExternalAccess('/pages', 'parent'), true)
    assert.equal(policy.shareScopeLabel('/pages', 'child', { id: 'child' }, 'personal'), '私人')
    assert.equal(policy.hasExternalAccess('/pages', 'child'), true)
    assert.equal(policy.hasExternalAccess('/pages', 'detached'), false)
  })
})
