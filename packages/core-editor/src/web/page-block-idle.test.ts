import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PAGE_BLOCK_IDLE_MIN_PX,
  PAGE_BLOCK_IDLE_ROOT_MARGIN,
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

test('idle placeholder is a min-height shell, never a loading plugin phase', () => {
  const view = readFileSync(resolve(import.meta.dirname, './page-block-view.tsx'), 'utf8')
  const idle = readFileSync(resolve(import.meta.dirname, './page-block-idle.ts'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './style.ts'), 'utf8')
  assert.match(idle, /export const PAGE_BLOCK_IDLE_MIN_PX = 200/)
  assert.match(idle, /PAGE_BLOCK_IDLE_ROOT_MARGIN = '160px'/)
  assert.match(idle, /setTimeout\(flush, 0\)/)
  assert.match(view, /data-page-block-idle/)
  assert.match(view, /IntersectionObserver/)
  assert.match(view, /schedulePageBlockMount/)
  assert.match(view, /PAGE_BLOCK_IDLE_ROOT_MARGIN/)
  assert.match(view, /PAGE_BLOCK_IDLE_MIN_PX/)
  assert.doesNotMatch(view, /data-page-block-idle[\s\S]{0,400}data-plugin-phase/)
  assert.doesNotMatch(view, /data-plugin-phase="loading"[\s\S]{0,200}page-block-idle/)
  assert.match(css, /\.page-editor \.page-block-idle\{[^}]*min-height:200px/)
  assert.ok(PAGE_BLOCK_IDLE_MIN_PX === 200)
  assert.equal(PAGE_BLOCK_IDLE_ROOT_MARGIN, '160px')
})
