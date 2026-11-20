import { test } from 'vitest'
import assert from 'node:assert/strict'
import React from 'react'
import { compileHostSource, loadSandboxComponent } from './sandbox-compile.ts'

test('sandbox compile accepts a default export and rejects imports', () => {
  const ok = compileHostSource('export default function App() { return <div>{biu.record().title}</div> }')
  assert.equal(ok.ok, true)
  const bad = compileHostSource('import x from "y"\nexport default function App() { return <div /> }')
  assert.equal(bad.ok, false)
})

test('sandbox compile accepts Field slot for property views', () => {
  const ok = compileHostSource('export default function App() { return <Field name="title" /> }', 'Field')
  assert.equal(ok.ok, true)
})

test('sandbox compile injects ui.icons without import', () => {
  const ok = compileHostSource(
    'export default function App() { const Star = ui.icons.StarIcon; return <Star style={{ width: 16 }} /> }',
  )
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  const App = loadSandboxComponent(ok.code, { React, Block: () => null, Field: () => null, biu: {} })
  const node = App() as { type?: unknown }
  assert.ok(node?.type)
})

test('sandbox compile accepts Layout slot with Field and Block', () => {
  const ok = compileHostSource(
    'export default function App() { return <div><Field name="title" /><Block id="a" /></div> }',
    'Layout',
  )
  assert.equal(ok.ok, true)
})

test('sandbox compile does not false-positive on require/import inside comments or string literals', () => {
  const ok = compileHostSource(`
    // Do not call require("fs") or import("x") here
    /* import foo from "bar" */
    export default function App() {
      const tip = "never call require('fs') or import('mod')"
      return <div>{tip}</div>
    }
  `)
  assert.equal(ok.ok, true)
  const badRequire = compileHostSource(`export default function App() { return <div>{require('fs')}</div> }`)
  assert.equal(badRequire.ok, false)
  const badDynamicImport = compileHostSource(`export default function App() { void import('x'); return <div /> }`)
  assert.equal(badDynamicImport.ok, false)
})
