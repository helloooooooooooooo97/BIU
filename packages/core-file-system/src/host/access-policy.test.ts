import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { builtinAllViewId } from '../catalog-views.ts'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

function createPolicy(grants: NonNullable<WorkspaceFiles['viewGrantsFor']> extends (...args: never[]) => infer R ? R : never) {
  const store: WorkspaceFiles = {
    activeWorkspaceId: () => 'ws-1',
    membership: () => ({ active: 'ws-1', home: 'ws-1', mine: new Set(), any: new Set() }),
    attach: () => {},
    viewGrantsFor: () => grants,
    collectionRecordOwners: () => new Map([['rec-1', 'owner-1']]),
  }
  const authorization = {
    matchesMemberView: () => false,
    scopeCurrent: () => 'workspace' as const,
    currentActor: () => ({ type: 'account' as const, accountId: 'acc-1', workspaceId: 'ws-1' }),
    authorize: () => ({ allowed: false, effectiveRole: null, source: 'none' }),
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
  } as unknown as AccessPolicyHost
  return new DatabaseAccessPolicy(host)
}

describe('DatabaseAccessPolicy.viewGrantRole deny semantics', () => {
  const allViewId = builtinAllViewId('/pages')

  it('does not treat an explicit deny view grant as allow', () => {
    const policy = createPolicy([
      {
        view_id: allViewId,
        subject_type: 'account',
        subject_id: 'acc-1',
        role: 'editor',
        effect: 'deny',
        granted_by: 'owner-1',
      },
    ])
    assert.equal(policy.viewGrantRole('ws-1', '/pages', { id: 'rec-1' }, 'acc-1'), null)
    assert.equal(policy.allowsViaView('/pages', { id: 'rec-1' }, 'resource:read'), false)
  })

  it('enforces Deny-overrides-Allow when both allow and deny view grants match', () => {
    const policy = createPolicy([
      {
        view_id: allViewId,
        subject_type: 'account',
        subject_id: 'acc-1',
        role: 'editor',
        effect: 'allow',
        granted_by: 'owner-1',
      },
      {
        view_id: allViewId,
        subject_type: 'account',
        subject_id: 'acc-1',
        role: 'viewer',
        effect: 'deny',
        granted_by: 'owner-1',
      },
    ])
    assert.equal(policy.viewGrantRole('ws-1', '/pages', { id: 'rec-1' }, 'acc-1'), null)
    assert.equal(policy.allowsViaView('/pages', { id: 'rec-1' }, 'resource:read'), false)
  })

  it('returns highest allow role when no deny grant matches', () => {
    const policy = createPolicy([
      {
        view_id: allViewId,
        subject_type: 'account',
        subject_id: 'acc-1',
        role: 'viewer',
        effect: 'allow',
        granted_by: 'owner-1',
      },
      {
        view_id: allViewId,
        subject_type: 'account',
        subject_id: 'acc-1',
        role: 'editor',
        effect: 'allow',
        granted_by: 'owner-1',
      },
    ])
    assert.equal(policy.viewGrantRole('ws-1', '/pages', { id: 'rec-1' }, 'acc-1'), 'editor')
    assert.equal(policy.allowsViaView('/pages', { id: 'rec-1' }, 'resource:update'), true)
  })
})
