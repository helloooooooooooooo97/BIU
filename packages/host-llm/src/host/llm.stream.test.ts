import assert from 'node:assert/strict'
import { test } from 'vitest'
import { consumeChatCompletionSse } from '@biu/host-llm'

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

test('consumeChatCompletionSse yields text deltas and usage', async () => {
  const deltas: string[] = []
  const reply = await consumeChatCompletionSse(
    sseBody([
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ]),
    { onDelta: (text) => { deltas.push(text) } },
  )
  assert.deepEqual(deltas, ['你', '好'])
  assert.equal(reply.content, '你好')
  assert.deepEqual(reply.toolCalls, [])
  assert.deepEqual(reply.usage, { inputTokens: 3, outputTokens: 2, totalTokens: 5 })
})

test('consumeChatCompletionSse streams DeepSeek reasoning_content separately from the answer', async () => {
  const reasoning: string[] = []
  const deltas: string[] = []
  const reply = await consumeChatCompletionSse(
    sseBody([
      'data: {"choices":[{"delta":{"reasoning_content":"先"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"想"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"短"}}]}\n\n',
      'data: [DONE]\n\n',
    ]),
    {
      onDelta: (text) => { deltas.push(text) },
      onReasoningDelta: (text) => { reasoning.push(text) },
    },
  )
  assert.deepEqual(reasoning, ['先', '想'])
  assert.deepEqual(deltas, ['短'])
  assert.equal(reply.content, '短')
})

test('consumeChatCompletionSse streams tool_calls before the stream ends', async () => {
  const tools: Array<{ id: string; name: string; arguments: string }> = []
  const reply = await consumeChatCompletionSse(
    sseBody([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"clock_now","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ]),
    { onToolDelta: (call) => { tools.push({ ...call }) } },
  )
  assert.equal(reply.toolCalls[0]?.name, 'clock_now')
  assert.ok(tools.length >= 2)
  assert.equal(tools[0]?.name, 'clock_now')
  assert.equal(tools.at(-1)?.arguments, '{}')
})

test('consumeChatCompletionSse aborts with signal', async () => {
  const abort = new AbortController()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'))
      abort.abort()
    },
  })
  await assert.rejects(() => consumeChatCompletionSse(stream, { signal: abort.signal }), /cancelled/)
})
