import type { AtomicFieldType, CollectionSchema, CollectionSchemaPack, DbRecord, FieldSpec, FieldType, SchemaFieldValue } from '@biu/type-file-system'
import { asAttachment, asAttachmentList, asHttpHref, asImageSrc, asImageSrcList, asPerson, asPersonList, BUILTIN_FIELD_KEYS, isFacetFieldType, isRefFieldType, isReservedSchemaFieldKey, isSchemaFieldKey, normalizeSchemaValue, personKey } from '@biu/type-file-system'
import { FACET_FLAT_PREFIX, parseFacetFlatColumnKey, readFacetFieldValue } from '../query-logic.ts'
import {
  cellGroupValue,
  GROUP_STRATEGIES,
  isGroupableKind,
  parseGroupByKey,
  resolveGroupField,
  strategyForField,
  type GroupStrategyContext,
} from './group-strategies.ts'

export { GROUP_STRATEGIES, isGroupableKind, parseGroupByKey }

export { FACET_FLAT_PREFIX, parseFacetFlatColumnKey }

export const BUILTIN_VIEW_MODES = ['table'] as const
export type BuiltinViewMode = (typeof BUILTIN_VIEW_MODES)[number]
/** 表格为文件系统默认；其它呈现由集合 registerView 注册。 */
export type ViewMode = BuiltinViewMode | (string & {})

export function isDroppedViewMode(mode: unknown) {
  return mode === 'queue' || mode === 'cards' || mode === 'board'
}

export function isViewModeId(mode: unknown): mode is ViewMode {
  return typeof mode === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(mode) && !isDroppedViewMode(mode)
}

export function resolveFieldType(field: FieldSpec): FieldType {
  if (isFacetFieldType(field.type)) return 'facet'
  if (field.type === 'string[]') return 'multi-select'
  if (field.type === 'string' && field.enum?.length) return 'select'
  if (field.type === 'number' && field.format === 'datetime') return 'datetime'
  if (field.type === 'string' && (field.format === 'url' || field.format === 'image' || field.format === 'attachment' || field.format === 'file')) {
    return field.format
  }
  return field.type
}

export function enumDisplayLabel(field: FieldSpec | undefined, value: unknown) {
  const key = String(value ?? '')
  return field?.enumLabels?.[key] || key
}

export function fieldValueOptions(rows: DbRecord[], key: string, field: FieldSpec) {
  const values = field.enum?.length ? field.enum : uniqueValues(rows, key, field)
  return values.map((value) => ({ value, label: enumDisplayLabel(field, value) }))
}

export function fieldEntries(schema: CollectionSchema | undefined) {
  if (!schema) return []
  return Object.entries(schema.fields).map(([key, field]) => ({ key, field, kind: resolveFieldType(field) }))
}

function declaredParentField(schema: CollectionSchema | undefined) {
  if (schema?.parentField && schema.fields[schema.parentField]) return schema.parentField
  if (schema?.fields.parentId) return 'parentId'
  if (schema?.fields.parent) return 'parent'
  const firstRef = fieldEntries(schema).find((item) => item.kind === 'ref')
  if (firstRef) return firstRef.key
  return null
}

/** 推断父子字段：schema 声明优先，否则看数据里是否有指向其它记录 id 的 string 列。 */
export function parentFieldKey(schema: CollectionSchema | undefined, rows: DbRecord[] = []): string | null {
  const declared = declaredParentField(schema)
  if (declared) return declared
  const ids = new Set(rows.map((row) => row.id))
  for (const item of fieldEntries(schema)) {
    if (item.kind !== 'string' || item.key === schema?.labelField) continue
    const linked = rows.some((row) => {
      const value = String(row[item.key] ?? '')
      return Boolean(value) && value !== row.id && ids.has(value)
    })
    if (linked) return item.key
  }
  return null
}

/** 当前列表里某条记录的直接子行（parent 不在列表里的当根）。 */
export function treeChildren(rows: DbRecord[], parentKey: string, parentId: string): DbRecord[] {
  const ids = new Set(rows.map((row) => row.id))
  return rows.filter((row) => {
    const raw = String(row[parentKey] ?? '')
    const parent = raw && raw !== row.id && ids.has(raw) ? raw : ''
    return parent === parentId
  })
}

/** 当前数据里是否真有父子链接；没有则不当树形表。 */
export function hasTreeLinks(rows: DbRecord[], parentKey: string | null): boolean {
  if (!parentKey || !rows.length) return false
  const ids = new Set(rows.map((row) => row.id))
  return rows.some((row) => {
    const raw = String(row[parentKey] ?? '')
    return Boolean(raw) && raw !== row.id && ids.has(raw)
  })
}

export type TreeRow = { row: DbRecord; depth: number; hasKids: boolean; kidCount: number }

export function flattenTree(rows: DbRecord[], parentKey: string, collapsed: Record<string, boolean> = {}): TreeRow[] {
  const ids = new Set(rows.map((row) => row.id))
  const children = new Map<string, DbRecord[]>()
  const hasKids = new Set<string>()
  for (const row of rows) {
    const raw = String(row[parentKey] ?? '')
    const parent = raw && raw !== row.id && ids.has(raw) ? raw : ''
    if (parent) hasKids.add(parent)
    const bucket = children.get(parent)
    if (bucket) bucket.push(row)
    else children.set(parent, [row])
  }
  const memo = new Map<string, number>()
  const kidCountOf = (id: string): number => {
    const hit = memo.get(id)
    if (hit != null) return hit
    memo.set(id, 0)
    const kids = children.get(id) ?? []
    const total = kids.reduce((sum, child) => sum + 1 + kidCountOf(child.id), 0)
    memo.set(id, total)
    return total
  }
  const out: TreeRow[] = []
  const seen = new Set<string>()
  const skip = (parent: string) => {
    for (const row of children.get(parent) ?? []) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      skip(row.id)
    }
  }
  const visit = (parent: string, depth: number) => {
    for (const row of children.get(parent) ?? []) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      out.push({ row, depth, hasKids: hasKids.has(row.id), kidCount: kidCountOf(row.id) })
      if (collapsed[row.id]) skip(row.id)
      else visit(row.id, depth + 1)
    }
  }
  visit('', 0)
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push({ row, depth: 0, hasKids: hasKids.has(row.id), kidCount: kidCountOf(row.id) })
    if (!collapsed[row.id]) visit(row.id, 1)
  }
  return out
}

/** 表格默认列：schema.columns 与现有列求交；没有声明则展开业务列（不含 id、内置时间列与父级字段）。标题列始终排在最前。 */
export function pinLabelColumn(schema: CollectionSchema | undefined, keys: string[]): string[] {
  const label = schema?.labelField
  if (!label) return keys
  return [label, ...keys.filter((key) => key !== label)]
}

/** 有动作列时固定在标题右侧，且始终展示。 */
export function pinActionColumn(schema: CollectionSchema | undefined, keys: string[], enabled: boolean): string[] {
  const without = keys.filter((key) => key !== 'actions')
  const pinned = pinLabelColumn(schema, without)
  if (!enabled) return pinned
  const label = schema?.labelField
  if (label && pinned[0] === label) return [label, 'actions', ...pinned.slice(1)]
  return ['actions', ...pinned]
}

export function defaultColumnKeys(schema: CollectionSchema | undefined, allKeys: string[]): string[] {
  const listed = schema?.columns?.filter((key) => allKeys.includes(key)) ?? []
  const parent = declaredParentField(schema)
  const raw = listed.length
    ? listed
    : allKeys.filter((key) => !(BUILTIN_FIELD_KEYS as readonly string[]).includes(key) && key !== parent)
  const keys = (raw.length ? raw : allKeys).filter((key) => !isFacetFlatColumnKey(key))
  return pinLabelColumn(schema, keys)
}

/** 动作 when 用到的字段。列表投影漏了会先画出运行/安装再跳到卸载。 */
export function actionWhenKeys(schema?: Pick<CollectionSchema, 'actions'> | null): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const action of schema?.actions ?? []) {
    const when = action.when
    if (!when) continue
    for (const key of Object.keys(when)) {
      const next = key.trim()
      if (!next || seen.has(next)) continue
      seen.add(next)
      keys.push(next)
    }
  }
  return keys
}

/** 列表投影：可见列 + 标题/图标/树/分组/标签源字段 + 动作 when。不传则服务端仍返回除正文外全字段。 */
export function listProjectionKeys(opts: {
  schema?: CollectionSchema
  columns: string[]
  groupBy?: string
}): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  const add = (key?: string | null) => {
    const next = String(key ?? '').trim()
    if (!next || seen.has(next)) return
    seen.add(next)
    keys.push(next)
  }
  add('id')
  add(opts.schema?.labelField ?? 'title')
  add('emoji')
  add('mascot')
  add(declaredParentField(opts.schema))
  add(parseGroupByKey(opts.groupBy).fieldKey)
  add('parentChain')
  add('blocked')
  add('usageParts')
  add('builtin')
  let needFacet = false
  for (const key of opts.columns) {
    add(key)
    if (parseFacetFlatColumnKey(key)) needFacet = true
  }
  if (needFacet) add(facetSourceKey(opts.schema))
  for (const key of actionWhenKeys(opts.schema)) add(key)
  return keys
}

export function facetFlatColumnKey(packId: string, fieldKey: string) {
  return `${FACET_FLAT_PREFIX}${packId}::${fieldKey}`
}

export function isFacetFlatColumnKey(key: string) {
  return key.startsWith(FACET_FLAT_PREFIX)
}

export function facetSourceKey(schema: CollectionSchema | undefined) {
  if (!schema) return 'facet'
  const hit = Object.entries(schema.fields).find(([, field]) => resolveFieldType(field) === 'facet')
  return hit?.[0] ?? 'facet'
}

export function flattenFacetColumns(catalog: CollectionSchemaPack[]) {
  return catalog.flatMap((pack) =>
    pack.fields
      .filter((field) => field.deleted !== true)
      .map((field) => ({
        key: facetFlatColumnKey(pack.id, field.key),
        field: { ...field, label: field.label ?? field.key },
        kind: resolveFieldType(field),
        packId: pack.id,
        packLabel: pack.label,
      })),
  )
}

export function facetColumnTitle(col: {
  key: string
  packLabel?: string
  field?: { label?: string }
}) {
  const fieldLabel = String(col.field?.label ?? col.key).trim() || col.key
  const pack = String(col.packLabel ?? '').trim()
  return pack ? `${pack}.${fieldLabel}` : fieldLabel
}

export function readFacetFlatValue(row: DbRecord, columnKey: string, sourceKey = 'facet') {
  if (!parseFacetFlatColumnKey(columnKey)) return undefined
  return readFacetFieldValue(row, columnKey, sourceKey)
}

export function patchFacetFlatValue(row: DbRecord, columnKey: string, next: unknown, sourceKey = 'facet'): SchemaFieldValue {
  const parsed = parseFacetFlatColumnKey(columnKey)
  const current = normalizeSchemaValue(row[sourceKey])
  if (!parsed) return current
  const tags = current.tags.includes(parsed.packId) ? current.tags : [...current.tags, parsed.packId]
  return {
    tags,
    values: {
      ...current.values,
      [parsed.packId]: { ...(current.values[parsed.packId] ?? {}), [parsed.fieldKey]: next },
    },
  }
}

export function inferPackFieldType(value: unknown): AtomicFieldType {
  if (typeof value === 'boolean' || value === 'true' || value === 'false') return 'boolean'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e11 ? 'datetime' : 'number'
  }
  if (Array.isArray(value)) {
    if (asAttachmentList(value).length) return 'attachment'
    return 'multi-select'
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>
    if (Array.isArray(rec.tags)) return 'facet'
    if (asPerson(value)) return 'person'
    if (asAttachment(value)) return 'attachment'
    if (asImageSrcList(value).length) return 'image'
  }
  if (asHttpHref(value) && typeof value === 'string') return 'url'
  return 'string'
}

export function orphanPackEntries(
  fields: Array<{ key: string; deleted?: boolean; type?: AtomicFieldType; label?: string }>,
  bag: Record<string, unknown> | undefined,
) {
  const known = new Set(fields.filter((item) => item.deleted !== true).map((item) => item.key))
  const retired = new Map(fields.map((item) => [item.key, item]))
  const out: Array<{ key: string; value: unknown; type: AtomicFieldType; label: string }> = []
  if (!bag) return out
  for (const [key, value] of Object.entries(bag)) {
    if (known.has(key) || isReservedSchemaFieldKey(key)) continue
    if (!isSchemaFieldKey(key)) continue
    const kept = retired.get(key)
    const type = kept?.type && kept.deleted ? kept.type : inferPackFieldType(value)
    if (!fieldHasValue({ type }, value)) continue
    out.push({ key, value, type, label: kept?.label ?? key })
  }
  return out
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function asTime(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function formatField(field: FieldSpec | undefined, value: unknown): string {
  if (!field) return value == null || value === '' ? '' : String(value)
  const kind = resolveFieldType(field)
  if (value == null || value === '') return ''
  if (kind === 'datetime') {
    const n = asTime(value)
    if (!n) return ''
    const d = new Date(n)
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  if (kind === 'boolean') return value === true || value === 'true' ? '是' : '否'
  if (kind === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n) || n === 0) return ''
    return String(n)
  }
  if (kind === 'url') return asHttpHref(value) || ''
  if (kind === 'image') {
    const list = asImageSrcList(value)
    return list.length ? list.join(', ') : ''
  }
  if (kind === 'attachment') {
    const list = asAttachmentList(value)
    return list.length ? list.map((file) => file.name).join(', ') : ''
  }
  if (kind === 'file') {
    if (value == null || value === '') return ''
    const img = asImageSrc(value)
    if (img) return img
    const file = asAttachment(value)
    if (file) return file.name
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  if (kind === 'multi-select') {
    const tags = asStringList(value)
    return tags.length ? tags.map((tag) => enumDisplayLabel(field, tag)).join(', ') : ''
  }
  if (kind === 'select') return enumDisplayLabel(field, value)
  if (kind === 'action') return field.label || '动作'
  if (kind === 'facet') {
    const parsed = normalizeSchemaValue(value)
    return parsed.tags.length ? parsed.tags.join(', ') : ''
  }
  if (kind === 'person') {
    return asPersonList(value)
      .map((item) => item.name)
      .filter(Boolean)
      .join(' ')
  }
  if (kind === 'ref') {
    const id = String(value ?? '').trim()
    return id
  }
  if (kind === 'multi-ref') {
    const tags = asStringList(value)
    return tags.length ? tags.join(', ') : ''
  }
  return String(value)
}

/** 列表 / 卡片 / 看板：没有实际内容的属性不渲染（表格单元格仍可显示空位）。 */
export function fieldHasValue(field: FieldSpec | undefined, value: unknown): boolean {
  if (field && resolveFieldType(field) === 'action') return true
  if (value == null) return false
  if (typeof value === 'string' && !value.trim()) return false
  if (field && resolveFieldType(field) === 'person') return asPersonList(value).length > 0
  if (Array.isArray(value) && asStringList(value).length === 0) return false
  if (!field) return true
  const kind = resolveFieldType(field)
  if (kind === 'boolean') return value === true || value === 'true'
  if (kind === 'facet') return normalizeSchemaValue(value).tags.length > 0
  return Boolean(formatField(field, value))
}

export function contentFieldKey(schema: CollectionSchema | undefined) {
  if (!schema) return null
  const preferred = schema.contentField ?? 'content'
  if (preferred !== schema.labelField && schema.fields[preferred]) return preferred
  const label = schema.labelField
  for (const key of ['description', 'notes', 'body']) {
    if (key === label) continue
    const field = schema.fields[key]
    if (field && (resolveFieldType(field) === 'string' || resolveFieldType(field) === 'file')) return key
  }
  return null
}

export function isParentLinkField(key: string) {
  return key === 'parentId' || key === 'parent'
}

export function isDependsLinkField(key: string) {
  return key === 'dependsOn'
}

export function isRecordLinkField(field: FieldSpec | undefined, key?: string) {
  if (field && isRefFieldType(resolveFieldType(field))) return true
  return Boolean(key && (isParentLinkField(key) || isDependsLinkField(key)))
}

export function isSingleRefField(field: FieldSpec | undefined, key?: string) {
  if (field && resolveFieldType(field) === 'ref') return true
  if (field && resolveFieldType(field) === 'multi-ref') return false
  return Boolean(key && isParentLinkField(key))
}

export function recordLinkIds(field: FieldSpec | string | undefined, value: unknown, key?: string): string[] {
  if (typeof field === 'string') {
    return recordLinkIds(undefined, value, field)
  }
  if (isSingleRefField(field, key)) {
    const id = String(value ?? '').trim()
    return id ? [id] : []
  }
  if ((field && resolveFieldType(field) === 'multi-ref') || (key && isDependsLinkField(key))) return asStringList(value)
  return []
}

export function uniqueValues(rows: DbRecord[], key: string, field: FieldSpec): string[] {
  const set = new Set<string>()
  const kind = resolveFieldType(field)
  const cell = (row: DbRecord) => (parseFacetFlatColumnKey(key) ? readFacetFieldValue(row, key) : row[key])
  for (const row of rows) {
    const raw = cell(row)
    if (kind === 'multi-select' || kind === 'multi-ref') {
      for (const item of asStringList(raw)) set.add(item)
    } else if (kind === 'facet') {
      for (const item of normalizeSchemaValue(raw).tags) set.add(item)
    } else if (kind === 'person') {
      for (const item of asPersonList(raw)) {
        const key = personKey(item)
        if (key) set.add(key)
      }
    } else if (raw != null && raw !== '') {
      set.add(String(raw))
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
}

export function groupableFields(schema: CollectionSchema | undefined, packs: CollectionSchemaPack[] = []) {
  const fromSchema = fieldEntries(schema).filter((item) => isGroupableKind(item.kind) && item.key !== schema?.labelField)
  const fromPacks = flattenFacetColumns(packs)
    .filter((item) => isGroupableKind(item.kind))
    .map((item) => ({ key: item.key, field: item.field, kind: item.kind }))
  return [...fromSchema, ...fromPacks]
}

export function groupField(
  schema: CollectionSchema | undefined,
  preferred?: string,
  packs: CollectionSchemaPack[] = [],
): { key: string; field: FieldSpec } | null {
  const match = resolveGroupField(schema, preferred, packs)
  return match ? { key: match.key, field: match.field } : null
}

function groupContext(
  schema: CollectionSchema | undefined,
  preferred: string | undefined,
  extraValues: string[] = [],
  packs: CollectionSchemaPack[] = [],
): GroupStrategyContext | null {
  const group = resolveGroupField(schema, preferred, packs)
  if (!group) return null
  return {
    fieldKey: group.key,
    groupBy: preferred ?? group.key,
    field: group.field,
    extraValues,
  }
}

export type GroupBucket = {
  key: string
  label: string
  rows: DbRecord[]
  total?: number
}

/** 分组表头的稳定 key：策略生成，而不是当前这一页里碰巧出现的值。 */
export function groupListKeys(
  schema: CollectionSchema | undefined,
  preferred?: string,
  extraValues: string[] = [],
  packs: CollectionSchemaPack[] = [],
): { key: string; label: string }[] {
  const ctx = groupContext(schema, preferred, extraValues, packs)
  const strategy = ctx ? strategyForField(ctx.field) : null
  if (!ctx || !strategy) return []
  const listed = strategy.keys(ctx)
  if (!listed.length) return []
  if (!strategy.skipEmpty?.(ctx)) listed.push({ key: '', label: strategy.emptyLabel ?? '未填' })
  return listed
}

/** 每一组自己的列表过滤。分享列是计算属性，分组请求走 $scope；host 按展示用的 shareScope 切包（公开/局域网链接算共享）。 */
export function groupListFilter(
  groupBy: string,
  groupKey: string,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
): Record<string, unknown> {
  const ctx = groupContext(schema, groupBy, [], packs)
  const strategy = ctx ? strategyForField(ctx.field) : null
  if (strategy && ctx) return strategy.filter(groupKey, ctx)
  if (groupBy === 'shareScope') {
    const scope = { 私人: 'personal', 空间: 'workspace', 共享: 'shared' }[groupKey]
    return scope ? { $scope: scope } : {}
  }
  if (!groupKey) {
    const fieldKey = parseGroupByKey(groupBy).fieldKey || groupBy
    return {
      $tree: {
        kind: 'group',
        id: 'group-empty',
        combinator: 'and',
        children: [{ kind: 'rule', id: 'group-empty-rule', field: fieldKey, op: 'is_empty', value: '' }],
      },
    }
  }
  return { [parseGroupByKey(groupBy).fieldKey || groupBy]: groupKey }
}

/** 视图筛选和组筛选叠在一起。$scope 冲突表示这组在当前视图里不可能有行。 */
export function mergeListFilters(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> | null {
  const baseScope = typeof base.$scope === 'string' ? base.$scope : ''
  const extraScope = typeof extra.$scope === 'string' ? extra.$scope : ''
  if (baseScope && extraScope && baseScope !== extraScope) return null
  const out: Record<string, unknown> = { ...base, ...extra }
  const left = base.$tree
  const right = extra.$tree
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    out.$tree = {
      kind: 'group',
      id: 'group-and',
      combinator: 'and',
      children: [left, right],
    }
  }
  return out
}

export function groupRecords(
  rows: DbRecord[],
  schema: CollectionSchema | undefined,
  preferred?: string,
  packs: CollectionSchemaPack[] = [],
): GroupBucket[] {
  const group = resolveGroupField(schema, preferred, packs)
  const extra = group ? uniqueValues(rows, group.key, group.field) : []
  const ctx = groupContext(schema, preferred, extra, packs)
  const strategy = ctx ? strategyForField(ctx.field) : null
  if (!ctx || !strategy) return [{ key: '', label: '全部', rows }]
  const labels = new Map(strategy.keys(ctx).map((item) => [item.key, item.label]))
  const buckets = new Map<string, DbRecord[]>()
  const unset: DbRecord[] = []
  for (const row of rows) {
    const keys = strategy.bucketOf(row, ctx)
    if (!keys.length) {
      unset.push(row)
      continue
    }
    for (const key of keys) {
      buckets.set(key, [...(buckets.get(key) ?? []), row])
    }
  }
  const listed = [...buckets.entries()].map(([key, grouped]) => ({
    key,
    label: labels.get(key) ?? strategy.label?.(key, ctx) ?? key,
    rows: grouped,
  }))
  if (unset.length) listed.push({ key: '', label: strategy.emptyLabel ?? '未填', rows: unset })
  return listed
}

export function groupRowBucketKeys(
  row: DbRecord,
  groupBy: string,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
): string[] {
  if (!groupBy) return ['']
  const ctx = groupContext(schema, groupBy, [], packs)
  const strategy = ctx ? strategyForField(ctx.field) : null
  if (!strategy || !ctx) {
    const raw = cellGroupValue(row, parseGroupByKey(groupBy).fieldKey || groupBy)
    return raw == null || raw === '' ? [''] : [String(raw)]
  }
  const keys = strategy.bucketOf(row, ctx)
  return keys.length ? keys : ['']
}

export function previewActionRecord(row: DbRecord, action: { id?: string; when?: Record<string, unknown> }): DbRecord {
  if (action.id === 'uninstall' || action.id === 'delete' || action.id === 'remove') {
    if (row.installed === false && row.running !== true && row.enabled !== true) return row
    return { ...row, installed: false, running: false, enabled: false }
  }
  if (action.id === 'pack') {
    if (row.installed === true) return row
    return { ...row, installed: true }
  }
  const when = action.when
  if (!when || !('running' in when) || typeof when.running !== 'boolean') return row
  const running = when.running === false
  if (Object.is(row.running, running)) return row
  return { ...row, running }
}

export function overlayListed(base: DbRecord, listed: DbRecord, projected?: string[] | null): DbRecord {
  let changed = false
  const next: DbRecord = { ...base }
  for (const [key, value] of Object.entries(listed)) {
    if (!Object.is(next[key], value)) {
      next[key] = value
      changed = true
    }
  }
  const keys = projected?.length ? projected : Object.keys(base)
  for (const key of keys) {
    if (key === 'id') continue
    if (Object.prototype.hasOwnProperty.call(listed, key)) continue
    if (next[key] !== true) continue
    next[key] = false
    changed = true
  }
  return changed ? next : base
}

export function matchActionWhen(record: DbRecord, when?: Record<string, unknown>) {
  if (!when) return true
  for (const [key, expected] of Object.entries(when)) {
    const actual = record[key]
    if (expected === true || expected === false) {
      const flag = actual === true || actual === 'true'
      if (flag !== expected) return false
      continue
    }
    if (String(actual ?? '') !== String(expected)) return false
  }
  return true
}
