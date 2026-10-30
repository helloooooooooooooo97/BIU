import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  isSandboxPickSurface,
  stampSandboxPickSurfaces,
  sandboxBlockKey,
} from '../../../../.plugin-dev/page-sandbox/web/stamp-picks.ts'

test('stamps every div and span plus semantic nodes', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <div class="card">
      <h2>爱乐之城</h2>
      <p>一部歌舞片</p>
      <span class="chip">标签</span>
      <button type="button">播放</button>
      <a href="#x">预告</a>
      <img alt="海报" src="about:blank" />
      <div id="score">8.6</div>
    </div>
  `
  document.body.append(root)
  stampSandboxPickSurfaces(root, '0-abcd', { plugin: 'page-sandbox' })
  const stamped = [...root.querySelectorAll('[data-sandbox-pick]')]
  if (root.hasAttribute('data-sandbox-pick') && !stamped.includes(root)) stamped.unshift(root)
  const tags = stamped.map((el) => el.tagName)
  assert.equal(root.getAttribute('data-biu-kind'), 'sandbox')
  assert.ok(tags.includes('DIV'))
  assert.ok(tags.includes('H2'))
  assert.ok(tags.includes('SPAN'))
  assert.ok(tags.includes('BUTTON'))
  const chip = root.querySelector('.chip')
  assert.equal(chip?.getAttribute('data-biu-plugin'), 'page-sandbox')
  assert.equal(isSandboxPickSurface(chip!), true)
  const divs = [...root.querySelectorAll('div')]
  const spans = [...root.querySelectorAll('span')]
  assert.ok(divs.every((el) => el.hasAttribute('data-biu-id')))
  assert.ok(spans.every((el) => el.hasAttribute('data-biu-id')))
  root.remove()
})

test('sandboxBlockKey is stable for the same host and source', () => {
  const editor = document.createElement('div')
  editor.className = 'tiptap'
  const a = document.createElement('div')
  a.setAttribute('data-page-block', 'sandbox')
  const b = document.createElement('div')
  b.setAttribute('data-page-block', 'sandbox')
  editor.append(a, b)
  assert.equal(sandboxBlockKey(a, 'export default function A(){return <p>x</p>}'), sandboxBlockKey(a, 'export default function A(){return <p>x</p>}'))
  assert.notEqual(sandboxBlockKey(a, 'export default function A(){return <p>x</p>}'), sandboxBlockKey(b, 'export default function A(){return <p>x</p>}'))
  assert.notEqual(sandboxBlockKey(a, 'export default function A(){return <p>x</p>}'), sandboxBlockKey(a, 'export default function A(){return <p>y</p>}'))
})
