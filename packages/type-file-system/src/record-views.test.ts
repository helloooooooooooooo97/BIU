import { test } from 'vitest'
import assert from 'node:assert/strict'
import { allocateRecordSandbox, defaultRecordLayout, listedRecordLayouts, parseRecordLayoutDefaultName, parseRecordLayouts, parseRecordSandboxes, recordSandboxFileNames, recordSandboxSource, seedRecordSandbox, uniqueViewName } from './record-views.ts'

test('record layouts keep a builtin 默认视图 for every file', () => {
  assert.equal(defaultRecordLayout().name, '默认视图')
  assert.equal(defaultRecordLayout().sort, 'doc')
  assert.equal(defaultRecordLayout('chat').sort, 'time-desc')
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

test('record layouts ignore leftover sandbox fields', () => {
  const parsed = parseRecordLayouts([
    { id: 'wide', name: '宽页', kind: 'sandbox', file: 'layout-wide.jsx', dataFile: 'layout-data-wide.json' },
  ])
  assert.equal(parsed[0]?.id, 'wide')
  assert.equal(parsed[0]?.name, '宽页')
  assert.equal(parsed[0]?.contentViewId, 'doc')
  assert.equal('kind' in (parsed[0] ?? {}), false)
  assert.equal('file' in (parsed[0] ?? {}), false)
})

test('sandbox catalogs share one parser', () => {
  const views = parseRecordSandboxes([{ id: 'a', name: '', file: 'a.jsx' }])
  assert.equal(views[0]?.name, '新视图')
  assert.deepEqual(
    recordSandboxFileNames({ views, propViews: [{ id: 'p', file: 'prop-view-x.jsx', dataFile: 'prop-view-data-x.json' }] }),
    ['a.jsx', 'view-data-a.json', 'prop-view-x.jsx', 'prop-view-data-x.json'],
  )
})

test('copy names use 副本 then 副本 2', () => {
  assert.equal(uniqueViewName('默认视图 副本', ['默认视图', '默认视图 副本']), '默认视图 副本 2')
})

test('every collection seeds content and property views from the same templates', async () => {
  const files = new Map<string, string>()
  const content = allocateRecordSandbox('views', 'task-1', '新视图', [])
  assert.match(content.file, /^view-task-1-[a-z0-9]+\.jsx$/)
  const written = await seedRecordSandbox({
    fieldKey: 'propViews',
    recordId: 'plugin-1',
    listed: [],
    writeFile: async (name, body) => {
      files.set(name, body)
    },
  })
  assert.equal(files.get(written.file), recordSandboxSource('propViews'))
  assert.match(recordSandboxSource('views'), /内容视图介绍/)
  assert.match(recordSandboxSource('propViews'), /属性视图介绍/)
})
