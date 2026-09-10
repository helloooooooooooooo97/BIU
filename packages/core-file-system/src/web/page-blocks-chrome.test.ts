import { test } from 'vitest'
import assert from 'node:assert/strict'
import { builtinAllViewId, builtinBlockKindViewId } from '../catalog-views.ts'
import { pageBlocksChrome } from './page-blocks-chrome.ts'
import type { SavedView } from './saved-view.ts'

test('page-blocks chrome lists all plus one view per kind', () => {
  const chrome = pageBlocksChrome(() => [
    { kind: 'algorithm', label: '算法题' },
    { kind: 'html', label: 'HTML' },
  ])
  const listed = chrome.listViews?.(
    [{ id: 'page-blocks', path: '/page-blocks', kind: 'collection', label: '组件', view: { title: '组件' } }],
    [],
  ) as SavedView[]
  assert.equal(listed[0]?.id, builtinAllViewId('/page-blocks'))
  assert.equal(listed.some((view) => view.id === builtinBlockKindViewId('html')), true)
  assert.equal(listed.some((view) => view.id === builtinBlockKindViewId('algorithm')), true)
})
