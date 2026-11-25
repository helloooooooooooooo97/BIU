import assert from 'node:assert/strict'
import { test } from 'vitest'
import { SharesStore } from './shares-store.ts'

test('shares persist workspaceId and createdBy and support creator revocation', () => {
  const store = new SharesStore().open(':memory:')
  const viewShare = store.upsert({
    kind: 'view',
    collection: '/pages',
    viewId: 'v-team',
    workspaceId: 'ws-1',
    createdBy: 'alice',
  })
  assert.equal(viewShare.workspaceId, 'ws-1')
  assert.equal(viewShare.createdBy, 'alice')

  // Updating flags does not overwrite original createdBy
  const updated = store.upsert({
    kind: 'view',
    collection: '/pages',
    viewId: 'v-team',
    allowCopy: false,
    workspaceId: 'ws-1',
    createdBy: 'bob',
  })
  assert.equal(updated.createdBy, 'alice')
  assert.equal(updated.allowCopy, false)

  // Revoking by creator removes Alice's shares in ws-1
  store.revokeByCreator('ws-1', 'alice')
  assert.equal(store.get(viewShare.token), null)
})
