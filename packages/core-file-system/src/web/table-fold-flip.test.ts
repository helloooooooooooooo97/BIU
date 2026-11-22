import assert from 'node:assert/strict'
import { test } from 'vitest'
import { captureTableFoldSnapshot, playTableFoldFlip, type TableFoldRowLike } from './table-fold-flip.ts'

function fakeRow(dataset: Record<string, string>, top: number, calls: Array<{ key: string; keyframes: Keyframe[]; opts?: KeyframeAnimationOptions }>): TableFoldRowLike {
  const key = dataset.rowKey ?? dataset.groupKey ?? dataset.groupPager ?? ''
  return {
    dataset,
    getBoundingClientRect: () => ({ top }),
    animate: (keyframes, opts) => {
      calls.push({ key, keyframes, opts })
    },
  }
}

test('playTableFoldFlip animates shifted existing rows and newly revealed rows with sidebar easing', () => {
  const calls: Array<{ key: string; keyframes: Keyframe[]; opts?: KeyframeAnimationOptions }> = []
  const before = [
    fakeRow({ groupKey: 'g1' }, 100, calls),
    fakeRow({ groupKey: 'g2' }, 136, calls),
  ]
  const snap = captureTableFoldSnapshot(before, false)
  assert.ok(snap)

  // Group g1 expands by 64px, pushing g2 from 136 -> 200 and revealing row r1.
  const after = [
    fakeRow({ groupKey: 'g1' }, 100, calls),
    fakeRow({ rowKey: 'g1:r1' }, 136, calls),
    fakeRow({ groupKey: 'g2' }, 200, calls),
  ]
  playTableFoldFlip(after, snap)

  assert.equal(calls.length, 2)
  assert.equal(calls[0]!.key, 'g1:r1')
  assert.equal(calls[0]!.opts?.duration, 180)
  assert.equal(calls[0]!.opts?.easing, 'cubic-bezier(0.22, 1, 0.36, 1)')
  assert.equal(calls[1]!.key, 'g2')
  assert.deepEqual(calls[1]!.keyframes, [
    { transform: 'translate3d(0, -64px, 0)' },
    { transform: 'translate3d(0, 0, 0)' },
  ])
})

test('captureTableFoldSnapshot returns null under prefers-reduced-motion', () => {
  const snap = captureTableFoldSnapshot([fakeRow({ groupKey: 'g1' }, 100, [])], true)
  assert.equal(snap, null)
})
