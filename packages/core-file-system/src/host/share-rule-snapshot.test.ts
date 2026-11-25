import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildShareSnapshot } from './share-payload.ts'
import type { SavedViewsStore } from './saved-views.ts'
import type { ShareRecord } from './shares-store.ts'

const mockSchema = {
  fields: {
    title: { key: 'title', label: '标题', type: 'text', writable: true },
    status: { key: 'status', label: '状态', type: 'text', writable: true },
    secretCost: { key: 'secretCost', label: '内部成本', type: 'number', writable: true },
  },
  records: {},
}

const mockDb = {
  async stat() {
    return { kind: 'collection', label: '页面', schema: mockSchema }
  },
  async list() {
    return {
      items: [
        { id: 'p1', title: 'Alpha', status: 'published', secretCost: 999 },
        { id: 'p2', title: 'Beta', status: 'published', secretCost: 888 },
      ],
    }
  },
  async read() {
    return { value: null }
  },
  async content() {
    return { value: '' }
  },
}

const emptySavedViews = {
  viewsFor: () => [],
} as unknown as SavedViewsStore

const ruleShare: ShareRecord = {
  token: 'tok_rule_1',
  kind: 'rule',
  collection: '/pages',
  viewId: '',
  recordId: '',
  ruleId: 'rule_1',
  hasPassword: false,
  sharePlugins: false,
  allowCopy: true,
  workspaceId: 'ws_1',
  createdBy: 'alice',
  createdAt: 1,
  updatedAt: 1,
}

test('rule public share projects column whitelist, enforces creator authority, and restores display snapshot without saved_views', async () => {
  const snapshot = await buildShareSnapshot(mockDb as never, emptySavedViews, ruleShare, {
    accessRule: {
      id: 'rule_1',
      name: 'Q3 客户交付',
      createdBy: 'alice',
      filterTree: { op: 'and', rules: [{ field: 'status', op: 'eq', value: 'published' }] },
      columns: ['title', 'status'],
      displaySnapshot: { mode: 'board', groupBy: 'status' },
      enabled: true,
    },
    // Alice can share p1, cannot share p2
    canCreatorShareRecord: (recordId) => recordId === 'p1',
  })

  assert.equal(snapshot.kind, 'rule')
  assert.equal(snapshot.ruleId, 'rule_1')
  assert.equal(snapshot.title, 'Q3 客户交付')
  assert.equal(snapshot.view?.mode, 'board')
  assert.equal(snapshot.view?.groupBy, 'status')
  assert.equal(snapshot.records.length, 1)
  assert.equal(snapshot.records[0]?.id, 'p1')
  assert.equal(snapshot.records[0]?.status, 'published')
  // Secret column is strictly stripped from public snapshot!
  assert.equal('secretCost' in (snapshot.records[0] ?? {}), false)
})

test('disabled or missing rule fails closed', async () => {
  await assert.rejects(
    () =>
      buildShareSnapshot(mockDb as never, emptySavedViews, ruleShare, {
        accessRule: {
          id: 'rule_1',
          name: 'Disabled',
          createdBy: 'alice',
          filterTree: { op: 'and', rules: [] },
          columns: null,
          displaySnapshot: null,
          enabled: false,
        },
      }),
    /unknown rule/,
  )
})
