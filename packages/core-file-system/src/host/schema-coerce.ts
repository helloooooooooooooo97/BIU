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
  pruneSchemaValue,
  type CollectionListQuery,
  type CollectionSchema,
  type CollectionSchemaPack,
  type CollectionSpec,
  type FieldSpec,
  type SchemaFieldValue,
} from '@biu/type-file-system'
import { parsePageBanner, type PageBanner } from '../page-banner.ts'

export const UPDATE_CONTENT_EXAMPLE =
  'Example: { "path": "/pages/<id>", "content": { "title": "...", "tag": { "values": { ... } } } }'
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

export function remapTagBag(pack: CollectionSchemaPack | null | undefined, bag: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(bag)) {
    const field = packFieldKey(pack, key)
    if (!field) continue
    out[field] = tagBagValueEmpty(value) ? '' : value
  }
  return out
}

export function applyTagBagPatch(
  pack: CollectionSchemaPack | null | undefined,
  current: Record<string, unknown>,
  bag: Record<string, unknown>,
) {
  return { ...current, ...remapTagBag(pack, bag) }
}

export function pruneTagBags(
  value: SchemaFieldValue,
  resolvePack: (idOrLabel: string) => CollectionSchemaPack | null,
) {
  const packs = value.tags
    .map((id) => resolvePack(id))
    .filter((pack): pack is CollectionSchemaPack => Boolean(pack))
  return pruneSchemaValue(value, packs)
}

/** Agent 常写成扁平 values（中文属性名），权威形状是 values[标签id][字段key]。 */
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
    if (!tags.includes(id)) return
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
      if (tags.length === 1) applyBag(tags[0]!, flat)
      else {
        for (const [key, value] of Object.entries(flat)) {
          const hit = tags
            .map((id) => resolvePack(id))
            .find((pack) => pack?.fields.some((field) => field.key === key || field.label === key))
          if (hit) applyBag(hit.id, { [key]: value })
        }
      }
    }
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key === 'tags' || key === 'values') continue
    if (tags.length === 1) applyBag(tags[0]!, { [key]: value })
    else {
      const hit = tags.map((id) => resolvePack(id)).find((pack) => pack?.fields.some((field) => field.key === key || field.label === key))
      if (hit) applyBag(hit.id, { [key]: value })
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
  const value =
    args.records !== undefined
      ? args.records
      : args.record !== undefined
        ? args.record
        : args.content
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (!Object.keys(value as Record<string, unknown>).length) {
      throw new Error(`records must include at least one non-empty object. ${CREATE_RECORDS_EXAMPLE}`)
    }
    return [value]
  }
  if (!Array.isArray(value)) return value
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
