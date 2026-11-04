import { test } from 'vitest'
import assert from 'node:assert/strict'
import { injectPageBlockPlugin } from '../../../core-editor/src/web/page-block-plugin-host.ts'
import { ignorePickCapture } from './overlay.tsx'
import { resolvePickAtPoint, resolvePickFromEvent } from './resolve.ts'
import { formatPicks } from './types.ts'

function stubBox(el: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON() {
          return {}
        },
      }) as DOMRect,
  })
}

/** Same chrome + shadow stamps as the live page-sandbox-block dump. */
function mountLiveDump() {
  const editor = document.createElement('div')
  editor.className = 'tiptap page-editor'
  editor.setAttribute('data-testid', 'page-editor')
  const block = document.createElement('div')
  block.className = 'page-block'
  block.setAttribute('data-page-block', 'sandbox')
  block.setAttribute('data-page-block-plugin', 'page-sandbox')
  block.setAttribute('data-biu-plugin', 'page-sandbox')
  block.setAttribute('data-biu-kind', 'plugin')
  block.setAttribute('data-biu-id', 'page-sandbox:ab12cd34')
  block.setAttribute('data-biu-label', 'Sandbox')
  const card = document.createElement('div')
  card.setAttribute('data-testid', 'page-sandbox-block')
  const bar = document.createElement('div')
  bar.setAttribute('data-testid', 'sandbox-bar')
  bar.setAttribute('data-biu-ignore', 'true')
  const pane = document.createElement('div')
  pane.style.overflow = 'auto'
  pane.style.position = 'relative'
  const host = document.createElement('div')
  host.setAttribute('data-testid', 'page-sandbox-preview')
  host.setAttribute('data-sandbox', '')
  host.setAttribute('data-page-block-capture', '')
  const grip = document.createElement('button')
  grip.setAttribute('data-testid', 'sandbox-size-grip')
  grip.setAttribute('data-biu-ignore', 'true')
  pane.append(host, grip)
  card.append(bar, pane)
  block.append(card)
  editor.append(block)
  document.body.append(editor)

  const root = host.attachShadow({ mode: 'open' })
  const body = document.createElement('div')
  body.setAttribute('data-sandbox-root', '')
  const game = document.createElement('div')
  game.setAttribute('data-testid', 'sandbox-game')
  game.setAttribute('data-sandbox-pick', '')
  game.setAttribute('data-biu-kind', 'sandbox')
  game.setAttribute('data-biu-id', 'sandbox:1-af3c568d-doc:0/0')
  game.setAttribute('data-biu-label', '2048')
  game.setAttribute('data-biu-plugin', 'page-sandbox')
  const cell = document.createElement('div')
  cell.setAttribute('data-testid', 'sandbox-cell')
  cell.setAttribute('data-sandbox-pick', '')
  cell.setAttribute('data-biu-kind', 'sandbox')
  cell.setAttribute('data-biu-id', 'sandbox:1-af3c568d-doc:0/0/1/0/11')
  cell.setAttribute('data-biu-label', '2')
  cell.setAttribute('data-biu-plugin', 'page-sandbox')
  cell.textContent = '2'
  game.append(cell)
  body.append(game)
  root.append(body)
  injectPageBlockPlugin(block, 'page-sandbox')

  stubBox(editor, 0, 0, 400, 600)
  stubBox(block, 0, 0, 400, 560)
  stubBox(card, 0, 0, 400, 560)
  stubBox(bar, 0, 0, 400, 36)
  stubBox(pane, 0, 36, 400, 524)
  stubBox(host, 0, 36, 400, 80)
  stubBox(grip, 0, 550, 400, 10)
  stubBox(body, 0, 36, 400, 500)
  stubBox(game, 0, 36, 400, 500)
  stubBox(cell, 24, 200, 80, 80)

  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [pane, card, block, editor, document.body],
  })

  return { editor, block, card, pane, host, cell, bar }
}

test('live dump: plugin pane covers the preview, host is only minHeight, cell below still picks sandbox', () => {
  const live = mountLiveDump()
  assert.equal(live.pane.getAttribute('data-biu-kind'), null, 'preview pane must not be a plugin hit')
  assert.equal(live.card.getAttribute('data-biu-kind'), null, 'sandbox card must not be a plugin hit')
  assert.equal(live.host.getAttribute('data-biu-kind'), null)

  const hit = resolvePickAtPoint(64, 240, '/pages/p1')
  const report = hit
    ? { kind: hit.ref.kind, id: hit.ref.id, label: hit.ref.label, el: hit.el.getAttribute('data-testid') }
    : null
  assert.ok(hit, `pick missed the stamped cell ${JSON.stringify(report)}`)
  assert.equal(hit?.ref.kind, 'sandbox', JSON.stringify(report))
  assert.equal(hit?.ref.id, 'sandbox:1-af3c568d-doc:0/0/1/0/11', JSON.stringify(report))
  assert.equal(hit?.el, live.cell)

  const composed = {
    target: live.cell,
    composedPath: () => [live.cell, live.host, live.pane, live.card, live.block, live.editor, document.body],
  } as unknown as Event
  assert.equal(ignorePickCapture(live.cell, composed), false)

  live.editor.remove()
})

test('pick event on an inner cell yields that cell as the ref, not the plugin card', () => {
  const live = mountLiveDump()
  stubBox(live.cell, 0, 0, 0, 0)
  stubBox(live.host, 0, 0, 0, 0)
  const event = {
    clientX: 64,
    clientY: 240,
    target: live.host,
    composedPath: () => [live.cell, live.host, live.pane, live.card, live.block, live.editor, document.body],
  } as unknown as PointerEvent
  const hit = resolvePickFromEvent(event, '/pages/p1')
  const report = hit
    ? { kind: hit.ref.kind, id: hit.ref.id, label: hit.ref.label, plugin: hit.ref.plugin }
    : null
  assert.ok(hit, `no pick from composed path ${JSON.stringify(report)}`)
  assert.equal(hit?.ref.kind, 'sandbox', JSON.stringify(report))
  assert.notEqual(hit?.ref.kind, 'plugin', JSON.stringify(report))
  assert.equal(hit?.ref.id, 'sandbox:1-af3c568d-doc:0/0/1/0/11', JSON.stringify(report))
  assert.doesNotMatch(hit?.ref.id ?? '', /^page-sandbox:/)
  assert.equal(hit?.el, live.cell)
  assert.match(hit?.ref.element ?? '', />2</)
  const packed = formatPicks([hit!.ref])
  assert.match(packed, /"kind":"sandbox"/)
  assert.doesNotMatch(packed, /"kind":"plugin"/)
  assert.doesNotMatch(packed, /page-sandbox-block/)
  live.editor.remove()
})
