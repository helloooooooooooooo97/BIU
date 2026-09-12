import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  TOOLS,
  buildEnrichmentPlan,
  categoryForTool,
  deriveCallPairs,
  extractInvocation,
  parseToolResult,
  resolveReportItems,
  type CallPair,
  type EnrichmentResult,
  type ToolCall,
  type ToolResult,
} from './model.ts'

function call(
  id: string,
  tool: string,
  args: Record<string, unknown>,
  seq = 1,
  turn = 1,
): ToolCall {
  return {
    id,
    seq,
    turn,
    ts: 1000 + seq,
    name: 'mcp_call',
    arguments: JSON.stringify({
      server: 'cloud-dba-ai-cdb-mcpserver',
      name: 'execute_tools',
      arguments: { tool_name: tool, arguments: args },
    }),
  }
}

function result(
  id: string,
  payload: unknown,
  options: { ok?: boolean; isError?: boolean; seq?: number; turn?: number } = {},
): ToolResult {
  return {
    id,
    seq: options.seq ?? 2,
    turn: options.turn ?? 1,
    ts: 1100,
    name: 'mcp_call',
    ok: options.ok ?? true,
    detail: JSON.stringify({
      content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
      ...(options.isError ? { isError: true } : {}),
    }),
  }
}

function pair(tool: string, args: Record<string, unknown>, data: unknown, id = 'c1'): CallPair {
  return {
    call: call(id, tool, args),
    result: result(id, { status: 'success', data }),
    turn: 1,
  }
}

test('unwraps both historical execute_tools envelope shapes', () => {
  const nested = call('a', TOOLS.metrics, { ip: '1.2.3.4', port: 3306, metrics: 'qps' })
  assert.deepEqual(extractInvocation(nested), {
    server: 'cloud-dba-ai-cdb-mcpserver',
    gateway: 'execute_tools',
    tool: TOOLS.metrics,
    args: { ip: '1.2.3.4', port: 3306, metrics: 'qps' },
  })

  const direct: ToolCall = {
    ...nested,
    id: 'b',
    arguments: JSON.stringify({
      server: 'cloud-dba-ai-cdb-mcpserver',
      name: 'execute_tools',
      tool_name: TOOLS.processOne,
      arguments: { product: 'CDB', ip: '1.2.3.4', port: 3306, timestamp: '2026-09-10 15:30:23' },
    }),
  }
  assert.equal(extractInvocation(direct).tool, TOOLS.processOne)
  assert.equal(extractInvocation(direct).args.timestamp, '2026-09-10 15:30:23')
})

test('tool/result ok is not trusted when MCP payload is an error', () => {
  const transportError = parseToolResult(result('a', 'shell failed', { ok: false }))
  assert.equal(transportError.state, 'error')

  const sdkError = parseToolResult(result('b', '[gateway] missing required argument: timestamp', { isError: true }))
  assert.equal(sdkError.state, 'error')
  assert.match(sdkError.error || '', /missing required/)

  const payloadError = parseToolResult(result('c', { status: 'error', error_message: 'time range too large' }))
  assert.equal(payloadError.state, 'error')
  assert.match(payloadError.error || '', /time range/)
})

test('empty and partial business payloads are classified without exposing envelope fields', () => {
  assert.equal(
    parseToolResult(result('a', { status: 'success', data: { data_status: 'empty', start_time: 'x' } })).state,
    'empty',
  )
  const partial = parseToolResult(
    result('b', {
      status: 'success',
      call_id: 'secret-envelope',
      data: { data_status: 'partial', records: [{ timestamp: 'x', qps: 1 }] },
    }),
  )
  assert.equal(partial.state, 'ok')
  assert.equal(partial.partial, true)
  assert.equal((partial.data as Record<string, unknown>).call_id, undefined)
})

test('whitelist excludes generic MCP tools and non-preflight metadata', () => {
  assert.equal(categoryForTool('mcp_list'), null)
  assert.equal(categoryForTool('cdb.error.query_error_logs'), null)
  assert.equal(categoryForTool('cdb.metadata.list_instances_by_ip'), null)
  assert.equal(categoryForTool('cdb.metadata.tdsql_preprocess'), null)
  assert.equal(categoryForTool('cdb.metadata.list_instance_metainfo_cdb_preprocess'), 'metadata')
  assert.equal(categoryForTool('cdb.metadata.list_instance_metainfo_cynos_preprocess'), 'metadata')
  assert.equal(categoryForTool(TOOLS.processRaw), 'processlist')
  assert.equal(categoryForTool(TOOLS.trxRaw), 'innodb-trx')
  assert.equal(categoryForTool(TOOLS.hostLoad), 'host-load')
})

test('deriveCallPairs keeps every matching call in chronological order and can filter a turn', () => {
  const events: unknown[] = [
    { type: 'turn/start', turn: 1, seq: 0, ts: 1 },
    { type: 'tool/call', ...call('a', TOOLS.metrics, { ip: 'a', port: 1, metrics: 'qps' }, 1, 1) },
    { type: 'tool/result', ...result('a', { status: 'success', data: { records: [{ timestamp: 't', qps: 1 }] } }, { seq: 2 }) },
    { type: 'tool/call', ...call('ignored', 'cdb.error.query_error_logs', {}, 3, 1) },
    { type: 'turn/start', turn: 2, seq: 4, ts: 4 },
    { type: 'tool/call', ...call('b', TOOLS.metrics, { ip: 'b', port: 2, metrics: 'qps' }, 5, 2) },
    { type: 'tool/result', ...result('b', { status: 'success', data: { records: [{ timestamp: 't', qps: 2 }] } }, { seq: 6, turn: 2 }) },
    { type: 'tool/call', ...call('c', TOOLS.metrics, { ip: 'b', port: 2, metrics: 'qps' }, 7, 2) },
    { type: 'tool/result', ...result('c', { status: 'success', data: { records: [{ timestamp: 't', qps: 3 }] } }, { seq: 8, turn: 2 }) },
  ]
  assert.deepEqual(
    deriveCallPairs(events).map((entry) => entry.call.id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(
    deriveCallPairs(events, 2).map((entry) => entry.call.id),
    ['b', 'c'],
  )
})

test('one-snapshot processlist fetches raw logs at the actual matched timestamp', () => {
  const source = pair(
    TOOLS.processOne,
    { product: 'CDB', ip: '1.2.3.4', port: 3306, timestamp: '2026-09-10 15:30:23' },
    {
      data_status: 'ok',
      start_time: '2026-09-10 15:30:22',
      end_time: '2026-09-10 15:30:22',
      sections: [{ section: 'by_state', records: [{ timestamp: '2026-09-10 15:30:22', count: 1 }] }],
    },
  )
  const plan = buildEnrichmentPlan(source)?.plan
  assert.equal(plan?.targetTool, TOOLS.processRaw)
  assert.deepEqual(plan?.args, {
    product: 'CDB',
    ip: '1.2.3.4',
    port: 3306,
    start_time: '2026-09-10 15:30:22',
    end_time: '2026-09-10 15:30:22',
  })
})

test('timeline processlist uses snapshot_aggregated.timestamp, never the first four window samples', () => {
  const source = pair(
    TOOLS.processTimeline,
    {
      product: 'CDB',
      ip: '1.2.3.4',
      port: 3306,
      start_time: '2026-09-10 15:00:00',
      end_time: '2026-09-10 16:00:00',
    },
    {
      data_status: 'ok',
      active_counts_timeline: { active_counts: [['15:00:00', 1], ['15:30:28', 99]] },
      snapshot_aggregated: {
        timestamp: '2026-09-10 15:30:28',
        by_state: [{ state: 'executing', count: 99 }],
      },
    },
  )
  const plan = buildEnrichmentPlan(source)?.plan
  assert.equal(plan?.args.start_time, '2026-09-10 15:30:28')
  assert.equal(plan?.args.end_time, '2026-09-10 15:30:28')
})

test('only normal trx calls trigger trx raw; raw calls are reused', () => {
  const normal = pair(
    TOOLS.trx,
    {
      product: 'CDB',
      ip: '1.2.3.4',
      port: 3306,
      start_time: '2026-09-10 15:00:00',
      end_time: '2026-09-10 15:10:00',
      detail: true,
      trx_state: 'LOCK WAIT',
    },
    { data_status: 'ok', records: [{ snapshot_time: 'x', transactions: [{ trx_id: '1' }] }] },
  )
  assert.deepEqual(buildEnrichmentPlan(normal)?.plan?.args, {
    product: 'CDB',
    ip: '1.2.3.4',
    port: 3306,
    start_time: '2026-09-10 15:00:00',
    end_time: '2026-09-10 15:10:00',
    mode: 'logjson',
  })
  assert.equal(
    buildEnrichmentPlan(
      pair(
        TOOLS.trxRaw,
        {
          product: 'CDB',
          ip: '1.2.3.4',
          port: 3306,
          start_time: 'x',
          end_time: 'y',
        },
        { data_status: 'ok', records: [{ transactions: [{ trx_id: '1' }] }] },
      ),
    ),
    null,
  )
})

test('status/host/iostat add include_raw_data even when anomaly summary is empty', () => {
  for (const tool of [TOOLS.status, TOOLS.hostLoad, TOOLS.iostat]) {
    const args =
      tool === TOOLS.status
        ? { product: 'CDB', ip: '1.2.3.4', port: 3306, start_time: 'x', end_time: 'y' }
        : { product: 'CDB', ip: '1.2.3.4', start_time: 'x', end_time: 'y' }
    const source = pair(tool, args, { data_status: 'empty', message: '未检测到异常数据' })
    const decision = buildEnrichmentPlan(source)
    assert.equal(decision?.plan?.args.include_raw_data, true, tool)
  }
})

test('schema-lookups disguised as successful tool payloads do not trigger malformed remote calls', () => {
  const schemaResult = pair(
    TOOLS.status,
    {},
    {
      tool_name: TOOLS.status,
      description: 'tool schema',
      input_schema: { type: 'object' },
    },
  )
  const decision = buildEnrichmentPlan(schemaResult)
  assert.equal(decision?.plan, undefined)
  assert.equal(decision?.skipped?.state, 'error')
  assert.match(decision?.skipped?.error || '', /ip, port/)
})

test('query_metrics, iotop, raw slow and raw processlist reuse historical data', () => {
  for (const tool of [TOOLS.metrics, TOOLS.iotop, TOOLS.slowRaw, TOOLS.processRaw]) {
    assert.equal(buildEnrichmentPlan(pair(tool, {}, { records: [{ timestamp: 'x', value: 1 }] })), null, tool)
  }
})

test('resolveReportItems replaces only enrichment targets and keeps duplicate source calls', () => {
  const sourceA = pair(
    TOOLS.status,
    { product: 'CDB', ip: '1.2.3.4', port: 3306 },
    { data_status: 'empty' },
    'a',
  )
  const sourceB = { ...sourceA, call: { ...sourceA.call, id: 'b', seq: 3 }, result: result('b', { status: 'success', data: { data_status: 'empty' } }) }
  const fetched = new Map<string, EnrichmentResult>([
    [
      'a',
      {
        sourceCallId: 'a',
        targetTool: TOOLS.status,
        state: 'ok',
        data: { sections: [{ section: 'qps', records: [{ timestamp: 'x', queries: 1 }] }] },
      },
    ],
    [
      'b',
      {
        sourceCallId: 'b',
        targetTool: TOOLS.status,
        state: 'empty',
      },
    ],
  ])
  const items = resolveReportItems([sourceA, sourceB], fetched, false)
  assert.equal(items.length, 2)
  assert.equal(items[0]?.state, 'ok')
  assert.equal(items[1]?.state, 'empty')
  assert.ok(items.every((item) => item.renderTool === TOOLS.status))
})
