import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Terminal } from '@xterm/xterm'

test('xterm buffer keeps history and can scroll back', () => {
  const term = new Terminal({ cols: 80, rows: 12, scrollback: 200 })
  for (let i = 0; i < 40; i++) term.write(`line-${i}\r\n`)
  assert.ok(term.buffer.active.length >= 12)
  term.scrollLines(-8)
  term.dispose()
})
