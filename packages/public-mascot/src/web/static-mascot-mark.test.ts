import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('static mascots share one geometry load instead of per-mark setState', () => {
  const mark = readFileSync(resolve(import.meta.dirname, './static-mascot-mark.tsx'), 'utf8')
  const loader = readFileSync(resolve(import.meta.dirname, './grok-bot-loader.ts'), 'utf8')
  const sidebar = readFileSync(resolve(import.meta.dirname, './sidebar-mascot.tsx'), 'utf8')
  assert.match(mark, /useSyncExternalStore/)
  assert.match(mark, /scheduleGrokGeo/)
  assert.doesNotMatch(mark, /setGeo/)
  assert.doesNotMatch(mark, /loadGrokGeo\(\)/)
  assert.match(loader, /export function scheduleGrokGeo/)
  assert.match(loader, /geoListeners/)
  assert.match(sidebar, /staticOnly = animate === false && !dancing/)
  assert.match(sidebar, /if \(staticOnly\) return/)
})
