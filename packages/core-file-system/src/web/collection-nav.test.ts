import { test } from 'vitest'
import assert from 'node:assert/strict'
import { builtinAllViewId } from '../catalog-views.ts'
import { paintCollectionViews } from './collection-nav.ts'
import { persistViewDisplay, rememberViews } from './view-storage.ts'
import type { CollectionInfo } from '@biu/type-file-system'

test('paintCollectionViews keeps saved rank instead of prepending builtin-all', () => {
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => {
        mem[key] = value
      },
      removeItem: (key: string) => {
        delete mem[key]
      },
    },
  })
  const path = '/tasks-crumb-view-order'
  const tables: CollectionInfo[] = [{ path, label: '任务', view: { title: '任务' } }]
  persistViewDisplay(path, 'mine', { rank: 0 })
  persistViewDisplay(path, builtinAllViewId(path), { rank: 1 })
  persistViewDisplay(path, 'board', { rank: 2 })
  rememberViews(path, [
    { id: 'board', name: '看板', mode: 'board', rank: 2 },
    { id: 'mine', name: '我的', mode: 'table', rank: 0 },
  ])
  assert.deepEqual(
    paintCollectionViews(path, tables).map((view) => view.id),
    ['mine', builtinAllViewId(path), 'board'],
  )
}
)