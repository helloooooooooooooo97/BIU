import { test } from 'vitest'
import assert from 'node:assert/strict'
import { compileSandboxSource, looksLikeJsx, sandboxModuleFile } from './compile.ts'
import { SANDBOX_SAMPLE } from './sample.ts'

test('board json is not a sandbox module file', () => {
  assert.equal(sandboxModuleFile('assets/画板-e7c178eb.json'), false)
  assert.equal(sandboxModuleFile('assets/sandbox-ab12cd34.jsx'), true)
})

test('static markup is not sandbox source', () => {
  const result = compileSandboxSource('<div style="color:var(--biu-color-text)">刊</div>')
  assert.equal(result.ok, false)
})

test('rejects import and require', () => {
  assert.equal(compileSandboxSource('require("fs")\nexport default function App(){ return <div /> }').ok, false)
  assert.equal(compileSandboxSource('import("x")\nexport default function App(){ return <div /> }').ok, false)
})

test('jsx may use ui.icons without import', () => {
  const result = compileSandboxSource(
    'export default function App(){ const Star = ui.icons.StarIcon; return <Star /> }',
  )
  assert.equal(result.ok, true)
})

test('jsx default export compiles after stripping react import', () => {
  assert.equal(looksLikeJsx('export default function App(){ return <div/> }'), true)
  const result = compileSandboxSource(`import React from 'react'\nexport default function App(){ return <div /> }`)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.mode, 'jsx')
})

test('block sandbox sample compiles', () => {
  const result = compileSandboxSource(SANDBOX_SAMPLE)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.mode, 'jsx')
})

test('empty source fails', () => {
  assert.deepEqual(compileSandboxSource('  '), { ok: false, error: 'empty source' })
})

test('sandbox mount flushes react before pick stamp', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './runtime.ts'), 'utf8')
  const files = await readFile(resolve(import.meta.dirname, './page-file.ts'), 'utf8')
  const card = await readFile(resolve(import.meta.dirname, './block.tsx'), 'utf8')
  assert.match(card, /markFreshSandboxAssets/)
  assert.match(card, /createOnMiss: false/)
  assert.match(files, /fresh.has\(name\) && createOnMiss/)
  assert.match(files, /opts\?\.bust \|\| !createOnMiss/)
  assert.match(files, /x-biu-resource-path/)
  assert.match(src, /flushSync/)
  assert.match(src, /data-sandbox-root/)
  assert.match(src, /:host-context\(html\.pick-mode\)/)
  assert.match(src, /%231a54c4/)
  assert.doesNotMatch(src, /cursor:crosshair/)
  assert.match(src, /data-sandbox-pick-mode/)
  assert.match(src, /sandboxGlobals/)
  assert.match(src, /'biu'/)
  assert.match(src, /'ui'/)
  assert.match(src, /sandboxUi/)
  assert.match(src, /io\.read\(\)/)
  const readme = await readFile(resolve(import.meta.dirname, './README.md'), 'utf8')
  const host = await readFile(resolve(import.meta.dirname, '../../host/index.ts'), 'utf8')
  assert.match(card, /SplitResize/)
  assert.match(readme, /dataFile/)
  assert.match(readme, /biu\.write/)
  assert.match(readme, /不要用 `db_asset`/)
  assert.match(readme, /左右宽度/)
  assert.match(host, /tools\.annotate\('db_doc'/)
  assert.match(host, /不要写进 \.jsx/)
  assert.match(src, /'window'/)
  assert.match(src, /'document'/)
})
