import { test } from 'vitest'
import assert from 'node:assert/strict'
import { defaultPropSandboxSource, parsePagePropViews, propViewsAssetName } from './page-prop-views.ts'

test('parse page property views keeps sandbox files bound to the page', () => {
  assert.equal(propViewsAssetName('p003'), 'page-prop-views-p003.json')
  assert.deepEqual(
    parsePagePropViews([
      { id: 'card1', name: '卡片', kind: 'sandbox', file: 'prop-view-p1-card1.jsx', dataFile: 'prop-view-data-p1-card1.json' },
      { id: '', file: 'skip.jsx' },
    ]),
    [
      {
        id: 'card1',
        name: '卡片',
        kind: 'sandbox',
        file: 'prop-view-p1-card1.jsx',
        dataFile: 'prop-view-data-p1-card1.json',
      },
    ],
  )
})

test('default property sandbox source uses Field and record APIs', () => {
  const src = defaultPropSandboxSource('演示页')
  assert.match(src, /export default function App/)
  assert.match(src, /biu\.record\(\)/)
  assert.match(src, /biu\.fields\(\)/)
  assert.match(src, /<Field name=\{field\.key\}/)
  assert.doesNotMatch(src, /biu\.blocks\(\)/)
  assert.doesNotMatch(src, /<Block /)
  assert.match(src, /演示页/)
})
