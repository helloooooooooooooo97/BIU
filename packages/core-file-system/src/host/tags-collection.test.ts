import { withBuiltinFields } from '@biu/type-file-system'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { collectAssetNames } from '@biu/type-file-system'
import { TagStore } from './tags-store.ts'
import { tagsCollection } from './tags-collection.ts'
import { RecordViewsStore, wrapCollectionRecordViews } from './record-views.ts'

test('tagsCollection lists tags with stamp counts and supports create/update/delete', async () => {
  const store = new TagStore()
  store.replace([{ id: 'dp', label: '动态规划', fields: [{ key: 'complexity', type: 'string' }] }])
  store.indexRecord('/pages', 'home', '首页', ['dp'])
  store.writeRecordTag('/pages', 'home', { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } }, '首页')
  const spec = wrapCollectionRecordViews(tagsCollection(store), new RecordViewsStore().open())
  assert.equal(spec.path, '/tags')
  assert.equal(spec.label, '标签')
  assert.equal(spec.view?.title, '标签')
  assert.equal(spec.view?.icon, 'tag')
  const listed = await spec.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.title, '动态规划')
  assert.equal(listed[0]?.fieldCount, 1)
  assert.equal(listed[0]?.stampCount, 1)

  const created = await spec.create!([{ title: 'IO' }])
  assert.equal(created[0]?.id, 'io')
  assert.equal(store.get('io')?.label, 'IO')
  assert.ok(Number(created[0]?.createdAt) > 0)
  assert.ok(Number(created[0]?.updatedAt) >= Number(created[0]?.createdAt))
  const createdAt = Number(created[0]?.createdAt)

  await assert.rejects(
    async () => spec.update!(created[0]!.id, { fields: [{ key: 'format', type: 'text' }] }),
    /unknown field type: text/,
  )
  const updated = await spec.update!(created[0]!.id, { title: 'I/O', fields: [{ key: 'format', type: 'string', label: '格式' }] })
  assert.equal(updated.title, 'I/O')
  assert.equal(Number(updated.createdAt), createdAt)
  assert.ok(Number(updated.updatedAt) >= Number(created[0]?.updatedAt))
  assert.equal(updated.fieldCount, 1)
  assert.equal(store.get('io')?.fields[0]?.key, 'format')
  assert.equal(withBuiltinFields(spec.schema.fields).fields?.writable, true)
  assert.match(String(updated.fields), /format/)
  assert.equal(withBuiltinFields(spec.schema.fields).views?.writable, true)
  const withViews = await spec.update!(created[0]!.id, {
    views: [{ id: '8fdbc4f8', name: '属性卡', kind: 'sandbox', file: 'tag-view-io-8fdbc4f8.jsx', dataFile: 'tag-view-data-io-8fdbc4f8.json' }],
  })
  assert.equal((withViews.views as Array<{ id: string }>)[0]?.id, '8fdbc4f8')
  assert.equal(store.get('io')?.fields[0]?.key, 'format')
  assert.equal(withBuiltinFields(spec.schema.fields).propViews?.writable, true)
  const withPropViews = await spec.update!(created[0]!.id, {
    propViews: [{ id: 'card1', name: '卡片', kind: 'sandbox', file: 'prop-view-io-card1.jsx', dataFile: 'prop-view-data-io-card1.json' }],
  })
  assert.equal((withPropViews.propViews as Array<{ id: string }>)[0]?.id, 'card1')
  assert.equal((withPropViews.views as Array<{ id: string }>)[0]?.id, '8fdbc4f8')
  const names = collectAssetNames(withPropViews)
  assert.equal(names.has('tag-views-io.json'), false)
  assert.equal(names.has('tag-view-io-8fdbc4f8.jsx'), true)
  assert.equal(names.has('prop-view-io-card1.jsx'), true)

  const withNotes = await spec.update!(created[0]!.id, { notes: '# 标签说明\n' })
  assert.equal(withNotes.notes, '# 标签说明\n')
  assert.equal(store.notes('io'), '# 标签说明\n')
  assert.equal(spec.schema.contentField, 'notes')
  store.upsert({ id: 'io', label: 'I/O', fields: [{ key: 'format', type: 'string', label: '格式' }] })
  assert.equal(store.notes('io'), '# 标签说明\n')

  await spec.remove!({ ids: [created[0]!.id] })
  assert.equal(store.get('io'), null)
  assert.equal((await spec.list()).length, 1)

  const specWithTables = tagsCollection(store, () => [{ id: 'pages', path: '/pages', label: '页面' }])
  const collected = await specWithTables.list({ filter: { tagId: 'dp' } })
  assert.equal(collected.length, 1)
  assert.equal(collected[0]?.id, 'pages::home')
  assert.equal(collected[0]?.table, '页面')
  assert.equal(collected[0]?.tablePath, '/pages')
  assert.equal(collected[0]?.sourceId, 'home')
  assert.equal(collected[0]?.tagId, 'dp')
  assert.deepEqual((collected[0]?.tag as { values?: { dp?: { complexity?: string } } })?.values?.dp, { complexity: 'O(n)' })

  const deleteAction = specWithTables.actions?.find((item) => item.id === 'delete')
  assert.ok(deleteAction)
  assert.equal(deleteAction.label, '删除')
  assert.equal(deleteAction.tone, 'danger')
  assert.deepEqual(deleteAction.when, { sourceId: '' })
})
