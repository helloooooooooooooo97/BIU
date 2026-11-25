import { afterEach, beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Context } from 'cordis'
import type { SlotProps } from '@biu/types/slots'
import { PickService } from './service.ts'
import { PickOverlay } from './overlay.tsx'
import { pickDragScroller, pickDragScrollStep } from './drag-scroll.ts'

let frames: Map<number, FrameRequestCallback>
let nextFrame: number
beforeEach(() => {
  frames = new Map()
  nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('[data-scroll-fixture]').forEach((node) => node.remove())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function rect(left: number, top: number, width: number, height: number) {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON() {} } as DOMRect
}
function fixture() {
  const scroller = document.createElement('div')
  scroller.setAttribute('data-scroll-fixture', '')
  scroller.style.overflowY = 'auto'
  scroller.getBoundingClientRect = () => rect(100, 100, 200, 200)
  Object.defineProperties(scroller, { clientHeight: { value: 200 }, scrollHeight: { value: 600 } })
  const rows = Array.from({ length: 10 }, (_, index) => {
    const row = document.createElement('div')
    row.dataset.biuKind = 'field'
    row.dataset.biuId = `row-${index}:title`
    row.dataset.biuLabel = `记录 ${index}`
    row.getBoundingClientRect = () => rect(100, 100 + index * 60 - scroller.scrollTop, 200, 55)
    scroller.append(row)
    return row
  })
  document.body.append(scroller)
  return { scroller, rows }
}
function frame(count = 1) {
  for (let index = 0; index < count; index++) {
    act(() => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(index * 16))
    })
  }
}
function picking() {
  const pick = new PickService(new Context())
  pick.enter()
  render(<PickOverlay {...({} as SlotProps)} />)
  return pick
}
function drag(rows: HTMLElement[]) {
  fireEvent.pointerDown(rows[0], { button: 0, buttons: 1, clientX: 110, clientY: 110 })
  fireEvent.pointerMove(window, { buttons: 1, clientX: 280, clientY: 295 })
}

test('pick drags use the nearest vertically scrolling pane rather than a horizontal table wrapper', () => {
  const { scroller, rows } = fixture()
  const wrap = document.createElement('div')
  wrap.style.overflowX = 'auto'
  Object.defineProperties(wrap, { clientHeight: { value: 600 }, scrollHeight: { value: 600 } })
  assert.equal(pickDragScroller([rows[0], wrap, scroller, document]), scroller)
})

test('edge scrolling works in both directions, stays in its pane, and stops at the scroll limits', () => {
  const { scroller } = fixture()
  assert.equal(pickDragScrollStep(scroller, { x: 200, y: 200 }), 0)
  assert.ok(pickDragScrollStep(scroller, { x: 200, y: 295 }) > 0)
  assert.equal(pickDragScrollStep(scroller, { x: 400, y: 295 }), 0)
  assert.ok(pickDragScrollStep(scroller, { x: 200, y: 105 }) < 0)
  scroller.scrollTop = 400
  assert.equal(pickDragScrollStep(scroller, { x: 200, y: 295 }), 0)
  scroller.scrollTop = 0
  assert.equal(pickDragScrollStep(scroller, { x: 200, y: 105 }), 0)
  const dock = document.createElement('div')
  dock.dataset.scrollFixture = ''
  dock.dataset.testid = 'chat-overlay-panel'
  dock.getBoundingClientRect = () => rect(100, 230, 200, 70)
  document.body.append(dock)
  assert.ok(pickDragScrollStep(scroller, { x: 200, y: 225 }) > 0)
})

test('pick marquee keeps scrolling with a stationary pointer and retains virtual rows already selected', () => {
  const { scroller, rows } = fixture()
  const pick = picking()
  drag(rows)
  frame(4)
  assert.ok(scroller.scrollTop > 0)
  rows[0].remove() // Simulate a virtual table unmounting the start of the selection.
  frame(24)
  assert.equal(scroller.scrollTop, 400)
  fireEvent.pointerUp(window, { button: 0, buttons: 0, clientX: 280, clientY: 295 })
  assert.ok(pick.refs.some((ref) => ref.id === 'row-0:title'))
  assert.ok(pick.refs.some((ref) => ref.id === 'row-9:title'))
  assert.equal(new Set(pick.refs.map((ref) => ref.id)).size, pick.refs.length)
  assert.equal(frames.size, 0)
  assert.equal(pick.marquee, null)
})

test('reversing the drag shrinks the selection and cancellation stops scrolling without attaching picks', () => {
  const { scroller, rows } = fixture()
  const pick = picking()
  drag(rows)
  frame(24)
  assert.equal(scroller.scrollTop, 400)
  fireEvent.pointerMove(window, { buttons: 1, clientX: 280, clientY: 105 })
  frame(24)
  assert.equal(scroller.scrollTop, 0)
  fireEvent.pointerUp(window, { button: 0, buttons: 0, clientX: 280, clientY: 105 })
  assert.deepEqual(pick.refs.map((ref) => ref.id), ['row-0:title'])
  drag(rows)
  frame(2)
  fireEvent.pointerCancel(window)
  assert.equal(frames.size, 0)
  assert.equal(pick.marquee, null)
  assert.deepEqual(pick.refs.map((ref) => ref.id), ['row-0:title'])
})
