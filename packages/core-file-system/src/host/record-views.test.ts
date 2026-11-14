import { test } from 'vitest'
import assert from 'node:assert/strict'
import { RecordViewsStore, wrapCollectionRecordViews } from './record-views.ts'
import { REQUIRED_RECORD_FIELDS, type CollectionSpec } from '@biu/type-file-system'

test('record view catalogs persist for any collection', async () => {
  const store = new RecordViewsStore().open()
  const rows = new Map([['n1', { id: 'n1', title: '笔记' }]])
  const spec = wrapCollectionRecordViews(
    {
      id: 'notes',
      path: '/notes',
      schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' } } },
      records: { update: true },
      list: () => [...rows.values()],
      get: (id) => rows.get(id) ?? null,
      update: (id, patch) => {
        const current = rows.get(id)
        if (!current) throw new Error('missing')
        const next = { ...current, ...patch }
        rows.set(id, next)
        return next
      },
    } as CollectionSpec,
    store,
  )
  await spec.update!('n1', {
    layouts: [{ id: 'need', name: '需求', contentViewId: 'doc', propViewId: 'table' }],
  })
  const got = await spec.get('n1')
  assert.equal((got?.layouts as Array<{ name: string }>)[0]?.name, '需求')
})
