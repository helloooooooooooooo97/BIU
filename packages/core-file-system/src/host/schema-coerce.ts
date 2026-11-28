import {
  allocateRecordId,
  asAttachmentList,
  asHttpHref,
  asImageSrcList,
  asPerson,
  bindSchemaValue,
  isAssignableRecordId,
  isTagFieldType,
  normalizeSchemaValue,
  type CollectionListQuery,
  type CollectionSchema,
  type CollectionSchemaPack,
  type CollectionSpec,
  type FieldSpec,
  type SchemaFieldValue,
  type SchemaPackField,
} from '@biu/type-file-system'
import { retainArchivedSchemaValue } from '../shared/tag-value-compat.ts'
import { parsePageBanner, type PageBanner } from '../page-banner.ts'

export const UPDATE_CONTENT_EXAMPLE =
  'Example: { "path": "/pages/<id>", "fields": { "title": "...", "tag": { "values": { ... } } } }'
export const CREATE_RECORDS_EXAMPLE =
  'Example: { "path": "/pages", "records": [{ "title": "...", "content": "..." }] }'

export function coerceList(value: unknown) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    if (text.startsWith('[')) {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('expected string list as JSON array, e.g. ["title","tag"]')
      }
      if (!Array.isArray(parsed)) throw new Error('expected string list as JSON array, e.g. ["title","tag"]')
      return parsed.map(String)
    }
    if (text.includes('"') || text.includes('[') || text.includes(']')) {
      throw new Error('expected string list as JSON array or array, not a comma-split JSON fragment')
    }
    return text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  throw new Error('expected string list')
}

export function coerceUrl(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const direct = asHttpHref(text)
  if (direct) return direct
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) throw new Error('expected url')
  const prefixed = asHttpHref(`https://${text}`)
  if (!prefixed) throw new Error('expected url')
  return prefixed
}

export function coerce(field: FieldSpec, value: unknown) {
  const kind = field.type === 'string[]'
    ? 'multi-select'
    : field.type === 'string' && field.enum?.length
      ? 'select'
      : field.format && field.type === 'string'
        ? field.format
        : field.type
  if (kind === 'boolean') return value === true || value === 'true'
  if (kind === 'multi-select') {
    const list = coerceList(value)
    if (field.enum?.length && list.some((item) => !field.enum!.includes(item))) throw new Error('value not in enum')
    return list
  }
  if (kind === 'select') {
    const selected = String(value ?? '')
    if (selected && field.enum?.length && !field.enum.includes(selected)) throw new Error('value not in enum')
    return selected
  }
  if (kind === 'number' || kind === 'datetime') {
    if (value == null || value === '') return null
    const n = Number(value)
    if (!Number.isFinite(n)) throw new Error(`expected ${kind}`)
    return n
  }
  if (kind === 'url') return coerceUrl(value)
  if (kind === 'person') {
    if (value == null || value === '') return null
    const person = asPerson(value)
    if (!person) throw new Error('expected person')
    return person
  }
  if (kind === 'ref') {
    if (value == null || value === '') return ''
    if (Array.isArray(value)) return String(value[0] ?? '').trim()
    return String(value).trim()
  }
  if (kind === 'multi-ref') {
    return [...new Set(coerceList(value).map((item) => item.trim()).filter(Boolean))]
  }
  if (kind === 'image') {
    if (value == null || value === '') return ''
    const list = asImageSrcList(value)
    if (!list.length) throw new Error('expected image')
    return list.length === 1 ? list[0] : list
  }
  if (kind === 'attachment' || kind === 'document') {
    if (value == null || value === '') return ''
    const list = asAttachmentList(value)
    if (!list.length) return ''
    return list.length === 1 ? list[0] : list
  }
  if (kind === 'file') {
    if (value == null) return null
    if (value === '') return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'object') return value
    throw new Error('expected file')
  }
  if (kind === 'action') return value == null ? '' : value
  if (isTagFieldType(kind)) return normalizeSchemaValue(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (typeof rec.sessionId === 'string' || rec.kind === 'agent' || rec.kind === 'user') return value
    return JSON.stringify(value)
  }
  return String(value ?? '')
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function findPackField(
  pack: CollectionSchemaPack | null | undefined,
  name: string,
): SchemaPackField | undefined {
  const want = String(name ?? '').trim()
  if (!pack || !want) return undefined
  for (const field of pack.fields) {
    if (field.deleted) continue
    if (field.key === want || field.label === want) return field
  }
  return undefined
}

export function packFieldKey(pack: CollectionSchemaPack | null | undefined, name: string) {
  const want = String(name ?? '').trim()
  if (!pack || !want) return want
  for (const field of pack.fields) {
    if (field.key === want || field.label === want) return field.key
  }
  return want
}

export function tagBagValueEmpty(value: unknown) {
  return value == null || (typeof value === 'string' && !value.trim())
}

function describeReceivedValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'number' && !Number.isFinite(value)) return `number ${String(value)}`
  if (Array.isArray(value)) return `array ${JSON.stringify(value)}`
  return `${typeof value} ${JSON.stringify(value)}`
}

export function coerceTagFieldValue(field: SchemaPackField, value: unknown): unknown {
  const label = String(field.label ?? field.key).trim() || field.key
  const kind = field.type
  if (kind === 'datetime') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} 期望 datetime（Unix 毫秒数，如 1795142384000），收到 ${describeReceivedValue(value)}`)
    }
    return value
  }
  if (kind === 'number') {
    if (typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string')) {
      throw new Error(`${label} 期望 number（数字，如 1），收到 ${describeReceivedValue(value)}`)
    }
    const n = Number(value)
    if (!Number.isFinite(n)) {
      throw new Error(`${label} 期望 number（数字，如 1），收到 ${describeReceivedValue(value)}`)
    }
    return n
  }
  if (kind === 'boolean') {
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
    throw new Error(`${label} 期望 boolean（true 或 false），收到 ${describeReceivedValue(value)}`)
  }
  if (kind === 'select') {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(
        `${label} 期望 select（${field.enum?.length ? `可选值: ${field.enum.join(', ')}` : '字符串'}），收到 ${describeReceivedValue(value)}`,
      )
    }
    const selected = String(value).trim()
    if (selected && field.enum?.length && !field.enum.includes(selected)) {
      const byLabel = field.enumLabels
        ? Object.entries(field.enumLabels).find(([, text]) => text === selected)?.[0]
        : undefined
      if (byLabel) return byLabel
      throw new Error(`${label} 期望 select（可选值: ${field.enum.join(', ')}），收到 ${describeReceivedValue(value)}`)
    }
    return selected
  }
  if (kind === 'multi-select') {
    let list: string[]
    try {
      list = coerceList(value)
    } catch {
      throw new Error(`${label} 期望 multi-select（字符串数组），收到 ${describeReceivedValue(value)}`)
    }
    if (field.enum?.length) {
      const normalized = list.map((item) => {
        if (field.enum!.includes(item)) return item
        const byLabel = field.enumLabels
          ? Object.entries(field.enumLabels).find(([, text]) => text === item)?.[0]
          : undefined
        if (byLabel) return byLabel
        throw new Error(`${label} 期望 multi-select（可选值: ${field.enum!.join(', ')}），收到 ${describeReceivedValue(value)}`)
      })
      return normalized
    }
    return list
  }
  if (kind === 'url') {
    if (typeof value !== 'string') {
      throw new Error(`${label} 期望 url（如 "https://example.com"），收到 ${describeReceivedValue(value)}`)
    }
    try {
      return coerceUrl(value)
    } catch {
      throw new Error(`${label} 期望 url（如 "https://example.com"），收到 ${describeReceivedValue(value)}`)
    }
  }
  if (kind === 'person') {
    const person = asPerson(value)
    if (!person) throw new Error(`${label} 期望 person，收到 ${describeReceivedValue(value)}`)
    return person
  }
  if (kind === 'ref') {
    if (Array.isArray(value)) return String(value[0] ?? '').trim()
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
    throw new Error(`${label} 期望 ref（记录 id 字符串），收到 ${describeReceivedValue(value)}`)
  }
  if (kind === 'multi-ref') {
    let list: string[]
    try {
      list = coerceList(value)
    } catch {
      throw new Error(`${label} 期望 multi-ref（记录 id 数组），收到 ${describeReceivedValue(value)}`)
    }
    return [...new Set(list.map((item) => item.trim()).filter(Boolean))]
  }
  if (kind === 'image') {
    const list = asImageSrcList(value)
    if (!list.length) throw new Error(`${label} 期望 image，收到 ${describeReceivedValue(value)}`)
    return list.length === 1 ? list[0] : list
  }
  if (kind === 'attachment' || kind === 'document') {
    const list = asAttachmentList(value)
    if (!list.length) throw new Error(`${label} 期望 ${kind}，收到 ${describeReceivedValue(value)}`)
    return list.length === 1 ? list[0] : list
  }
  if (isTagFieldType(kind)) return normalizeSchemaValue(value)
  if (kind === 'action') return value == null ? '' : value
  if (typeof value === 'object') {
    throw new Error(`${label} 期望 string，收到 ${describeReceivedValue(value)}`)
  }
  return String(value ?? '')
}

export function remapTagBag(pack: CollectionSchemaPack | null | undefined, bag: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  const removed = new Set<string>()
  const liveFields = pack ? pack.fields.filter((field) => !field.deleted) : []
  for (const [key, value] of Object.entries(bag)) {
    const trimmed = String(key ?? '').trim()
    if (!trimmed) continue
    const spec = findPackField(pack, trimmed)
    if (pack && liveFields.length > 0 && !spec) {
      // 允许记录拥有者显式清空（null / ""）已归档或已删除的历史字段残留，而不是报错拦住
      if (tagBagValueEmpty(value)) {
        removed.add(packFieldKey(pack, trimmed))
        continue
      }
      const available = liveFields
        .map((field) => (field.label && field.label !== field.key ? `${field.key}（${field.label}）` : field.key))
        .join('、')
      throw new Error(`标签「${pack.label || pack.id}」不存在属性「${trimmed}」。可用属性：${available}`)
    }
    const field = spec?.key ?? packFieldKey(pack, trimmed)
    if (!field) continue
    if (tagBagValueEmpty(value)) {
      if (!spec) removed.add(field)
      else out[field] = ''
      continue
    }
    out[field] = spec ? coerceTagFieldValue(spec, value) : value
  }
  return { out, removed }
}

export function applyTagBagPatch(
  pack: CollectionSchemaPack | null | undefined,
  current: Record<string, unknown>,
  bag: Record<string, unknown>,
) {
  const { out, removed } = remapTagBag(pack, bag)
  const next = { ...current, ...out }
  for (const key of removed) delete next[key]
  return next
}

export function pruneTagBags(
  value: SchemaFieldValue,
  resolvePack: (idOrLabel: string) => CollectionSchemaPack | null,
) {
  const packs = value.tags
    .map((id) => resolvePack(id))
    .filter((pack): pack is CollectionSchemaPack => Boolean(pack))
  return retainArchivedSchemaValue(value, packs)
}

/** 统一校验并归整标签写入。标准形状：{ tags: [id], values: { [id]: { [field]: value } } }，兼容单标签扁平 values，绝不静默丢弃未知属性。 */
export function coerceTagPatch(
  raw: unknown,
  current: SchemaFieldValue,
  resolvePack: (idOrLabel: string) => CollectionSchemaPack | null,
): SchemaFieldValue {
  let parsed: unknown = raw
  if (typeof parsed === 'string' && parsed.trim()) {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      parsed = raw
    }
  }
  if (Array.isArray(parsed)) {
    const tags = parsed.map((item) => resolvePack(String(item))?.id ?? String(item).trim()).filter(Boolean)
    return pruneTagBags(bindSchemaValue(tags, current.values), resolvePack)
  }
  if (!isPlainObject(parsed)) return normalizeSchemaValue(parsed)
  const rec = parsed
  const rawTags = Array.isArray(rec.tags)
    ? rec.tags.map((item) => String(item).trim()).filter(Boolean)
    : rec.tags == null
      ? current.tags
      : []
  const tags = [...new Set(rawTags.map((item) => resolvePack(item)?.id ?? item).filter(Boolean))]
  const bags: SchemaFieldValue['values'] = {}
  for (const id of tags) bags[id] = { ...(current.values[id] ?? {}) }
  const applyBag = (packId: string, bag: Record<string, unknown>) => {
    const id = resolvePack(packId)?.id ?? packId
    if (!tags.includes(id)) {
      if (Object.keys(bag).length > 0) {
        throw new Error(`tag.values 中的标签「${packId}」不在当前标签列表 [${tags.join(', ')}] 中，无法写入属性`)
      }
      return
    }
    bags[id] = applyTagBagPatch(resolvePack(id), bags[id] ?? {}, bag)
  }
  if (isPlainObject(rec.values)) {
    const nested: Array<[string, Record<string, unknown>]> = []
    const flat: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rec.values)) {
      const pack = resolvePack(key)
      const packId = pack?.id ?? (tags.includes(key) ? key : '')
      if (packId && isPlainObject(value)) nested.push([packId, value])
      else flat[key] = value
    }
    for (const [id, bag] of nested) applyBag(id, bag)
    if (Object.keys(flat).length) {
      if (tags.length === 0) {
        throw new Error(`未指定任何标签，无法写入标签属性：${Object.keys(flat).join('、')}`)
      }
      if (tags.length === 1) applyBag(tags[0]!, flat)
      else {
        for (const [key, value] of Object.entries(flat)) {
          const hit = tags
            .map((id) => resolvePack(id))
            .find((pack) => pack?.fields.some((field) => !field.deleted && (field.key === key || field.label === key)))
          if (!hit) {
            throw new Error(`无法确定属性「${key}」属于哪个标签，请按标签 id 分组传入 values: { "<标签id>": { "${key}": ... } }`)
          }
          applyBag(hit.id, { [key]: value })
        }
      }
    }
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key === 'tags' || key === 'values') continue
    if (tags.length === 0) {
      throw new Error(`未指定任何标签，无法写入标签属性：${key}`)
    }
    if (tags.length === 1) applyBag(tags[0]!, { [key]: value })
    else {
      const hit = tags.map((id) => resolvePack(id)).find((pack) => pack?.fields.some((field) => !field.deleted && (field.key === key || field.label === key)))
      if (!hit) {
        throw new Error(`无法确定属性「${key}」属于哪个标签，请按标签 id 分组传入 values: { "<标签id>": { "${key}": ... } }`)
      }
      applyBag(hit.id, { [key]: value })
    }
  }
  return pruneTagBags(bindSchemaValue(tags, bags), resolvePack)
}

export function writableFieldKeys(schema: CollectionSchema) {
  return Object.entries(schema.fields)
    .filter(([, field]) => field.writable && !field.computed)
    .map(([key]) => key)
}

export function takeRequestedRecordId(row: Record<string, unknown>) {
  const requested = String(row.id ?? '').trim()
  delete row.id
  return requested
}

export async function unusedRecordId(spec: CollectionSpec, requested: string) {
  if (isAssignableRecordId(requested) && !(await spec.get(requested))) return requested
  for (let i = 0; i < 8; i += 1) {
    const id = allocateRecordId()
    if (!(await spec.get(id))) return id
  }
  throw new Error(`could not allocate record id: ${spec.path}`)
}

export function pickWritablePatch(schema: CollectionSchema, patch: Record<string, unknown>) {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id') throw new Error('field not writable: id')
    const field = schema.fields[key]
    if (!field) {
      const keys = writableFieldKeys(schema)
      throw new Error(`unknown field: ${key}. writable: ${keys.length ? keys.join(', ') : '(none)'}`)
    }
    if (!field.writable || field.computed) throw new Error(`field not writable: ${key}`)
    next[key] = coerce(field, value)
  }
  return next
}

export function takeBannerPatch(raw: Record<string, unknown>): { present: boolean; value: PageBanner | null } {
  if (!('banner' in raw)) return { present: false, value: null }
  const value = parsePageBanner(raw.banner)
  delete raw.banner
  return { present: true, value }
}

export async function assertSameTableLinks(spec: CollectionSpec, patch: Record<string, unknown>, selfId?: string) {
  const ids: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    const field = spec.schema.fields[key]
    if (!field) continue
    const kind = field.type === 'string[]' ? 'multi-select' : field.type
    if (kind === 'ref') {
      const parent = String(value ?? '').trim()
      if (!parent) continue
      if (selfId && parent === selfId) throw new Error('cannot link a record to itself')
      ids.push(parent)
      continue
    }
    if (kind === 'multi-ref') {
      const list = Array.isArray(value) ? value.map((item) => String(item)) : []
      for (const id of list) {
        if (!id) continue
        if (selfId && id === selfId) throw new Error('cannot link a record to itself')
        ids.push(id)
      }
    }
  }
  for (const id of [...new Set(ids)]) {
    const hit = await spec.get(id)
    if (!hit) throw new Error(`unknown record in this table: ${id}`)
  }
}

export function parseContent(content: unknown): Record<string, unknown> {
  if (typeof content === 'string') {
    const trimmed = content.trim()
    if (!trimmed) return {}
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`content must be an object. ${UPDATE_CONTENT_EXAMPLE}`)
    }
    return parsed as Record<string, unknown>
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error(`content must be an object. ${UPDATE_CONTENT_EXAMPLE}`)
  }
  return content as Record<string, unknown>
}

export function parseRecords(content: unknown): Record<string, unknown>[] {
  const raw = typeof content === 'string' ? JSON.parse(content.trim() || 'null') : content
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (!Object.keys(raw as Record<string, unknown>).length) {
      throw new Error(`records must be a non-empty array. ${CREATE_RECORDS_EXAMPLE}`)
    }
    return [raw as Record<string, unknown>]
  }
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error(`records must be a non-empty array. ${CREATE_RECORDS_EXAMPLE}`)
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`records[${index}] must be an object`)
    return item as Record<string, unknown>
  })
}

export function asColumnKeys(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim()
    if (text.startsWith('[')) {
      try {
        return asColumnKeys(JSON.parse(text) as unknown)
      } catch {
        return undefined
      }
    }
    return asColumnKeys(text.split(','))
  }
  if (!Array.isArray(value)) return undefined
  const keys = value.map((item) => String(item).trim()).filter(Boolean)
  return keys.length ? keys : undefined
}

export function parseListColumnsParam(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  const text = raw.trim()
  if (!text) return undefined
  if (text.startsWith('[')) {
    try {
      return asColumnKeys(JSON.parse(text) as unknown)
    } catch {
      return undefined
    }
  }
  return asColumnKeys(text.split(','))
}

export function parseSortsParam(raw: string | null): Array<{ field: string; dir: 'asc' | 'desc' }> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return undefined
    const out: Array<{ field: string; dir: 'asc' | 'desc' }> = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const field = String((item as { field?: unknown }).field ?? '').trim()
      if (!field) continue
      out.push({ field, dir: (item as { dir?: unknown }).dir === 'desc' ? 'desc' : 'asc' })
    }
    return out.length ? out : undefined
  } catch {
    return undefined
  }
}

export function asFilter(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function asIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => String(item).trim()).filter(Boolean)
}

export function asDeleteQuery(args: Record<string, unknown>): CollectionListQuery {
  return {
    ids: asIds(args.ids),
    q: args.q != null ? String(args.q) : undefined,
    filter: asFilter(args.filter),
    purge: args.purge === true,
  }
}

export function asCreateRecords(args: Record<string, unknown>) {
  const value = args.records
  if (!Array.isArray(value)) {
    throw new Error(`records must be a non-empty array of objects. ${CREATE_RECORDS_EXAMPLE}`)
  }
  const records = value.filter((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return true
    return Object.keys(item).length > 0
  })
  if (!records.length) throw new Error(`records must include at least one non-empty object. ${CREATE_RECORDS_EXAMPLE}`)
  return records
}

export function isTextDoc(name: string, type: string) {
  if (/^text\/|json|xml|javascript|typescript|svg/.test(type)) return true
  return /\.(?:md|markdown|txt|json|jsx|tsx|js|ts|css|html|htm|svg|yaml|yml|toml|csv|xml|sh|py|sql)$/i.test(name)
}
