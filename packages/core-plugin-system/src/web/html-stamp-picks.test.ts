import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  isHtmlPickSurface,
  stampHtmlPickSurfaces,
  stampHtmlSource,
  htmlBlockKey,
} from '../../../../.plugin-dev/page-html-blocks/stamp-picks.ts'

test('stamps the preview root, semantic nodes, and text runs', () => {
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
  const heading = root.querySelector('h2')
  assert.equal(heading?.getAttribute('data-biu-label'), '爱乐之城')
  const chip = root.querySelector('.chip')
  assert.equal(chip?.getAttribute('data-biu-kind'), 'html')
  assert.equal(isHtmlPickSurface(chip!, root), true)
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

test('stampHtmlSource marks peer slide cards and their text lines', () => {
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
  assert.ok(picks.some((el) => el.textContent?.includes('视听盛宴') && el.childElementCount === 0))
  assert.ok(wrap.querySelector('span')?.hasAttribute('data-biu-kind'))
})

test('stampHtmlSource marks each poster text line, not only the card', () => {
  const html = `<div style="min-height:340px">
    <div style="pointer-events:none"></div>
    <div>
      <div>✻ a romantic musical · 达米恩·查泽雷</div>
      <div>LA LA</div>
      <div>LAND <span>爱乐之城</span></div>
      <div>塞巴斯蒂安 · 米娅 —— 敬那些做梦的人</div>
      <div><span>🏆 奥斯卡最佳导演</span><span>🎵 City of Stars</span></div>
      <div><span>致所有做梦的人 · 2026</span><span>CITY OF STARS</span></div>
    </div>
  </div>`
  const stamped = stampHtmlSource(html, '0-poster')
  const wrap = document.createElement('div')
  wrap.innerHTML = stamped
  const labels = [...wrap.querySelectorAll('[data-biu-id]')].map((el) => el.getAttribute('data-biu-label') ?? '')
  assert.ok(labels.some((label) => label.includes('LA LA')))
  assert.ok(labels.some((label) => label.includes('爱乐之城')))
  assert.ok(labels.some((label) => label.includes('奥斯卡最佳导演')))
  assert.ok(labels.some((label) => label.includes('CITY OF STARS')))
  assert.equal(wrap.querySelector('[style*="pointer-events:none"]')?.hasAttribute('data-biu-kind'), false)
})
