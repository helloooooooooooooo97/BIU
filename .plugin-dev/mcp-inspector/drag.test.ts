import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { suspendAncestorDrag } from './drag-guard.ts'

function pageBlock() {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('draggable', 'true')
  const host = document.createElement('div')
  wrapper.append(host)
  document.body.append(wrapper)
  return { wrapper, host, cleanup: () => wrapper.remove() }
}

test('suspendAncestorDrag frees text selection while the mouse is down', () => {
  const { wrapper, host, cleanup } = pageBlock()
  suspendAncestorDrag(host)
  assert.equal(wrapper.getAttribute('draggable'), 'false', '按下期间不许拖节点')
  cleanup()
})

test('draggable comes back on mouseup, so block reordering still works', () => {
  const { wrapper, host, cleanup } = pageBlock()
  suspendAncestorDrag(host)
  window.dispatchEvent(new window.MouseEvent('mouseup'))
  assert.equal(wrapper.getAttribute('draggable'), 'true', '松手必须还原')
  cleanup()
})

test('draggable also comes back on dragend', () => {
  const { wrapper, host, cleanup } = pageBlock()
  suspendAncestorDrag(host)
  window.dispatchEvent(new window.Event('dragend'))
  assert.equal(wrapper.getAttribute('draggable'), 'true')
  cleanup()
})

test('listeners are removed after restoring, leaving no leak', () => {
  const { host, cleanup } = pageBlock()
  const seen: string[] = []
  const target = {
    addEventListener: ((type: string) => seen.push(`+${type}`)) as any,
    removeEventListener: ((type: string) => seen.push(`-${type}`)) as any,
  }
  const restore = suspendAncestorDrag(host, target)
  restore()
  assert.deepEqual(seen, ['+mouseup', '+dragend', '-mouseup', '-dragend'])
  cleanup()
})

test('no draggable ancestor is a no-op, not a crash', () => {
  const loose = document.createElement('div')
  document.body.append(loose)
  suspendAncestorDrag(loose)
  loose.remove()
})

/** atom 的另一半：mousedown 不能冒到 PageBlockView，否则整块被 setNodeSelection 选中。 */
test('report host still stops mousedown from reaching PageBlockView', () => {
  const source = readFileSync(resolve(import.meta.dirname, './web.tsx'), 'utf8')
  assert.match(source, /event\.stopPropagation\(\)\s*\n\s*suspendAncestorDrag/)
  assert.match(source, /from '\.\/drag-guard\.ts'/)
})
