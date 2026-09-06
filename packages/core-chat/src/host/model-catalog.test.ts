import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { resolveChatCompletionsUrl, resolveAnthropicMessagesUrl } from '@biu/host-llm'
import {
  LLM_ENDPOINT_PRESETS,
  LLM_MODEL_CATALOG,
  findEndpointPreset,
  normalizeBaseUrl,
  inferModelCapabilities,
  defaultThinkingFor,
  knobIds,
  applyModeToLlm,
} from './model-catalog.ts'

test('resolveChatCompletionsUrl uses defaults when baseUrl missing', () => {
  assert.equal(resolveChatCompletionsUrl(undefined, 'deepseek'), 'https://api.deepseek.com/chat/completions')
  assert.equal(resolveChatCompletionsUrl(undefined, 'openai'), 'https://api.openai.com/v1/chat/completions')
})

test('resolveChatCompletionsUrl appends path and accepts full URL', () => {
  assert.equal(
    resolveChatCompletionsUrl('https://api.closeai-asia.com/v1', 'openai'),
    'https://api.closeai-asia.com/v1/chat/completions',
  )
  assert.equal(
    resolveChatCompletionsUrl('https://gate.example.com/v1/chat/completions/', 'openai'),
    'https://gate.example.com/v1/chat/completions',
  )
})

test('resolveAnthropicMessagesUrl supports custom base', () => {
  assert.equal(resolveAnthropicMessagesUrl(undefined), 'https://api.anthropic.com/v1/messages')
  assert.equal(
    resolveAnthropicMessagesUrl('https://proxy.example.com/anthropic/v1'),
    'https://proxy.example.com/anthropic/v1/messages',
  )
})

test('endpoint presets cover official + relay + local groups', () => {
  const groups = new Set(LLM_ENDPOINT_PRESETS.map((e) => e.group))
  assert.ok(groups.has('official'))
  assert.ok(groups.has('relay'))
  assert.ok(groups.has('local'))
  assert.ok(LLM_ENDPOINT_PRESETS.length >= 30)
  assert.ok(findEndpointPreset('deepseek'))
  assert.ok(findEndpointPreset('openrouter'))
  assert.ok(findEndpointPreset('closeai'))
  assert.ok(findEndpointPreset('ollama'))
})

test('local runtimes stay as addable presets, not default providers', () => {
  assert.equal(findEndpointPreset('vllm')?.group, 'local')
  assert.equal(findEndpointPreset('ollama')?.group, 'local')
  assert.equal(findEndpointPreset('lmstudio')?.group, 'local')
  const host = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(host, /return Boolean\(\(config\.apiKeys\[endpoint\.id\] \?\? ''\)\.trim\(\)\)/)
  assert.doesNotMatch(host, /return isLocalEndpoint\(endpoint\)/)
  const composer = readFileSync(resolve(import.meta.dirname, '../web/composer.tsx'), 'utf8')
  assert.match(composer, /allModels\.filter\(\(m\) => modelProviders\?\.\[m\.endpointId\]\)/)
  assert.doesNotMatch(composer, /modelProviders\?\.\[m\.provider\]/)
})

test('builtin models reference known endpoints', () => {
  const ids = new Set(LLM_ENDPOINT_PRESETS.map((e) => e.id))
  for (const m of LLM_MODEL_CATALOG) {
    assert.ok(ids.has(m.endpointId), `model ${m.id} endpoint ${m.endpointId}`)
  }
})

test('official providers ship a rich model catalog', () => {
  const deepseek = LLM_MODEL_CATALOG.filter((m) => m.endpointId === 'deepseek')
  const openai = LLM_MODEL_CATALOG.filter((m) => m.endpointId === 'openai')
  const anthropic = LLM_MODEL_CATALOG.filter((m) => m.endpointId === 'anthropic')
  assert.ok(deepseek.length >= 3, `deepseek=${deepseek.length}`)
  assert.ok(deepseek.length <= 3, `deepseek should be flash/pro/vision only, got ${deepseek.length}`)
  assert.deepEqual(
    deepseek.map((m) => m.model).sort(),
    ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-v4-pro'].sort(),
  )
  assert.ok(openai.length >= 15, `openai=${openai.length}`)
  assert.ok(anthropic.length >= 8, `anthropic=${anthropic.length}`)
  assert.ok(LLM_MODEL_CATALOG.length >= 100, `total=${LLM_MODEL_CATALOG.length}`)
})

test('relay endpoints share a multi-model pack', () => {
  const closeai = LLM_MODEL_CATALOG.filter((m) => m.endpointId === 'closeai')
  assert.ok(closeai.length >= 15, `closeai=${closeai.length}`)
  assert.ok(closeai.some((m) => m.model === 'gpt-4o'))
  assert.ok(closeai.some((m) => m.model.includes('claude')))
})

test('normalizeBaseUrl strips trailing slash', () => {
  assert.equal(normalizeBaseUrl(' https://a.com/v1/ '), 'https://a.com/v1')
})

test('DeepSeek V4 can toggle thinking and High/Max', () => {
  const caps = inferModelCapabilities('deepseek-v4-flash', 'deepseek')
  assert.deepEqual(knobIds(caps), ['thinking', 'effort'])
  assert.equal(defaultThinkingFor(caps), 'enabled')
})

test('Grok exposes a speed switch, not thinking', () => {
  const caps = inferModelCapabilities('grok-4', 'openai')
  assert.deepEqual(knobIds(caps), ['speed'])
})

test('GPT-4o has no extra knobs', () => {
  const caps = inferModelCapabilities('gpt-4o', 'openai')
  assert.deepEqual(knobIds(caps), [])
})

test('GPT-4.1 exposes context size only', () => {
  const caps = inferModelCapabilities('gpt-4.1', 'openai')
  assert.deepEqual(knobIds(caps), ['context'])
})

test('GPT-5 exposes speed, effort and context', () => {
  const caps = inferModelCapabilities('gpt-5', 'openai')
  assert.deepEqual(knobIds(caps), ['speed', 'effort', 'context'])
})

test('o3 exposes speed and effort, not a thinking switch', () => {
  const caps = inferModelCapabilities('o3-mini', 'openai')
  assert.deepEqual(knobIds(caps), ['speed', 'effort'])
})

test('applyModeToLlm maps speed without using thinking knobs', () => {
  const caps = inferModelCapabilities('gpt-5', 'openai')
  const fast = applyModeToLlm(caps, { thinking: 'enabled', speed: 'fast', effort: 'max', context: '1m' })
  assert.deepEqual(fast, { thinking: 'disabled' })
  const slow = applyModeToLlm(caps, { thinking: 'enabled', speed: 'slow', effort: 'max', context: '1m' })
  assert.equal(slow.thinking, 'enabled')
  assert.equal(slow.reasoningEffort, 'max')
})
