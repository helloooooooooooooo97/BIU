import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  EMPTY_SESSION_WINDOW,
  SESSION_ROW_PX,
  SESSION_WINDOW_OVERSCAN,
  SESSION_WINDOW_VIEWPORT_FALLBACK,
  sessionWindowFromHost,
  sessionWindowHidden,
  sessionWindowSlice,
  sessionWindowUnchanged,
} from './session-window.ts'

test('session window keeps overscan around the viewport', () => {
  const slice = sessionWindowSlice(200, 0, SESSION_ROW_PX * 10)
  assert.equal(slice.start, 0)
  assert.equal(slice.end, 10 + SESSION_WINDOW_OVERSCAN * 2)
  assert.equal(slice.padTop, 0)
  assert.equal(slice.padBottom, (200 - slice.end) * SESSION_ROW_PX)
})

test('session window shifts with scroll and pads both sides', () => {
  const slice = sessionWindowSlice(200, SESSION_ROW_PX * 50, SESSION_ROW_PX * 10)
  assert.equal(slice.start, 50 - SESSION_WINDOW_OVERSCAN)
  assert.equal(slice.end, 50 + 10 + SESSION_WINDOW_OVERSCAN)
  assert.equal(slice.padTop, slice.start * SESSION_ROW_PX)
  assert.equal(slice.padBottom, (200 - slice.end) * SESSION_ROW_PX)
})

test('session window clamps at the end', () => {
  const slice = sessionWindowSlice(20, SESSION_ROW_PX * 18, SESSION_ROW_PX * 10)
  assert.equal(slice.end, 20)
  assert.equal(slice.padBottom, 0)
  assert.ok(slice.start >= 0)
})

test('empty session list has no pad', () => {
  assert.deepEqual(sessionWindowSlice(0, 0, 400), EMPTY_SESSION_WINDOW)
})

test('unmeasured viewport still paints a first screen under 200 rows', () => {
  const slice = sessionWindowSlice(200, 0, 0)
  assert.equal(slice.start, 0)
  assert.ok(slice.end >= Math.ceil(SESSION_WINDOW_VIEWPORT_FALLBACK / SESSION_ROW_PX))
  assert.ok(slice.end < 200)
  assert.ok(slice.end <= Math.ceil(SESSION_WINDOW_VIEWPORT_FALLBACK / SESSION_ROW_PX) + SESSION_WINDOW_OVERSCAN * 2)
})

test('hidden list keeps height without painting rows', () => {
  const hidden = sessionWindowHidden(200)
  assert.equal(hidden.start, 0)
  assert.equal(hidden.end, 0)
  assert.equal(hidden.padTop, 0)
  assert.equal(hidden.padBottom, 200 * SESSION_ROW_PX)
})

test('host below the scroller stays hidden', () => {
  const host = {
    getBoundingClientRect: () => ({ top: 1400, bottom: 1400 + 200 * SESSION_ROW_PX, height: 200 * SESSION_ROW_PX }),
  } as HTMLElement
  const scroller = {
    getBoundingClientRect: () => ({ top: 80, bottom: 800, height: 720 }),
    clientHeight: 720,
  } as HTMLElement
  const slice = sessionWindowFromHost(200, host, scroller)
  assert.equal(slice.end, 0)
  assert.equal(slice.padBottom, 200 * SESSION_ROW_PX)
})

test('collapsed host stays hidden', () => {
  const host = {
    getBoundingClientRect: () => ({ top: 120, bottom: 120, height: 0 }),
  } as HTMLElement
  const scroller = {
    getBoundingClientRect: () => ({ top: 80, bottom: 800, height: 720 }),
    clientHeight: 720,
  } as HTMLElement
  const slice = sessionWindowFromHost(200, host, scroller)
  assert.equal(slice.end, 0)
  assert.equal(slice.padBottom, 200 * SESSION_ROW_PX)
})

test('one-row host shorter than a session row still paints', () => {
  const host = {
    getBoundingClientRect: () => ({ top: 120, bottom: 140, height: 20 }),
  } as HTMLElement
  const scroller = {
    getBoundingClientRect: () => ({ top: 80, bottom: 800, height: 720 }),
    clientHeight: 720,
  } as HTMLElement
  const slice = sessionWindowFromHost(1, host, scroller)
  assert.equal(slice.start, 0)
  assert.equal(slice.end, 1)
  assert.equal(slice.padTop, 0)
  assert.equal(slice.padBottom, 0)
})

test('host in the scroller paints a window', () => {
  const host = {
    getBoundingClientRect: () => ({ top: 80, bottom: 80 + 200 * SESSION_ROW_PX, height: 200 * SESSION_ROW_PX }),
  } as HTMLElement
  const scroller = {
    getBoundingClientRect: () => ({ top: 80, bottom: 800, height: 720 }),
    clientHeight: 720,
  } as HTMLElement
  const slice = sessionWindowFromHost(200, host, scroller)
  assert.equal(slice.start, 0)
  assert.ok(slice.end < 200)
  assert.ok(slice.end >= Math.ceil(720 / SESSION_ROW_PX))
})

test('unchanged window skips state when scroll stays in the same rows', () => {
  const prev = { top: 0, height: 720 }
  const next = { top: 8, height: 720 }
  assert.equal(sessionWindowUnchanged(200, prev, next), true)
  assert.equal(sessionWindowUnchanged(200, prev, { top: SESSION_ROW_PX * 10, height: 720 }), false)
})
