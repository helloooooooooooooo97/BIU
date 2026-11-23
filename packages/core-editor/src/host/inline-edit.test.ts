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

test('runInlineEdit calls llm directly with temporary context and records events when sessionId is given', async () => {
  const captured: { config: Record<string, unknown> | null } = { config: null }
  let capturedMessages: Array<{ role: string; content: string }> = []
  const appended: Array<{ id: string; body: Record<string, unknown> }> = []

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
            captured.config = cfg
            return {
              chat: async (messages: Array<{ role: string; content: string }>) => {
                capturedMessages = messages
                return { content: '  优化后的文本  ', usage: { inputTokens: 12, outputTokens: 6 } }
              },
            }
          },
        }
      }
      if (key === 'sessions') {
        return {
          append: async (id: string, body: Record<string, unknown>) => {
            appended.push({ id, body })
          },
        }
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
    sessionId: 'sess-global-1',
  })

  assert.equal(result, '优化后的文本')
  assert.equal(captured.config?.thinking, 'disabled')
  assert.equal(capturedMessages[0]?.role, 'system')
  assert.equal(capturedMessages[0]?.content, INLINE_EDIT_SYSTEM_PROMPT)
  assert.match(capturedMessages[1]?.content ?? '', /测试文档/)
  assert.match(capturedMessages[1]?.content ?? '', /这是一段比较啰嗦的原始文本/)
  assert.match(capturedMessages[1]?.content ?? '', /精简这句话/)
  assert.equal(appended.length, 2)
  assert.equal(appended[0]?.id, 'sess-global-1')
  assert.equal(appended[0]?.body.type, 'user/message')
  assert.match(String(appended[0]?.body.text ?? ''), /\[原地修改 · 测试文档\] 精简这句话/)
  assert.equal(appended[1]?.id, 'sess-global-1')
  assert.equal(appended[1]?.body.type, 'assistant/message')
  assert.equal(appended[1]?.body.text, '优化后的文本')
})

test('buildInlineEditUserMessage handles empty selection for cursor insertion', () => {
  const msg = buildInlineEditUserMessage({ instruction: '补充一个总结句', selection: '' })
  assert.match(msg, /当前选区为空/)
  assert.match(msg, /补充一个总结句/)
})
