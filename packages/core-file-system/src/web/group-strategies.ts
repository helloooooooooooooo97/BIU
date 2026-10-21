import type { CollectionSchema, CollectionSchemaPack, DbRecord, FieldSpec, FieldType } from '@biu/type-file-system'
import { asPersonList, isFacetFieldType, normalizeSchemaValue, personKey } from '@biu/type-file-system'

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}
import { parseFacetFlatColumnKey, readFacetFieldValue } from '../query-logic.ts'

function fieldKind(field: FieldSpec): FieldType {
  if (isFacetFieldType(field.type)) return 'facet'
  if (field.type === 'string[]') return 'multi-select'
  if (field.type === 'string' && field.enum?.length) return 'select'
  if (field.type === 'number' && field.format === 'datetime') return 'datetime'
  if (field.type === 'string' && (field.format === 'url' || field.format === 'image' || field.format === 'attachment' || field.format === 'file')) {
    return field.format
  }
  return field.type
}

function enumLabel(field: FieldSpec | undefined, value: unknown) {
  const key = String(value ?? '')
  return field?.enumLabels?.[key] || key
}

export const GROUP_GRAINS = ['day', 'week', 'month', 'quarter', 'year', 'relative'] as const
export type GroupGrain = (typeof GROUP_GRAINS)[number]

const EXTRA_CAP = 80

export type GroupStrategyContext = {
  fieldKey: string
  groupBy: string
  field: FieldSpec
  extraValues?: string[]
  now?: number
}

export type GroupStrategy = {
  kind: FieldType
  keys(ctx: GroupStrategyContext): { key: string; label: string }[]
  bucketOf(row: DbRecord, ctx: GroupStrategyContext): string[]
  filter(groupKey: string, ctx: GroupStrategyContext): Record<string, unknown>
  label?(key: string, ctx: GroupStrategyContext): string
  emptyLabel?: string
  skipEmpty?(ctx: GroupStrategyContext): boolean
}

export function parseGroupByKey(raw?: string): { fieldKey: string; grain?: GroupGrain } {
  const groupBy = String(raw ?? '').trim()
  if (!groupBy) return { fieldKey: '' }
  const split = groupBy.lastIndexOf('::')
  if (split <= 0) return { fieldKey: groupBy }
  const tail = groupBy.slice(split + 2)
  if ((GROUP_GRAINS as readonly string[]).includes(tail)) {
    return { fieldKey: groupBy.slice(0, split), grain: tail as GroupGrain }
  }
  return { fieldKey: groupBy }
}

export function isGroupableKind(kind: FieldType) {
  return kind in GROUP_STRATEGIES
}

export function cellGroupValue(row: DbRecord, fieldKey: string) {
  return parseFacetFlatColumnKey(fieldKey) ? readFacetFieldValue(row, fieldKey) : row[fieldKey]
}

function emptyFilter(fieldKey: string): Record<string, unknown> {
  return {
    $tree: {
      kind: 'group',
      id: 'group-empty',
      combinator: 'and',
      children: [{ kind: 'rule', id: 'group-empty-rule', field: fieldKey, op: 'is_empty', value: '' }],
    },
  }
}

function eqFilter(fieldKey: string, value: unknown): Record<string, unknown> {
  return { [fieldKey]: value }
}

function rangeFilter(fieldKey: string, start: number, end: number): Record<string, unknown> {
  return {
    $tree: {
      kind: 'group',
      id: `group-range-${fieldKey}`,
      combinator: 'and',
      children: [
        { kind: 'rule', id: `${fieldKey}-gt`, field: fieldKey, op: 'gt', value: String(start - 1) },
        { kind: 'rule', id: `${fieldKey}-lt`, field: fieldKey, op: 'lt', value: String(end) },
      ],
    },
  }
}

function uniqKeys(values: string[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const key = String(value ?? '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= EXTRA_CAP) break
  }
  return out
}

const SHARE_SCOPE_FILTER: Record<string, 'personal' | 'workspace' | 'shared'> = {
  私人: 'personal',
  空间: 'workspace',
  共享: 'shared',
}

function enumOrExtraKeys(ctx: GroupStrategyContext, labelOf: (key: string) => string) {
  const declared = ctx.field.enum?.length ? ctx.field.enum.map(String) : []
  return uniqKeys([...declared, ...(ctx.extraValues ?? [])]).map((key) => ({ key, label: labelOf(key) }))
}

function singleValueStrategy(
  kind: FieldType,
  labelOf: (key: string, field?: FieldSpec) => string,
): GroupStrategy {
  return {
    kind,
    keys(ctx) {
      return enumOrExtraKeys(ctx, (key) => labelOf(key, ctx.field))
    },
    bucketOf(row, ctx) {
      const raw = cellGroupValue(row, ctx.fieldKey)
      if (raw == null || raw === '') return []
      const key = String(raw)
      return key ? [key] : []
    },
    filter(groupKey, ctx) {
      if (ctx.fieldKey === 'shareScope') {
        const scope = SHARE_SCOPE_FILTER[groupKey]
        return scope ? { $scope: scope } : {}
      }
      if (!groupKey) return emptyFilter(ctx.fieldKey)
      return eqFilter(ctx.fieldKey, groupKey)
    },
    skipEmpty(ctx) {
      return ctx.fieldKey === 'shareScope' || Boolean(ctx.field.enum?.length)
    },
  }
}

function multiValueStrategy(
  kind: FieldType,
  valuesOf: (raw: unknown) => string[],
  labelOf: (key: string, field?: FieldSpec) => string,
  emptyLabel?: string,
): GroupStrategy {
  return {
    kind,
    emptyLabel,
    keys(ctx) {
      return enumOrExtraKeys(ctx, (key) => labelOf(key, ctx.field))
    },
    bucketOf(row, ctx) {
      return valuesOf(cellGroupValue(row, ctx.fieldKey))
    },
    filter(groupKey, ctx) {
      if (!groupKey) return emptyFilter(ctx.fieldKey)
      return eqFilter(ctx.fieldKey, groupKey)
    },
    skipEmpty(ctx) {
      return Boolean(ctx.field.enum?.length)
    },
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function startOfDay(stamp: number) {
  const d = new Date(stamp)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addMonths(stamp: number, delta: number) {
  const d = new Date(stamp)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() + delta)
  return d.getTime()
}

function startOfWeek(stamp: number) {
  const d = new Date(startOfDay(stamp))
  const day = d.getDay()
  const back = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - back)
  return d.getTime()
}

function startOfQuarter(stamp: number) {
  const d = new Date(stamp)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  d.setMonth(Math.floor(d.getMonth() / 3) * 3)
  return d.getTime()
}

function startOfYear(stamp: number) {
  const d = new Date(stamp)
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function datetimeGrain(ctx: GroupStrategyContext): GroupGrain {
  const parsed = parseGroupByKey(ctx.groupBy)
  return parsed.grain ?? 'month'
}

function datetimeBucket(ts: number, grain: GroupGrain, now: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (grain === 'day') return `d:${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  if (grain === 'week') {
    const start = startOfWeek(ts)
    const w = new Date(start)
    return `w:${w.getFullYear()}-${pad2(w.getMonth() + 1)}-${pad2(w.getDate())}`
  }
  if (grain === 'quarter') return `q:${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
  if (grain === 'year') return `y:${d.getFullYear()}`
  if (grain === 'relative') {
    const day = startOfDay(ts)
    const today = startOfDay(now)
    if (day === today) return 'rel:today'
    if (day === today - 86400e3) return 'rel:yesterday'
    if (day >= startOfWeek(now) && day < today - 86400e3) return 'rel:week'
    if (day >= addMonths(today, 0) && day < startOfWeek(now)) return 'rel:month'
    if (day >= startOfYear(now) && day < addMonths(today, 0)) return 'rel:year'
    return 'rel:earlier'
  }
  return `m:${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function datetimeKeyRange(key: string): { start: number; end: number } | null {
  if (key.startsWith('m:') && key !== 'm:earlier' && key !== 'm:later') {
    const [y, mo] = key.slice(2).split('-').map(Number)
    if (!y || !mo) return null
    const start = new Date(y, mo - 1, 1).getTime()
    return { start, end: addMonths(start, 1) }
  }
  if (key.startsWith('d:') && key !== 'd:earlier' && key !== 'd:later') {
    const [y, mo, da] = key.slice(2).split('-').map(Number)
    if (!y || !mo || !da) return null
    const start = new Date(y, mo - 1, da).getTime()
    return { start, end: start + 86400e3 }
  }
  if (key.startsWith('q:') && key !== 'q:earlier') {
    const match = /^q:(\d+)-Q([1-4])$/.exec(key)
    if (!match) return null
    const start = new Date(Number(match[1]), (Number(match[2]) - 1) * 3, 1).getTime()
    return { start, end: addMonths(start, 3) }
  }
  if (key.startsWith('y:') && key !== 'y:earlier') {
    const y = Number(key.slice(2))
    if (!y) return null
    const start = new Date(y, 0, 1).getTime()
    return { start, end: addMonths(start, 12) }
  }
  if (key.startsWith('w:') && key !== 'w:earlier') {
    const [y, mo, da] = key.slice(2).split('-').map(Number)
    if (!y || !mo || !da) return null
    const start = new Date(y, mo - 1, da).getTime()
    return { start, end: start + 7 * 86400e3 }
  }
  return null
}

function datetimeLabel(key: string) {
  if (key === 'm:earlier' || key === 'd:earlier' || key === 'w:earlier' || key === 'q:earlier' || key === 'y:earlier' || key === 'rel:earlier') {
    return '更早'
  }
  if (key.endsWith(':later')) return '更晚'
  if (key === 'rel:today') return '今天'
  if (key === 'rel:yesterday') return '昨天'
  if (key === 'rel:week') return '本周'
  if (key === 'rel:month') return '本月'
  if (key === 'rel:year') return '本年'
  if (key.startsWith('m:')) {
    const [y, mo] = key.slice(2).split('-')
    return `${y}/${mo}`
  }
  if (key.startsWith('d:')) {
    const [y, mo, da] = key.slice(2).split('-')
    return `${y}/${mo}/${da}`
  }
  if (key.startsWith('w:')) {
    const [y, mo, da] = key.slice(2).split('-')
    return `${y}/${mo}/${da} 当周`
  }
  if (key.startsWith('q:')) return key.slice(2).replace('-', '/')
  if (key.startsWith('y:')) return key.slice(2)
  return key
}

function datetimeWindow(grain: GroupGrain, now: number): { key: string; start: number; end: number }[] {
  if (grain === 'relative') {
    const today = startOfDay(now)
    const yesterday = today - 86400e3
    const week = startOfWeek(now)
    const month = addMonths(today, 0)
    const year = startOfYear(now)
    return [
      { key: 'rel:today', start: today, end: today + 86400e3 },
      { key: 'rel:yesterday', start: yesterday, end: today },
      { key: 'rel:week', start: week, end: yesterday },
      { key: 'rel:month', start: month, end: week },
      { key: 'rel:year', start: year, end: month },
      { key: 'rel:earlier', start: 0, end: year },
    ].filter((item) => item.end > item.start)
  }
  const out: { key: string; start: number; end: number }[] = []
  if (grain === 'day') {
    const today = startOfDay(now)
    out.push({ key: 'd:earlier', start: 0, end: today - 6 * 86400e3 })
    for (let i = 6; i >= 0; i -= 1) {
      const start = today - i * 86400e3
      out.push({ key: datetimeBucket(start, 'day', now), start, end: start + 86400e3 })
    }
    out.push({ key: 'd:later', start: today + 86400e3, end: today + 86400e3 * 3650 })
    return out
  }
  if (grain === 'week') {
    const week = startOfWeek(now)
    out.push({ key: 'w:earlier', start: 0, end: week - 7 * 7 * 86400e3 })
    for (let i = 7; i >= 0; i -= 1) {
      const start = week - i * 7 * 86400e3
      out.push({ key: datetimeBucket(start, 'week', now), start, end: start + 7 * 86400e3 })
    }
    return out
  }
  if (grain === 'quarter') {
    const q = startOfQuarter(now)
    out.push({ key: 'q:earlier', start: 0, end: addMonths(q, -21) })
    for (let i = 7; i >= 0; i -= 1) {
      const start = addMonths(q, -i * 3)
      out.push({ key: datetimeBucket(start, 'quarter', now), start, end: addMonths(start, 3) })
    }
    return out
  }
  if (grain === 'year') {
    const y = startOfYear(now)
    out.push({ key: 'y:earlier', start: 0, end: addMonths(y, -5 * 12) })
    for (let i = 5; i >= 0; i -= 1) {
      const start = addMonths(y, -i * 12)
      out.push({ key: datetimeBucket(start, 'year', now), start, end: addMonths(start, 12) })
    }
    return out
  }
  const month = addMonths(now, 0)
  out.push({ key: 'm:earlier', start: 0, end: addMonths(month, -5) })
  for (let i = 5; i >= -1; i -= 1) {
    const start = addMonths(month, -i)
    out.push({ key: datetimeBucket(start, 'month', now), start, end: addMonths(start, 1) })
  }
  out.push({ key: 'm:later', start: addMonths(month, 2), end: addMonths(month, 2 + 36) })
  return out
}

const datetimeStrategy: GroupStrategy = {
  kind: 'datetime',
  label: (key) => datetimeLabel(key),
  keys(ctx) {
    const now = ctx.now ?? Date.now()
    return datetimeWindow(datetimeGrain(ctx), now).map((item) => ({ key: item.key, label: datetimeLabel(item.key) }))
  },
  bucketOf(row, ctx) {
    const n = Number(cellGroupValue(row, ctx.fieldKey))
    if (!Number.isFinite(n) || n <= 0) return []
    return [datetimeBucket(n, datetimeGrain(ctx), ctx.now ?? Date.now())]
  },
  filter(groupKey, ctx) {
    if (!groupKey) return emptyFilter(ctx.fieldKey)
    const parsedRange = datetimeKeyRange(groupKey)
    if (parsedRange) return rangeFilter(ctx.fieldKey, Math.max(1, parsedRange.start), parsedRange.end)
    const now = ctx.now ?? Date.now()
    const hit = datetimeWindow(datetimeGrain(ctx), now).find((item) => item.key === groupKey)
    if (!hit) return emptyFilter(ctx.fieldKey)
    return rangeFilter(ctx.fieldKey, Math.max(1, hit.start), hit.end)
  },
}

const NUMBER_EDGES = [0, 1, 10, 100, 1000]

function numberBucket(n: number): string {
  if (n < 0) return 'n:-inf:0'
  for (let i = 0; i < NUMBER_EDGES.length; i += 1) {
    const start = NUMBER_EDGES[i]!
    const end = NUMBER_EDGES[i + 1]
    if (end == null) return `n:${start}:inf`
    if (n >= start && n < end) return `n:${start}:${end}`
  }
  return 'n:1000:inf'
}

function numberLabel(key: string) {
  if (key === 'n:-inf:0') return '< 0'
  if (key === 'n:0:1') return '0'
  if (key === 'n:1:10') return '1–9'
  if (key === 'n:10:100') return '10–99'
  if (key === 'n:100:1000') return '100–999'
  if (key === 'n:1000:inf') return '1000+'
  return key
}

function numberRange(key: string): { start: number; end: number } | null {
  const match = /^n:([^:]+):([^:]+)$/.exec(key)
  if (!match) return null
  const start = match[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1])
  const end = match[2] === 'inf' ? Number.POSITIVE_INFINITY : Number(match[2])
  return { start, end }
}

const numberStrategy: GroupStrategy = {
  kind: 'number',
  label: (key) => numberLabel(key),
  keys() {
    return ['n:-inf:0', 'n:0:1', 'n:1:10', 'n:10:100', 'n:100:1000', 'n:1000:inf'].map((key) => ({
      key,
      label: numberLabel(key),
    }))
  },
  bucketOf(row, ctx) {
    const raw = cellGroupValue(row, ctx.fieldKey)
    if (raw == null || raw === '') return []
    const n = Number(raw)
    if (!Number.isFinite(n)) return []
    return [numberBucket(n)]
  },
  filter(groupKey, ctx) {
    if (!groupKey) return emptyFilter(ctx.fieldKey)
    const range = numberRange(groupKey)
    if (!range) return {}
    const start = Number.isFinite(range.start) ? range.start : -1e15
    const end = Number.isFinite(range.end) ? range.end : 1e15
    return rangeFilter(ctx.fieldKey, start, end)
  },
}

const booleanStrategy: GroupStrategy = {
  kind: 'boolean',
  keys() {
    return [
      { key: 'true', label: '是' },
      { key: 'false', label: '否' },
    ]
  },
  bucketOf(row, ctx) {
    const raw = cellGroupValue(row, ctx.fieldKey)
    if (raw == null || raw === '') return []
    if (raw === true || raw === 'true') return ['true']
    if (raw === false || raw === 'false') return ['false']
    return []
  },
  filter(groupKey, ctx) {
    if (!groupKey) return emptyFilter(ctx.fieldKey)
    return eqFilter(ctx.fieldKey, groupKey === 'true')
  },
}

const refStrategy: GroupStrategy = {
  ...singleValueStrategy('ref', (key) => key),
  emptyLabel: '未关联',
  skipEmpty: () => false,
}

export const GROUP_STRATEGIES: Record<string, GroupStrategy> = {
  select: singleValueStrategy('select', (key, field) => enumLabel(field, key)),
  'multi-select': multiValueStrategy('multi-select', asStringList, (key, field) => enumLabel(field, key)),
  facet: multiValueStrategy('facet', (raw) => normalizeSchemaValue(raw).tags, (key) => key),
  boolean: booleanStrategy,
  datetime: datetimeStrategy,
  person: multiValueStrategy(
    'person',
    (raw) => asPersonList(raw).map((item) => personKey(item)).filter(Boolean),
    (key) => (key === 'user' ? '用户' : key === 'system' ? '系统' : key),
    '未指派',
  ),
  ref: refStrategy,
  'multi-ref': multiValueStrategy('multi-ref', asStringList, (key) => key, '未关联'),
  number: numberStrategy,
}

export function resolveGroupField(
  schema: CollectionSchema | undefined,
  preferred: string | undefined,
  packs: CollectionSchemaPack[] = [],
): { key: string; field: FieldSpec; grain?: GroupGrain } | null {
  const parsed = parseGroupByKey(preferred)
  if (!parsed.fieldKey) return null
  const facet = parseFacetFlatColumnKey(parsed.fieldKey)
  const field = facet
    ? packs.find((pack) => pack.id === facet.packId)?.fields.find((item) => item.key === facet.fieldKey)
    : schema?.fields[parsed.fieldKey]
  if (!field) return null
  const kind = fieldKind(field)
  if (!isGroupableKind(kind)) return null
  if (schema?.labelField && parsed.fieldKey === schema.labelField) return null
  return { key: parsed.fieldKey, field, grain: parsed.grain }
}

export function strategyForField(field: FieldSpec | undefined): GroupStrategy | null {
  if (!field) return null
  return GROUP_STRATEGIES[fieldKind(field)] ?? null
}
