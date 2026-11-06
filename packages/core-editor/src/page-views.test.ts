import { test } from 'vitest'
import assert from 'node:assert/strict'
import { defaultSandboxSource, parsePageViews, viewsAssetName } from './page-views.ts'

test('parsePageViews keeps sandbox views bound to files', () => {
  assert.deepEqual(
    parsePageViews([
      { id: 'site1', name: '官网', kind: 'sandbox', file: 'view-p1-site1.jsx', dataFile: 'view-data-p1-site1.json' },
      { id: '', file: 'skip.jsx' },
      { id: 'site1', file: 'dup.jsx' },
    ]),
    [
      {
        id: 'site1',
        name: '官网',
        kind: 'sandbox',
        file: 'view-p1-site1.jsx',
        dataFile: 'view-data-p1-site1.json',
      },
    ],
  )
  assert.deepEqual(parsePageViews('not-json'), [])
  assert.equal(viewsAssetName('p003'), 'page-views-p003.json')
})

test('default sandbox source is a host component that uses Block', () => {
  const src = defaultSandboxSource('演示页')
  assert.match(src, /export default function App/)
  assert.match(src, /biu\.blocks\(\)/)
  assert.match(src, /<Block id=\{open\}/)
  assert.match(src, /演示页/)
})
