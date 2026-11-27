import { test } from 'vitest'
import assert from 'node:assert/strict'
import { clearMentionTitleCache, peekMentionTitle, rememberMentionTitle } from './mention-title-cache.ts'

test('mention title cache remembers current titles by id and clears on workspace reset', () => {
  rememberMentionTitle('page/p053', '现在的标题')
  assert.equal(peekMentionTitle('page/p053'), '现在的标题')
  clearMentionTitleCache()
  assert.equal(peekMentionTitle('page/p053'), undefined)
})
