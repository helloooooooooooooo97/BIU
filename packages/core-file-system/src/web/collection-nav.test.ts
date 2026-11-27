import { test } from 'vitest'
import assert from 'node:assert/strict'
import { paintCollectionViews } from './collection-nav.ts'
import { rememberViews } from './view-storage.ts'
import type { CollectionInfo } from '@biu/type-file-system'

test('paintCollectionViews preserves saved rank order across plain and seeded views', () => {
  const path = '/tasks-crumb-view-order'
  const tables: CollectionInfo[] = [{ id: 'tasks', path, kind: 'collection', label: '任务', view: { moduleId: 'tasks', route: path, title: '任务' } }]
  rememberViews(path, [
    { id: 'board', name: '看板', mode: 'board', rank: 2, sortField: '', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'all', name: '全部任务', mode: 'table', rank: 1, sortField: '', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'mine', name: '我的', mode: 'table', rank: 0, sortField: '', sortDir: 'asc', filters: {}, columns: [] },
  ])
  assert.deepEqual(
    paintCollectionViews(path, tables).map((view) => view.id),
    ['mine', 'all', 'board'],
  )
})
