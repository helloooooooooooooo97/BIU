import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

describe('RBAC 100% SQL pushdown pre-filtering', () => {
  it('computes authorized IDs for SQL pushdown across 5000 records and excludes deleted/denied records', () => {
    const ownership = new Map<string, 'personal' | 'workspace' | 'shared'>()
    for (let i = 0; i < 5000; i += 1) {
      ownership.set(`rec-${i}`, i % 2 === 0 ? 'workspace' : 'personal')
    }

    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-1',
      membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
      attach: () => {},
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
        const idx = Number(res.recordId.split('-')[1])
        return { allowed: idx % 2 === 0, effectiveRole: idx % 2 === 0 ? 'viewer' : null, source: 'workspace-default' }
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
    } as unknown as AccessPolicyHost

    const policy = new DatabaseAccessPolicy(host)

    const t0 = performance.now()
    const allowedIds = policy.resolvePushdownAllowedIds('/pages')
    const elapsedMs = performance.now() - t0

    assert.ok(Array.isArray(allowedIds))
    assert.equal(allowedIds.length, 2498)
    assert.equal(allowedIds.includes('rec-0'), false)
    assert.equal(allowedIds.includes('rec-1'), false)
    assert.equal(allowedIds.includes('rec-4'), true)
    assert.equal(preloaded, 1)
    assert.equal(released, 1)
    assert.ok(elapsedMs < 500, `expected fast ID pre-filter, took ${elapsedMs.toFixed(2)}ms`)
  })

  it('never circuit-breaks pushdown even when member_view grants are active', () => {
    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-1',
      membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
      attach: () => {},
      collectionOwnership: () =>
        new Map([
          ['rec-1', 'shared'],
          ['rec-2', 'personal'],
        ]),
    }

    const authorization = {
      currentActor: () => ({ type: 'account' as const, accountId: 'acc-1', workspaceId: 'ws-1' }),
      preloadCollection: () => {},
      releaseCollection: () => {},
      authorize: (_actor: unknown, _action: unknown, res: { recordId: string }) =>
        res.recordId === 'rec-1'
          ? { allowed: true, effectiveRole: 'editor', source: 'member-view-grant' }
          : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' },
    }

    const host = {
      tags: { isDeleted: () => false } as unknown as AccessPolicyHost['tags'],
      shares: {} as AccessPolicyHost['shares'],
      collabStore: () => store,
      authorization: () => authorization as unknown as ReturnType<AccessPolicyHost['authorization']>,
      deviceWorkspace: () => false,
    } as unknown as AccessPolicyHost

    const policy = new DatabaseAccessPolicy(host)
    assert.deepEqual(policy.resolvePushdownAllowedIds('/pages'), ['rec-1'])
  })
})
