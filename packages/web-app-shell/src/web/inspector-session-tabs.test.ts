import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { inspectorPanelMatches } from './inspector-panels.ts'

test('requiresSession tabs hide when no session is selected', () => {
  assert.equal(inspectorPanelMatches({ requiresSession: true }, null), false)
  assert.equal(inspectorPanelMatches({ requiresSession: true, centerKinds: ['session'] }, 'abc'), true)
})

test('inspector mascot uses live busySessions, not the stale list busy flag', () => {
  const inspector = readFileSync(resolve(import.meta.dirname, './session-inspector.tsx'), 'utf8')
  assert.match(inspector, /state\.busySessions\[state\.sessionId\]/)
  assert.doesNotMatch(inspector, /currentSession\?\.busy/)
})
