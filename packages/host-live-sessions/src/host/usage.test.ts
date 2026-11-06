import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  collectLiveDispatchedTasks,
  collectLiveDispatchedUsage,
  buildLiveDispatchPoints,
  usageFromTaskReports,
} from './live-dispatched-usage.ts'
import type { SessionEventBody } from '@biu/type-session'
import type { TaskDispatchSource, TokenUsageSum } from './live-dispatched-usage.ts'

function ev(partial: SessionEventBody & { seq?: number; ts?: number }): {
  seq: number
  ts: number
} & SessionEventBody {
  return { seq: partial.seq ?? 0, ts: partial.ts ?? 1, ...partial }
}

function task(
  partial: {
    id: string
    title: string
    sessionId: string
    createdAt: number
    status?: 'todo' | 'doing' | 'done'
    usage?: TokenUsageSum
    workerTurn?: number
  },
): TaskDispatchSource {
  return {
    id: partial.id,
    title: partial.title,
    sessionId: partial.sessionId,
    createdAt: partial.createdAt,
    status: partial.status ?? 'todo',
    ...(partial.usage ? { usage: partial.usage } : {}),
    ...(partial.workerTurn != null ? { workerTurn: partial.workerTurn } : {}),
  }
}

test('buildLiveDispatchPoints maps task_deliver tasks onto live turns', () => {
  const points = buildLiveDispatchPoints(
    [
      ev({ type: 'turn/start', turn: 2, ts: 10 }),
      ev({ type: 'turn/end', turn: 2, reason: 'complete', ts: 30 }),
      ev({ type: 'turn/start', turn: 3, ts: 40 }),
      ev({ type: 'turn/end', turn: 3, reason: 'complete', ts: 60 }),
    ],
    [task({ id: 't1', title: 'go', sessionId: 'w1', createdAt: 15 }), task({ id: 't2', title: 'run', sessionId: 'w2', createdAt: 45, status: 'done' })],
  )
  assert.equal(points.length, 2)
  assert.equal(points[0]?.targetId, 'w1')
  assert.equal(points[0]?.liveTurn, 2)
  assert.equal(points[0]?.preview, 'go')
  assert.equal(points[0]?.status, 'pending')
  assert.equal(points[1]?.targetId, 'w2')
  assert.equal(points[1]?.liveTurn, 3)
  assert.equal(points[1]?.status, 'complete')
})

test('collectLiveDispatchedTasks uses stored task usage without worker logs', () => {
  const result = collectLiveDispatchedTasks(
    'live-1',
    [
      ev({ type: 'turn/start', turn: 3, ts: 100 }),
      ev({ type: 'turn/end', turn: 3, reason: 'complete', ts: 130 }),
    ],
    [],
    [
      task({
        id: 't1',
        title: 'run tests',
        sessionId: 'worker-a',
        createdAt: 110,
        status: 'done',
        workerTurn: 1,
        usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50, cacheReadTokens: 4 },
      }),
    ],
  )
  assert.equal(result.tasks.length, 1)
  assert.equal(result.tasks[0]?.tool, 'task_deliver')
  assert.equal(result.tasks[0]?.status, 'complete')
  assert.equal(result.tasks[0]?.workerTurn, 1)
  assert.equal(result.tasks[0]?.preview, 'run tests')
  assert.deepEqual(result.tasks[0]?.usage, {
    inputTokens: 40,
    outputTokens: 10,
    totalTokens: 50,
    cacheReadTokens: 4,
  })
  assert.equal(result.byLiveTurn['3']?.tasks.length, 1)
  assert.equal(result.byLiveTurn['3']?.usage.inputTokens, 40)
})

test('collectLiveDispatchedTasks marks unmatched task as pending with task status', () => {
  const result = collectLiveDispatchedTasks(
    'live-1',
    [
      ev({ type: 'turn/start', turn: 1, ts: 1 }),
      ev({ type: 'turn/end', turn: 1, reason: 'complete', ts: 3 }),
    ],
    [],
    [task({ id: 't1', title: 'x', sessionId: 'worker-a', createdAt: 2, status: 'doing' })],
  )
  assert.equal(result.tasks[0]?.status, 'running')
})

test('collectLiveDispatchedTasks keeps doing status from the task table', () => {
  const result = collectLiveDispatchedTasks(
    'live-1',
    [
      ev({ type: 'turn/start', turn: 1, ts: 1 }),
      ev({ type: 'turn/end', turn: 1, reason: 'complete', ts: 3 }),
    ],
    [
      {
        id: 'worker-a',
        events: [
          ev({ type: 'turn/start', turn: 4, ts: 10 }),
          ev({ type: 'user/message', text: 'other work', kind: 'wake', ts: 11 }),
          ev({ type: 'turn/end', turn: 4, reason: 'complete', ts: 12 }),
        ],
      },
    ],
    [task({ id: 't1', title: 'x', sessionId: 'worker-a', createdAt: 2, status: 'doing' })],
  )
  assert.equal(result.tasks[0]?.status, 'running')
})

test('collectLiveDispatchedUsage still aggregates by live turn', () => {
  const liveId = 'live-1'
  const result = collectLiveDispatchedUsage(
    liveId,
    [
      ev({ type: 'turn/start', turn: 3, ts: 100 }),
      ev({ type: 'turn/end', turn: 3, reason: 'complete', ts: 130 }),
    ],
    [],
    [
      task({
        id: 't1',
        title: 'run',
        sessionId: 'worker-a',
        createdAt: 110,
        usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
      }),
    ],
  )
  assert.deepEqual(result.byLiveTurn['3'], {
    inputTokens: 40,
    outputTokens: 10,
    totalTokens: 50,
  })
})

test('usageFromTaskReports adds later reports and dedupes the same turn', () => {
  const first = usageFromTaskReports([
    { sessionId: 'w1', turn: 1, usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } },
  ])
  assert.deepEqual(first, { inputTokens: 10, outputTokens: 4, totalTokens: 14 })
  const added = usageFromTaskReports([
    { sessionId: 'w1', turn: 1, usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } },
    { sessionId: 'w1', turn: 2, usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 } },
  ])
  assert.deepEqual(added, { inputTokens: 15, outputTokens: 5, totalTokens: 20 })
  const replaced = usageFromTaskReports([
    { sessionId: 'w1', turn: 1, usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } },
    { sessionId: 'w1', turn: 1, usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 } },
  ])
  assert.deepEqual(replaced, { inputTokens: 20, outputTokens: 8, totalTokens: 28 })
})
