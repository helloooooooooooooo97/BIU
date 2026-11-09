import { test } from 'vitest'
import assert from 'node:assert/strict'
import { compileHostSource } from './page-host-compile.ts'

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
