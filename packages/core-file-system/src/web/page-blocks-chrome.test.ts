import { test } from 'vitest'
import assert from 'node:assert/strict'
import { builtinAllViewId, builtinBlockKindViewId } from '../catalog-views.ts'
import { pageBlocksChrome } from './page-blocks-chrome.ts'
import type { SavedView } from './saved-view.ts'

test('page-blocks chrome lists only 全部组件 as builtin', () => {
  const chrome = pageBlocksChrome()
  const tables = [{ id: 'editor-blocks', path: '/editor-blocks', kind: 'collection' as const, label: '组件', view: { moduleId: 'editor-blocks', route: '/editor-blocks', title: '组件' } }]
  const leftover = chrome.listViews?.(tables, [
    { id: builtinBlockKindViewId('sandbox'), name: '沙箱', mode: 'table', sortField: 'id', sortDir: 'asc', filters: { blockKind: 'sandbox' }, columns: [] },
  ]) as SavedView[]
  assert.equal(leftover[0]?.id, builtinAllViewId('/editor-blocks'))
  assert.equal(leftover.some((view) => view.id === builtinBlockKindViewId('sandbox')), false)
  const listed = chrome.listViews?.(tables, []) as SavedView[]
  assert.equal(listed[0]?.id, builtinAllViewId('/editor-blocks'))
  assert.equal(listed.length, 1)
  assert.equal(listed.some((view) => view.id === builtinBlockKindViewId('html')), false)
})
