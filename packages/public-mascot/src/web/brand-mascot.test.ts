import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('brand mascot is the grok blob on a white rounded square', () => {
  const mascot = readFileSync(resolve(import.meta.dirname, './brand-mascot.tsx'), 'utf8')
  const geo = readFileSync(resolve(import.meta.dirname, '../../../../public/grok-bot/geometry-data.js'), 'utf8')
  const blob = geo.match(/"blobPath":"([^"]+)"/)?.[1]
  assert.ok(blob)
  assert.match(mascot, /fill="#fff"/)
  assert.match(mascot, /rx="8"/)
  assert.match(mascot, new RegExp(blob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(mascot, /fill="#000"/)
  assert.match(mascot, /SidebarBrandLockup/)
  assert.doesNotMatch(mascot, /Biu Agent OS/)
  assert.doesNotMatch(mascot, /#0066B0/)
  assert.match(mascot, /tapToDance/)
  assert.match(mascot, /face\?: ReactNode/)
  assert.match(mascot, /label\?: string/)
  assert.match(mascot, /dancing=\{tapDance\}/)
  assert.match(mascot, /playNonce/)
  assert.match(mascot, /onPointerDown/)
  assert.match(mascot, /if \(onToggle\) event\.preventDefault\(\)/)
})
