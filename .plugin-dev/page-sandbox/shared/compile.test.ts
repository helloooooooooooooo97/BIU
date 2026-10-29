import { test } from 'vitest'
import assert from 'node:assert/strict'
import { compileSandboxSource, looksLikeJsx } from './compile.ts'

test('static markup is not sandbox source', () => {
  const result = compileSandboxSource('<div style="color:var(--biu-color-text)">刊</div>')
  assert.equal(result.ok, false)
})

test('rejects import and require', () => {
  assert.equal(compileSandboxSource('require("fs")\nexport default function App(){ return <div /> }').ok, false)
  assert.equal(compileSandboxSource('import("x")\nexport default function App(){ return <div /> }').ok, false)
})

test('jsx default export compiles after stripping react import', () => {
  assert.equal(looksLikeJsx('export default function App(){ return <div/> }'), true)
  const result = compileSandboxSource(`import React from 'react'\nexport default function App(){ return <div /> }`)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.mode, 'jsx')
})

test('empty source fails', () => {
  assert.deepEqual(compileSandboxSource('  '), { ok: false, error: 'empty source' })
})

test('sandbox mount flushes react before pick stamp', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../web/sandbox.ts'), 'utf8')
  assert.match(src, /flushSync/)
  assert.match(src, /data-sandbox-root/)
  assert.match(src, /:host-context\(html\.pick-mode\)/)
  assert.match(src, /%231a54c4/)
  assert.doesNotMatch(src, /cursor:crosshair/)
  assert.match(src, /data-sandbox-pick-mode/)
  assert.match(src, /sandboxGlobals/)
  assert.match(src, /'biu'/)
  assert.match(src, /io\.read\(\)/)
  const readme = await readFile(resolve(import.meta.dirname, '../README.md'), 'utf8')
  const host = await readFile(resolve(import.meta.dirname, '../host/index.ts'), 'utf8')
  assert.match(readme, /dataFile/)
  assert.match(readme, /biu\.write/)
  assert.match(readme, /不要用 `db_asset`/)
  assert.match(host, /tools\.annotate\('db_doc'/)
  assert.match(host, /不要写进 \.jsx/)
  assert.match(src, /'window'/)
  assert.match(src, /'document'/)
})
