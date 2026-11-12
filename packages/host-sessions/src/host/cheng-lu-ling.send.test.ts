import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { attachProviderOptions } from '@biu/host-llm'
import { openSqlite } from '@biu/host-plugin-loader/data-dir'
import { applyContextBudget, deriveMessages, estimateTokens, type SessionEvent } from './index.ts'

const SESSION_ID = '881253d6-c6bf-4239-9007-f1b9dfa46f8b'
const ROOT = resolve(import.meta.dirname, '../../../../.local-data/.biu')
const CONFIG_PATH = resolve(ROOT, 'chat-config/acc_f1dc2678992c5413.json')
const EVENTS_PATH = resolve(ROOT, 'events.sqlite')

function liveConfig() {
  if (!existsSync(CONFIG_PATH)) return null
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as {
    provider?: string
    model?: string
    thinking?: string
    reasoningEffort?: string
    modelPrefs?: Record<string, { thinking?: string; reasoningEffort?: string }>
  }
}

function loadSessionEvents(): SessionEvent[] | null {
  if (!existsSync(EVENTS_PATH)) return null
  const db = openSqlite(EVENTS_PATH)
  try {
    const rows = db
      .prepare('SELECT seq, ts, type, event_json FROM events WHERE session_id = ? ORDER BY seq')
      .all(SESSION_ID) as Array<{ seq: number; ts: number; type: string; event_json: string }>
    return rows.map((row) => {
      const body = JSON.parse(row.event_json) as Record<string, unknown>
      return { seq: row.seq, ts: row.ts, type: row.type, ...body } as SessionEvent
    })
  } finally {
    db.close()
  }
}

test.runIf(existsSync(CONFIG_PATH))('橙露灵配置发给 DeepSeek 的 body 是思考关闭', () => {
  const saved = liveConfig()
  assert.ok(saved, CONFIG_PATH)
  assert.equal(saved.thinking, 'disabled')
  assert.equal(saved.model, 'deepseek-v4-flash')
  assert.equal(saved.modelPrefs?.['deepseek::deepseek-v4-flash']?.thinking, 'disabled')
  const body: Record<string, unknown> = {}
  attachProviderOptions(
    body,
    {
      provider: 'deepseek',
      apiKey: '',
      model: String(saved.model),
      thinking: 'disabled',
      reasoningEffort: 'max',
    },
    'openai-compat',
  )
  assert.deepEqual(body.thinking, { type: 'disabled' })
  assert.equal(body.reasoning_effort, undefined)
})

test.runIf(existsSync(EVENTS_PATH))('橙露灵组模型请求：本地预处理远小于 11 秒，但上下文很大', () => {
  const events = loadSessionEvents()
  assert.ok(events, EVENTS_PATH)
  assert.ok(events.length > 1000, `events=${events.length}`)
  const t0 = performance.now()
  const derived = deriveMessages(events)
  const budgeted = applyContextBudget(derived, 1_000_000)
  const payload = JSON.stringify({ model: 'deepseek-v4-flash', stream: true, thinking: { type: 'disabled' }, messages: budgeted })
  const ms = performance.now() - t0
  const tokens = budgeted.reduce((sum, msg) => {
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '')
    return sum + estimateTokens(text)
  }, 0)
  assert.ok(ms < 500, `derive+stringify ${ms.toFixed(1)}ms`)
  assert.ok(payload.length > 50_000, `payload bytes=${payload.length}`)
  assert.ok(tokens > 8_000, `est tokens=${tokens} messages=${budgeted.length} events=${events.length}`)
})
