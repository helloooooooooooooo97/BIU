import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileHtmlSource, looksLikeJsx } from './compile.ts'

test('html plugin points agents at its intro instead of inlining the contract', () => {
  const host = readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8')
  const web = readFileSync(resolve(import.meta.dirname, '../web/index.tsx'), 'utf8')
  const readme = readFileSync(resolve(import.meta.dirname, '../README.md'), 'utf8')
  assert.match(host, /tools\.annotate\('db_content'/)
  assert.match(host, /tools\.annotate\('db_doc'/)
  assert.match(host, /\/plugins\/page-html-blocks 读「示例写法」/)
  assert.equal(host.includes('围栏体只写'), false)
  assert.match(web, /源码必须 db_doc 附件/)
  assert.match(readme, /源码用 `db_doc`/)
  assert.match(readme, /示例写法/)
})

test('markup without scripts compiles', () => {
  const result = compileHtmlSource('<div style="color:var(--biu-color-text)">刊</div>')
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
