import { test } from 'vitest'
import assert from 'node:assert/strict'
import React from 'react'
import { compileHostSource, loadHostComponent } from './page-host-compile.ts'

test('host compile accepts a default export and rejects imports', () => {
  const ok = compileHostSource('export default function App() { return <div>{biu.page().title}</div> }')
  assert.equal(ok.ok, true)
  const bad = compileHostSource('import x from "y"\nexport default function App() { return <div /> }')
  assert.equal(bad.ok, false)
})

test('host compile accepts Field slot for property views', () => {
  const ok = compileHostSource('export default function App() { return <Field name="title" /> }', 'Field')
  assert.equal(ok.ok, true)
})

test('host compile accepts ui.icons without import', () => {
  const ok = compileHostSource(
    'export default function App() { const Star = ui.icons.StarIcon; return <Star style={{ width: 16 }} /> }',
  )
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  const App = loadHostComponent(ok.code, React, () => null, () => null, {})
  const node = App() as { type?: unknown }
  assert.ok(node?.type)
})

test('host compile accepts Layout slot with Field and Block', () => {
  const ok = compileHostSource(
    'export default function App() { return <div><Field name="title" /><Block id="a" /></div> }',
    'Layout',
  )
  assert.equal(ok.ok, true)
})
