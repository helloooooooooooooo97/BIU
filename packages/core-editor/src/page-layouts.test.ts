import { test } from 'vitest'
import assert from 'node:assert/strict'
import { defaultPageLayout, layoutsAssetName, listedPageLayouts, parsePageLayouts, PAGE_DEFAULT_LAYOUT_ID } from './page-layouts.ts'

test('page layouts keep a builtin default and skip it from stored custom rows', () => {
  assert.equal(layoutsAssetName('p003'), 'page-layouts-p003.json')
  assert.equal(defaultPageLayout().id, PAGE_DEFAULT_LAYOUT_ID)
  assert.equal(defaultPageLayout().name, '默认视图')
  assert.equal(defaultPageLayout().contentViewId, 'doc')
  assert.equal(defaultPageLayout().propViewId, 'table')
  const parsed = parsePageLayouts([
    { id: PAGE_DEFAULT_LAYOUT_ID, name: '假默认', contentViewId: 'source' },
    { id: 'need', name: '需求', contentViewId: 'outline', propViewId: 'card1', sort: 'kind', filterKinds: ['heading'] },
    { id: '', name: 'skip' },
  ])
  assert.deepEqual(parsed, [
    {
      id: 'need',
      name: '需求',
      contentViewId: 'outline',
      propViewId: 'card1',
      sort: 'kind',
      filterKinds: ['heading'],
    },
  ])
  assert.equal(listedPageLayouts(parsed)[0]?.builtin, true)
  assert.equal(listedPageLayouts(parsed)[1]?.id, 'need')
  const sandbox = parsePageLayouts([{ id: 'wide', name: '宽页', kind: 'sandbox', file: 'layout-wide.jsx' }])
  assert.equal(sandbox[0]?.kind, 'sandbox')
  assert.equal(sandbox[0]?.file, 'layout-wide.jsx')
})
