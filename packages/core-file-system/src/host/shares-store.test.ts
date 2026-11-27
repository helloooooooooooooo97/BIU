import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildShareSnapshot } from './share-payload.ts'
import { SharesStore } from './shares-store.ts'

test('shares persist workspaceId and createdBy and support creator revocation', () => {
  const store = new SharesStore().open(':memory:')
  const recShare = store.upsert({
    kind: 'record',
    collection: '/pages',
    recordId: 'p-1',
    workspaceId: 'ws-1',
    createdBy: 'alice',
  })
  assert.equal(recShare.workspaceId, 'ws-1')
  assert.equal(recShare.createdBy, 'alice')

  // Updating flags does not overwrite original createdBy
  const updated = store.upsert({
    kind: 'record',
    collection: '/pages',
    recordId: 'p-1',
    allowCopy: false,
    workspaceId: 'ws-1',
    createdBy: 'bob',
  })
  assert.equal(updated.createdBy, 'alice')
  assert.equal(updated.allowCopy, false)

  // Revoking by creator removes Alice's shares in ws-1
  store.revokeByCreator('ws-1', 'alice')
  assert.equal(store.get(recShare.token), null)

  // Legacy view and rule shares are rejected
  assert.throws(
    () => store.upsert({ kind: 'view' as never, collection: '/pages', viewId: 'v-team' }),
    /invalid share kind/,
  )
  assert.throws(
    () => store.upsert({ kind: 'rule' as never, collection: '/pages', recordId: 'rule_abc' }),
    /invalid share kind/,
  )
})

test('buildShareSnapshot includes active inheriting descendants for record shares and excludes detached subpages', async () => {
  const store = new SharesStore().open(':memory:')
  const share = store.upsert({
    kind: 'record',
    collection: '/pages',
    recordId: 'root',
    workspaceId: 'ws-1',
    createdBy: 'ada',
  })
  const rows: Record<string, { id: string; title: string; parentId?: string }> = {
    root: { id: 'root', title: '项目总览' },
    'child-pub': { id: 'child-pub', title: '需求文档', parentId: 'root' },
    'grand-pub': { id: 'grand-pub', title: '登录页', parentId: 'child-pub' },
    'child-secret': { id: 'child-secret', title: '内部报价', parentId: 'root' },
  }
  const bodies: Record<string, string> = {
    root: '# 项目总览正文',
    'child-pub': '# 需求文档正文',
    'grand-pub': '# 登录页正文',
    'child-secret': '# 机密报价',
  }
  const db = {
    stat: async () => ({
      kind: 'collection',
      label: '页面',
      schema: {
        labelField: 'title',
        parentField: 'parentId',
        fields: {
          title: { type: 'text', label: '标题' },
          parentId: { type: 'text', label: '上级' },
        },
      },
    }),
    list: async () => ({ items: Object.values(rows), total: Object.keys(rows).length }),
    read: async (path: string) => {
      const id = path.split('/').pop() ?? ''
      if (!rows[id]) throw new Error(`unknown record: ${path}`)
      return { value: rows[id] }
    },
    content: async (path: string) => {
      const id = path.split('/').pop() ?? ''
      return { value: bodies[id] ?? null }
    },
  }
  const collabStore = {
    collectInheritingDescendants: (_wsId: string, collection: string, rootId: string) =>
      rootId === 'root'
        ? [
            { collection, recordId: 'child-pub', parentCollection: collection, parentRecordId: 'root' },
            { collection, recordId: 'grand-pub', parentCollection: collection, parentRecordId: 'child-pub' },
          ]
        : [],
  }

  // Initial load: root + inheriting descendants included; detached child-secret strictly absent; only root body loaded by default
  const initial = await buildShareSnapshot(db as never, {} as never, share, {
    shares: store,
    collabStore,
    workspaceId: 'ws-1',
  })
  assert.deepEqual(
    initial.records.map((r) => r.id),
    ['root', 'child-pub', 'grand-pub'],
  )
  assert.equal(initial.records.some((r) => r.id === 'child-secret'), false)
  assert.equal(initial.contents.root, '# 项目总览正文')
  assert.equal(initial.contents['child-pub'], undefined)

  // Opening a subpage loads its content on demand
  const withChild = await buildShareSnapshot(db as never, {} as never, share, {
    contentIds: ['child-pub'],
    shares: store,
    collabStore,
    workspaceId: 'ws-1',
  })
  assert.equal(withChild.contents['child-pub'], '# 需求文档正文')
})
