import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { DEFAULT_CHROME_PATH } from '@biu/type-file-system/ui'
import { DatabaseUiService } from './database-ui.ts'
import { contentBodyOf } from './record-content.tsx'

function ChatBody() {
  return null
}
function PageBody() {
  return null
}
function SkillBody() {
  return null
}

test('own content Body wins; inherited editor Body does not override collection Content', () => {
  const ui = new DatabaseUiService(new Context())
  ui.registerContentView(DEFAULT_CHROME_PATH, {
    id: 'doc',
    label: '文档',
    plugin: 'core-editor',
    Body: PageBody,
  })
  ui.registerContentView('/agents', {
    id: 'chat',
    label: '聊天',
    plugin: 'core-chat',
    Body: ChatBody,
  })
  assert.equal(contentBodyOf('/agents', 'chat', { Content: SkillBody }), ChatBody)
  assert.equal(contentBodyOf('/agents', 'hidden', { Content: ChatBody }), undefined)
  assert.equal(contentBodyOf('/skills', 'doc', { Content: SkillBody }), SkillBody)
  assert.equal(contentBodyOf('/tasks', 'doc', { Content: PageBody }), PageBody)
})
