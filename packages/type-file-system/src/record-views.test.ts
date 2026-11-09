import { test } from 'vitest'
import assert from 'node:assert/strict'
import { defaultRecordLayout, listedRecordLayouts, parseRecordLayouts, parseRecordSandboxes, uniqueViewName } from './record-views.ts'

test('record layouts keep a builtin 默认视图 for every file', () => {
  assert.equal(defaultRecordLayout().name, '默认视图')
  const parsed = parseRecordLayouts([{ id: 'need', name: '需求', contentViewId: 'outline', propViewId: 'card1' }])
  assert.equal(parsed[0]?.id, 'need')
  assert.equal(listedRecordLayouts(parsed)[0]?.builtin, true)
})

test('sandbox catalogs share one parser', () => {
  const views = parseRecordSandboxes([{ id: 'a', name: '', file: 'a.jsx' }])
  assert.equal(views[0]?.name, '新视图')
})

test('copy names use 副本 then 副本 2', () => {
  assert.equal(uniqueViewName('默认视图 副本', ['默认视图', '默认视图 副本']), '默认视图 副本 2')
})
