import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { currentRequestWorkspaceId, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

describe('DatabaseAccessPolicy multi-tenant bounded LRU caches', () => {
  it('avoids thrashing across 10 interleaved workspaces (99% hit rate over 1000 calls)', () => {
    let ownershipCalls = 0
    let ownerCalls = 0

    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-0',
      membership: () => ({ active: 'ws-0', home: 'ws-0', mine: new Set(), any: new Set() }),
      attach: () => {},
      collectionOwnership: (ws) => {
        ownershipCalls += 1
        return new Map([['rec-1', ws === 'ws-0' ? 'workspace' : 'personal']])
      },
      collectionRecordOwners: (ws) => {
        ownerCalls += 1
        return new Map([['rec-1', `owner-${ws}`]])
      },
    }

    const host = {
      tags: {} as AccessPolicyHost['tags'],
      shares: {
        listRecords: () => [],
      } as unknown as AccessPolicyHost['shares'],
      collabStore: () => store,
      authorization: () => undefined,
      deviceWorkspace: () => false,
    } as unknown as AccessPolicyHost

    const policy = new DatabaseAccessPolicy(host)

    for (let round = 0; round < 100; round += 1) {
      for (let i = 0; i < 10; i += 1) {
        const ws = `ws-${i}`
        runWithRequestWorkspace(ws, () => {
          assert.equal(policy.ownershipOf('/pages', 'rec-1'), i === 0 ? 'workspace' : 'personal')
          assert.equal(policy.recordOwner('/pages', 'rec-1'), `owner-${ws}`)
        })
      }
    }

    // 1000 calls across 10 workspaces -> only 10 backend fetches (99% cache hit rate)
    assert.equal(ownershipCalls, 10)
    assert.equal(ownerCalls, 10)
  })

  it('isolates recordShareIds by workspaceId', () => {
    const sharesByWs: Record<string, Array<{ recordId: string }>> = {
      'ws-a': [{ recordId: 'shared-in-a' }],
      'ws-b': [{ recordId: 'shared-in-b' }],
    }
    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-a',
      membership: () => ({ active: 'ws-a', home: 'ws-a', mine: new Set(), any: new Set() }),
      attach: () => {},
    }
    const host = {
      tags: {} as AccessPolicyHost['tags'],
      shares: {
        listRecords: () => sharesByWs[currentRequestWorkspaceId()] ?? [],
      } as unknown as AccessPolicyHost['shares'],
      collabStore: () => store,
      authorization: () => undefined,
      deviceWorkspace: () => false,
    } as unknown as AccessPolicyHost

    const policy = new DatabaseAccessPolicy(host)

    runWithRequestWorkspace('ws-a', () => {
      const ids = policy.recordShareIds('/pages')
      assert.equal(ids.has('shared-in-a'), true)
      assert.equal(ids.has('shared-in-b'), false)
    })

    runWithRequestWorkspace('ws-b', () => {
      const ids = policy.recordShareIds('/pages')
      assert.equal(ids.has('shared-in-b'), true)
      assert.equal(ids.has('shared-in-a'), false)
    })
  })

  it('markPublicView immediately invalidates recordShareIds cache', () => {
    const records: Array<{ kind: string; collection: string; recordId: string }> = []
    const store: WorkspaceFiles = {
      activeWorkspaceId: () => 'ws-a',
      membership: () => ({ active: 'ws-a', home: 'ws-a', mine: new Set(), any: new Set() }),
      attach: () => {},
    }
    const host = {
      tags: {} as AccessPolicyHost['tags'],
      shares: {
        list: () => records,
        listRecords: () => records,
        upsert: (entry: { kind: string; collection: string; recordId: string }) => {
          records.push(entry)
        },
      } as unknown as AccessPolicyHost['shares'],
      collabStore: () => store,
      authorization: () => undefined,
      deviceWorkspace: () => false,
    } as unknown as AccessPolicyHost

    const policy = new DatabaseAccessPolicy(host)
    runWithRequestWorkspace('ws-a', () => {
      assert.equal(policy.hasPublicShare('/pages', 'p1'), false)
      policy.markPublicView('/pages', 'p1')
      assert.equal(policy.hasPublicShare('/pages', 'p1'), true)
    })
  })
})
