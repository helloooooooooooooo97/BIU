import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { Context } from 'cordis'
import type { SessionRecord } from '@biu/type-session'
import { runWithAccount } from '@biu/host-plugin-loader/data-dir'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-agents/system-prompt'
import * as llm from '@biu/host-llm'
import * as agentLoop from '@biu/host-agent-loop'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import * as agents from '@biu/host-agents'
import {
  ChatService,
  cloudSafePersistedConfig,
  decryptChatSecret,
  encryptChatSecret,
  persistedChatConfig,
  redactCloudSessionSecrets,
} from './index.ts'

test('online chat config encrypts API keys at rest and rejects legacy plaintext keys', () => {
  const prevHome = process.env.BIU_HOME
  const tempHome = mkdtempSync(join(tmpdir(), 'biu-chat-secret-'))
  process.env.BIU_HOME = tempHome
  try {
    // Legacy plaintext keys on cloud disk are still ignored
    const legacyLoaded = cloudSafePersistedConfig(
      {
        provider: 'openai',
        apiKeys: { openai: 'sk-cloud-must-not-read' },
        apiKey: 'legacy-cloud-must-not-read',
      } as never,
      true,
    ) as Record<string, unknown>
    assert.deepEqual(legacyLoaded.apiKeys, { deepseek: '', openai: '', anthropic: '' })
    assert.equal('apiKey' in legacyLoaded, false)

    // Persisting in online mode writes encryptedApiKeys (never plaintext apiKeys)
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
      apiKeys: { openai: 'sk-cloud-secret-token-123456' },
      baseUrls: {},
      customEndpoints: [],
      customModels: [],
      blockedEndpoints: [],
    }
    const online = persistedChatConfig(config as never, true) as Record<string, unknown>
    assert.equal('apiKeys' in online, false)
    assert.equal(JSON.stringify(online).includes('sk-cloud-secret-token-123456'), false)
    assert.equal(typeof (online.encryptedApiKeys as Record<string, string>)?.openai, 'string')
    assert.match((online.encryptedApiKeys as Record<string, string>).openai, /^enc:v1:/)

    // Loading back decrypts the key into memory
    const decrypted = cloudSafePersistedConfig(online as never, true) as { apiKeys: Record<string, string> }
    assert.equal(decrypted.apiKeys.openai, 'sk-cloud-secret-token-123456')

    // Roundtrip encryption helper
    const enc = encryptChatSecret('sk-roundtrip-key', tempHome)
    assert.notEqual(enc, 'sk-roundtrip-key')
    assert.equal(decryptChatSecret(enc, tempHome), 'sk-roundtrip-key')

    // Desktop/local mode still stores plaintext apiKeys for compatibility
    assert.deepEqual((persistedChatConfig(config as never, false) as typeof config).apiKeys, config.apiKeys)
  } finally {
    if (prevHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = prevHome
    rmSync(tempHome, { recursive: true, force: true })
  }
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

test('online ChatService isolates API keys per account concurrently and encrypts on disk', async () => {
  const prevOnline = process.env.BIU_ONLINE
  const prevHome = process.env.BIU_HOME
  const tempHome = mkdtempSync(join(tmpdir(), 'biu-chat-multi-'))
  process.env.BIU_ONLINE = '1'
  process.env.BIU_HOME = tempHome
  try {
    const ctx = new Context()
    await ctx.plugin(sessionStore, { driver: 'memory' })
    await ctx.plugin(sessions)
    await ctx.plugin(tools)
    await ctx.plugin(systemPrompt)
    await ctx.plugin(llm)
    await ctx.plugin(agentLoop)
    await ctx.plugin(agents)
    const chat = new ChatService(ctx)

    runWithAccount('acct-alice', () => {
      chat.activateAccount()
      chat.patch({ endpointId: 'openai', setApiKey: { openai: 'sk-alice-token-1111' } })
    })
    runWithAccount('acct-bob', () => {
      chat.activateAccount()
      chat.patch({ endpointId: 'openai', setApiKey: { openai: 'sk-bob-token-2222' } })
    })

    // Concurrent reads under different account scopes must never cross-contaminate
    const aliceLlm = runWithAccount('acct-alice', () => chat.resolveLlm())
    const bobLlm = runWithAccount('acct-bob', () => chat.resolveLlm())
    assert.equal(aliceLlm.apiKey, 'sk-alice-token-1111')
    assert.equal(bobLlm.apiKey, 'sk-bob-token-2222')

    // Outside any account scope in cloud mode, must never fall back to last activeAccountId
    const unscopedLlm = chat.resolveLlm()
    assert.equal(unscopedLlm.apiKey, '')

    const aliceView = runWithAccount('acct-alice', () => chat.publicView())
    assert.equal(aliceView.acceptsApiKeys, true)
    assert.equal(aliceView.secretsLocalOnly, false)

    // Persisted file for Alice must not contain plaintext key
    const aliceDisk = readFileSync(join(tempHome, '.biu', 'chat-config', 'acct-alice.json'), 'utf8')
    assert.equal(aliceDisk.includes('sk-alice-token-1111'), false)
    assert.match(aliceDisk, /enc:v1:/)
  } finally {
    if (prevOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = prevOnline
    if (prevHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = prevHome
    rmSync(tempHome, { recursive: true, force: true })
  }
})
