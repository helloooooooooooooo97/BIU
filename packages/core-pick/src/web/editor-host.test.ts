import { test } from 'vitest'
import assert from 'node:assert/strict'
import { bindEditorTextHost } from './editor-host.ts'
import { textPickFromSelection } from './types.ts'

test('text pick from a bound editor includes markdown source lines', () => {
  const root = document.createElement('div')
  const leaf = document.createTextNode('第一段')
  root.append(leaf)
  document.body.append(root)
  bindEditorTextHost(root, {
    path: '/pages/home',
    locusFromSelection: () => ({ start_line: 5, end_line: 5, text: 'UNIQUESEL' }),
    locusFromElement: () => null,
  })
  const fake = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => '第一段',
    anchorNode: leaf,
  }
  const ref = textPickFromSelection('/pages/home', fake)
  assert.ok(ref)
  assert.equal(ref.start_line, 5)
  assert.equal(ref.end_line, 5)
  assert.equal(ref.text, 'UNIQUESEL')
  assert.equal(ref.path, '/pages/home')
  bindEditorTextHost(root, null)
  root.remove()
})
