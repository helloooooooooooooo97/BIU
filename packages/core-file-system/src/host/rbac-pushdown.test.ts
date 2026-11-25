import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

describe('RBAC SQL pushdown pre-filtering & column-restriction fast path', () => {
  it('computes authorized IDs for SQL pushdown when no view_grants exist and excludes deleted/denied records', () => {
    const ownership = new Map<string, 'personal' | 'workspace' | 'shared'>()
    for (let i = 0; i < 5000; i += 1) {
      ownership.set(`rec-${i}`, i % 2 === 0 ? 'workspace' : 'personal')
    }

    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-1',
      membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
      attach: () => {},
      viewGrantsFor: () => [],
      collectionOwnership: () => ownership,
    }

    let preloaded = 0
    let released = 0
    const authorization = {
      currentActor: () => ({ type: 'account' as const, accountId: 'acc-1', workspaceId: 'ws-1' }),
      preloadCollection: () => {
        preloaded += 1
      },
      releaseCollection: () => {
        released += 1
      },
      authorize: (_actor: unknown, _action: unknown, res: { recordId: string }) => {
        // Even IDs allowed, odd IDs denied
        const idx = Number(res.recordId.split('-')[1])
        return { allowed: idx % 2 === 0, effectiveRole: idx % 2 === 0 ? 'viewer' : null, source: 'workspace' }
      },
    }

    const host = {
      tags: {
        isDeleted: (_col: string, id: string) => id === 'rec-0' || id === 'rec-2',
      } as unknown as AccessPolicyHost['tags'],
      shares: {} as AccessPolicyHost['shares'],
      collabStore: () => store,
      authorization: () => authorization as unknown as ReturnType<AccessPolicyHost['authorization']>,
      deviceWorkspace: () => false,
      markDeviceRecord: () => {},
      collection: () => undefined,
      schemaFor: () => ({ fields: {} }) as ReturnType<AccessPolicyHost['schemaFor']>,
      applyTagOverlay: (_spec: unknown, row: Record<string, unknown>) => row,
    } as unknown as AccessPolicyHost

    const policy = new DatabaseAccessPolicy(host)
    assert.equal(policy.hasViewGrants('/pages'), false)
    assert.equal(policy.hasColumnRestrictions('/pages'), false)

    const t0 = performance.now()
    const allowedIds = policy.resolvePushdownAllowedIds('/pages')
    const elapsedMs = performance.now() - t0

    assert.ok(Array.isArray(allowedIds))
    // 2500 even IDs minus 2 deleted (rec-0, rec-2) = 2498
    assert.equal(allowedIds.length, 2498)
    assert.equal(allowedIds.includes('rec-0'), false)
    assert.equal(allowedIds.includes('rec-1'), false)
    assert.equal(allowedIds.includes('rec-4'), true)
    assert.equal(preloaded, 1)
    assert.equal(released, 1)
    assert.ok(elapsedMs < 500, `expected fast ID pre-filter, took ${elapsedMs.toFixed(2)}ms`)
  })

  it('disables ID-only pushdown and enables column projection when view_grants have column rules', () => {
    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-1',
      membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
      attach: () => {},
      viewGrantsFor: () => [
        {
          view_id: 'v-1',
          subject_type: 'account',
          subject_id: 'acc-1',
          role: 'viewer',
          readable_columns: JSON.stringify(['title', 'status']),
        },
      ],
      collectionOwnership: () => new Map([['rec-1', 'workspace']]),
    }

    const authorization = {
      currentActor: () => ({ type: 'account' as const, accountId: 'acc-1', workspaceId: 'ws-1' }),
    }

    const host = {
      tags: { isDeleted: () => false } as unknown as AccessPolicyHost['tags'],
      shares: {} as AccessPolicyHost['shares'],
      collabStore: () => store,
      authorization: () => authorization as unknown as ReturnType<AccessPolicyHost['authorization']>,
      deviceWorkspace: () => false,
      markDeviceRecord: () => {},
      collection: () => undefined,
      schemaFor: () => ({ fields: {} }) as ReturnType<AccessPolicyHost['schemaFor']>,
      applyTagOverlay: (_spec: unknown, row: Record<string, unknown>) => row,
    } as unknown as AccessPolicyHost

    const policy = new DatabaseAccessPolicy(host)
    assert.equal(policy.hasViewGrants('/pages'), true)
    assert.equal(policy.hasColumnRestrictions('/pages'), true)
    assert.equal(policy.resolvePushdownAllowedIds('/pages'), null)
  })
})
