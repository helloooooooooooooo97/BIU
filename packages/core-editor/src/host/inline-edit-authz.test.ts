import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { runInlineEdit } from './inline-edit.ts'

const originalOnline = process.env.BIU_ONLINE

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
})

test('runInlineEdit enforces session ownership in cloud RBAC mode before calling LLM or appending messages', async () => {
  process.env.BIU_ONLINE = '1'
  let llmCalls = 0
  let appendedSessions: string[] = []

  const ctx = new Context()
  ctx.provide('account')
  ctx.set('account', {
    store: {
      canReadRecord: (_col: string, id: string) => id === 'sess-owned',
      tenantForRecord: (_col: string, id: string) =>
        id === 'sess-owned'
          ? { workspaceId: 'ws-a', accountId: 'acc-a' }
          : { workspaceId: 'ws-b', accountId: 'acc-b' },
    },
  } as never)
  ctx.provide('chat')
  ctx.set('chat', {
    resolveLlm: () => ({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-test' }),
  } as never)
  ctx.provide('llm')
  ctx.set('llm', {
    forConfig: () => ({
      chat: async () => {
        llmCalls += 1
        return { content: 'edited result' }
      },
    }),
  } as never)
  ctx.provide('sessions')
  ctx.set('sessions', {
    append: async (id: string) => {
      appendedSessions.push(id)
    },
  } as never)

  // Unauthenticated caller -> rejected
  await assert.rejects(
    () => runInlineEdit(ctx, { instruction: 'fix typo', selection: 'helo', sessionId: 'sess-owned' }),
    /需要登录/,
  )

  // Cross-tenant sessionId -> rejected before LLM or append
  await runWithAccount('acc-a', () =>
    runWithRequestWorkspace('ws-a', async () => {
      await assert.rejects(
        () => runInlineEdit(ctx, { instruction: 'inject', selection: 'hi', sessionId: 'sess-other' }),
        /无权访问目标会话/,
      )
    }),
  )
  assert.equal(llmCalls, 0)
  assert.deepEqual(appendedSessions, [])

  // Owned sessionId in matching workspace -> allowed
  const output = await runWithAccount('acc-a', () =>
    runWithRequestWorkspace('ws-a', () =>
      runInlineEdit(ctx, { instruction: 'fix typo', selection: 'helo', sessionId: 'sess-owned' }),
    ),
  )
  assert.equal(output, 'edited result')
  assert.equal(llmCalls, 1)
  assert.deepEqual(appendedSessions, ['sess-owned', 'sess-owned'])
})
