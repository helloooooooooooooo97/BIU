import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  hasImageContent,
  isVisionImageUrl,
  classifyLlmError,
  omitImageContent,
  omitRejectedImages,
  stampMessageSeqs,
  DEEPSEEK_VISION_MODEL,
  flattenToolImagesForChatCompletions,
  toAnthropicContent,
} from '@biu/host-llm'

test('hasImageContent detects image_url block in array content', () => {
  assert.equal(
    hasImageContent([
      { type: 'text' as const, text: 'hi' },
      { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,xxx' } },
    ]),
    true,
  )
})

test('hasImageContent returns false for plain string / null / text-only', () => {
  assert.equal(hasImageContent('hello'), false)
  assert.equal(hasImageContent(null), false)
  assert.equal(hasImageContent(undefined), false)
  assert.equal(hasImageContent([{ type: 'text' as const, text: 'only text' }]), false)
})

test('DEEPSEEK_VISION_MODEL constant matches vision-exp model', () => {
  assert.equal(DEEPSEEK_VISION_MODEL, 'deepseek-v4-flash-vision-exp')
})

test('flattenToolImagesForChatCompletions keeps tool text and appends user images', () => {
  const out = flattenToolImagesForChatCompletions([
    { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'bash', arguments: '{}' } }] },
    {
      role: 'tool',
      tool_call_id: '1',
      content: [
        { type: 'text', text: '{"ok":true}' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
      ],
    },
  ])
  assert.equal(out[1]?.role, 'tool')
  assert.equal(out[1]?.content, '{"ok":true}')
  assert.equal(out[2]?.role, 'user')
  assert.equal(hasImageContent(out[2]?.content), true)
})

test('flattenToolImagesForChatCompletions does not insert user between sibling tool results', () => {
  const out = flattenToolImagesForChatCompletions([
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'a', type: 'function', function: { name: 'bash', arguments: '{}' } },
        { id: 'b', type: 'function', function: { name: 'db_list', arguments: '{}' } },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'a',
      content: [
        { type: 'text', text: '{"ok":true}' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
      ],
    },
    { role: 'tool', tool_call_id: 'b', content: '{"kind":"root"}' },
    { role: 'user', content: '????' },
  ])
  assert.equal(out[1]?.role, 'tool')
  assert.equal(out[1]?.tool_call_id, 'a')
  assert.equal(out[2]?.role, 'tool')
  assert.equal(out[2]?.tool_call_id, 'b')
  assert.equal(out[3]?.role, 'user')
  assert.equal(hasImageContent(out[3]?.content), true)
  assert.equal(out[4]?.content, '????')
})

test('isVisionImageUrl rejects svg and accepts raster data URLs', () => {
  assert.equal(isVisionImageUrl('data:image/png;base64,xx'), true)
  assert.equal(isVisionImageUrl('data:image/svg+xml;base64,PHN2Zz4='), false)
  assert.equal(isVisionImageUrl('/api/agents/s/artifacts/favicon.svg'), false)
})

test('flattenToolImagesForChatCompletions drops svg image_url blocks', () => {
  const out = flattenToolImagesForChatCompletions([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'logo' },
        { type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,PHN2Zz4=' } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
      ],
    },
    {
      role: 'tool',
      tool_call_id: '1',
      content: [
        { type: 'text', text: '{"ok":true}' },
        { type: 'image_url', image_url: { url: 'data:image/svg+xml;utf8,<svg/>' } },
      ],
    },
  ])
  const user = out[0]?.content as Array<{ type: string; image_url?: { url: string } }>
  assert.equal(user.filter((part) => part.type === 'image_url').length, 1)
  assert.equal(user[1]?.image_url?.url, 'data:image/png;base64,xx')
  assert.equal(out[1]?.role, 'tool')
  assert.equal(out[1]?.content, '{"ok":true}')
  assert.equal(out.some((item) => item.role === 'user' && hasImageContent(item.content) && item !== out[0]), false)
})

test('classifyLlmError splits cancel / image reject / orphan tools / fatal', () => {
  assert.equal(classifyLlmError(new DOMException('aborted', 'AbortError')), 'cancel')
  assert.equal(
    classifyLlmError(new Error('.messages[2].image[0]: You have uploaded an unsupported image')),
    'images',
  )
  assert.equal(
    classifyLlmError(new Error("An assistant message with 'tool_calls' must be followed by tool messages")),
    'orphan-tools',
  )
  assert.equal(classifyLlmError(new Error('llm http 401')), 'fatal')
})

test('omitImageContent keeps text and replaces image_url with a placeholder', () => {
  const out = omitImageContent([
    {
      role: 'user',
      content: [
        { type: 'text', text: '看看' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
      ],
    },
    { role: 'assistant', content: 'ok' },
  ])
  assert.match(String(out[0]?.content), /看看/)
  assert.match(String(out[0]?.content), /已省略/)
  assert.equal(out[1]?.content, 'ok')
})

test('omitRejectedImages only drops images after the last successful assistant', () => {
  const oldUser = stampMessageSeqs(
    {
      role: 'user',
      content: [
        { type: 'text', text: '旧图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,old' } },
      ],
    },
    [1],
  )
  const ok = stampMessageSeqs({ role: 'assistant', content: '上次已经回过了' }, [2])
  const newUser = stampMessageSeqs(
    {
      role: 'user',
      content: [
        { type: 'text', text: '新图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,new' } },
      ],
    },
    [3],
  )
  const omitted = omitRejectedImages(
    [oldUser, ok, newUser],
    new Error('.messages[2].image[0]: You have uploaded an unsupported image'),
  )
  assert.deepEqual(omitted.seqs, [3])
  assert.equal(hasImageContent(omitted.next[0]?.content), true)
  assert.match(String(omitted.next[2]?.content), /新图/)
  assert.match(String(omitted.next[2]?.content), /已省略/)
})

test('omitRejectedImages ignores a failed assistant placeholder as last success', () => {
  const user = stampMessageSeqs(
    {
      role: 'user',
      content: [
        { type: 'text', text: '图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
      ],
    },
    [4],
  )
  const fail = { role: 'assistant' as const, content: '模型调用失败：unsupported image' }
  const omitted = omitRejectedImages([user, fail], new Error('unsupported image'))
  assert.deepEqual(omitted.seqs, [4])
})

test('toAnthropicContent wraps tool images as tool_result image source', () => {
  const content = toAnthropicContent(
    [
      { type: 'text', text: 'shot' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ],
    'call-1',
  )
  assert.deepEqual(content, [
    {
      type: 'tool_result',
      tool_use_id: 'call-1',
      content: [
        { type: 'text', text: 'shot' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
      ],
    },
  ])
})
