import { test } from 'vitest'
import assert from 'node:assert/strict'
import { formatUserMessagesForTitle, lastUserMessages, sanitizeGeneratedTitle, sessionsCollection } from './sessions-collection.ts'

test('sessionsCollection maps summaries and writes title/pinned/facet', async () => {
  const calls: unknown[] = []
  const spec = sessionsCollection({
    listSummaries: async () => [
      {
        id: 's1',
        version: 1,
        eventCount: 3,
        title: 'hello',
        updatedAt: 100,
        mascot: { shape: 'pebble', color: 'orange', eye: 1 },
        config: { pinned: false, tag: { tags: ['a'], values: {} } },
      },
    ],
    rename: async (id, title) => {
      calls.push(['rename', id, title])
    },
    patchConfig: async (id, patch) => {
      calls.push(['patch', id, patch])
    },
    setProject: async (id, project) => {
      calls.push(['project', id, project])
    },
    delete: async (id) => {
      calls.push(['delete', id])
      return true
    },
    require: async (id) => ({
      id,
      events: [{ type: 'user/message', text: 'hi', seq: 0, ts: 1, kind: 'user' }],
    }),
  })
  assert.equal(spec.schema.contentField, 'events')
  assert.equal(spec.schema.fields.events?.type, 'file')
  assert.equal(spec.view?.moduleId, 'sessions-db')
  assert.equal(spec.label, '代理')
  assert.equal(spec.view?.title, '代理')
  assert.equal(spec.view?.icon, 'cursor')
  assert.deepEqual(spec.records, { update: true, create: false, delete: true })
  const rows = await spec.list()
  assert.equal(rows[0]?.id, 's1')
  assert.equal(rows[0]?.title, 'hello')
  assert.deepEqual(rows[0]?.mascot, { shape: 'pebble', color: 'orange', eye: 1 })
  assert.equal(rows[0]?.mascotShape, 'pebble')
  assert.equal(rows[0]?.mascotColor, 'orange')
  assert.equal(rows[0]?.mascotEye, 1)
  assert.equal(rows[0]?.mascotName, '橙石美')
  assert.deepEqual((rows[0]?.tag as { tags?: string[] })?.tags, ['a'])
  assert.equal(rows[0]?.createdAt, 100)
  assert.equal(rows[0]?.events, undefined)
  assert.equal(rows[0]?.project, undefined)
  assert.equal(spec.schema.fields.project, undefined)
  assert.equal(spec.schema.fields.projectPath?.type, 'string')
  const got = await spec.get?.('s1')
  assert.equal(Array.isArray(got?.events), true)
  await spec.update?.('s1', {
    title: 'renamed',
    pinned: true,
    tag: { tags: ['b', 'c'], values: {} },
    model: 'deepseek-reasoner',
    projectPath: '/tmp/app',
  })
  await spec.remove?.({ ids: ['s1'] })
  assert.deepEqual(calls, [
    ['rename', 's1', 'renamed'],
    ['patch', 's1', { pinned: true, tag: { tags: ['b', 'c'], values: {} }, model: 'deepseek-reasoner' }],
    ['project', 's1', { path: '/tmp/app' }],
    ['delete', 's1'],
  ])
  const actionIds = (spec.actions ?? []).map((item) => item.id)
  assert.deepEqual(actionIds, ['chat', 'rename', 'inspect', 'query', 'progress', 'compact', 'clear', 'retrieve', 'status'])
  assert.equal(spec.actions?.find((item) => item.id === 'chat')?.for, 'user')
  assert.deepEqual(spec.actions?.find((item) => item.id === 'chat')?.placement, ['row', 'detail'])
  assert.equal(spec.actions?.find((item) => item.id === 'rename')?.for, 'both')
  assert.deepEqual(spec.actions?.find((item) => item.id === 'rename')?.placement, ['row', 'detail'])
  assert.equal(spec.actions?.find((item) => item.id === 'progress')?.for, 'agent')
  assert.deepEqual(spec.actions?.find((item) => item.id === 'progress')?.placement, [])
  assert.equal(spec.actions?.find((item) => item.id === 'compact')?.for, 'agent')
  assert.equal(spec.actions?.find((item) => item.id === 'inspect')?.for, 'agent')
})

test('progress is idle when the agent is not busy even if turn/end is missing', async () => {
  const spec = sessionsCollection({
    listSummaries: async () => [],
    rename: async () => undefined,
    patchConfig: async () => undefined,
    delete: async () => true,
    isBusy: () => false,
    require: async (id) => ({
      id,
      events: [
        { type: 'turn/start', turn: 1, seq: 1, ts: 1 },
        { type: 'assistant/message', text: 'done talking', seq: 2, ts: 2 },
      ],
    }),
  })
  const progress = spec.actions?.find((item) => item.id === 'progress')
  const got = await progress?.run('s1', { id: 's1' }, {})
  assert.equal(got.status, 'idle')
  assert.equal(got.turn, 1)
  assert.equal(got.assistantText, 'done talking')
})

test('query reads one session timeline', async () => {
  const spec = sessionsCollection({
    listSummaries: async () => [],
    rename: async () => undefined,
    patchConfig: async () => undefined,
    delete: async () => true,
    require: async (id) => ({
      id,
      events: [
        { type: 'user/message', text: '查一下页面', seq: 1, ts: 1, kind: 'user' },
        { type: 'tool/call', id: 't1', name: 'db_list', arguments: '{"path":"/pages"}', seq: 2, ts: 2 },
        { type: 'tool/result', id: 't1', name: 'db_list', ok: true, detail: 'pages ok', seq: 3, ts: 3 },
      ],
    }),
  })
  const query = spec.actions?.find((item) => item.id === 'query')
  const found = await query?.run('s1', { id: 's1' }, { query: 'db_list' })
  assert.equal(found.hits, 2)
  assert.equal(found.results[0]?.type, 'tool/call')
  const typed = await query?.run('s1', { id: 's1' }, { type: 'user/message' })
  assert.equal(typed.hits, 1)
  assert.match(String(typed.results[0]?.summary), /查一下页面/)
})

test('rename action titles from the last 100 user messages with timestamps', async () => {
  const calls: unknown[] = []
  const events = []
  const epoch = Date.parse('2026-01-01T00:00:00.000Z')
  for (let i = 1; i <= 102; i += 1) {
    events.push({
      type: 'user/message' as const,
      text: `用户${i}`,
      seq: i * 2 - 1,
      ts: epoch + i * 1000,
      kind: 'user' as const,
    })
    events.push({ type: 'assistant/message' as const, text: `助手${i} 不该进标题`, seq: i * 2, ts: epoch + i * 1000 })
  }
  const spec = sessionsCollection({
    listSummaries: async () => [],
    rename: async (id, title) => {
      calls.push(['rename', id, title])
    },
    patchConfig: async () => undefined,
    delete: async () => true,
    require: async (id) => ({ id, events }),
    suggestTitle: async (id, messages) => {
      calls.push(['suggest', id, messages])
      return '「页面排查」'
    },
  })
  const messages = lastUserMessages(events, 100)
  assert.equal(messages.length, 100)
  assert.equal(messages[0]?.text, '用户3')
  assert.equal(messages[99]?.text, '用户102')
  assert.equal(messages[0]?.ts, epoch + 3 * 1000)
  const payload = formatUserMessagesForTitle(messages)
  assert.match(payload, /^1\. \[2026-01-01T00:00:03.000Z\] 用户3/)
  assert.match(payload, /100\. \[2026-01-01T00:01:42.000Z\] 用户102/)
  assert.doesNotMatch(payload, /助手/)
  assert.equal(sanitizeGeneratedTitle('「页面排查」\nextra'), '页面排查')
  const rename = spec.actions?.find((item) => item.id === 'rename')
  const got = await rename?.run('s1', { id: 's1' }, {})
  assert.equal(got.ok, true)
  assert.equal(got.title, '页面排查')
  assert.deepEqual(calls[0], ['suggest', 's1', messages])
  assert.deepEqual(calls[1], ['rename', 's1', '页面排查'])
})

test('rename action fails without user messages', async () => {
  const spec = sessionsCollection({
    listSummaries: async () => [],
    rename: async () => undefined,
    patchConfig: async () => undefined,
    delete: async () => true,
    require: async (id) => ({
      id,
      events: [{ type: 'assistant/message', text: '只有助手', seq: 1, ts: 1 }],
    }),
    suggestTitle: async () => '不该调用',
  })
  const rename = spec.actions?.find((item) => item.id === 'rename')
  await assert.rejects(() => rename?.run('s1', { id: 's1' }, {}), /没有用户消息/)
})

