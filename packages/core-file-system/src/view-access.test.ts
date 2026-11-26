import assert from 'node:assert/strict'
import { test } from 'vitest'
import { builtinAllViewId } from './catalog-views.ts'
import { effectiveDataScope, highestViewRole, recordMatchesGrantedView } from './view-access.ts'

test('a view grant matches records in that view and keeps the highest role', () => {
  const saved = [
    { id: 'personal-v', filters: { $scope: 'personal' } },
    { id: 'open', filters: { status: 'open', $scope: 'workspace' } },
  ]
  const record = { id: 'p1', status: 'open', title: 'Alpha' }
  assert.equal(recordMatchesGrantedView(record, 'personal-v', saved, 'personal'), true)
  assert.equal(recordMatchesGrantedView(record, 'personal-v', saved, 'shared'), false)
  assert.equal(recordMatchesGrantedView(record, 'open', saved, 'workspace'), true)
  assert.equal(recordMatchesGrantedView(record, 'open', saved, 'personal'), false)
  assert.equal(recordMatchesGrantedView({ id: 'p2', status: 'done' }, 'open', saved, 'workspace'), false)
  assert.equal(recordMatchesGrantedView(record, 'missing', saved, 'workspace'), false)
  assert.equal(highestViewRole(['viewer', 'manager', 'editor']), 'manager')
})

test('inherited view grants raise a personal record to workspace or shared', () => {
  const record = { id: 'p1', title: 'Alpha' }
  const dataViews = [{ id: 'personal-v', filters: { $scope: 'personal' } }]
  const internal = { viewId: 'personal-v', subjectType: 'account' as const, subjectId: 'bob', memberKind: 'member' }
  const external = { viewId: 'personal-v', subjectType: 'account' as const, subjectId: 'cara', memberKind: 'external' }
  assert.equal(effectiveDataScope('personal', record, [internal], dataViews, []), 'workspace')
  assert.equal(effectiveDataScope('personal', record, [internal, external], dataViews, []), 'shared')
  assert.equal(effectiveDataScope('workspace', record, [], [], []), 'workspace')
  assert.equal(effectiveDataScope('personal', { id: 'p2', status: 'done' }, [{ ...internal, viewId: 'open' }], [{ id: 'open', filters: { status: 'open' } }], []), 'personal')
  const allMembers = { viewId: builtinAllViewId('/tasks'), subjectType: 'member_view' as const, subjectId: 'builtin-member:member', grantedBy: 'bob' }
  assert.equal(recordMatchesGrantedView(record, allMembers.viewId, [], 'personal', { grantedBy: 'bob', recordOwnerId: 'ada' }), false)
  assert.equal(recordMatchesGrantedView(record, allMembers.viewId, [], 'personal', { grantedBy: 'bob', recordOwnerId: 'bob' }), true)
  assert.equal(effectiveDataScope('personal', record, [allMembers], [], [{ id: 'builtin-member:member', filters: { membershipKind: 'member' } }], 'ada'), 'personal')
  assert.equal(effectiveDataScope('personal', record, [allMembers], [], [{ id: 'builtin-member:member', filters: { membershipKind: 'member' } }], 'bob'), 'workspace')
})

test('recordMatchesGrantedView evaluates complex filterTree (OR / contains / neq) instead of leaking all records', () => {
  const saved = [
    {
      id: 'urgent-or-eng',
      filters: {},
      filterTree: {
        kind: 'group' as const,
        id: 'g1',
        combinator: 'or' as const,
        children: [
          { kind: 'rule' as const, id: 'r1', field: 'priority', op: 'eq' as const, value: 'p0' },
          { kind: 'rule' as const, id: 'r2', field: 'title', op: 'contains' as const, value: 'Design' },
        ],
      },
    },
  ]
  assert.equal(recordMatchesGrantedView({ id: '1', priority: 'p0', title: 'Fix' }, 'urgent-or-eng', saved, 'personal'), true)
  assert.equal(recordMatchesGrantedView({ id: '2', priority: 'p2', title: 'Design Doc' }, 'urgent-or-eng', saved, 'personal'), true)
  assert.equal(recordMatchesGrantedView({ id: '3', priority: 'p2', title: 'Secret HR' }, 'urgent-or-eng', saved, 'personal'), false)
})
