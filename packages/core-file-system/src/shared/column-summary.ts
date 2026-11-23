import type { DbRecord, FieldSpec, FieldType } from '@biu/type-file-system'
import { parseTagFlatColumnKey, readTagFlatValue, resolveFieldType } from './fields.ts'

export type ColumnSummaryOp =
  | 'none'
  | 'count'
  | 'filled'
  | 'empty'
  | 'unique'
  | 'percent-filled'
  | 'percent-empty'
  | 'sum'
  | 'avg'
  | 'median'
  | 'min'
  | 'max'
  | 'checked'
  | 'unchecked'
  | 'percent-checked'
  | 'earliest'
  | 'latest'

export type ColumnSummaryOption = {
  op: ColumnSummaryOp
  label: string
  shortLabel?: string
}

const VALID_OPS = new Set<ColumnSummaryOp>([
  'none',
  'count',
  'filled',
  'empty',
  'unique',
  'percent-filled',
  'percent-empty',
  'sum',
  'avg',
  'median',
  'min',
  'max',
  'checked',
  'unchecked',
  'percent-checked',
  'earliest',
  'latest',
])

const BASE_OPTIONS: ColumnSummaryOption[] = [
  { op: 'none', label: '无' },
  { op: 'count', label: '计数', shortLabel: '计数' },
  { op: 'filled', label: '非空数', shortLabel: '非空' },
  { op: 'empty', label: '空值数', shortLabel: '为空' },
  { op: 'unique', label: '去重数', shortLabel: '去重' },
  { op: 'percent-filled', label: '非空占比', shortLabel: '非空' },
  { op: 'percent-empty', label: '空值占比', shortLabel: '为空' },
]

const NUMBER_OPTIONS: ColumnSummaryOption[] = [
  { op: 'sum', label: '求和', shortLabel: '求和' },
  { op: 'avg', label: '平均值', shortLabel: '平均' },
  { op: 'median', label: '中位数', shortLabel: '中位' },
  { op: 'min', label: '最小值', shortLabel: '最小' },
  { op: 'max', label: '最大值', shortLabel: '最大' },
]

const BOOLEAN_OPTIONS: ColumnSummaryOption[] = [
  { op: 'checked', label: '已勾选', shortLabel: '已勾选' },
  { op: 'unchecked', label: '未勾选', shortLabel: '未勾选' },
  { op: 'percent-checked', label: '勾选率', shortLabel: '完成率' },
]

const DATE_OPTIONS: ColumnSummaryOption[] = [
  { op: 'earliest', label: '最早', shortLabel: '最早' },
  { op: 'latest', label: '最晚', shortLabel: '最晚' },
]

const OP_LABELS = new Map<ColumnSummaryOp, ColumnSummaryOption>(
  [...BASE_OPTIONS, ...NUMBER_OPTIONS, ...BOOLEAN_OPTIONS, ...DATE_OPTIONS].map((item) => [item.op, item]),
)

export function summaryOpLabel(op: ColumnSummaryOp): string {
  return OP_LABELS.get(op)?.label ?? '无'
}

export function summaryOpsForKind(kind: FieldType): ColumnSummaryOption[] {
  if (kind === 'number') return [BASE_OPTIONS[0]!, ...NUMBER_OPTIONS, ...BASE_OPTIONS.slice(1)]
  if (kind === 'boolean') return [BASE_OPTIONS[0]!, ...BOOLEAN_OPTIONS, ...BASE_OPTIONS.slice(1)]
  if (kind === 'datetime') return [BASE_OPTIONS[0]!, ...DATE_OPTIONS, ...BASE_OPTIONS.slice(1)]
  return BASE_OPTIONS
}

export function normalizeColumnSummaries(raw: unknown): Record<string, ColumnSummaryOp> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, ColumnSummaryOp> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const colKey = String(key ?? '').trim()
    const op = String(value ?? '').trim() as ColumnSummaryOp
    if (!colKey || op === 'none' || !VALID_OPS.has(op)) continue
    out[colKey] = op
  }
  return Object.keys(out).length ? out : undefined
}

function readColumnRawValue(row: DbRecord, key: string): unknown {
  if (parseTagFlatColumnKey(key)) return readTagFlatValue(row, key)
  return row[key]
}

function isValueEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (Array.isArray(rec.tags)) return rec.tags.length === 0
    return Object.keys(rec).length === 0
  }
  return false
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed)
      return Number.isFinite(n) ? n : null
    }
    const ms = Date.parse(trimmed)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US')
  const rounded = Math.round(n * 100) / 100
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatPercent(part: number, total: number): string {
  if (total <= 0) return '0%'
  const pct = (part / total) * 100
  const rounded = Math.round(pct * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

function valueUniqueKey(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  return ''
}

export type ColumnSummaryResult = {
  op: ColumnSummaryOp
  label: string
  value: string
}

export function computeColumnSummary(
  rows: DbRecord[],
  key: string,
  field: FieldSpec | undefined,
  op: ColumnSummaryOp | undefined,
): ColumnSummaryResult | null {
  if (!op || op === 'none') return null
  const meta = OP_LABELS.get(op)
  const label = meta?.shortLabel ?? meta?.label ?? ''
  const total = rows.length

  if (op === 'count') return { op, label, value: formatNumber(total) }

  const values = rows.map((row) => readColumnRawValue(row, key))

  if (op === 'filled' || op === 'empty' || op === 'percent-filled' || op === 'percent-empty') {
    let filled = 0
    for (const v of values) {
      if (!isValueEmpty(v)) filled += 1
    }
    const empty = total - filled
    if (op === 'filled') return { op, label, value: formatNumber(filled) }
    if (op === 'empty') return { op, label, value: formatNumber(empty) }
    if (op === 'percent-filled') return { op, label, value: formatPercent(filled, total) }
    return { op, label, value: formatPercent(empty, total) }
  }

  if (op === 'unique') {
    const uniq = new Set<string>()
    for (const v of values) {
      if (isValueEmpty(v)) continue
      uniq.add(valueUniqueKey(v))
    }
    return { op, label, value: formatNumber(uniq.size) }
  }

  if (op === 'checked' || op === 'unchecked' || op === 'percent-checked') {
    let checked = 0
    for (const v of values) {
      if (v === true || v === 'true' || v === 1) checked += 1
    }
    const unchecked = total - checked
    if (op === 'checked') return { op, label, value: formatNumber(checked) }
    if (op === 'unchecked') return { op, label, value: formatNumber(unchecked) }
    return { op, label, value: formatPercent(checked, total) }
  }

  if (op === 'sum' || op === 'avg' || op === 'median' || op === 'min' || op === 'max') {
    const nums: number[] = []
    for (const v of values) {
      const n = toFiniteNumber(v)
      if (n !== null) nums.push(n)
    }
    if (!nums.length) return { op, label, value: '—' }
    if (op === 'sum') return { op, label, value: formatNumber(nums.reduce((a, b) => a + b, 0)) }
    if (op === 'avg') return { op, label, value: formatNumber(nums.reduce((a, b) => a + b, 0) / nums.length) }
    const sorted = [...nums].sort((a, b) => a - b)
    if (op === 'min') return { op, label, value: formatNumber(sorted[0]!) }
    if (op === 'max') return { op, label, value: formatNumber(sorted[sorted.length - 1]!) }
    const mid = Math.floor(sorted.length / 2)
    const med = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
    return { op, label, value: formatNumber(med) }
  }

  if (op === 'earliest' || op === 'latest') {
    const times: number[] = []
    for (const v of values) {
      const ms = toTimestamp(v)
      if (ms !== null) times.push(ms)
    }
    if (!times.length) return { op, label, value: '—' }
    const target = op === 'earliest' ? Math.min(...times) : Math.max(...times)
    return { op, label, value: formatDate(target) }
  }

  void (field && resolveFieldType(field))
  return null
}
