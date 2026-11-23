import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  FSDB_CRUMB_LABELS_EVENT,
  FSDB_DETAIL_REFRESH_EVENT,
  FSDB_SHARES_CHANGE_EVENT,
  emitFsdbEvent,
  onFsdbEvent,
} from './fsdb-events.ts'

test('emitFsdbEvent and onFsdbEvent deliver typed signals and unsubscribe cleanly', () => {
  const listeners = new Map<string, Set<EventListener>>()
  const prevWin = (globalThis as Record<string, unknown>).window
  ;(globalThis as Record<string, unknown>).window = {
    addEventListener(type: string, fn: EventListener) {
      const set = listeners.get(type) ?? new Set()
      set.add(fn)
      listeners.set(type, set)
    },
    removeEventListener(type: string, fn: EventListener) {
      listeners.get(type)?.delete(fn)
    },
    dispatchEvent(ev: Event) {
      for (const fn of listeners.get(ev.type) ?? []) fn(ev)
      return true
    },
  }

  try {
    let crumbHits = 0
    let shareHits = 0
    let refreshDetail: unknown = null

    const offCrumb = onFsdbEvent(FSDB_CRUMB_LABELS_EVENT, () => {
      crumbHits += 1
    })
    const offShare = onFsdbEvent(FSDB_SHARES_CHANGE_EVENT, () => {
      shareHits += 1
    })
    const offRefresh = onFsdbEvent(FSDB_DETAIL_REFRESH_EVENT, (detail) => {
      refreshDetail = detail
    })

    emitFsdbEvent(FSDB_CRUMB_LABELS_EVENT)
    emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
    emitFsdbEvent(FSDB_DETAIL_REFRESH_EVENT, { path: '/pages', recordId: 'r1' })

    assert.equal(crumbHits, 1)
    assert.equal(shareHits, 1)
    assert.deepEqual(refreshDetail, { path: '/pages', recordId: 'r1' })

    offCrumb()
    offShare()
    offRefresh()

    emitFsdbEvent(FSDB_CRUMB_LABELS_EVENT)
    emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
    assert.equal(crumbHits, 1)
    assert.equal(shareHits, 1)
  } finally {
    if (prevWin === undefined) delete (globalThis as Record<string, unknown>).window
    else (globalThis as Record<string, unknown>).window = prevWin
  }
})

test('emitFsdbEvent and onFsdbEvent are safe when window is undefined', () => {
  const prevWin = (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).window
  try {
    const off = onFsdbEvent(FSDB_CRUMB_LABELS_EVENT, () => {
      throw new Error('should not fire')
    })
    emitFsdbEvent(FSDB_CRUMB_LABELS_EVENT)
    off()
  } finally {
    if (prevWin !== undefined) (globalThis as Record<string, unknown>).window = prevWin
  }
})
