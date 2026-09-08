import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, waitFor } from '@testing-library/react'
import { SourceEditor } from './source-editor.tsx'

test('source editor uses CodeMirror markdown highlighting and line numbers', () => {
  const src = readFileSync(resolve(import.meta.dirname, './source-editor.tsx'), 'utf8')
  assert.match(src, /@codemirror\/view/)
  assert.match(src, /markdown\(/)
  assert.match(src, /lineNumbers/)
  assert.match(src, /syntaxHighlighting/)
  assert.match(src, /page-source-editor/)
  assert.match(src, /getLocus/)
  assert.match(src, /isAtStart/)
})

test('source editor mounts a CodeMirror view for markdown', async () => {
  const { container } = render(<SourceEditor value={'# Hello\n\nbody'} writable onChange={() => undefined} />)
  await waitFor(() => {
    assert.ok(container.querySelector('.cm-editor'))
  })
  assert.match(container.textContent ?? '', /Hello/)
  assert.ok(container.querySelector('.cm-lineNumbers'))
})
