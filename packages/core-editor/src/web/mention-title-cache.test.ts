import { test } from 'vitest'
import assert from 'node:assert/strict'
import { getRegisteredWorkspaceCaches, resetWorkspaceClientCaches } from '@biu/biu-ui/cache'
import { peekMentionTitle, rememberMentionTitle } from './mention-title-cache.ts'

test('mention title cache remembers current titles by id and clears via unified workspace cache registry', () => {
  assert.ok(getRegisteredWorkspaceCaches().includes('mention-title-cache'))
  rememberMentionTitle('page/p053', '现在的标题')
  assert.equal(peekMentionTitle('page/p053'), '现在的标题')
  resetWorkspaceClientCaches()
  assert.equal(peekMentionTitle('page/p053'), undefined)
})
