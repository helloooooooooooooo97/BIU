import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

const overlay = readFileSync(resolve(import.meta.dirname, './overlay.tsx'), 'utf8')

test('pick capture does not eat inspector chrome, chat overlay, or ignored nodes', () => {
  assert.match(overlay, /function ignorePickCapture/)
  assert.doesNotMatch(overlay, /\[data-biu-ignore\], \.app-side-bar/)
  assert.doesNotMatch(overlay, /data-os-dock/)
  assert.match(overlay, /data-biu-ignore/)
  assert.match(overlay, /chat-overlay-panel/)
  assert.doesNotMatch(overlay, /\.app-rail/)
  assert.doesNotMatch(overlay, /\.session-inspector/)
})

test('sandbox inner stamps are pickable even if a page-bubble ancestor is on the path', async () => {
  const { ignorePickCapture } = await import('./overlay.tsx')
  const bubble = document.createElement('div')
  bubble.className = 'page-bubble'
  const cell = document.createElement('div')
  cell.setAttribute('data-sandbox-pick', '')
  cell.setAttribute('data-biu-kind', 'sandbox')
  document.body.append(bubble, cell)
  const event = {
    target: cell,
    composedPath: () => [cell, bubble, document.body],
  } as unknown as Event
  assert.equal(ignorePickCapture(cell, event), false)
  bubble.remove()
  cell.remove()
})

test('sidebar list content can start a pick drag; chrome stays ignored', async () => {
  const { ignorePickCapture } = await import('./overlay.tsx')
  const bar = document.createElement('aside')
  bar.className = 'app-side-bar'
  const row = document.createElement('div')
  row.setAttribute('data-biu-kind', 'session')
  row.setAttribute('data-biu-id', 's1')
  const head = document.createElement('div')
  head.className = 'app-side-bar-head'
  head.setAttribute('data-biu-ignore', '')
  bar.append(head, row)
  document.body.append(bar)
  assert.equal(ignorePickCapture(row), false)
  assert.equal(ignorePickCapture(head), true)
  bar.remove()
})

test('close button inside the chat overlay is not captured while picking', async () => {
  const { ignorePickCapture } = await import('./overlay.tsx')
  const panel = document.createElement('div')
  panel.setAttribute('data-testid', 'chat-overlay-panel')
  const close = document.createElement('button')
  close.setAttribute('data-testid', 'chat-overlay-close')
  panel.append(close)
  document.body.append(panel)
  assert.equal(ignorePickCapture(close), true)
  panel.remove()
})

test('replies inside the chat overlay stay pickable', async () => {
  const { ignorePickCapture } = await import('./overlay.tsx')
  const panel = document.createElement('div')
  panel.setAttribute('data-testid', 'chat-overlay-panel')
  const reply = document.createElement('div')
  reply.setAttribute('data-biu-kind', 'reply')
  reply.setAttribute('data-biu-id', 'r1')
  panel.append(reply)
  document.body.append(panel)
  const event = {
    target: reply,
    composedPath: () => [reply, panel, document.body],
  } as unknown as Event
  assert.equal(ignorePickCapture(reply, event), false)
  panel.remove()
})

test('Escape exits pick mode', () => {
  assert.match(overlay, /pick.exit\(\)/)
})

test('Escape blurs the focused control so the UA focus ring does not linger', () => {
  assert.match(overlay, /active.blur\(\)/)
})

test('click and hover use the same point resolver', () => {
  assert.match(overlay, /resolvePickFromEvent/)
  assert.doesNotMatch(overlay, /resolvePickAtPoint/)
  assert.doesNotMatch(overlay, /textPickFromSelection/)
  assert.doesNotMatch(overlay, /picksOnPointerUp/)
  assert.doesNotMatch(overlay, /kind === 'html'/)
  assert.match(overlay, /inReadable/)
  assert.match(overlay, /\.chat-stage/)
  assert.match(overlay, /\.page-bubble/)
})

test('pointerup does not attach picks after pick mode has exited', () => {
  assert.match(overlay, /if \(!pick.picking\) return/)
})

test('Command/Ctrl+2 toggles pick mode', () => {
  assert.match(overlay, /event.metaKey \|\| event.ctrlKey/)
  assert.match(overlay, /key === '2'/)
  assert.doesNotMatch(overlay, /key === 'q'/)
  assert.doesNotMatch(overlay, /key === '1'/)
})

test('marquee inside inspector uses the inspector as the query root', () => {
  assert.match(overlay, /pickSurfaceAtPoint/)
})

test('pick mode uses a blue white-outline pointer and no hit pulse', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  const sandbox = readFileSync(resolve(import.meta.dirname, '../../../../.plugin-dev/page-sandbox/web/sandbox.ts'), 'utf8')
  assert.match(css, /html\.pick-mode[\s\S]*cursor: url\("data:image\/svg\+xml/)
  assert.match(css, /%231a54c4/)
  assert.doesNotMatch(css, /html\.pick-mode[\s\S]*cursor: crosshair/)
  assert.doesNotMatch(css, /pick-hit-pulse/)
  assert.doesNotMatch(css, /pick-hit-in/)
  assert.match(overlay, /pick-overlay-hit/)
  assert.match(sandbox, /%231a54c4/)
  assert.doesNotMatch(sandbox, /cursor:crosshair/)
})
