import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { Context } from 'cordis'
import {
  INLINE_EDIT_SYSTEM_PROMPT,
  buildInlineEditUserMessage,
  runInlineEdit,
  sanitizeInlineEditOutput,
} from './inline-edit.ts'

test('sanitizeInlineEditOutput strips accidental code fences unless requested', () => {
  assert.equal(sanitizeInlineEditOutput('```markdown\n精简后的文案\n```', '原文案', '精简一下'), '精简后的文案')
  assert.equal(sanitizeInlineEditOutput('```ts\nconst a = 1\n```', '原文案', '改写成代码块'), '```ts\nconst a = 1\n```')
})

test('runInlineEdit calls llm directly with thinking disabled without touching sessions/events', async () => {
  let capturedConfig: Record<string, unknown> | null = null
  let capturedMessages: Array<{ role: string; content: string }> = []
  let sessionsTouched = false

  const ctx = {
    get(key: string) {
      if (key === 'chat') {
        return {
          resolveLlm: () => ({
            provider: 'openai',
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
            thinking: 'enabled',
          }),
        }
      }
      if (key === 'llm') {
        return {
          forConfig: (cfg: Record<string, unknown>) => {
            capturedConfig = cfg
            return {
              chat: async (messages: Array<{ role: string; content: string }>) => {
                capturedMessages = messages
                return { content: '  优化后的文本  ' }
              },
            }
          },
        }
      }
      if (key === 'sessions') {
        sessionsTouched = true
      }
      return undefined
    },
  } as unknown as Context

  const result = await runInlineEdit(ctx, {
    instruction: '精简这句话',
    selection: '这是一段比较啰嗦的原始文本',
    before: '前文',
    after: '后文',
    title: '测试文档',
  })

  assert.equal(result, '优化后的文本')
  assert.equal(sessionsTouched, false)
  assert.equal(capturedConfig?.thinking, 'disabled')
  assert.equal(capturedMessages[0]?.role, 'system')
  assert.equal(capturedMessages[0]?.content, INLINE_EDIT_SYSTEM_PROMPT)
  assert.match(capturedMessages[1]?.content ?? '', /测试文档/)
  assert.match(capturedMessages[1]?.content ?? '', /这是一段比较啰嗦的原始文本/)
  assert.match(capturedMessages[1]?.content ?? '', /精简这句话/)
})

test('buildInlineEditUserMessage handles empty selection for cursor insertion', () => {
  const msg = buildInlineEditUserMessage({ instruction: '补充一个总结句', selection: '' })
  assert.match(msg, /当前选区为空/)
  assert.match(msg, /补充一个总结句/)
})
