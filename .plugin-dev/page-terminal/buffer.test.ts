import { test } from 'vitest'
import assert from 'node:assert/strict'
import { applyPtyChunk } from './buffer.ts'

test('pty chunk applies newline, carriage return and backspace', () => {
  let text = applyPtyChunk('', 'hello')
  text = applyPtyChunk(text, '\r')
  text = applyPtyChunk(text, 'ok')
  assert.equal(text, 'ok')
  text = applyPtyChunk('ab', '\b')
  assert.equal(text, 'a')
  text = applyPtyChunk('', 'one\ntwo')
  assert.equal(text, 'one\ntwo')
})

test('pty chunk strips ansi color', () => {
  const text = applyPtyChunk('', '\x1b[32mhi\x1b[0m')
  assert.equal(text, 'hi')
})
