import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { SessionRecord } from '@biu/type-session'
import {
  cloudSafePersistedConfig,
  persistedChatConfig,
  redactCloudSessionSecrets,
} from './index.ts'

test('online chat config neither loads nor persists user API keys', () => {
  const loaded = cloudSafePersistedConfig(
    {
      provider: 'openai',
      apiKeys: { openai: 'sk-cloud-must-not-read' },
      apiKey: 'legacy-cloud-must-not-read',
    } as never,
    true,
  ) as Record<string, unknown>
  assert.deepEqual(loaded.apiKeys, { deepseek: '', openai: '', anthropic: '' })
  assert.equal('apiKey' in loaded, false)

  const config = {
    endpointId: 'openai',
    provider: 'openai',
    model: 'gpt-test',
    systemPrompt: '',
    agentMode: 'standard',
    extraTools: [],
    thinking: 'enabled',
    reasoningEffort: 'high',
    contextWindow: '200k',
    speed: 'slow',
    modelPrefs: {},
    apiKeys: { openai: 'sk-cloud-must-not-write' },
    baseUrls: {},
    customEndpoints: [],
    customModels: [],
    blockedEndpoints: [],
  }
  const online = persistedChatConfig(config as never, true)
  assert.equal('apiKeys' in online, false)
  assert.equal(JSON.stringify(online).includes('sk-cloud-must-not-write'), false)
  assert.deepEqual((persistedChatConfig(config as never, false) as typeof config).apiKeys, config.apiKeys)
})

test('cloud session sync strips nested provider credentials and authorization headers', () => {
  const record = {
    id: 'session-secret-boundary',
    version: 1,
    title: 'Safe sync',
    updatedAt: 1,
    events: [
      {
        type: 'tool/result',
        apiKey: 'sk-top-level',
        detail: {
          api_keys: { openai: 'sk-nested' },
          headers: {
            Authorization: 'Bearer sk-header',
            'x-api-key': 'sk-anthropic',
            'content-type': 'application/json',
          },
        },
      },
    ],
  } as unknown as SessionRecord

  const safe = redactCloudSessionSecrets(record) as unknown as Record<string, unknown>
  const serialized = JSON.stringify(safe)
  assert.equal(serialized.includes('sk-top-level'), false)
  assert.equal(serialized.includes('sk-nested'), false)
  assert.equal(serialized.includes('sk-header'), false)
  assert.equal(serialized.includes('sk-anthropic'), false)
  assert.equal(serialized.includes('content-type'), true)
  assert.equal(serialized.includes('Safe sync'), true)
})
