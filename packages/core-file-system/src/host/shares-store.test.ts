import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildShareSnapshot, computeViewPublicStats } from './share-payload.ts'
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

test('local LAN view share includes all matching view rows across pages without per-record public links while cloud keeps zero-leak', async () => {
  const store = new SharesStore().open(':memory:')
  const viewShare = store.upsert({
    kind: 'record',
    collection: '/views',
    recordId: 'pages::v-all',
    workspaceId: 'ws-local',
    createdBy: 'local-owner',
  })
  // 250 matching rows (> MAX_PAGE_SIZE=200) and only 1 individually shared
  const allRows = Array.from({ length: 250 }, (_, idx) => ({
    id: `p-${idx + 1}`,
    title: `页面 ${idx + 1}`,
    status: 'done',
  }))
  store.upsert({
    kind: 'record',
    collection: '/pages',
    recordId: 'p-1',
    workspaceId: 'ws-local',
    createdBy: 'local-owner',
  })
  const db = {
    stat: async () => ({
      kind: 'collection',
      label: '页面',
      schema: {
        labelField: 'title',
        fields: {
          title: { type: 'text', label: '标题' },
          status: { type: 'text', label: '状态' },
        },
      },
    }),
    list: async (_path: string, filter?: Record<string, unknown>, page?: { limit?: number; offset?: number }) => {
      const filtered = filter?.status ? allRows.filter((r) => r.status === filter.status) : allRows
      const limit = Math.min(200, page?.limit ?? 20)
      const offset = page?.offset ?? 0
      return { items: filtered.slice(offset, offset + limit), total: filtered.length }
    },
    read: async (path: string) => {
      const id = path.split('/').pop() ?? ''
      const hit = allRows.find((r) => r.id === id)
      if (!hit) throw new Error(`unknown record: ${path}`)
      return { value: hit }
    },
    content: async (path: string) => ({ value: `正文:${path}` }),
  }
  const savedViews = {
    viewsFor: () => [
      {
        id: 'v-all',
        name: '已完成页面',
        mode: 'table',
        sortField: 'title',
        sortDir: 'asc',
        filters: { status: 'done' },
        columns: ['title'],
      },
    ],
  }

  // Local LAN mode: all 250 rows across both pages are included
  const localStats = await computeViewPublicStats(
    db as never,
    savedViews as never,
    store,
    'pages::v-all',
    'local-owner',
    'ws-local',
    undefined,
    true,
  )
  assert.deepEqual(localStats, { matchedCount: 250, publicCount: 250 })

  const localSnap = await buildShareSnapshot(db as never, savedViews as never, viewShare, {
    shares: store,
    workspaceId: 'ws-local',
    includeAllViewRecords: true,
    contentIds: ['p-250'],
  })
  assert.equal(localSnap.kind, 'view')
  assert.equal(localSnap.records.length, 250)
  assert.equal(localSnap.contents['p-250'], '正文:/pages/p-250')

  // Cloud mode (default includeAllViewRecords=false): still strictly zero-leak (only p-1)
  const cloudStats = await computeViewPublicStats(
    db as never,
    savedViews as never,
    store,
    'pages::v-all',
    'local-owner',
    'ws-local',
    undefined,
    false,
  )
  assert.deepEqual(cloudStats, { matchedCount: 250, publicCount: 1 })

  const cloudSnap = await buildShareSnapshot(db as never, savedViews as never, viewShare, {
    shares: store,
    workspaceId: 'ws-local',
    includeAllViewRecords: false,
  })
  assert.deepEqual(cloudSnap.records.map((r) => r.id), ['p-1'])
})
