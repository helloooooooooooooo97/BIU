import { test } from 'vitest'
import assert from 'node:assert/strict'
import { defaultRecordLayout, listedRecordLayouts, parseRecordLayoutDefaultName, parseRecordLayouts, parseRecordSandboxes, uniqueViewName } from './record-views.ts'

test('record layouts keep a builtin 默认视图 for every file', () => {
  assert.equal(defaultRecordLayout().name, '默认视图')
  const parsed = parseRecordLayouts([{ id: 'need', name: '需求', contentViewId: 'outline', propViewId: 'card1' }])
  assert.equal(parsed[0]?.id, 'need')
  assert.equal(listedRecordLayouts(parsed)[0]?.builtin, true)
})

test('listed record layouts keep a renamed builtin default', () => {
  const listed = listedRecordLayouts([
    { id: 'builtin-default', name: '工作台' },
    { id: 'need', name: '需求', contentViewId: 'doc', propViewId: 'table' },
  ])
  assert.equal(listed[0]?.id, 'builtin-default')
  assert.equal(listed[0]?.name, '工作台')
  assert.equal(listed[0]?.builtin, true)
  assert.equal(listed[1]?.id, 'need')
  assert.equal(parseRecordLayouts([{ id: 'builtin-default', name: '工作台' }]).length, 0)
  assert.equal(parseRecordLayoutDefaultName([{ id: 'builtin-default', name: '工作台' }]), '工作台')
})

test('record layouts can be a code sandbox', () => {
  const parsed = parseRecordLayouts([
    { id: 'wide', name: '宽页', kind: 'sandbox', file: 'layout-wide.jsx', dataFile: 'layout-data-wide.json' },
  ])
  assert.equal(parsed[0]?.kind, 'sandbox')
  assert.equal(parsed[0]?.file, 'layout-wide.jsx')
  assert.equal(parsed[0]?.contentViewId, 'doc')
})

test('sandbox catalogs share one parser', () => {
  const views = parseRecordSandboxes([{ id: 'a', name: '', file: 'a.jsx' }])
  assert.equal(views[0]?.name, '新视图')
})

test('copy names use 副本 then 副本 2', () => {
  assert.equal(uniqueViewName('默认视图 副本', ['默认视图', '默认视图 副本']), '默认视图 副本 2')
})
