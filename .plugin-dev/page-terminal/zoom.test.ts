import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeOverlay, watchZoom } from './zoom.ts'

const dir = dirname(fileURLToPath(import.meta.url))
const skin = readFileSync(join(dir, 'xterm-skin.css'), 'utf8')

test('skin hides helper textarea and accessibility tree from layout', () => {
  assert.match(skin, /xterm-helper-textarea/)
  assert.match(skin, /left: -9999em/)
  assert.match(skin, /outline: none/)
  assert.match(skin, /xterm-accessibility-tree/)
  assert.match(skin, /overflow-y: auto/)
  assert.match(skin, /scrollbar-width: thin/)
  assert.match(skin, /xterm-viewport::-webkit-scrollbar/)
})

test('zoom overlay is fixed on document.body, not nested in the page', () => {
  const el = makeOverlay('page-terminal-zoom-host', '#1c1c1e')
  assert.equal(el.parentElement, document.body)
  assert.equal(getComputedStyle(el).position, 'fixed')
  assert.equal(el.style.inset, '0px')
  const stop = watchZoom(() => {}, el)
  stop()
  el.remove()
})
