import { test } from 'vitest'
import assert from 'node:assert/strict'
import { bindEditorTextHost, pickContentFile } from './editor-host.ts'
import { textPickFromSelection } from './types.ts'

test('text pick from a bound editor includes markdown source lines', () => {
  const root = document.createElement('div')
  const leaf = document.createTextNode('第一段')
  root.append(leaf)
  document.body.append(root)
  bindEditorTextHost(root, {
    path: '/pages/home',
    file: '.page/home.md',
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
  assert.equal(ref.file, '.page/home.md')
  bindEditorTextHost(root, null)
  root.remove()
})

test('page record path maps to the workspace markdown file', () => {
  assert.equal(pickContentFile('/pages/p002'), '.page/p002.md')
  assert.equal(pickContentFile('/tasks/t1'), undefined)
})
