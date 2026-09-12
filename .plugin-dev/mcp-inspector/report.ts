/**
 * MCP 诊断数据专用渲染器。
 *
 * 只负责把 model.ts 已筛选、已剥 envelope 的 ReportItem 变成 HTML。
 * 所有动态值必须 esc()；所有 CSS 必须挂在 .mcpi 下，因为内容直接进入主文档。
 */

import {
  TOOLS,
  asList,
  asRecord,
  getToolName,
  withoutTopLevelNoise,
  type CallPair,
  type ReportCategory,
  type ReportItem,
  type ToolCall,
  type ToolResult,
} from './model.ts'

export type { CallPair, ReportItem, ToolCall, ToolResult }
export { getToolName }

export const REPORT_SCOPE = 'mcpi'

const CATEGORY_ORDER: ReportCategory[] = [
  'metadata',
  'processlist',
  'slow',
  'innodb-trx',
  'status',
  'iostat',
  'iotop',
  'host-load',
]

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  metadata: '元数据',
  processlist: 'Processlist',
  slow: 'Slow Log',
  'innodb-trx': 'InnoDB TRX',
  status: 'Status 指标',
  iostat: 'Iostat 设备趋势',
  iotop: 'Iotop 快照',
  'host-load': 'Host Load',
}

const SECTION_LABEL: Record<string, string> = {
  system_resource_usage: '系统资源',
  qps: 'QPS',
  innodb_throughput: 'InnoDB 吞吐',
  innodb_buffer_io: 'InnoDB Buffer / IO',
  threads: '线程与连接',
  performance_issues: '性能指标',
  slave_issues: '复制指标',
}

const COLORS = ['#2b7de6', '#1f8a65', '#cf2d56', '#c9a227', '#7c5cbf', '#3aa6a0', '#d67e30', '#4c8eb5']
const TIME_KEYS = ['timestamp', 'time', 'ts', 'datetime', 'date']

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value ?? '')
  }
}

function shortTool(tool: string): string {
  return tool.split('.').pop() || tool
}

function parseTs(value: unknown, index: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 1e12 ? value * 1000 : value
  }
  const raw = String(value ?? '').trim()
  const direct = Date.parse(raw)
  if (!Number.isNaN(direct)) return direct
  const tod = Date.parse(`1970-01-01T${raw}`)
  if (!Number.isNaN(tod)) return tod + index
  return index
}

function metricNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  const lower = text.toLowerCase()
  if (['yes', 'on', 'true', 'running', 'connected'].includes(lower)) return 1
  if (['no', 'off', 'false', 'stopped', 'disconnected'].includes(lower)) return 0
  const numeric = text.endsWith('%') ? text.slice(0, -1) : text
  if (!/^-?\d+(\.\d+)?$/.test(numeric)) return null
  const number = Number(numeric)
  return Number.isFinite(number) ? number : null
}

function fmtNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}G`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

type Point = { x: number; y: number | null }
type Series = { name: string; color: string; points: Point[] }

function seriesFromRecords(records: unknown[], names: string[]): Series[] {
  const rows = records.map(asRecord)
  const timeKey = TIME_KEYS.find((key) => rows.some((row) => row[key] != null))
  return names.flatMap((name, index) => {
    const points = rows.map((row, rowIndex) => ({
      x: parseTs(timeKey ? row[timeKey] : rowIndex, rowIndex),
      y: metricNumber(row[name]),
    }))
    return points.some((point) => point.y != null)
      ? [{ name, color: COLORS[index % COLORS.length]!, points }]
      : []
  })
}

function svgChart(series: Series[], height = 150): string {
  const width = 800
  const padL = 54
  const padR = 12
  const padT = 18
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const all = series.flatMap((item) => item.points)
  const ys = all.map((point) => point.y).filter((value): value is number => value != null && Number.isFinite(value))
  const xs = all.map((point) => point.x).filter(Number.isFinite)
  if (!ys.length || !xs.length) return ''

  let yMin = Math.min(...ys)
  let yMax = Math.max(...ys)
  let xMin = Math.min(...xs)
  let xMax = Math.max(...xs)
  if (yMin === yMax) {
    const pad = Math.abs(yMin) * 0.1 || 1
    yMin -= pad
    yMax += pad
  } else {
    const pad = (yMax - yMin) * 0.08
    yMin -= pad
    yMax += pad
  }
  if (xMin === xMax) {
    xMin -= 1
    xMax += 1
  }

  const xScale = (x: number) => ((x - xMin) / (xMax - xMin)) * plotW
  const yScale = (y: number) => plotH - ((y - yMin) / (yMax - yMin)) * plotH
  const ticks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4)
  const grid = ticks
    .map((tick) => {
      const y = padT + yScale(tick)
      return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" class="chart-grid"/><text x="${padL - 5}" y="${y + 3}" text-anchor="end" class="chart-label">${esc(fmtNumber(tick))}</text>`
    })
    .join('')

  const basePoints = series[0]?.points ?? []
  const labelCount = Math.min(6, basePoints.length)
  const labels: string[] = []
  if (labelCount > 1) {
    for (let index = 0; index < labelCount; index += 1) {
      const point = basePoints[Math.floor(((basePoints.length - 1) * index) / (labelCount - 1))]
      if (!point) continue
      const isIndex = point.x < 10_000_000_000
      const label = isIndex
        ? String(index + 1)
        : new Date(point.x).toLocaleTimeString('zh-CN', { hour12: false })
      labels.push(
        `<text x="${padL + xScale(point.x)}" y="${height - 7}" text-anchor="middle" class="chart-label">${esc(label)}</text>`,
      )
    }
  }

  const paths = series
    .map((item) => {
      const valid = item.points.filter((point) => point.y != null) as Array<{ x: number; y: number }>
      if (!valid.length) return ''
      const d = valid
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${padL + xScale(point.x)} ${padT + yScale(point.y)}`)
        .join(' ')
      const dots =
        valid.length === 1
          ? `<circle cx="${padL + xScale(valid[0]!.x)}" cy="${padT + yScale(valid[0]!.y)}" r="3" fill="${esc(item.color)}"/>`
          : ''
      return `<path d="${d}" fill="none" stroke="${esc(item.color)}" stroke-width="1.7" vector-effect="non-scaling-stroke"/>${dots}`
    })
    .join('')

  const legend = series
    .map(
      (item, index) =>
        `<g transform="translate(${padL + index * 150},3)"><rect width="10" height="3" rx="1" fill="${esc(item.color)}"/><text x="14" y="6" class="chart-label">${esc(item.name.length > 18 ? `${item.name.slice(0, 18)}…` : item.name)}</text></g>`,
    )
    .join('')

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${grid}${labels.join('')}${paths}${legend}</svg>`
}

function seriesStats(series: Series[]): string {
  return series
    .map((item) => {
      const values = item.points.map((point) => point.y).filter((value): value is number => value != null)
      if (!values.length) return ''
      const min = Math.min(...values)
      const max = Math.max(...values)
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length
      const last = values[values.length - 1]!
      return `<span><b>${esc(item.name)}</b> last=${esc(fmtNumber(last))} min=${esc(fmtNumber(min))} max=${esc(fmtNumber(max))} avg=${esc(fmtNumber(avg))}</span>`
    })
    .join('')
}

function chartPanel(title: string, records: unknown[], names: string[], wide = false): string {
  const series = seriesFromRecords(records, names)
  if (!series.length) return ''
  return `<section class="metric-card${wide ? ' is-wide' : ''}">
    <div class="metric-title">${esc(title)}</div>
    ${svgChart(series)}
    <div class="chart-stats">${seriesStats(series)}</div>
  </section>`
}

function metricKeys(records: unknown[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of records.map(asRecord)) {
    for (const key of Object.keys(row)) {
      if (TIME_KEYS.includes(key) || seen.has(key)) continue
      if (records.some((entry) => metricNumber(asRecord(entry)[key]) != null)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys
}

function metricGrid(records: unknown[]): string {
  const cards = metricKeys(records).map((name) => chartPanel(name, records, [name])).filter(Boolean)
  return cards.length ? `<div class="metric-grid">${cards.join('')}</div>` : '<p class="notice is-empty">没有可绘制的数值指标</p>'
}

function flattenMetadata(
  value: Record<string, unknown>,
  prefix = '',
  depth = 0,
): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  for (const [key, nested] of Object.entries(value)) {
    const label = prefix ? `${prefix}.${key}` : key
    if (
      depth < 2 &&
      nested &&
      typeof nested === 'object' &&
      !Array.isArray(nested)
    ) {
      rows.push(...flattenMetadata(asRecord(nested), label, depth + 1))
    } else {
      rows.push([label, cell(nested)])
    }
  }
  return rows
}

function metadataFacts(title: string, value: Record<string, unknown>): string {
  const rows = flattenMetadata(value)
  if (!rows.length) return ''
  return `<section class="metadata-section">
    <h4>${esc(title)}</h4>
    <div class="metadata-facts">${rows
      .map(
        ([key, item]) =>
          `<div class="metadata-fact"><span>${esc(key)}</span><strong>${esc(item || '—')}</strong></div>`,
      )
      .join('')}</div>
  </section>`
}

function renderMetadataTopology(nodes: unknown[]): string {
  if (!nodes.length) return ''
  const rows = nodes.map((raw) => {
    const node = asRecord(raw)
    const info = asRecord(node.node_info)
    const resource = asRecord(node.resource_info)
    const status = asRecord(node.status_info)
    const network = asRecord(node.network_info)
    const sets = asList(node.sets)
      .map((entry) => {
        const set = asRecord(entry)
        return [
          cell(set.instance_id),
          set.oss_cluster_id != null ? `cluster=${cell(set.oss_cluster_id)}` : '',
          cell(set.disk_partition),
        ]
          .filter(Boolean)
          .join(' · ')
      })
      .join('\n')
    return [
      `${cell(info.ip)}${info.port != null ? `:${cell(info.port)}` : ''}`,
      cell(info.db_version),
      [cell(status.node_status), cell(status.set_status)].filter(Boolean).join(' / '),
      cell(resource.cpu),
      cell(resource.quota_mem),
      cell(resource.quota_disk),
      cell(resource.xtype),
      cell(resource.cbs_id),
      cell(network.server_device_class),
      cell(network.inner_switch_ip),
      sets,
    ]
  })
  const headers = ['节点', '数据库版本', '状态', 'CPU', '内存(MB)', '磁盘(GB)', '类型', 'CBS', '机型', '交换 IP', 'Set']
  return `<section class="metadata-section">
    <h4>拓扑节点 <span>${nodes.length}</span></h4>
    <div class="grid-wrap"><table class="grid metadata-topology">
      <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows
        .map((row) => `<tr>${row.map((value) => `<td>${esc(value || '—')}</td>`).join('')}</tr>`)
        .join('')}</tbody>
    </table></div>
  </section>`
}

function renderMetadataTimelines(
  master: unknown,
  slaves: unknown[],
): string {
  const lines: Array<{ role: string; ip: string; port: string; start: string; end: string }> = []
  const append = (role: string, timeline: unknown) => {
    const record = asRecord(timeline)
    for (const raw of asList(record.ip_durations)) {
      const duration = asRecord(raw)
      lines.push({
        role,
        ip: cell(duration.ip),
        port: cell(duration.port),
        start: cell(duration.start),
        end: cell(duration.end),
      })
    }
  }
  if (master && Object.keys(asRecord(master)).length) append('master', master)
  slaves.forEach((timeline, index) => {
    const row = asRecord(timeline)
    append(cell(row.line) || `slave-${index + 1}`, row)
  })
  if (!lines.length) return ''
  return `<section class="metadata-section">
    <h4>节点时间线 <span>${lines.length}</span></h4>
    <div class="timeline-list">${lines
      .map(
        (line) => `<div class="timeline-row">
          <span class="timeline-role">${esc(line.role)}</span>
          <strong>${esc(line.ip ? `${line.ip}${line.port ? `:${line.port}` : ''}` : '未解析节点')}</strong>
          <span>${esc(line.start || '—')}</span>
          <i>→</i>
          <span>${esc(line.end || '—')}</span>
        </div>`,
      )
      .join('')}</div>
  </section>`
}

function renderMetadata(data: unknown): string {
  const cleaned = withoutTopLevelNoise(data)
  const rec = asRecord(cleaned)
  const extra = asRecord(rec.extra_metadata)
  const summary = asRecord(extra.instance_summary)
  const meta = asRecord(rec.instance_meta)
  const merged = { ...meta, ...summary }
  const owner = asRecord(merged.owner)
  const topology = asList(extra.topology_nodes)

  // 把所有关键信息压成一个扁平表格
  const rows: string[][] = []
  const add = (k: string, v: unknown) => { if (v != null && v !== '') rows.push([k, cell(v)]) }

  add('实例ID', merged.instance_id)
  add('实例名', merged.instance_name)
  add('长ID', merged.long_instance_id)
  add('Region', merged.region)
  add('VIP', merged.vip)
  add('VPort', merged.vport)
  add('AppID', merged.app_id)
  add('UIN', owner.uin)
  add('客户名称', owner.company_name)
  add('OSS集群', merged.oss_cluster_id)
  add('总节点数', merged.total_nodes)
  add('主库数', merged.master_count)
  add('从库数', merged.slave_count)
  add('RO数', merged.ro_count)

  // 拓扑节点每个一行
  for (const raw of topology) {
    const node = asRecord(raw)
    const info = asRecord(node.node_info)
    const resource = asRecord(node.resource_info)
    const status = asRecord(node.status_info)
    rows.push([
      '节点',
      `${cell(info.ip)}:${cell(info.port)}  ${cell(info.db_version)}  CPU=${cell(resource.cpu)}  MEM=${cell(resource.quota_mem)}MB  DISK=${cell(resource.quota_disk)}GB  ${cell(status.node_status)}`,
    ])
  }

  // 时间线
  const masterTL = asRecord(rec.master_timeline)
  for (const raw of asList(masterTL.ip_durations)) {
    const d = asRecord(raw)
    rows.push(['主库', `${cell(d.ip)}:${cell(d.port)}  ${cell(d.start)} → ${cell(d.end)}`])
  }
  for (const sl of asList(rec.slave_timelines)) {
    const sRec = asRecord(sl)
    const line = cell(sRec.line) || 'slave'
    for (const raw of asList(sRec.ip_durations)) {
      const d = asRecord(raw)
      rows.push([line, `${cell(d.ip)}:${cell(d.port)}  ${cell(d.start)} → ${cell(d.end)}`])
    }
  }

  const body = rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')
  return `<section class="skin-grid"><div class="skin-kicker">实例元数据</div><div class="grid-wrap"><table class="grid"><tbody>${body}</tbody></table></div></section>`
}

function normalizeOneLine(value: unknown): string {
  return cell(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function csvCell(value: unknown): string {
  const text = normalizeOneLine(value)
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const PROCESS_COLUMNS = ['ID', 'USER', 'HOST', 'db', 'COMMAND', 'TIME', 'STATE', 'INFO']

function renderProcesslist(data: unknown): string {
  const rec = asRecord(data)
  const titles = asList(rec.title).map(String)
  const snapshots = asList(rec.snapshots)
    .map(asRecord)
    .sort((left, right) => cell(left.timestamp).localeCompare(cell(right.timestamp)))
  if (!snapshots.length) return '<p class="notice is-empty">原始 processlist 为空</p>'

  const blocks = snapshots.map((snapshot) => {
    const timestamp = cell(snapshot.timestamp)
    const rows = asList(snapshot.data).map((raw) => {
      const row = asRecord(raw)
      if (Array.isArray(raw)) {
        return PROCESS_COLUMNS.map((column) => {
          const index = titles.findIndex((title) => title.toLowerCase() === column.toLowerCase())
          return csvCell(index >= 0 ? raw[index] : '')
        }).join(',')
      }
      return PROCESS_COLUMNS.map((column) => {
        const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === column.toLowerCase())
        return csvCell(key ? row[key] : '')
      }).join(',')
    })
    return `---------------${timestamp}---------------\n${PROCESS_COLUMNS.join(',')}\n${rows.join('\n')}`
  })
  return `<pre class="term processlist-term">${esc(blocks.join('\n\n'))}</pre>`
}

function preferredKeys(row: Record<string, unknown>, preferred: string[], omitted: Set<string>): string[] {
  const output: string[] = []
  for (const key of preferred) {
    if (key in row && !omitted.has(key)) output.push(key)
  }
  for (const key of Object.keys(row)) {
    if (!output.includes(key) && !omitted.has(key)) output.push(key)
  }
  return output
}

function renderAnalyzedSlow(data: unknown): string {
  const records = asList(asRecord(data).records).map(asRecord)
  if (!records.length) return '<p class="notice is-empty">分析慢日志为空</p>'
  const preferred = [
    'rank',
    'count',
    'total_time_sec',
    'avg_time_sec',
    'max_time_sec',
    'min_time_sec',
    'avg_rows_examined',
    'avg_rows_sent',
    'first_seen',
    'last_seen',
    'timestamp',
    'sql_template_hash',
  ]
  const cards = records.map((row, index) => {
    const keys = preferredKeys(row, preferred, new Set(['sql_template']))
    const fields = keys
      .map(
        (key) =>
          `<div class="kv"><span class="kv-key">${esc(key)}</span><span class="kv-value">${esc(cell(row[key]))}</span></div>`,
      )
      .join('')
    const sql = row.sql_template != null
      ? `<div class="flat-sql"><span class="kv-key">sql_template</span><pre>${esc(cell(row.sql_template))}</pre></div>`
      : ''
    return `<article class="flat-card"><div class="flat-index">SQL ${index + 1}</div><div class="kv-grid">${fields}</div>${sql}</article>`
  })
  return `<div class="flat-list">${cards.join('')}</div>`
}

function formatSlowTime(value: unknown): string {
  const raw = cell(value).trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
  if (!match) return raw
  return `${match[1]!.slice(2)}${match[2]}${match[3]}  ${Number(match[4])}:${match[5]}:${match[6]}`
}

function slowEpoch(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
  }
  const raw = cell(value).trim()
  if (!raw) return null
  const withZone = /(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : `${raw.replace(' ', 'T')}+08:00`
  const parsed = Date.parse(withZone)
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

function slowUserHost(row: Record<string, unknown>): string {
  const raw = cell(row.user_host).trim()
  if (raw.includes('@') || raw.includes('[')) return raw
  const user = cell(row.user_name).trim()
  if (!user && !raw) return ''
  return `${user || 'unknown'}[${user || 'unknown'}] @  [${raw}]`
}

function renderRawSlow(data: unknown): string {
  const records = asList(asRecord(data).records).map(asRecord)
  if (!records.length) return '<p class="notice is-empty">原始慢日志为空</p>'
  const entries = records.map((row) => {
    const lines: string[] = []
    const time = row.log_timestamp ?? row.timestamp
    if (time != null) lines.push(`# Time: ${formatSlowTime(time)}`)
    const userHost = slowUserHost(row)
    const threadId = row.thread_id ?? row.id
    if (userHost || threadId != null) {
      lines.push(`# User@Host: ${userHost}${threadId != null ? `  Id: ${cell(threadId)}` : ''}`)
    }
    let queryLine = ''
    if (row.query_time != null) queryLine += `Query_time: ${cell(row.query_time)}`
    if (row.lock_time != null) queryLine += `${queryLine ? '  ' : ''}Lock_time: ${cell(row.lock_time)}`
    if (row.rows_sent != null) queryLine += `${queryLine ? ' ' : ''}Rows_sent: ${cell(row.rows_sent)}`
    if (row.rows_examined != null) queryLine += `${queryLine ? '  ' : ''}Rows_examined: ${cell(row.rows_examined)}`
    if (queryLine) lines.push(`# ${queryLine}`)
    const epoch = slowEpoch(time)
    if (epoch != null) lines.push(`SET timestamp=${epoch};`)
    const sql = row.sql_raw_text ?? row.sql_text ?? row.content
    if (sql != null && cell(sql).trim()) lines.push(cell(sql).trim())
    return lines.join('\n')
  })
  return `<pre class="term slow-term">${esc(entries.join('\n\n'))}</pre>`
}

function renderSlow(data: unknown, tool: string): string {
  return tool === TOOLS.slowRaw ? renderRawSlow(data) : renderAnalyzedSlow(data)
}

const TRX_KEYS = [
  'trx_id',
  'trx_state',
  'trx_started',
  'trx_requested_lock_id',
  'trx_wait_started',
  'trx_weight',
  'trx_mysql_thread_id',
  'trx_query',
  'trx_operation_state',
  'trx_tables_in_use',
  'trx_tables_locked',
  'trx_lock_structs',
  'trx_lock_memory_bytes',
  'trx_rows_locked',
  'trx_rows_modified',
  'trx_concurrency_tickets',
  'trx_isolation_level',
  'trx_unique_checks',
  'trx_foreign_key_checks',
  'trx_last_foreign_key_error',
  'trx_adaptive_hash_latched',
  'trx_adaptive_hash_timeout',
  'trx_is_read_only',
  'trx_autocommit_non_locking',
]

function renderTrx(data: unknown): string {
  const snapshots = asList(asRecord(data).records).map(asRecord)
  if (!snapshots.length) return '<p class="notice is-empty">InnoDB transaction 日志为空</p>'
  const chunks = snapshots.map((snapshot) => {
    const timestamp = cell(snapshot.snapshot_time || snapshot.timestamp)
    const transactions = asList(snapshot.transactions).map(asRecord)
    const lines = [timestamp]
    if (!transactions.length) lines.push('(该采集点无事务)')
    transactions.forEach((trx, index) => {
      lines.push(`***** ${index + 1}.row *****`)
      for (const key of preferredKeys(trx, TRX_KEYS, new Set())) {
        lines.push(`${key}: ${cell(trx[key])}`)
      }
    })
    return lines.join('\n')
  })
  return `<pre class="term trx-term">${esc(chunks.join('\n\n'))}</pre>`
}

function renderStatus(data: unknown, tool: string): string {
  const rec = asRecord(data)
  if (tool === TOOLS.metrics) {
    const records = asList(rec.records)
    return records.length ? metricGrid(records) : '<p class="notice is-empty">Query metrics 为空</p>'
  }

  const sections = asList(rec.sections).map(asRecord)
  if (!sections.length) return '<p class="notice is-empty">Status 原始时序为空</p>'
  return sections
    .map((section) => {
      const name = cell(section.section) || 'status'
      const records = asList(section.records)
      return `<section class="metric-section"><h4>${esc(SECTION_LABEL[name] || name)}</h4>${metricGrid(records)}</section>`
    })
    .join('')
}

function renderIostat(data: unknown): string {
  const sections = asList(asRecord(data).sections).map(asRecord)
  if (!sections.length) return '<p class="notice is-empty">Iostat 原始时序为空</p>'
  return sections
    .map((section) => {
      const device = cell(section.section) || 'device'
      const records = asList(section.records)
      const panels = [
        chartPanel('吞吐 (MB/s)', records, ['r_mbs', 'w_mbs'], true),
        chartPanel('等待时延 (ms)', records, ['r_await', 'w_await'], true),
        chartPanel('平均队列长度', records, ['avgqu_sz'], true),
      ].filter(Boolean)
      return `<section class="metric-section device-section"><h4>${esc(device)}</h4><div class="metric-grid">${panels.join('') || '<p class="notice is-empty">该设备没有可绘制指标</p>'}</div></section>`
    })
    .join('')
}

function renderHostLoad(data: unknown): string {
  const rec = asRecord(data)
  const records = asList(rec.records)
  if (!records.length) return '<p class="notice is-empty">Host load 原始时序为空</p>'
  const panels = [
    chartPanel('Load', records, ['load_1min', 'load_5min', 'load_15min'], true),
    chartPanel('CPU (%)', records, ['cpu_us', 'cpu_sy', 'cpu_ni', 'cpu_id', 'cpu_wa', 'cpu_hi', 'cpu_si', 'cpu_st'], true),
    chartPanel('Tasks', records, ['tasks_total', 'tasks_running', 'tasks_sleeping', 'tasks_zombie'], true),
    chartPanel('Memory (KiB)', records, ['mem_total', 'mem_free', 'mem_used', 'mem_cache'], true),
  ].filter(Boolean)
  const cores = rec.cpu_cores != null ? `<div class="data-fact">CPU cores: ${esc(cell(rec.cpu_cores))}</div>` : ''
  return `${cores}<div class="metric-grid host-grid">${panels.join('')}</div>`
}

function tableFromRecords(title: string, records: unknown[], preferred: string[], omit = new Set<string>()): string {
  const rows = records.map(asRecord)
  if (!rows.length) return ''
  const keys = preferredKeys(rows[0]!, preferred, omit)
  const head = keys.map((key) => `<th>${esc(key)}</th>`).join('')
  const body = rows
    .map((row) => `<tr>${keys.map((key) => `<td>${esc(cell(row[key]))}</td>`).join('')}</tr>`)
    .join('')
  return `<section class="table-section"><h4>${esc(title)}</h4><div class="grid-wrap"><table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></section>`
}

function renderIotop(data: unknown): string {
  const sections = asList(asRecord(data).sections).map(asRecord)
  const summary = sections.find((section) => section.section === 'summary')
  const processes = sections.find((section) => section.section === 'processes')
  const summaryRow = asRecord(asList(summary?.records)[0])
  const facts = Object.entries(summaryRow)
    .filter(([key]) => key !== 'timestamp')
    .map(([key, value]) => `<div class="kv"><span class="kv-key">${esc(key)}</span><span class="kv-value">${esc(cell(value))}</span></div>`)
    .join('')
  const timestamp = cell(summaryRow.timestamp || asRecord(asList(processes?.records)[0]).timestamp)
  const processTable = tableFromRecords(
    'IO Top Processes',
    asList(processes?.records),
    ['pid', 'user', 'prio', 'disk_read', 'disk_write', 'swap_in', 'io_pct', 'command'],
    new Set(['timestamp']),
  )
  if (!facts && !processTable) return '<p class="notice is-empty">Iotop 快照为空</p>'
  return `${timestamp ? `<div class="snapshot-time">${esc(timestamp)}</div>` : ''}${facts ? `<div class="kv-grid summary-grid">${facts}</div>` : ''}${processTable}`
}

function renderBody(item: ReportItem): string {
  if (item.state === 'pending') return '<p class="notice is-pending">正在补拉原始数据…</p>'
  if (item.state === 'empty') {
    const text = item.enriched ? '补拉的原始数据为空' : '该次调用返回为空'
    return `<p class="notice is-empty">${esc(text)}</p>`
  }
  if (item.state === 'error') {
    const prefix = item.enriched
      ? '原始数据补拉失败'
      : item.renderTool !== item.sourceTool
        ? '无法补拉原始数据'
        : '原调用失败'
    return `<p class="notice is-error">${esc(prefix)}${item.error ? `：${esc(item.error)}` : ''}</p>`
  }

  switch (item.category) {
    case 'metadata':
      return renderMetadata(item.data)
    case 'processlist':
      return renderProcesslist(item.data)
    case 'slow':
      return renderSlow(item.data, item.renderTool)
    case 'innodb-trx':
      return renderTrx(item.data)
    case 'status':
      return renderStatus(item.data, item.renderTool)
    case 'iostat':
      return renderIostat(item.data)
    case 'iotop':
      return renderIotop(item.data)
    case 'host-load':
      return renderHostLoad(item.data)
  }
}

function itemContext(item: ReportItem): string {
  const ip = cell(item.args.ip)
  const port = cell(item.args.port)
  if (ip && port) return `${ip}:${port}`
  if (ip) return ip
  const instance = cell(item.args.instance_id || item.args.long_instance_id || item.args.cluster_id)
  return instance
}

export function itemTitle(item: ReportItem): string {
  const source = shortTool(item.sourceTool)
  if (item.renderTool === item.sourceTool) return source
  return `${shortTool(item.renderTool)} · 来源 ${source}`
}

function renderItem(item: ReportItem, index: number, ordinal: number, zoomable: boolean): string {
  const context = itemContext(item)
  const zoom = zoomable
    ? `<button type="button" class="zoom" data-zoom="${index}" data-biu-ignore="" title="全屏查看" aria-label="全屏查看 ${esc(itemTitle(item))}">⤢</button>`
    : ''
  return `<article class="data-entry" aria-label="${esc(itemTitle(item))}">
    <header class="entry-head">
      <span class="entry-ordinal">#${ordinal}</span>
      <span class="entry-name">${esc(itemTitle(item))}</span>
      ${context ? `<span class="entry-context">${esc(context)}</span>` : ''}
      ${item.partial ? '<span class="entry-warning">数据已截断</span>' : ''}
      ${zoom}
    </header>
    <div class="entry-body">${renderBody(item)}</div>
  </article>`
}

export function buildReportFragment(input: { items: ReportItem[]; zoomable?: boolean }): string {
  const zoomable = input.zoomable !== false
  const indexById = new Map(input.items.map((item, index) => [item.id, index]))
  const groups = CATEGORY_ORDER.flatMap((category) => {
    const items = input.items.filter((item) => item.category === category)
    if (!items.length) return []
    const body = items
      .map((item, ordinal) => renderItem(item, indexById.get(item.id) ?? ordinal, ordinal + 1, zoomable))
      .join('')
    return [
      `<section class="category" data-category="${category}">
        <h3 class="category-head"><span>${esc(CATEGORY_LABEL[category])}</span><span>${items.length} 组</span></h3>
        <div class="category-body">${body}</div>
      </section>`,
    ]
  })
  return `<div class="report" data-testid="mcp-inspector-report">${groups.join('') || '<p class="notice is-empty">没有符合展示范围的数据</p>'}</div>`
}

/**
 * 作用域 CSS。每一条规则必须以 .mcpi 开头，不能出现 :root/html/body。
 * 这既防止污染主应用，也让全屏 portal 和页面内报告共用同一份样式。
 */
export function reportCss(): string {
  const s = `.${REPORT_SCOPE}`
  return `${s}{--mcpi-fg:var(--dsw-label);--mcpi-muted:var(--dsw-label-3);--mcpi-line:var(--dsw-border);--mcpi-ok:var(--dsw-ok);--mcpi-bad:var(--dsw-danger);--mcpi-code:var(--dsw-chat-code-bg,var(--dsw-bubble));--mcpi-mono:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);color:var(--mcpi-fg);font:13px/1.45 var(--mcpi-mono);user-select:text;-webkit-user-select:text}
${s} *{box-sizing:border-box}
${s},${s} *{-webkit-user-drag:none}
${s} *{user-select:text;-webkit-user-select:text}
${s} .report{display:flex;flex-direction:column;gap:18px;padding:2px 0 8px}
${s} .category{min-width:0}
${s} .category-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;padding:0 2px;color:var(--mcpi-fg);font-size:13px;font-weight:700}
${s} .category-head span:last-child{color:var(--mcpi-muted);font-size:10px;font-weight:500}
${s} .category-body{display:flex;flex-direction:column;gap:10px}
${s} .data-entry{min-width:0;overflow:hidden;border:1px solid var(--mcpi-line);border-radius:9px;background:var(--dsw-surface,var(--dsw-bg))}
${s} .entry-head{display:flex;min-height:34px;align-items:center;gap:7px;padding:5px 8px 5px 10px;border-bottom:1px solid var(--mcpi-line)}
${s} .entry-ordinal{color:var(--mcpi-muted);font-size:10px}
${s} .entry-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
${s} .entry-context{max-width:36%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mcpi-muted);font-size:10px}
${s} .entry-warning{flex:none;color:#a56c00;font-size:10px}
${s} .entry-body{min-width:0;padding:10px}
${s} .zoom{flex:none;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--mcpi-muted);font:14px/1 var(--mcpi-mono);cursor:pointer;opacity:0;user-select:none}
${s} .entry-head:hover .zoom,${s} .zoom:focus{opacity:1}
${s} .zoom:hover{background:color-mix(in srgb,var(--mcpi-fg) 8%,transparent);color:var(--mcpi-fg)}
${s} .notice{margin:0;padding:10px 12px;border-radius:7px;background:var(--mcpi-code);color:var(--mcpi-muted);font-size:11px}
${s} .notice.is-pending{color:var(--dsw-pick)}
${s} .notice.is-error{border-left:2px solid var(--mcpi-bad);color:var(--mcpi-bad)}
${s} .code,${s} .term{max-width:100%;overflow:auto;margin:0;padding:10px 12px;border-radius:7px;white-space:pre-wrap;word-break:break-word;font:12px/1.6 var(--mcpi-mono)}
${s} .code{background:var(--mcpi-code);color:var(--mcpi-fg)}
${s} .entry-body .term{border:1px solid #303642;background:#17191f!important;color:#f3f5f8!important;font-family:var(--mcpi-mono)!important;font-size:13px!important;font-weight:500!important;line-height:1.65!important}
${s} .processlist-term{white-space:pre;word-break:normal;letter-spacing:.01em}
${s} .slow-term,${s} .trx-term{white-space:pre-wrap}
${s} .metadata-view{display:flex;flex-direction:column;gap:12px}
${s} .metadata-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--dsw-pick) 28%,var(--mcpi-line));border-radius:9px;background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-pick) 10%,transparent),transparent 64%)}
${s} .metadata-identity{display:flex;min-width:0;flex-direction:column;gap:2px}
${s} .metadata-kicker{color:var(--dsw-pick);font-size:9px;font-weight:700;letter-spacing:.12em}
${s} .metadata-identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-sans);font-size:18px;font-weight:700}
${s} .metadata-hero .metadata-identity code{display:inline;width:max-content;max-width:100%;overflow:hidden;padding:0;background:transparent;color:var(--mcpi-muted);font:11px/1.4 var(--mcpi-mono);text-overflow:ellipsis;white-space:nowrap}
${s} .metadata-badges{display:flex;max-width:48%;flex-wrap:wrap;justify-content:flex-end;gap:5px}
${s} .metadata-badges span{padding:3px 7px;border:1px solid var(--mcpi-line);border-radius:999px;background:var(--dsw-surface,var(--dsw-bg));color:var(--mcpi-muted);font-size:10px}
${s} .metadata-section{min-width:0}
${s} .metadata-view .metadata-section h4{display:flex;align-items:center;justify-content:space-between;margin:0 0 6px;padding:0 2px;color:var(--mcpi-fg);font-size:11px;font-weight:700}
${s} .metadata-section h4 span{color:var(--mcpi-muted);font-size:9px;font-weight:500}
${s} .metadata-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;overflow:hidden;border:1px solid var(--mcpi-line);border-radius:8px;background:var(--mcpi-line)}
${s} .metadata-fact{display:flex;min-width:0;flex-direction:column;gap:3px;padding:8px 10px;background:var(--dsw-surface,var(--dsw-bg))}
${s} .metadata-fact span{overflow:hidden;color:var(--mcpi-muted);font-size:9px;text-overflow:ellipsis;white-space:nowrap}
${s} .metadata-fact strong{overflow-wrap:anywhere;color:var(--mcpi-fg);font-size:11px;font-weight:600}
${s} .metadata-topology td{max-width:280px;white-space:pre-wrap;word-break:break-word}
${s} .metadata-topology td:first-child{color:var(--dsw-pick);font-weight:700;white-space:nowrap}
${s} .timeline-list{display:flex;flex-direction:column;gap:1px;overflow:hidden;border:1px solid var(--mcpi-line);border-radius:8px;background:var(--mcpi-line)}
${s} .timeline-row{display:grid;grid-template-columns:72px minmax(150px,1fr) minmax(140px,auto) 18px minmax(140px,auto);align-items:center;gap:8px;padding:8px 10px;background:var(--dsw-surface,var(--dsw-bg));font-size:10px}
${s} .timeline-row strong{overflow:hidden;color:var(--mcpi-fg);text-overflow:ellipsis;white-space:nowrap}
${s} .timeline-row>span:not(.timeline-role){color:var(--mcpi-muted)}
${s} .timeline-row i{color:var(--mcpi-muted);font-style:normal;text-align:center}
${s} .timeline-role{width:max-content;padding:2px 6px;border-radius:999px;background:var(--dsw-pick-fill);color:var(--dsw-pick);font-weight:700}
${s} .metadata-raw{overflow:hidden;border:1px solid var(--mcpi-line);border-radius:8px}
${s} .metadata-raw summary{padding:8px 10px;color:var(--mcpi-muted);font-size:10px;cursor:pointer;list-style:none}
${s} .metadata-raw summary::-webkit-details-marker{display:none}
${s} .metadata-raw[open] summary{border-bottom:1px solid var(--mcpi-line)}
${s} .metadata-raw .metadata-json{max-height:420px;border-radius:0}
${s} .flat-list{display:flex;flex-direction:column;gap:10px}
${s} .flat-card{padding:10px;border-radius:7px;background:var(--mcpi-code)}
${s} .flat-index{margin-bottom:8px;font-weight:700}
${s} .kv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px 12px}
${s} .kv{display:flex;min-width:0;flex-direction:column;gap:2px}
${s} .kv-key{color:var(--mcpi-muted);font-size:10px}
${s} .kv-value{overflow-wrap:anywhere;color:var(--mcpi-fg);font:13px/1.5 var(--mcpi-mono)}
${s} .flat-sql{margin-top:10px}
${s} .flat-card .flat-sql pre{overflow:auto;margin:3px 0 0;padding:9px;border:1px solid #303642;border-radius:6px;background:#17191f!important;color:#f3f5f8!important;white-space:pre-wrap;font-family:var(--mcpi-mono)!important;font-size:13px!important;font-weight:500!important;line-height:1.65!important}
${s} .metric-section+ .metric-section{margin-top:14px}
${s} .metric-section h4,${s} .table-section h4{margin:0 0 7px;color:var(--mcpi-fg);font-size:11px}
${s} .metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:9px}
${s} .metric-card{min-width:0;overflow:hidden;padding:8px;border:1px solid var(--mcpi-line);border-radius:7px;background:var(--mcpi-code)}
${s} .metric-card.is-wide{grid-column:span 2}
${s} .metric-title{margin:0 0 3px;color:var(--mcpi-fg);font-size:11px;font-weight:700}
${s} .chart{display:block;width:100%;height:auto;color:var(--mcpi-muted)}
${s} .chart-grid{stroke:currentColor;stroke-opacity:.16}
${s} .chart-label{fill:currentColor;font:9px var(--mcpi-mono)}
${s} .chart-stats{display:flex;flex-wrap:wrap;gap:5px 10px;color:var(--mcpi-muted);font-size:9px}
${s} .chart-stats b{color:var(--mcpi-fg)}
${s} .data-fact,${s} .snapshot-time{margin-bottom:8px;color:var(--mcpi-muted);font-size:10px}
${s} .summary-grid{margin-bottom:12px;padding:9px;border-radius:7px;background:var(--mcpi-code)}
${s} .table-section+ .table-section{margin-top:12px}
${s} .grid-wrap{max-width:100%;overflow:auto}
${s} .grid{width:100%;border-collapse:collapse;font-size:11px}
${s} .grid th,${s} .grid td{padding:5px 8px;border-bottom:1px solid var(--mcpi-line);text-align:left;vertical-align:top;white-space:nowrap}
${s} .grid th{position:sticky;top:0;background:var(--dsw-surface,var(--dsw-bg));color:var(--mcpi-muted);font-size:10px}
${s} .grid td:last-child{max-width:520px;white-space:pre-wrap;word-break:break-word}
${s}.is-zoom{display:flex;min-height:0;flex:1;flex-direction:column;overflow:auto;padding:12px 16px 20px}
${s}.is-zoom .report{width:100%;max-width:1600px;margin:0 auto}
${s}.is-zoom .code,${s}.is-zoom .term{max-height:none}
${s}.is-zoom .metric-grid{grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
${s}.is-zoom .metric-card.is-wide{grid-column:span 1}`
}
