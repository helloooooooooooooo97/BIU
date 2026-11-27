import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

function createMultiWorkspacePolicy() {
  const attached: Array<{ workspaceId: string; collection: string; recordId: string }> = []
  const ownersByWs = new Map<string, Map<string, string>>([
    ['ws-global', new Map([['rec-1', 'owner-global']])],
    ['ws-req-a', new Map([['rec-1', 'owner-a']])],
    ['ws-req-b', new Map([['rec-1', 'owner-b']])],
  ])
  const ownershipByWs = new Map<string, Map<string, 'personal' | 'workspace' | 'shared'>>([
    ['ws-global', new Map([['rec-1', 'personal']])],
    ['ws-req-a', new Map([['rec-1', 'workspace']])],
    ['ws-req-b', new Map([['rec-1', 'shared']])],
  ])

  const store: WorkspaceFiles = {
    activeWorkspaceId: () => 'ws-global',
    membership: () => ({ active: 'ws-global', home: 'ws-global', mine: new Set(), any: new Set() }),
    attach: (workspaceId, collection, recordId) => {
      attached.push({ workspaceId, collection, recordId })
    },
    collectionRecordOwners: (workspaceId) => ownersByWs.get(workspaceId) ?? new Map(),
    collectionOwnership: (workspaceId) => ownershipByWs.get(workspaceId) ?? new Map(),
  }

  const host = {
    tags: {} as AccessPolicyHost['tags'],
    shares: {} as AccessPolicyHost['shares'],
    collabStore: () => store,
    authorization: () => undefined,
    deviceWorkspace: () => false,
  } as unknown as AccessPolicyHost

  return { policy: new DatabaseAccessPolicy(host), attached }
}

describe('DatabaseAccessPolicy request-scoped workspaceId isolation', () => {
  it('prefers request workspaceId over global activeWorkspaceId', () => {
    const { policy, attached } = createMultiWorkspacePolicy()

    runWithRequestWorkspace('ws-req-a', () => {
      assert.equal(policy.recordOwner('/pages', 'rec-1'), 'owner-a')
      assert.equal(policy.ownershipOf('/pages', 'rec-1'), 'workspace')
      policy.attachWorkspaceRecord('/pages', 'rec-new-a')
    })

    runWithRequestWorkspace('ws-req-b', () => {
      assert.equal(policy.recordOwner('/pages', 'rec-1'), 'owner-b')
      assert.equal(policy.ownershipOf('/pages', 'rec-1'), 'shared')
      policy.attachWorkspaceRecord('/pages', 'rec-new-b')
    })

    assert.deepEqual(attached, [
      { workspaceId: 'ws-req-a', collection: '/pages', recordId: 'rec-new-a' },
      { workspaceId: 'ws-req-b', collection: '/pages', recordId: 'rec-new-b' },
    ])
  })

  it('refuses implicit fallback to global activeWorkspaceId in cloud mode when no request scope is set', () => {
    const prevOnline = process.env.BIU_ONLINE
    process.env.BIU_ONLINE = '1'
    try {
      const { policy, attached } = createMultiWorkspacePolicy()
      assert.equal(policy.recordOwner('/pages', 'rec-1'), '')
      assert.equal(policy.ownershipOf('/pages', 'rec-1'), 'personal')
      assert.equal(policy.workspaceMembership(), null)
      policy.attachWorkspaceRecord('/pages', 'should-not-attach')
      assert.equal(attached.length, 0)

      // Inside an explicit request scope, cloud mode works normally
      runWithRequestWorkspace('ws-req-a', () => {
        assert.equal(policy.recordOwner('/pages', 'rec-1'), 'owner-a')
        assert.equal(policy.ownershipOf('/pages', 'rec-1'), 'workspace')
        policy.attachWorkspaceRecord('/pages', 'rec-scoped')
      })
      assert.deepEqual(attached, [
        { workspaceId: 'ws-req-a', collection: '/pages', recordId: 'rec-scoped' },
      ])
    } finally {
      if (prevOnline === undefined) delete process.env.BIU_ONLINE
      else process.env.BIU_ONLINE = prevOnline
    }
  })
})
