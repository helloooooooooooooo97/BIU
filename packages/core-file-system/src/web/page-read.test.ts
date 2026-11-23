import assert from 'node:assert/strict'
import { test } from 'vitest'
import { bindPageRead, pageReadRatio } from './page-read.ts'

test('typing forty line-growths measures once and skips an invisible progress change', () => {
  const growths = 40
  let height = 8000
  let top = 400
  let reads = 0
  const scroller = document.createElement('div')
  Object.defineProperty(scroller, 'scrollHeight', {
    get() {
      reads += 1
      return height
    },
  })
  Object.defineProperty(scroller, 'clientHeight', { get: () => 400 })
  Object.defineProperty(scroller, 'scrollTop', { get: () => top })
  const bar = document.createElement('div')
  let writes = 0
  const orig = bar.style.setProperty.bind(bar.style)
  bar.style.setProperty = (name: string, value: string) => {
    if (name === '--page-read') writes += 1
    orig(name, value)
  }

  const legacy = () => {
    const max = scroller.scrollHeight - scroller.clientHeight
    const p = max <= 0 ? 0 : Math.min(1, Math.max(0, scroller.scrollTop / max))
    bar.style.setProperty('--page-read', String(p))
  }
  for (let i = 0; i < growths; i += 1) {
    height += 20
    legacy()
  }
  const legacyReads = reads
  const legacyWrites = writes

  reads = 0
  writes = 0
  height = 8000
  const ref: { queued: (() => void) | null } = { queued: null }
  const runQueued = (clear = false) => {
    const fn = ref.queued
    if (clear) ref.queued = null
    fn?.()
  }
  const read = bindPageRead(
    scroller,
    bar,
    (cb) => {
      ref.queued = cb
      return 1
    },
    () => {
      ref.queued = null
    },
  )
  for (let i = 0; i < growths; i += 1) {
    height += 20
    read.poke()
  }
  assert.equal(reads, 0)
  runQueued(true)
  const coalescedReads = reads
  const coalescedWrites = writes
  read.poke()
  runQueued()
  assert.equal(writes, coalescedWrites)
  assert.deepEqual(
    { legacyReads, legacyWrites, coalescedReads, coalescedWrites, followUpWrites: writes },
    { legacyReads: 40, legacyWrites: 40, coalescedReads: 1, coalescedWrites: 1, followUpWrites: 1 },
  )

  top = 4000
  read.poke()
  runQueued()
  assert.equal(writes, 2)
  assert.ok(Math.abs(pageReadRatio(4000, height, 400) - Number(bar.style.getPropertyValue('--page-read'))) < 1e-12)
})
