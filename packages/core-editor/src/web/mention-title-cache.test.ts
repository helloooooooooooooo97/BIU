import { test } from 'vitest'
import assert from 'node:assert/strict'
import { peekMentionTitle, rememberMentionTitle } from './mention-title-cache.ts'

test('mention title cache remembers current titles by id', () => {
  rememberMentionTitle('page/p053', '现在的标题')
  assert.equal(peekMentionTitle('page/p053'), '现在的标题')
})
