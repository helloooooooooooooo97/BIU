import { test } from 'vitest'
import assert from 'node:assert/strict'
import { databaseRevealForTool, databaseRevealFromPath, normalizeCollectionPath, savedViewRecordPath } from './paths.ts'

test('normalizeCollectionPath strips trailing slash and adds a leading one', () => {
  assert.equal(normalizeCollectionPath('/plugins/'), '/plugins')
  assert.equal(normalizeCollectionPath('plugins'), '/plugins')
  assert.equal(normalizeCollectionPath('/'), '/')
})

test('databaseRevealFromPath ignores root and splits table vs record', () => {
  assert.equal(databaseRevealFromPath('/'), null)
  assert.deepEqual(databaseRevealFromPath('/tasks'), { collection: '/tasks' })
  assert.deepEqual(databaseRevealFromPath('/tasks/abc'), { collection: '/tasks', recordId: 'abc' })
  assert.deepEqual(databaseRevealFromPath('pages/p1'), { collection: '/pages', recordId: 'p1' })
})

test('databaseRevealForTool follows result path and drops deleted records', () => {
  assert.deepEqual(
    databaseRevealForTool({ path: '/tasks', result: { path: '/tasks/t1' } }),
    { collection: '/tasks', recordId: 't1' },
  )
  assert.deepEqual(
    databaseRevealForTool({ path: '/tasks/t1', dropRecord: true }),
    { collection: '/tasks' },
  )
  assert.equal(databaseRevealForTool({ path: '/' }), null)
})

test('databaseRevealForTool opens the source table view after creating a saved view', () => {
  assert.deepEqual(
    databaseRevealForTool({
      path: '/views',
      result: {
        kind: 'created',
        items: [{ value: { tablePath: '/tasks', viewId: 'board-1', title: '看板' } }],
      },
    }),
    { collection: '/tasks', viewId: 'board-1' },
  )
  assert.deepEqual(
    databaseRevealForTool({
      path: '/views',
      result: { kind: 'created', items: [{ value: { title: '普通行' } }] },
    }),
    { collection: '/views' },
  )
})

test('databaseRevealForTool maps view db_update onto the source table', () => {
  assert.deepEqual(
    databaseRevealForTool({
      path: '/views/pages::mine',
      result: {
        kind: 'record',
        path: '/views/pages::mine',
        value: { tablePath: '/pages', viewId: 'mine', filters: '{"project":"biu"}' },
      },
    }),
    { collection: '/pages', viewId: 'mine' },
  )
})

test('savedViewRecordPath matches /views row ids including builtin view ids', () => {
  assert.equal(savedViewRecordPath('/pages', 'mine'), '/views/pages::mine')
  assert.equal(savedViewRecordPath('pages/', 'builtin-all:/pages'), '/views/pages::builtin-all:/pages')
  assert.equal(savedViewRecordPath('/', 'mine'), '')
})
