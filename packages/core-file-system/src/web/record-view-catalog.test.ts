/** @vitest-environment jsdom */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { emitFsdbChange, parseFsdbChange } from '@biu/type-file-system'
import {
  emitViewCatalogChange,
  getRecordViewCatalog,
  hydrateRecordViewCatalog,
  patchRecordViewCatalog,
} from './record-view-catalog.ts'

test('record view catalog hydrates and patches the three filesystem fields', () => {
  hydrateRecordViewCatalog('/pages', 'p1', {
    views: [{ id: 'v1', name: '官网', kind: 'sandbox', file: 'view-p1-v1.jsx' }],
    propViews: [{ id: 'c1', name: '卡片', kind: 'sandbox', file: 'prop-view-p1-c1.jsx' }],
    layouts: [{ id: 'need', name: '需求', contentViewId: 'doc', propViewId: 'c1' }],
  })
  const first = getRecordViewCatalog('/pages', 'p1')
  assert.equal(first.views[0]?.id, 'v1')
  assert.equal(first.propViews[0]?.id, 'c1')
  assert.equal(first.layouts[0]?.id, 'need')
  patchRecordViewCatalog('/pages', 'p1', { activeLayoutId: 'need', contentViewId: 'v1', propViewId: 'c1' })
  assert.equal(getRecordViewCatalog('/pages', 'p1').activeLayoutId, 'need')
  assert.equal(getRecordViewCatalog('/pages', 'p1').contentViewId, 'v1')
  patchRecordViewCatalog('/pages', 'p1', {
    propViews: [...first.propViews, { id: 'c2', name: '新视图', kind: 'sandbox', file: 'prop-view-p1-c2.jsx', dataFile: 'prop-view-data-p1-c2.json' }],
  })
  assert.equal(getRecordViewCatalog('/pages', 'p1').propViews.map((item) => item.id).join(','), 'c1,c2')
  hydrateRecordViewCatalog('/pages', 'p1', { title: 'keep' })
  assert.equal(getRecordViewCatalog('/pages', 'p1').propViews.length, 2)
  hydrateRecordViewCatalog('/pages', 'p1', { views: [], propViews: [], layouts: [] })
  assert.equal(getRecordViewCatalog('/pages', 'p1').propViews.map((item) => item.id).join(','), 'c1,c2')
  patchRecordViewCatalog('/pages', 'p1', { propViews: first.propViews })
  hydrateRecordViewCatalog('/pages', 'p1', {
    propViews: [
      ...first.propViews,
      { id: 'c2', name: '新视图', kind: 'sandbox', file: 'prop-view-p1-c2.jsx', dataFile: 'prop-view-data-p1-c2.json' },
    ],
  })
  assert.equal(getRecordViewCatalog('/pages', 'p1').propViews.map((item) => item.id).join(','), 'c1')
})

test('view catalog change events include the record path', () => {
  const seen: unknown[] = []
  const onChange = (event: Event) => seen.push(parseFsdbChange(event))
  window.addEventListener('fsdb:change', onChange)
  emitViewCatalogChange('/pages', 'p1')
  window.removeEventListener('fsdb:change', onChange)
  assert.deepEqual(seen[0], { scope: 'views', path: '/pages/p1' })
  emitFsdbChange({ scope: 'views' })
})
