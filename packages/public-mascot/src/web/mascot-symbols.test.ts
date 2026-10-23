import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { GROK_COLORS, GROK_SHAPES } from './grok-bot-types.ts'
import { mascotSymbolId } from './mascot-symbols.tsx'

test('mascot sprite is one symbol per shape and color', () => {
  const src = readFileSync(resolve(import.meta.dirname, './mascot-symbols.tsx'), 'utf8')
  assert.match(src, /GROK_SHAPES.flatMap/)
  assert.match(src, /ensureMascotSymbols/)
  assert.equal(mascotSymbolId({ shape: 'blob', color: 'cyan' }), 'mascot-blob-cyan')
  assert.equal(GROK_SHAPES.length * GROK_COLORS.length > 100, true)
})
