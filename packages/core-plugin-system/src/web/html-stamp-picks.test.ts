import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  isHtmlPickSurface,
  stampHtmlPickSurfaces,
  stampHtmlSource,
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

test('stampHtmlSource marks peer slide cards inside a flex wrap', () => {
  const html = `<div style="display:flex;gap:12px">
    <div style="flex:1"><span>SLIDE 01 · 视听</span><div>视听盛宴</div><div>从山顶的黄昏共舞到天文馆。</div></div>
    <div style="flex:1"><span>SLIDE 02 · 弧光</span><div>梦想与现实</div><div>塞巴斯蒂安守着爵士乐。</div></div>
    <div style="flex:1"><span>SLIDE 03 · 假如</span><div>结局的假如</div><div>结尾那段蒙太奇。</div></div>
  </div>`
  const stamped = stampHtmlSource(html, '1-slide')
  const wrap = document.createElement('div')
  wrap.innerHTML = stamped
  const picks = [...wrap.querySelectorAll('[data-biu-id]')]
  assert.ok(picks.length >= 3)
  const ids = picks.map((el) => el.getAttribute('data-biu-id') ?? '')
  assert.ok(ids.some((id) => id.includes('1-slide')))
  const slides = picks.filter((el) => (el.textContent ?? '').includes('视听盛宴') || (el.textContent ?? '').includes('梦想与现实') || (el.textContent ?? '').includes('结局的假如'))
  assert.equal(slides.length >= 3, true)
  assert.equal(wrap.querySelector('span')?.hasAttribute('data-biu-kind'), false)
})
