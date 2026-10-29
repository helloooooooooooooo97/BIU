import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  pageBlockIdleQueueSize,
  resetPageBlockIdleQueue,
  schedulePageBlockMount,
} from './page-block-idle.ts'

afterEach(() => {
  resetPageBlockIdleQueue()
  vi.unstubAllGlobals()
})

test('page block idle mounts at most one view per macrotask', () => {
  const timers: Array<() => void> = []
  vi.stubGlobal('setTimeout', (cb: () => void) => {
    timers.push(cb)
    return timers.length
  })
  vi.stubGlobal('clearTimeout', (id: number) => {
    timers[id - 1] = () => {}
  })
  resetPageBlockIdleQueue()
  const seen: number[] = []
  schedulePageBlockMount(() => seen.push(1))
  schedulePageBlockMount(() => seen.push(2))
  schedulePageBlockMount(() => seen.push(3))
  assert.deepEqual(seen, [])
  assert.equal(pageBlockIdleQueueSize(), 3)
  timers.shift()!()
  assert.deepEqual(seen, [1])
  assert.equal(pageBlockIdleQueueSize(), 2)
  timers.shift()!()
  assert.deepEqual(seen, [1, 2])
  timers.shift()!()
  assert.deepEqual(seen, [1, 2, 3])
  assert.equal(pageBlockIdleQueueSize(), 0)
})

test('page plugin views mount without an idle or near-viewport gate', () => {
  const view = readFileSync(resolve(import.meta.dirname, './page-block-view.tsx'), 'utf8')
  const host = readFileSync(resolve(import.meta.dirname, './page-plugin-host.tsx'), 'utf8')
  assert.doesNotMatch(view, /useNearPageBlock/)
  assert.doesNotMatch(view, /IntersectionObserver/)
  assert.doesNotMatch(view, /schedulePageBlockMount/)
  assert.doesNotMatch(view, /PageBlockIdle/)
  assert.doesNotMatch(view, /data-page-block-idle/)
  assert.match(host, /if \(!plugin \|\| phase === 'loading' \|\| phase === 'failed' \|\| phase === 'missing'\) return/)
  assert.match(host, /if \(phase === 'ready'\)/)
  assert.match(host, /ENABLE_PAGE_BLOCK_PLUGIN/)
  assert.match(host, /requestEnablePageBlockPlugin\(plugin, kind, \{ force: true \}\)/)
  assert.match(host, /requestEnablePageBlockPlugin\(plugin, kind\)/)
  assert.match(host, /<View data=\{data\} update=\{update\} writable=\{writable\} selected=\{selected\} \/>/)
})
