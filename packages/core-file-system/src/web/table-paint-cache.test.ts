import assert from 'node:assert/strict'
import { test } from 'vitest'
import { evictCellCache, reuseRowStamp } from './table-paint-cache.ts'

test('refreshing row objects and dropping offscreen cells', () => {
  const fields = Array.from({ length: 12 }, (_, index) => `f${index}`)
  const rows = Array.from({ length: 40 }, (_, id) => {
    const row: Record<string, unknown> = { id, title: `页面 ${id}` }
    for (const field of fields) row[field] = `${field}-${id}-`.padEnd(180, '文')
    return row
  })
  const waves = 50

  const legacyStart = performance.now()
  for (let wave = 0; wave < waves; wave += 1) {
    for (const row of rows) JSON.stringify({ ...row })
  }
  const legacyMs = performance.now() - legacyStart

  const cache = new Map()
  for (const row of rows) reuseRowStamp(cache, `row-${row.id}`, row)
  const currentStart = performance.now()
  let fresh = 0
  for (let wave = 0; wave < waves; wave += 1) {
    for (const row of rows) {
      if (reuseRowStamp(cache, `row-${row.id}`, { ...row }).fresh) fresh += 1
    }
  }
  const currentMs = performance.now() - currentStart
  assert.equal(fresh, 0)
  assert.ok(currentMs < legacyMs, `current ${currentMs.toFixed(2)} ms, legacy ${legacyMs.toFixed(2)} ms`)
  console.log(`row stamp ${waves}x${rows.length}: legacy ${legacyMs.toFixed(2)} ms, current ${currentMs.toFixed(2)} ms`)

  const cells = new Map<string, unknown>()
  for (let row = 0; row < 20; row += 1) {
    for (let col = 0; col < 15; col += 1) cells.set(`r${row}\0c${col}`, true)
  }
  const removed = evictCellCache(cells, new Set(['r0', 'r1']), new Set(['c0', 'c1']))
  assert.equal(cells.size, 4)
  assert.equal(removed, 296)
  console.log(`cell cache after one column window: 300 -> ${cells.size}`)
})
