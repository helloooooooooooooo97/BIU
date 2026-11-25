import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { DatabaseAccessPolicy } from './access-policy.ts'
import { TagStore } from './tags-store.ts'

const originalOnline = process.env.BIU_ONLINE

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
})

test('DatabaseAccessPolicy fails closed in cloud RBAC mode when actor or workspace membership is missing', () => {
  process.env.BIU_ONLINE = '1'
  const tags = new TagStore().open(':memory:')
  tags.upsert({ id: 'orphan-tag', name: 'Orphan', fields: [] })

  const policy = new DatabaseAccessPolicy({
    tags,
    shares: { listRecords: () => [], listViews: () => [] } as never,
    collabStore: () => ({
      activeWorkspaceId: () => null,
      membership: () => ({ active: null, home: null, mine: new Set(), any: new Set(), strict: true }),
    }) as never,
    authorization: () =>
      ({
        currentActor: () => null,
        authorize: () => ({ allowed: false }),
      }) as never,
  } as never)

  // visibleRecords must NOT leak tenant rows when actor/membership is missing
  const visible = policy.visibleRecords('/pages', [{ id: 'p1' }, { id: 'p2' }], 'resource:read')
  assert.deepEqual(visible, [])

  // Builtin plugin rows remain readable
  const pluginRows = policy.visibleRecords(
    '/plugins',
    [
      { id: 'builtin-1', builtin: true },
      { id: 'custom-1', builtin: false },
    ] as Array<{ id: string; builtin?: boolean }>,
    'resource:read',
  )
  assert.deepEqual(
    pluginRows.map((r) => r.id),
    ['builtin-1'],
  )

  // assertLiveRecord must throw instead of silently passing
  assert.throws(
    () => policy.assertLiveRecord({ id: 'pages', path: '/pages' } as never, 'p1', 'resource:read'),
    /unknown record/,
  )

  // Unattributed tags fail closed in cloud RBAC mode
  assert.equal(policy.indexTagVisible('orphan-tag', 'acc-a'), false)
})
