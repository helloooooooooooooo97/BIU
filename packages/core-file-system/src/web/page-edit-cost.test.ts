import assert from 'node:assert/strict'
import { test } from 'vitest'
import { emitFsdbChange, parseFsdbChange } from '@biu/type-file-system'
import { listReloadInterval } from './inspector-pane-cost.ts'
import { liveRecordShouldPull } from './live-db-record.ts'
import { sameStringDraft } from './fsdb-cells.tsx'

test('idle list, one edited block, foreign records, and an unchanged body', () => {
  const ticks = 20
  let legacyReloads = 0
  for (let i = 0; i < ticks; i += 1) legacyReloads += 1
  const currentReloads = Array.from({ length: ticks }, () => listReloadInterval(false)).filter((ms) => ms > 0).length
  assert.deepEqual({ legacyReloads, currentReloads }, { legacyReloads: 20, currentReloads: 0 })

  let legacyPulls = 0
  let currentPulls = 0
  const hear = (emit: () => void) => {
    const onChange = (event: Event) => {
      const change = parseFsdbChange(event)
      if (change.scope === 'content' && change.path && change.path !== '/pages/p1') return
      legacyPulls += 1
      if (liveRecordShouldPull(change, '/pages', 'p1')) currentPulls += 1
    }
    window.addEventListener('fsdb:change', onChange)
    emit()
    window.removeEventListener('fsdb:change', onChange)
  }
  for (let i = 2; i <= 8; i += 1) hear(() => emitFsdbChange({ scope: 'records', path: `/pages/p${i}` }))
  assert.deepEqual({ legacyPulls, currentPulls }, { legacyPulls: 7, currentPulls: 0 })
  hear(() => emitFsdbChange({ scope: 'records', path: '/pages/p1' }))
  assert.equal(currentPulls, 1)
  const beforeBare = currentPulls
  hear(() => emitFsdbChange())
  assert.equal(currentPulls, beforeBare)

  const body = '的'.repeat(100_000)
  const prev = { title: '后端性能', body }
  const same = { title: '后端性能', body }
  let legacyJson = 0
  const orig = JSON.stringify
  JSON.stringify = ((value: unknown) => {
    legacyJson += 1
    return orig(value)
  }) as typeof JSON.stringify
  const legacySame = JSON.stringify(prev) === JSON.stringify(same)
  JSON.stringify = orig
  assert.equal(legacySame, true)
  assert.equal(legacyJson, 2)
  assert.equal(sameStringDraft(prev, same), true)
  assert.equal(sameStringDraft(prev, { ...same, title: '改了' }), false)
})
