import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { closeMathPop, openMathPop } from './math-pop.ts'
import { pageEditorExtensions } from './kit.ts'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('math pop opens below the formula and commits on Enter, not via window.prompt', async () => {
  const kit = await readFile(resolve(import.meta.dirname, './kit.ts'), 'utf8')
  assert.match(kit, /openMathPop/)
  assert.doesNotMatch(kit, /window\.prompt/)
  assert.doesNotMatch(kit, /const editorOf = \(\) => this\.editor/)
  assert.match(kit, /pageMathPopKey/)
  assert.match(kit, /handleDOMEvents/)
  const css = await readFile(resolve(import.meta.dirname, './style.ts'), 'utf8')
  assert.match(css, /\.page-math-pop\{[^}]*position:fixed/)
  assert.match(css, /\.page-math-pop\{[^}]*z-index:10000/)

  const anchor = document.createElement('span')
  document.body.appendChild(anchor)
  Object.defineProperty(anchor, 'getBoundingClientRect', {
    value: () => ({ top: 40, bottom: 60, left: 24, right: 80, width: 56, height: 20, x: 24, y: 40, toJSON() {} }),
  })
  let committed = ''
  openMathPop({
    anchor,
    latex: 'x^2',
    onCommit: (next) => {
      committed = next
    },
  })
  const pop = document.querySelector('[data-testid="page-math-pop"]')
  assert.ok(pop instanceof HTMLElement)
  assert.equal(pop.style.top, '66px')
  const input = pop.querySelector('textarea')
  assert.ok(input)
  assert.equal(input.value, 'x^2')
  input.value = 'y^2'
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  assert.equal(committed, 'y^2')
  assert.equal(document.querySelector('[data-testid="page-math-pop"]'), null)
  anchor.remove()
})

test('Escape closes the math pop without committing', () => {
  const anchor = document.createElement('span')
  document.body.appendChild(anchor)
  let committed = 'untouched'
  openMathPop({
    anchor,
    latex: 'E=mc^2',
    onCommit: (next) => {
      committed = next
    },
  })
  const input = document.querySelector('.page-math-pop-input')
  assert.ok(input instanceof HTMLTextAreaElement)
  input.value = 'changed'
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(committed, 'untouched')
  assert.equal(document.querySelector('[data-testid="page-math-pop"]'), null)
  closeMathPop()
  anchor.remove()
})

test('clicking inline math opens the latex pop without crashing', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: '见 $x^2$ 公式',
    contentType: 'markdown',
  })
  const el = host.querySelector('[data-type="inline-math"]')
  assert.ok(el instanceof HTMLElement)
  el.click()
  const pop = document.querySelector('[data-testid="page-math-pop"]')
  assert.ok(pop, 'click should open the pop under the formula')
  closeMathPop()
  editor.destroy()
  host.remove()
})
