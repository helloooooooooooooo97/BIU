import { test } from 'vitest'
import assert from 'node:assert/strict'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'
import {
  clearContentJump,
  consumeContentJump,
  rememberContentJump,
  snippetAtLine,
  stripMarkdownLine,
} from './content-jump.ts'

test('content jump remembers then consumes for the matching record', () => {
  clearContentJump()
  rememberContentJump({ path: '/pages/home', start_line: 4, end_line: 6 })
  assert.equal(consumeContentJump('other'), null)
  const jump = consumeContentJump('home')
  assert.deepEqual(jump, { path: '/pages/home', start_line: 4, end_line: 6 })
  assert.equal(consumeContentJump('home'), null)
})

test('window content-jump event is remembered', () => {
  clearContentJump()
  window.dispatchEvent(
    new CustomEvent(CONTENT_JUMP_EVENT, { detail: { path: '/tasks/t1', start_line: 2, end_line: 2 } }),
  )
  assert.deepEqual(consumeContentJump('t1'), { path: '/tasks/t1', start_line: 2, end_line: 2 })
})

test('snippetAtLine strips markdown markers', () => {
  assert.equal(stripMarkdownLine('## Hello `x`'), 'Hello x')
  assert.equal(snippetAtLine('# Title\n\n- **item**\nmore', 3), 'item')
})
