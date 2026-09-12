/**
 * MCP 调用记录的数据模型。
 *
 * 这里同时被 host/web 使用，所以只能放纯数据逻辑，不能引用 DOM、React 或 Cordis。
 * 负责四件事：
 * 1. 剥开 mcp_call → execute_tools → 叶子工具；
 * 2. 严格识别 MCP 层的成功/失败/空（不能只信 tool/result.ok）；
 * 3. 只保留产品确认过的 8 类数据；
 * 4. 从历史调用安全地推导“补拉 raw 数据”的计划。
 */

export interface ToolCall {
  seq: number
  ts: number
  id: string
  name: string
  arguments: string
  turn: number
}

export interface ToolResult {
  seq: number
  ts: number
  id: string
  name: string
  ok: boolean
  detail: string
  turn: number
}

export interface CallPair {
  call: ToolCall
  result: ToolResult | null
  turn: number
}

export type ReportCategory =
  | 'metadata'
  | 'processlist'
  | 'slow'
  | 'innodb-trx'
  | 'status'
  | 'iostat'
  | 'iotop'
  | 'host-load'

export type DataState = 'pending' | 'ok' | 'empty' | 'error'

export interface ParsedOutput {
  state: DataState
  /** 完整 MCP 叶子工具返回；业务数据一般位于 payload.data。 */
  payload?: unknown
  /** 已剥掉 call_id/status/tokens/trace_id 的业务 data。 */
  data?: unknown
  error?: string
  partial?: boolean
}

export interface McpInvocation {
  server: string
  gateway: string
  tool: string
  args: Record<string, unknown>
}

export interface EnrichmentPlan {
  sourceCallId: string
  sourceSeq: number
  sourceTool: string
  targetTool: string
  server: string
  args: Record<string, unknown>
}

export interface EnrichmentResult {
  sourceCallId: string
  targetTool: string
  state: Exclude<DataState, 'pending'>
  data?: unknown
  error?: string
  partial?: boolean
  cached?: boolean
}

export interface ReportItem {
  id: string
  seq: number
  turn: number
  category: ReportCategory
  sourceTool: string
  renderTool: string
  args: Record<string, unknown>
  state: DataState
  data?: unknown
  error?: string
  partial?: boolean
  enriched: boolean
}

export const TOOLS = {
  processRaw: 'cdb.processlist.query_processlist_raw_logs',
  processOne: 'cdb.processlist.query_processlist_one_snapshot_aggregated',
  processTimeline: 'cdb.processlist.query_processlist_timeline_snapshot_aggregated',
  slowRaw: 'cdb.slow.export_raw_slow_log',
  slowAnalyzed: 'cdb.slow.query_analyzed_slow_log',
  trx: 'cdb.innodb_trx.query_innodb_trx',
  trxRaw: 'cdb.innodb_trx.query_innodb_trx_raw',
  status: 'cdb.status.query_status_data',
  metrics: 'cdb.status.query_metrics',
  iostat: 'cdb.os_monitor.query_iostat_all_devices_trend',
  iotop: 'cdb.os_monitor.query_iotop_snapshot',
  hostLoad: 'cdb.os_monitor.query_host_load',
} as const

const PROCESS_TOOLS = new Set([TOOLS.processRaw, TOOLS.processOne, TOOLS.processTimeline])
const SLOW_TOOLS = new Set([TOOLS.slowRaw, TOOLS.slowAnalyzed])
const TRX_TOOLS = new Set([TOOLS.trx, TOOLS.trxRaw])
const STATUS_TOOLS = new Set([TOOLS.status, TOOLS.metrics])
const GATEWAYS = new Set(['mcp_call', 'execute_tools'])
const METADATA_RE = /^cdb\.metadata\.list_instance_metainfo_[^.]+_preprocess$/
const ERROR_STATUS = new Set(['error', 'failed', 'failure'])
const EMPTY_STATUS = new Set(['empty', 'no_data', 'nodata'])
const ENVELOPE_KEYS = new Set(['call_id', 'trace_id', 'tokens', 'status', 'error_message'])
const TOP_LEVEL_NOISE = new Set(['status', 'data_status', 'start_time', 'end_time', 'message'])

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  let current: unknown = value
  for (let depth = 0; depth < 4 && typeof current === 'string'; depth += 1) {
    const text = current.trim()
    if (!text || !['{', '[', '"'].includes(text[0]!)) return current
    try {
      current = JSON.parse(text) as unknown
    } catch {
      return current
    }
  }
  return current
}

export function extractInvocation(call: ToolCall): McpInvocation {
  const top = asRecord(tryParseJson(call.arguments))
  const server = nonEmptyString(top.server)

  if (call.name === 'mcp_call') {
    const gateway = nonEmptyString(top.name) || 'execute_tools'
    if (gateway === 'execute_tools') {
      // 历史上出现过两种网关包法：
      // A. {name:"execute_tools", arguments:{tool_name, arguments}}
      // B. {name:"execute_tools", tool_name, arguments}
      const nested = asRecord(top.arguments)
      const directTool = nonEmptyString(top.tool_name)
      const nestedTool = nonEmptyString(nested.tool_name) || nonEmptyString(nested.name)
      return {
        server,
        gateway,
        tool: directTool || nestedTool || gateway,
        args: directTool ? nested : asRecord(nested.arguments),
      }
    }
    return {
      server,
      gateway,
      tool: gateway,
      args: asRecord(top.arguments),
    }
  }

  if (call.name === 'execute_tools') {
    return {
      server,
      gateway: 'execute_tools',
      tool: nonEmptyString(top.tool_name) || nonEmptyString(top.name) || call.name,
      args: asRecord(top.arguments),
    }
  }

  return {
    server,
    gateway: call.name,
    tool: call.name,
    args: top,
  }
}

export function getToolName(call: ToolCall): string {
  return extractInvocation(call).tool
}

export function getRealArgs(call: ToolCall): string {
  return JSON.stringify(extractInvocation(call).args, null, 2)
}

function contentText(content: unknown): string {
  return asList(content)
    .map((entry) => nonEmptyString(asRecord(entry).text))
    .filter(Boolean)
    .join('\n')
}

function clippedError(value: unknown): string {
  const text =
    typeof value === 'string'
      ? value
      : (() => {
          try {
            return JSON.stringify(value)
          } catch {
            return String(value)
          }
        })()
  return text.replace(/\s+/g, ' ').trim().slice(0, 500) || 'MCP 调用失败'
}

/** 从 SDK CallToolResult 或事件 detail 中剥出叶子工具 payload。 */
function unwrapMcpOutput(raw: unknown): { payload?: unknown; error?: string } {
  const decoded = tryParseJson(raw)
  const outer = asRecord(decoded)

  if (outer.isError === true) {
    return { error: clippedError(contentText(outer.content) || outer) }
  }

  if (Array.isArray(outer.content)) {
    const texts = outer.content
      .map((entry) => nonEmptyString(asRecord(entry).text))
      .filter(Boolean)
    if (!texts.length) return { payload: outer }
    if (texts.length === 1) {
      const payload = tryParseJson(texts[0]!)
      const rec = asRecord(payload)
      if (ERROR_STATUS.has(nonEmptyString(rec.status).toLowerCase()) || nonEmptyString(rec.error_message)) {
        return { error: clippedError(rec.error_message || rec.message || payload) }
      }
      // 某些旧网关忘记标 isError，仍会以纯文本返回错误。
      if (typeof payload === 'string' && /^\[(gateway|error)\]/i.test(payload.trim())) {
        return { error: clippedError(payload) }
      }
      return { payload }
    }
    return { payload: texts.map(tryParseJson) }
  }

  const rec = asRecord(decoded)
  if (ERROR_STATUS.has(nonEmptyString(rec.status).toLowerCase()) || nonEmptyString(rec.error_message)) {
    return { error: clippedError(rec.error_message || rec.message || decoded) }
  }
  return { payload: decoded }
}

/** 只去掉最外层 MCP envelope；业务 data 里的字段保持原值。 */
export function businessData(payload: unknown): unknown {
  const rec = asRecord(payload)
  if ('data' in rec) return rec.data
  if (!Object.keys(rec).length) return payload
  return Object.fromEntries(Object.entries(rec).filter(([key]) => !ENVELOPE_KEYS.has(key)))
}

/** 主展示不画这些顶层控制/状态字段；嵌套业务字段（如 node_status）不会被误删。 */
export function withoutTopLevelNoise(data: unknown): unknown {
  const rec = asRecord(data)
  if (!Object.keys(rec).length) return data
  return Object.fromEntries(Object.entries(rec).filter(([key]) => !TOP_LEVEL_NOISE.has(key)))
}

function hasMeaningfulData(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some((entry) => hasMeaningfulData(entry, depth + 1))
  const rec = asRecord(value)
  const status = nonEmptyString(rec.data_status).toLowerCase()
  if (EMPTY_STATUS.has(status)) return false

  const structural = ['records', 'snapshots', 'sections', 'transactions', 'instances', 'logs']
  for (const key of structural) {
    const list = asList(rec[key])
    if (list.length && list.some((entry) => hasMeaningfulData(entry, depth + 1))) return true
  }

  const timeline = asRecord(rec.active_counts_timeline)
  if (asList(timeline.active_counts).length) return true
  if (asList(rec.active_counts).length) return true

  return Object.entries(rec).some(([key, nested]) => {
    if (TOP_LEVEL_NOISE.has(key) || ENVELOPE_KEYS.has(key) || key === 'truncation') return false
    return hasMeaningfulData(nested, depth + 1)
  })
}

export function parseMcpOutput(raw: unknown, transportOk = true): ParsedOutput {
  if (!transportOk) return { state: 'error', error: clippedError(raw) }
  const unwrapped = unwrapMcpOutput(raw)
  if (unwrapped.error) return { state: 'error', error: unwrapped.error }
  const payload = unwrapped.payload
  const data = businessData(payload)
  const payloadRec = asRecord(payload)
  const dataRec = asRecord(data)
  const dataStatus = nonEmptyString(dataRec.data_status || payloadRec.data_status).toLowerCase()
  const partial = dataStatus === 'partial' || asRecord(dataRec.truncation).truncated === true
  if (EMPTY_STATUS.has(dataStatus) || !hasMeaningfulData(data)) {
    return { state: 'empty', payload, data, partial }
  }
  return { state: 'ok', payload, data, partial }
}

export function parseToolResult(result: ToolResult | null): ParsedOutput {
  if (!result) return { state: 'pending' }
  return parseMcpOutput(result.detail, result.ok)
}

export function categoryForTool(tool: string): ReportCategory | null {
  if (METADATA_RE.test(tool)) return 'metadata'
  if (PROCESS_TOOLS.has(tool as (typeof TOOLS)[keyof typeof TOOLS])) return 'processlist'
  if (SLOW_TOOLS.has(tool as (typeof TOOLS)[keyof typeof TOOLS])) return 'slow'
  if (TRX_TOOLS.has(tool as (typeof TOOLS)[keyof typeof TOOLS])) return 'innodb-trx'
  if (STATUS_TOOLS.has(tool as (typeof TOOLS)[keyof typeof TOOLS])) return 'status'
  if (tool === TOOLS.iostat) return 'iostat'
  if (tool === TOOLS.iotop) return 'iotop'
  if (tool === TOOLS.hostLoad) return 'host-load'
  return null
}

export function isDisplayTool(tool: string): boolean {
  return categoryForTool(tool) != null
}

export function deriveCallPairs(events: unknown[], selectedTurn: number | null = null): CallPair[] {
  const results = new Map<string, ToolResult>()
  for (const raw of events) {
    const event = asRecord(raw)
    if (event.type === 'tool/result' && nonEmptyString(event.id)) {
      results.set(String(event.id), event as unknown as ToolResult)
    }
  }

  const pairs: CallPair[] = []
  let turn = 0
  for (const raw of events) {
    const event = asRecord(raw)
    if (event.type === 'turn/start') turn = Number(event.turn) || turn
    if (event.type !== 'tool/call') continue
    const call = event as unknown as ToolCall
    const callTurn = Number(event.turn) || turn
    if (selectedTurn != null && callTurn !== selectedTurn) continue
    if (!isDisplayTool(getToolName(call))) continue
    pairs.push({
      call: { ...call, turn: callTurn },
      result: results.get(call.id) ?? null,
      turn: callTurn,
    })
  }
  return pairs
}

function pickArgs(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const key of keys) {
    if (source[key] != null && source[key] !== '') output[key] = source[key]
  }
  return output
}

function actualSnapshot(data: unknown, sourceTool: string): string {
  const rec = asRecord(data)
  if (sourceTool === TOOLS.processTimeline) {
    return nonEmptyString(asRecord(rec.snapshot_aggregated).timestamp)
  }
  if (sourceTool === TOOLS.processOne) {
    const direct = nonEmptyString(rec.start_time) || nonEmptyString(rec.end_time)
    if (direct) return direct
    for (const section of asList(rec.sections)) {
      for (const row of asList(asRecord(section).records)) {
        const timestamp = nonEmptyString(asRecord(row).timestamp)
        if (timestamp) return timestamp
      }
    }
  }
  return ''
}

export function enrichmentTarget(tool: string, args: Record<string, unknown>): string | null {
  if (tool === TOOLS.processOne || tool === TOOLS.processTimeline) return TOOLS.processRaw
  if (tool === TOOLS.trx) return TOOLS.trxRaw
  if (tool === TOOLS.status && args.include_raw_data !== true) return TOOLS.status
  if (tool === TOOLS.iostat && args.include_raw_data !== true) return TOOLS.iostat
  if (tool === TOOLS.hostLoad && args.include_raw_data !== true) return TOOLS.hostLoad
  return null
}

function needsNonEmptySource(tool: string): boolean {
  return tool === TOOLS.processOne || tool === TOOLS.processTimeline || tool === TOOLS.trx
}

export function buildEnrichmentPlan(
  pair: CallPair,
): { plan?: EnrichmentPlan; skipped?: EnrichmentResult } | null {
  const invocation = extractInvocation(pair.call)
  const targetTool = enrichmentTarget(invocation.tool, invocation.args)
  if (!targetTool) return null

  const source = parseToolResult(pair.result)
  if (source.state === 'pending') {
    return {
      skipped: {
        sourceCallId: pair.call.id,
        targetTool,
        state: 'error',
        error: '原调用尚未返回',
      },
    }
  }
  if (source.state === 'error') {
    return {
      skipped: {
        sourceCallId: pair.call.id,
        targetTool,
        state: 'error',
        error: source.error || '原调用失败',
      },
    }
  }
  if (needsNonEmptySource(invocation.tool) && source.state === 'empty') {
    return {
      skipped: {
        sourceCallId: pair.call.id,
        targetTool,
        state: 'empty',
      },
    }
  }
  if (!invocation.server) {
    return {
      skipped: {
        sourceCallId: pair.call.id,
        targetTool,
        state: 'error',
        error: '无法从历史调用确定 MCP server',
      },
    }
  }

  let args: Record<string, unknown>
  if (targetTool === TOOLS.processRaw) {
    const timestamp = actualSnapshot(source.data, invocation.tool)
    if (!timestamp) {
      return {
        skipped: {
          sourceCallId: pair.call.id,
          targetTool,
          state: 'error',
          error: '聚合结果中缺少实际快照时间',
        },
      }
    }
    args = {
      ...pickArgs(invocation.args, ['product', 'ip', 'port']),
      start_time: timestamp,
      end_time: timestamp,
    }
  } else if (targetTool === TOOLS.trxRaw) {
    args = {
      ...pickArgs(invocation.args, ['product', 'ip', 'port', 'start_time', 'end_time']),
      mode: 'logjson',
    }
  } else if (targetTool === TOOLS.status) {
    args = {
      ...pickArgs(invocation.args, [
        'product',
        'ip',
        'port',
        'start_time',
        'end_time',
        'region',
        'oss_instance_id',
        'shard_id',
      ]),
      include_raw_data: true,
    }
  } else if (targetTool === TOOLS.iostat) {
    args = {
      ...pickArgs(invocation.args, ['product', 'ip', 'start_time', 'end_time', 'device', 'metric']),
      include_raw_data: true,
    }
  } else {
    args = {
      ...pickArgs(invocation.args, ['product', 'ip', 'start_time', 'end_time']),
      include_raw_data: true,
    }
  }

  const required =
    targetTool === TOOLS.processRaw || targetTool === TOOLS.trxRaw
      ? ['product', 'ip', 'port', 'start_time', 'end_time']
      : targetTool === TOOLS.status
        ? ['ip', 'port']
        : ['product', 'ip']
  const missing = required.filter((key) => args[key] == null || args[key] === '')
  if (missing.length) {
    return {
      skipped: {
        sourceCallId: pair.call.id,
        targetTool,
        state: 'error',
        error: `来源调用缺少补拉参数：${missing.join(', ')}`,
      },
    }
  }

  return {
    plan: {
      sourceCallId: pair.call.id,
      sourceSeq: pair.call.seq,
      sourceTool: invocation.tool,
      targetTool,
      server: invocation.server,
      args,
    },
  }
}

export function resolveReportItems(
  pairs: CallPair[],
  enrichments: Map<string, EnrichmentResult>,
  enrichmentLoading: boolean,
): ReportItem[] {
  return pairs.flatMap((pair) => {
    const invocation = extractInvocation(pair.call)
    const category = categoryForTool(invocation.tool)
    if (!category) return []
    const targetTool = enrichmentTarget(invocation.tool, invocation.args)
    const source = parseToolResult(pair.result)
    let state = source.state
    let data = source.data
    let error = source.error
    let partial = source.partial
    let enriched = false

    if (targetTool) {
      const planned = buildEnrichmentPlan(pair)
      if (planned?.skipped) {
        state = planned.skipped.state
        data = planned.skipped.data
        error = planned.skipped.error
        partial = planned.skipped.partial
      } else {
        const fetched = enrichments.get(pair.call.id)
        if (fetched) {
          state = fetched.state
          data = fetched.data
          error = fetched.error
          partial = fetched.partial
          enriched = true
        } else if (enrichmentLoading) {
          state = 'pending'
          data = undefined
          error = undefined
        } else {
          state = 'error'
          data = undefined
          error = '未取得补拉结果'
        }
      }
    }

    return [
      {
        id: pair.call.id,
        seq: pair.call.seq,
        turn: pair.turn,
        category,
        sourceTool: invocation.tool,
        renderTool: targetTool || invocation.tool,
        args: invocation.args,
        state,
        data,
        error,
        partial,
        enriched,
      },
    ]
  })
}

export function itemSearchText(item: ReportItem): string {
  let data = ''
  try {
    data = JSON.stringify(item.data)
  } catch {
    data = String(item.data ?? '')
  }
  return `${item.sourceTool} ${item.renderTool} ${JSON.stringify(item.args)} ${data} ${item.error || ''}`.toLowerCase()
}

/** 稳定 cache key：对象 key 排序；数组保持原顺序。 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return `{${Object.keys(rec)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(rec[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function callHaystack(pair: CallPair): string {
  const invocation = extractInvocation(pair.call)
  return `${invocation.tool} ${JSON.stringify(invocation.args)} ${pair.result?.detail || ''}`
}

export function isMcpTool(name: string): boolean {
  const lower = (name || '').toLowerCase()
  return GATEWAYS.has(lower) || lower.startsWith('mcp_')
}
