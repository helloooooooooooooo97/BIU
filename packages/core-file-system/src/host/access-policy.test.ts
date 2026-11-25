import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { builtinAllViewId } from '../catalog-views.ts'
import { DatabaseAccessPolicy, type AccessPolicyHost, type WorkspaceFiles } from './access-policy.ts'

function createPolicy(
  grants: NonNullable<WorkspaceFiles['viewGrantsFor']> extends (...args: never[]) => infer R ? R : never,
  savedViews: Array<{ id: string; name?: string; filters?: Record<string, unknown>; columns?: string[] }> = [],
) {
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
    viewCatalog: { viewsFor: () => savedViews },
  } as unknown as AccessPolicyHost
  return new DatabaseAccessPolicy(host)
}

describe('DatabaseAccessPolicy.viewGrantRole union semantics', () => {
  const allViewId = builtinAllViewId('/pages')

  it('returns highest allow role when multiple view grants match', () => {
    const policy = createPolicy([
      {
        view_id: allViewId,
        subject_type: 'account',
        subject_id: 'acc-1',
        role: 'viewer',
        granted_by: 'owner-1',
      },
      {
        view_id: allViewId,
        subject_type: 'account',
        subject_id: 'acc-1',
        role: 'editor',
        granted_by: 'owner-1',
      },
    ])
    assert.equal(policy.viewGrantRole('ws-1', '/pages', { id: 'rec-1' }, 'acc-1'), 'editor')
    assert.equal(policy.allowsViaView('/pages', { id: 'rec-1' }, 'resource:update'), true)
  })

  it('automatically derives readable and writable column whitelist from custom view.columns', () => {
    const policy = createPolicy(
      [
        {
          view_id: 'v-public',
          subject_type: 'account',
          subject_id: 'acc-1',
          role: 'editor',
          granted_by: 'owner-1',
        },
      ],
      [{ id: 'v-public', name: '公开看板', filters: {}, columns: ['title', 'status'] }],
    )
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
