/** @vitest-environment jsdom */
import { test, afterEach, vi } from 'vitest'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { OverlayChatWindow } from './overlay-window.tsx'
import { closeChatOverlay, getChatOverlay, getOverlayThread, revealOverlayThread, setChatOverlay, setOverlayThread } from './chat-overlay.ts'

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  host?.remove()
  root = null
  host = null
  setChatOverlay(false)
  setOverlayThread(false)
  window.dispatchEvent(new CustomEvent('biu:pick-mode', { detail: { picking: false } }))
  try {
    localStorage.removeItem('cordis.overlay.geom')
  } catch {
    /* ignore */
  }
  vi.useRealTimers()
})

test('clicking the overlay close button actually closes the overlay', () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  setChatOverlay(true)
  setOverlayThread(true)
  const header = createElement(
    'button',
    { type: 'button', 'data-testid': 'chat-overlay-close' },
    'close',
  )
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header,
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  assert.equal(getChatOverlay(), true)
  const close = document.querySelector('[data-testid="chat-overlay-close"]')
  assert.ok(close)
  act(() => {
    close!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
  })
  assert.equal(getChatOverlay(), false)
  closeChatOverlay()
})

test('overlay opens docked to the right and anchored to the bottom', () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  const panel = document.querySelector('[data-testid="chat-overlay-panel"]') as HTMLElement
  assert.ok(panel)
  assert.equal(panel.classList.contains('is-compose-only'), true)
  assert.equal(panel.getAttribute('data-overlay-layout'), 'right')
  assert.equal(document.querySelector('[data-testid="chat-overlay-drag"]'), null)
  assert.ok(Number.parseFloat(panel.style.left) > 700)
  assert.equal(panel.style.bottom, '12px')
  assert.equal(panel.style.height, '')
  assert.equal(document.querySelector('[data-testid="chat-overlay-layout-toggle"]'), null)
  assert.equal(document.querySelector('[data-testid="chat-overlay-layout"]'), null)
})

test('idle overlay dims when composer is not focused', () => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  setChatOverlay(true)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  const panel = document.querySelector('[data-testid="chat-overlay-panel"]') as HTMLElement
  assert.ok(panel)
  assert.equal(panel.classList.contains('is-dimmed'), false)
  act(() => {
    vi.advanceTimersByTime(200)
  })
  assert.equal(panel.classList.contains('is-dimmed'), true)
  vi.useRealTimers()
})

test('composer-focus wake does not keep overlay opaque if editor never focuses', () => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  setChatOverlay(true)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  const panel = document.querySelector('[data-testid="chat-overlay-panel"]') as HTMLElement
  act(() => {
    vi.advanceTimersByTime(200)
  })
  assert.equal(panel.classList.contains('is-dimmed'), true)
  act(() => {
    window.dispatchEvent(new Event('biu:composer-focus'))
  })
  assert.equal(panel.classList.contains('is-dimmed'), false)
  act(() => {
    vi.advanceTimersByTime(400)
  })
  assert.equal(panel.classList.contains('is-dimmed'), true)
  vi.useRealTimers()
})

test('pointer leaving the window lets the overlay dim', () => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  setChatOverlay(true)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  const panel = document.querySelector('[data-testid="chat-overlay-panel"]') as HTMLElement
  act(() => {
    vi.advanceTimersByTime(200)
    panel.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  })
  assert.equal(panel.classList.contains('is-dimmed'), false)
  act(() => {
    panel.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null, clientX: 10, clientY: 10 }))
    vi.advanceTimersByTime(120)
  })
  assert.equal(panel.classList.contains('is-dimmed'), true)
  vi.useRealTimers()
})

test('parked mascot click shows last thread state', () => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  setChatOverlay(true)
  setOverlayThread(true)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div'),
        dock: createElement('button', { type: 'button', 'data-testid': 'brand-corner-mascot-toggle' }, 'm'),
      }),
    )
  })
  const panel = document.querySelector('[data-testid="chat-overlay-panel"]') as HTMLElement
  const mascot = document.querySelector('[data-testid="brand-corner-mascot-toggle"]') as HTMLElement
  act(() => {
    vi.advanceTimersByTime(200)
  })
  assert.equal(panel.classList.contains('is-dimmed'), true)
  act(() => {
    mascot.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  })
  assert.equal(panel.classList.contains('is-dimmed'), true)
  act(() => {
    mascot.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  assert.equal(panel.classList.contains('is-dimmed'), false)
  assert.equal(getOverlayThread(), true)
  vi.useRealTimers()
})

test('overlay header close button has no layout control beside it', () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  setChatOverlay(true)
  setOverlayThread(true)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement(
          'header',
          { className: 'chat-view-header' },
          createElement('div', { className: 'chat-view-header-left' }, 'project'),
          createElement(
            'div',
            { className: 'chat-view-header-right' },
            createElement('button', { type: 'button', 'data-testid': 'chat-overlay-close' }, 'x'),
          ),
        ),
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  const right = document.querySelector('.chat-view-header-right')
  assert.ok(right)
  assert.equal(right.querySelector('[data-testid="chat-overlay-layout-toggle"]'), null)
  assert.ok(right.querySelector('[data-testid="chat-overlay-close"]'))
})

test('compose-only overlay shows the thread after send', () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  setChatOverlay(true)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div', { 'data-testid': 'overlay-thread-stub' }),
        dock: createElement('div'),
      }),
    )
  })
  const panel = document.querySelector('[data-testid="chat-overlay-panel"]') as HTMLElement
  assert.ok(panel)
  assert.equal(panel.classList.contains('is-compose-only'), true)
  assert.equal(document.querySelector('[data-testid="chat-overlay-head"]'), null)
  assert.equal(document.querySelector('[data-testid="chat-overlay-peek"]'), null)
  act(() => {
    revealOverlayThread()
  })
  assert.equal(getOverlayThread(), true)
  assert.equal(panel.classList.contains('is-compose-only'), false)
  assert.ok(document.querySelector('[data-testid="chat-overlay-head"]'))
  assert.equal(panel.style.bottom, '12px')
  const pane = document.querySelector('[data-testid="chat-pane"]') as HTMLElement
  assert.ok(pane)
  assert.ok(Number.parseFloat(pane.style.height) >= 280)
  assert.equal(panel.contains(pane), true)
  const dock = panel.querySelector('.chat-composer-dock')
  assert.ok(dock)
  assert.equal(pane.contains(dock), false)
  assert.ok(pane.querySelector('.chat-overlay-thread'))
  assert.ok(document.querySelector('[data-testid="chat-overlay-resize-n"]'))
  assert.ok(document.querySelector('[data-testid="chat-overlay-resize-w"]'))
  assert.ok(document.querySelector('[data-testid="chat-overlay-resize-nw"]'))
  assert.equal(document.querySelector('[data-testid="chat-overlay-resize-s"]'), null)
  assert.equal(document.querySelector('[data-testid="chat-overlay-resize-e"]'), null)
  assert.equal(document.querySelector('[data-testid="chat-overlay-resize-se"]'), null)
  assert.equal(document.querySelector('[data-testid="chat-overlay-resize-sw"]'), null)
  assert.equal(document.querySelector('[data-testid="chat-overlay-resize-ne"]'), null)
  const north = document.querySelector('[data-testid="chat-overlay-resize-n"]') as HTMLElement
  assert.match(north.className, /\bz-40\b/)
})

test('compose-only overlay closes when clicking outside; expanded does not', () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  setChatOverlay(true)
  setOverlayThread(false)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  act(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  assert.equal(getChatOverlay(), false)

  setChatOverlay(true)
  setOverlayThread(true)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  act(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  assert.equal(getChatOverlay(), true)
})

test('compose-only overlay stays while pick mode is on', () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  window.dispatchEvent(new CustomEvent('biu:pick-mode', { detail: { picking: true } }))
  setChatOverlay(true)
  setOverlayThread(false)
  act(() => {
    root!.render(
      createElement(OverlayChatWindow, {
        header: createElement('div'),
        thread: createElement('div'),
        dock: createElement('div'),
      }),
    )
  })
  act(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  assert.equal(getChatOverlay(), true)
})
