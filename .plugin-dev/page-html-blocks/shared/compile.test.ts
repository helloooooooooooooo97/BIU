import { test } from 'vitest'
import assert from 'node:assert/strict'
import { compileHtmlSource, looksLikeJsx } from './compile.ts'

test('markup without scripts compiles', () => {
  const result = compileHtmlSource('<div style="color:var(--biu-label)">刊</div>')
  assert.deepEqual(result, { ok: true, mode: 'markup' })
})

test('script syntax errors fail compile', () => {
  const result = compileHtmlSource('<div></div><script>function (</script>')
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /Unexpected|Function|\)/)
})

test('rejects external script and require', () => {
  assert.equal(compileHtmlSource('<script src="/x.js"></script>').ok, false)
  assert.equal(compileHtmlSource('<script>require("fs")</script>').ok, false)
})

test('valid scripts compile', () => {
  const result = compileHtmlSource('<button id="n"></button><script>document.getElementById("n")</script>')
  assert.deepEqual(result, { ok: true, mode: 'script' })
})

test('jsx default export compiles after stripping react import', () => {
  assert.equal(looksLikeJsx('export default function App(){ return <div/> }'), true)
  const result = compileHtmlSource(`import React from 'react'\nexport default function App(){ return <div /> }`)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.mode, 'jsx')
})

test('empty source fails', () => {
  assert.deepEqual(compileHtmlSource('  '), { ok: false, error: 'empty source' })
})
