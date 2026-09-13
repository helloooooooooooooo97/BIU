import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TerminalBuffer, applyPtyChunk } from './buffer.ts'

test('bare CR does not wipe the current line', () => {
  const buf = new TerminalBuffer()
  buf.apply('hello')
  buf.apply('\r')
  assert.equal(buf.text(), 'hello')
})

test('carriage return overwrites the current line, keeps history', () => {
  const buf = new TerminalBuffer()
  buf.apply('one\nhello')
  buf.apply('\rOK\x1b[K')
  assert.equal(buf.text(), 'one\nOK')
})

test('pty chunk keeps previous lines across enter', () => {
  const text = applyPtyChunk('prompt % ls', '\r\npackages\nprompt % ')
  assert.match(text, /packages/)
  assert.match(text, /prompt/)
})

test('ansi color codes do not stay in the buffer', () => {
  assert.equal(applyPtyChunk('', '\x1b[32mhi\x1b[0m'), 'hi')
})
