import { test } from 'vitest'
import assert from 'node:assert/strict'
import { RawFetchCache, enrichPairs } from './host.ts'
import { TOOLS, type CallPair, type ToolCall, type ToolResult } from './model.ts'

function pair(
  id: string,
  tool: string,
  args: Record<string, unknown>,
  data: unknown,
  seq = 1,
): CallPair {
  const call: ToolCall = {
    id,
    seq,
    turn: 1,
    ts: seq,
    name: 'mcp_call',
    arguments: JSON.stringify({
      server: 'cloud-dba-ai-cdb-mcpserver',
      name: 'execute_tools',
      arguments: { tool_name: tool, arguments: args },
    }),
  }
  const result: ToolResult = {
    id,
    seq: seq + 1,
    turn: 1,
    ts: seq + 1,
    name: 'mcp_call',
    ok: true,
    detail: JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({ status: 'success', data }) }],
    }),
  }
  return { call, result, turn: 1 }
}

function remoteResult(data: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ status: 'success', data }) }],
  }
}

test('duplicate successful source calls stay duplicated but share one remote fetch', async () => {
  const sourceData = {
    data_status: 'ok',
    start_time: '2026-09-10 15:30:23',
    sections: [{ section: 'by_state', records: [{ timestamp: '2026-09-10 15:30:23', count: 2 }] }],
  }
  const args = { product: 'CDB', ip: '1.2.3.4', port: 3306, timestamp: '2026-09-10 15:30:24' }
  const pairs = [
    pair('a', TOOLS.processOne, args, sourceData, 1),
    pair('b', TOOLS.processOne, args, sourceData, 3),
  ]
  let calls = 0
  const output = await enrichPairs(
    pairs,
    async (plan) => {
      calls += 1
      assert.equal(plan.targetTool, TOOLS.processRaw)
      return remoteResult({
        data_status: 'ok',
        title: ['timestamp', 'ID'],
        snapshots: [{ timestamp: '2026-09-10 15:30:23', data: [['2026-09-10 15:30:23', '1']] }],
      })
    },
    new RawFetchCache(),
  )
  assert.equal(calls, 1, '同参数不得重复打远端')
  assert.equal(output.length, 2, '但两个来源调用都要渲染')
  assert.deepEqual(output.map((entry) => entry.sourceCallId), ['a', 'b'])
  assert.deepEqual(output.map((entry) => entry.state), ['ok', 'ok'])
  assert.equal(output.filter((entry) => entry.cached).length, 1)
})

test('failed and empty process/trx sources never trigger a raw fetch', async () => {
  const emptyProcess = pair(
    'empty',
    TOOLS.processOne,
    { product: 'CDB', ip: 'x', port: 1, timestamp: 't' },
    { data_status: 'empty', sections: [] },
  )
  const emptyTrx = pair(
    'trx',
    TOOLS.trx,
    { product: 'CDB', ip: 'x', port: 1, start_time: 'a', end_time: 'b' },
    { data_status: 'empty', records: [] },
  )
  let called = false
  const output = await enrichPairs([emptyProcess, emptyTrx], async () => {
    called = true
    return remoteResult({})
  })
  assert.equal(called, false)
  assert.deepEqual(output.map((entry) => entry.state), ['empty', 'empty'])
})

test('an empty anomaly summary still fetches raw status data', async () => {
  const source = pair(
    'status',
    TOOLS.status,
    { product: 'CDB', ip: '1.2.3.4', port: 3306, start_time: 'a', end_time: 'b' },
    { data_status: 'empty', message: '未检测到异常数据' },
  )
  let requested: Record<string, unknown> | undefined
  const output = await enrichPairs([source], async (plan) => {
    requested = plan.args
    return remoteResult({
      data_status: 'ok',
      sections: [{ section: 'qps', records: [{ timestamp: 'x', queries: 1 }] }],
    })
  })
  assert.equal(requested?.include_raw_data, true)
  assert.equal(output[0]?.state, 'ok')
})

test('remote MCP errors become compact enrichment errors', async () => {
  const source = pair(
    'status',
    TOOLS.status,
    { product: 'CDB', ip: '1.2.3.4', port: 3306 },
    { data_status: 'ok', anomalies: { anomalies: [{ metric: 'cpu' }] } },
  )
  const output = await enrichPairs([source], async () => ({
    content: [{ type: 'text', text: '[gateway] backend timeout' }],
    isError: true,
  }))
  assert.equal(output[0]?.state, 'error')
  assert.match(output[0]?.error || '', /backend timeout/)
})

test('remote calls are capped at four concurrent requests', async () => {
  const pairs = Array.from({ length: 10 }, (_, index) =>
    pair(
      `h${index}`,
      TOOLS.hostLoad,
      {
        product: 'CDB',
        ip: `10.0.0.${index}`,
        start_time: '2026-09-10 15:00:00',
        end_time: '2026-09-10 15:10:00',
      },
      { data_status: 'ok', anomalies: { anomalies: [{ metric: 'cpu' }] } },
      index * 2 + 1,
    ),
  )
  let active = 0
  let maxActive = 0
  const output = await enrichPairs(pairs, async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    return remoteResult({
      data_status: 'ok',
      records: [{ timestamp: 'x', cpu_us: 1 }],
    })
  })
  assert.equal(output.length, 10)
  assert.ok(maxActive <= 4, `并发数越界: ${maxActive}`)
  assert.ok(maxActive >= 2, '测试没有实际形成并发')
})
