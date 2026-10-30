import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { PickChip } from './chip.tsx'
import { composerDocExtensions } from '../../../core-chat/src/web/composer-kit.ts'

const PICK = {
  kind: 'sandbox',
  id: 'sandbox:1',
  label: 'SANDBOX',
  route: '/p/p1',
  path: '/pages/p1',
  title: 'sandbox',
}

async function paint() {
  await act(async () => {
    await Promise.resolve()
  })
}

function mount(node: HTMLElement, element: ReturnType<typeof createElement>) {
  const root = createRoot(node)
  act(() => {
    root.render(element)
  })
  return root
}

function unmount(root: Root, ...nodes: Array<HTMLElement | null>) {
  act(() => {
    root.unmount()
  })
  for (const node of nodes) node?.remove()
  document.querySelectorAll('[data-testid="pick-chip-data"]').forEach((el) => el.remove())
}

test('inspect flyout portals to body so overflow columns cannot clip it', async () => {
  const clip = document.createElement('div')
  clip.setAttribute('data-testid', 'overflow-column')
  clip.className = 'app-side-bar'
  clip.style.cssText = 'overflow:hidden;contain:paint;width:72px;height:36px;position:relative'
  document.body.append(clip)
  const root = mount(clip, createElement(PickChip, { pick: PICK }))
  const chip = clip.querySelector<HTMLButtonElement>('[data-testid="user-pick-chip"]')
  assert.ok(chip)
  await act(async () => {
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await paint()
  const card = document.querySelector('[data-testid="pick-chip-data"]')
  assert.ok(card, 'flyout should open')
  assert.equal(clip.contains(card), false, 'must leave the overflow column')
  assert.equal(card.parentElement === clip, false)
  assert.ok(document.body.contains(card))
  const pop = card.closest('.biu-headless-pop') ?? card
  const z = Number.parseInt(getComputedStyle(pop).zIndex || (pop as HTMLElement).style.zIndex, 10)
  assert.ok(z >= 300, `flyout z-index should clear the sidebar, got ${z}`)
  unmount(root, clip)
})

test('inspect flyout closes on outside pointerdown and Escape', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = mount(host, createElement(PickChip, { pick: PICK }))
  const chip = host.querySelector<HTMLButtonElement>('[data-testid="user-pick-chip"]')
  assert.ok(chip)
  await act(async () => {
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await paint()
  assert.ok(document.querySelector('[data-testid="pick-chip-data"]'))
  const outside = document.createElement('button')
  outside.type = 'button'
  outside.setAttribute('data-testid', 'outside-page')
  outside.textContent = 'outside'
  document.body.append(outside)
  await act(async () => {
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await paint()
  assert.equal(document.querySelector('[data-testid="pick-chip-data"]'), null, 'outside click must close')
  outside.remove()
  unmount(root, host)
})

test('overlay composer chip opens inspect even inside contenteditable isolation', async () => {
  const panel = document.createElement('div')
  panel.setAttribute('data-testid', 'chat-overlay-panel')
  panel.className = 'chat-overlay-panel'
  panel.style.cssText = 'overflow:hidden;isolation:isolate;position:relative;z-index:80'
  const dock = document.createElement('div')
  dock.className = 'chat-composer-dock'
  dock.style.cssText = 'overflow:hidden;isolation:isolate;z-index:20;pointer-events:none'
  const editable = document.createElement('div')
  editable.contentEditable = 'true'
  editable.style.pointerEvents = 'auto'
  dock.append(editable)
  panel.append(dock)
  document.body.append(panel)
  const root = mount(editable, createElement(PickChip, { pick: PICK }))
  const chip = editable.querySelector<HTMLButtonElement>('[data-testid="user-pick-chip"]')
  assert.ok(chip)
  await act(async () => {
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await paint()
  const card = document.querySelector('[data-testid="pick-chip-data"]')
  assert.ok(card, 'overlay composer chip must open')
  assert.equal(panel.contains(card), false)
  assert.ok(document.body.contains(card))
  unmount(root, panel)
})

test('tip tap pick node view does not let the editor swallow chip clicks', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({
    element: host,
    extensions: composerDocExtensions(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'pickChip',
              attrs: { kind: 'sandbox', id: 's1', label: 'SANDBOX', route: '/p/p1', path: '/pages/p1' },
            },
          ],
        },
      ],
    },
  })
  await paint()
  const chip = host.querySelector<HTMLButtonElement>('[data-testid="user-pick-chip"]')
  assert.ok(chip)
  await act(async () => {
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await paint()
  assert.ok(document.querySelector('[data-testid="pick-chip-data"]'), 'node-view chip must open')
  editor.destroy()
  host.remove()
  document.querySelectorAll('[data-testid="pick-chip-data"]').forEach((el) => el.remove())
})
