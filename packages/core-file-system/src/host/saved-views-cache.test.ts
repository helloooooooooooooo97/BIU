import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import { DatabaseService } from './index.ts'
import { SavedViewsStore, viewsCollection } from './saved-views.ts'
import { VIEWS_COLLECTION_PATH } from '../paths.ts'

test('notifyViewCatalog clears visibleCache so renamed views immediately appear in /views list', async () => {
  const ctx = new Context()
  const broadcasts: Array<{ type: string; payload: unknown }> = []
  ctx.provide('http', {
    broadcast: (type: string, payload: unknown) => {
      broadcasts.push({ type, payload })
    },
  } as never)

  const db = new DatabaseService(ctx)
  db.tags.open(':memory:')
  const savedViews = new SavedViewsStore().open(':memory:')
  db.savedViews = savedViews
  db.viewCatalog = savedViews
  db.register({
    id: 'pages',
    path: '/pages',
    label: '页面',
    list: async () => [],
    get: async () => null,
  })
  db.register(viewsCollection(savedViews, () => db.collectionsList().map((item) => db.publishCollection(item))))

  savedViews.applyPatch('/pages', {
    upsert: [{ id: 'v-shared', name: '旧名称', updatedAt: 1000 }],
  })

  // Prime db.visibleCache for /views
  const first = await db.list(VIEWS_COLLECTION_PATH)
  assert.equal(first.kind, 'collection')
  assert.equal(first.items.find((item) => item.viewId === 'v-shared')?.title, '旧名称')

  // Simulate POST /api/db/saved-views renaming the view and calling notifyViewCatalog
  savedViews.applyPatch('/pages', {
    upsert: [{ id: 'v-shared', name: '新名称', updatedAt: 2000 }],
  })
  db.notifyViewCatalog('/pages')

  const second = await db.list(VIEWS_COLLECTION_PATH)
  assert.equal(second.kind, 'collection')
  assert.equal(second.items.find((item) => item.viewId === 'v-shared')?.title, '新名称')
  assert.ok(broadcasts.some((b) => b.type === 'database'))
})

test('notifyTagCatalog clears visibleCache so tag catalog changes invalidate cached list rows', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.tags.open(':memory:')
  let listCalls = 0
  db.register({
    id: 'notes',
    path: '/notes',
    label: '笔记',
    schema: { fields: { title: { type: 'string', label: '标题' } } },
    list: async () => {
      listCalls += 1
      return [{ id: 'n1', title: '笔记 1' }]
    },
    get: async () => ({ id: 'n1', title: '笔记 1' }),
  })

  await db.list('/notes')
  await db.list('/notes')
  assert.equal(listCalls, 1)

  db.notifyTagCatalog()
  await db.list('/notes')
  assert.equal(listCalls, 2)
})
