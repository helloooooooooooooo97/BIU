import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  isHtmlPickSurface,
  stampHtmlPickSurfaces,
  htmlBlockKey,
} from '../../../../.plugin-dev/page-html-blocks/stamp-picks.ts'

test('stamps the preview root, semantic nodes, and top-level chunks only', () => {
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
  stampHtmlPickSurfaces(root, '0-abcd')
  const stamped = [...root.querySelectorAll('[data-html-pick]')]
  if (root.hasAttribute('data-html-pick') && !stamped.includes(root)) stamped.unshift(root)
  const tags = stamped.map((el) => el.tagName)
  assert.equal(root.getAttribute('data-biu-kind'), 'html')
  assert.equal(root.getAttribute('data-biu-id'), 'html:0-abcd:root')
  assert.ok(tags.includes('DIV'))
  assert.ok(tags.includes('H2'))
  assert.ok(tags.includes('P'))
  assert.ok(tags.includes('BUTTON'))
  assert.ok(tags.includes('A'))
  assert.ok(tags.includes('IMG'))
  assert.equal(stamped.some((el) => el.className === 'chip'), false)
  const heading = root.querySelector('h2')
  assert.equal(heading?.getAttribute('data-biu-label'), '爱乐之城')
  const chip = root.querySelector('.chip')
  assert.equal(chip?.hasAttribute('data-biu-kind'), false)
  assert.equal(isHtmlPickSurface(chip!, root), false)
  root.remove()
})

test('htmlBlockKey is stable for the same host and source', () => {
  const editor = document.createElement('div')
  editor.className = 'tiptap'
  const a = document.createElement('div')
  a.setAttribute('data-page-block', 'html')
  const b = document.createElement('div')
  b.setAttribute('data-page-block', 'htmlframe')
  editor.append(a, b)
  assert.equal(htmlBlockKey(a, '<p>x</p>'), htmlBlockKey(a, '<p>x</p>'))
  assert.notEqual(htmlBlockKey(a, '<p>x</p>'), htmlBlockKey(b, '<p>x</p>'))
  assert.notEqual(htmlBlockKey(a, '<p>x</p>'), htmlBlockKey(a, '<p>y</p>'))
})
