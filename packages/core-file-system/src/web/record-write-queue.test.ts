import assert from 'node:assert/strict'
import { test } from 'vitest'
import { KeyedSerialQueue, PendingFieldPatchTracker } from './record-write-queue.ts'

test('KeyedSerialQueue serializes same-key writes in FIFO order while allowing different keys in parallel', async () => {
  const queue = new KeyedSerialQueue()
  const events: string[] = []
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const p1 = queue.enqueue('/pages/1', async (gen) => {
    events.push(`p1:start:${gen}`)
    await firstGate
    events.push(`p1:end:latest=${queue.isLatest('/pages/1', gen)}`)
    return 'first'
  })
  const p2 = queue.enqueue('/pages/1', async (gen) => {
    events.push(`p2:start:${gen}`)
    events.push(`p2:end:latest=${queue.isLatest('/pages/1', gen)}`)
    return 'second'
  })
  const other = queue.enqueue('/pages/2', async () => {
    events.push('other:run')
    return 'other'
  })

  assert.equal(queue.pendingCount('/pages/1'), 2)
  assert.equal(await other, 'other')
  assert.deepEqual(events, ['p1:start:1', 'other:run'])

  releaseFirst()
  assert.equal(await p1, 'first')
  assert.equal(await p2, 'second')
  assert.deepEqual(events, [
    'p1:start:1',
    'other:run',
    'p1:end:latest=false',
    'p2:start:2',
    'p2:end:latest=true',
  ])
  assert.equal(queue.hasPending('/pages/1'), false)
  assert.equal(queue.hasPending('/pages/2'), false)
})

test('KeyedSerialQueue isolates rejections so subsequent queued writes still execute', async () => {
  const queue = new KeyedSerialQueue()
  const failed = queue.enqueue('/pages/1', async () => {
    throw new Error('network boom')
  })
  const recovered = queue.enqueue('/pages/1', async () => 'ok')

  await assert.rejects(() => failed, /network boom/)
  assert.equal(await recovered, 'ok')
  assert.equal(queue.hasPending('/pages/1'), false)
})

test('PendingFieldPatchTracker reference-counts overlapping writes and overlays onto reloaded rows', () => {
  const tracker = new PendingFieldPatchTracker()
  const releaseA = tracker.track('rec-1', { title: '前半' })
  const releaseB = tracker.track('rec-1', { title: '前半后半', priority: 'P1' })

  const overlaid = tracker.overlay({ id: 'rec-1', title: '服务器旧值', priority: 'P3' })
  assert.equal(overlaid.title, '前半后半')
  assert.equal(overlaid.priority, 'P1')

  // First write settles; second write is still in flight so title stays protected.
  releaseA()
  assert.deepEqual(tracker.patchFor('rec-1'), { title: '前半后半', priority: 'P1' })

  // Idempotent double release does not underflow.
  releaseA()
  assert.deepEqual(tracker.patchFor('rec-1'), { title: '前半后半', priority: 'P1' })

  releaseB()
  assert.equal(tracker.patchFor('rec-1'), null)
})
