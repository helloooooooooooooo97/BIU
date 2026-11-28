import {
  asAttachmentList,
  asHttpHref,
  asImageSrcList,
  asPerson,
  isEmptySchemaValue,
  normalizeSchemaValue,
  type AtomicFieldType,
  type CollectionSchemaPack,
  type FieldSpec,
  type FieldType,
  type SchemaFieldValue,
} from '@biu/type-file-system'
import { asStringList, inferPackFieldType, resolveFieldType } from './fields.ts'

function isNonEmptyArchivedValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (Array.isArray(rec.tags)) return !isEmptySchemaValue(normalizeSchemaValue(value))
    return Object.keys(rec).length > 0
  }
  return true
}

/**
 * 保留活跃字段与「非空的已归档/未归属字段值」，仅裁掉已删字段的空白占位。
 * 保证删字段、改权限或编辑其它字段时，已有历史数据绝不静默丢失，并可在属性集收纳区查看/恢复/清理。
 */
export function retainArchivedSchemaValue(raw: unknown, packs: CollectionSchemaPack[] = []): SchemaFieldValue {
  const parsed = normalizeSchemaValue(raw)
  const rawObj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { values?: unknown })
      : typeof raw === 'string' && raw.trim().startsWith('{')
        ? (() => {
            try {
              const obj = JSON.parse(raw) as unknown
              return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as { values?: unknown }) : null
            } catch {
              return null
            }
          })()
        : null
  const rawValues =
    rawObj?.values && typeof rawObj.values === 'object' && !Array.isArray(rawObj.values)
      ? (rawObj.values as Record<string, unknown>)
      : parsed.values
  const byId = new Map(packs.map((pack) => [pack.id, pack]))
  const values: SchemaFieldValue['values'] = {}
  for (const id of parsed.tags) {
    const pack = byId.get(id)
    const bag = parsed.values[id] ?? {}
    if (!pack) {
      const next: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(bag)) {
        if (isNonEmptyArchivedValue(item)) next[key] = item
      }
      if (Object.keys(next).length) values[id] = next
      continue
    }
    const keep = new Set((pack.fields ?? []).filter((field) => field.deleted !== true).map((field) => field.key))
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(bag)) {
      if (keep.has(key) || isNonEmptyArchivedValue(item)) next[key] = item
    }
    values[id] = next
  }
  for (const [id, bag] of Object.entries(rawValues)) {
    if (id in values || !bag || typeof bag !== 'object' || Array.isArray(bag)) continue
    if (byId.has(id)) continue
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(bag as Record<string, unknown>)) {
      if (isNonEmptyArchivedValue(item)) next[key] = item
    }
    if (Object.keys(next).length) values[id] = next
  }
  const nextTags = [...new Set(parsed.tags.map((item) => String(item).trim()).filter(Boolean))]
  return { tags: nextTags, values }
}

export type AdaptedFieldValue = {
  /** 适配到目标类型后的可展示/可索引值；无法无损兼容时为 undefined。 */
  value: unknown
  /** true 表示存在非空旧值，但与当前字段类型不兼容，需要原样保留并提示用户。 */
  incompatible: boolean
  /** 原始存储值（永不覆盖）。 */
  raw: unknown
  /** 便于提示/复制的原始值可读预览。 */
  rawPreview: string
  /** 推断出的旧值原始类型。 */
  rawType: AtomicFieldType
}

const NUMERIC_RE = /^-?(?:\d+\.?\d*|\.\d+)$/

export function formatRawValuePreview(value: unknown, max = 80): string {
  if (value == null) return ''
  let text = ''
  if (typeof value === 'string') {
    text = value.trim()
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value)
  } else if (Array.isArray(value)) {
    text = value
      .map((item) => {
        if (item == null) return ''
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return String(item)
        if (typeof item === 'object') {
          const rec = item as Record<string, unknown>
          return String(rec.name ?? rec.title ?? rec.href ?? rec.url ?? '').trim() || JSON.stringify(item)
        }
        return String(item)
      })
      .filter(Boolean)
      .join('、')
  } else if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    const person = asPerson(value)
    if (person?.name) text = person.name
    else if (Array.isArray(rec.tags)) text = rec.tags.map(String).filter(Boolean).join('、')
    else if (typeof rec.name === 'string' && rec.name.trim()) text = rec.name.trim()
    else if (typeof rec.title === 'string' && rec.title.trim()) text = rec.title.trim()
    else {
      try {
        text = JSON.stringify(value)
      } catch {
        text = String(value)
      }
    }
  } else {
    text = String(value)
  }
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function isBlankRaw(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (Array.isArray(rec.tags)) return isEmptySchemaValue(normalizeSchemaValue(value))
    return Object.keys(rec).length === 0
  }
  return false
}

function ok(value: unknown, raw: unknown, rawType: AtomicFieldType): AdaptedFieldValue {
  return {
    value,
    incompatible: false,
    raw,
    rawPreview: formatRawValuePreview(raw),
    rawType,
  }
}

function mismatch(raw: unknown, rawType: AtomicFieldType): AdaptedFieldValue {
  return {
    value: undefined,
    incompatible: true,
    raw,
    rawPreview: formatRawValuePreview(raw),
    rawType,
  }
}

function parseCompatibleTimestamp(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (/^\d{10,16}$/.test(trimmed)) {
      const n = Number(trimmed)
      if (Number.isFinite(n) && n > 0) return trimmed.length <= 10 ? n * 1000 : n
    }
    // 仅接受明确的日期/ISO 格式，避免把随意数字/文本误当成日期
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed)) {
      const ms = Date.parse(trimmed)
      if (Number.isFinite(ms) && ms > 0) return ms
    }
  }
  return null
}

/**
 * 读时类型宽容适配：
 * - 无损/可安全解析的跨类型旧值（如 select↔multi-select、数字字符串→number、日期字符串→datetime、任意→string）直接无缝适配；
 * - 真正不兼容的旧值（如文本 "待定" 落入 number/datetime/boolean、多选项落入单选 select）绝不静默清空，
 *   标记 `incompatible: true` 并完整保留 `raw` 与可读预览，供界面提示、复制、改写或切回原类型无损恢复。
 */
export function adaptTagFieldValue(field: FieldSpec | { type?: FieldType }, raw: unknown): AdaptedFieldValue {
  const kind = resolveFieldType(field as FieldSpec)
  if (isBlankRaw(raw)) {
    return { value: raw, incompatible: false, raw, rawPreview: '', rawType: 'string' }
  }
  const rawType = inferPackFieldType(raw)

  if (kind === 'string' || kind === 'file') {
    if (typeof raw === 'string') return ok(raw, raw, rawType)
    if (typeof raw === 'number' || typeof raw === 'boolean') return ok(String(raw), raw, rawType)
    return ok(formatRawValuePreview(raw, 500), raw, rawType)
  }

  if (kind === 'action') return ok(raw, raw, rawType)

  if (kind === 'number') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return ok(raw, raw, rawType)
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (NUMERIC_RE.test(trimmed)) {
        const n = Number(trimmed)
        if (Number.isFinite(n)) return ok(n, raw, rawType)
      }
    }
    return mismatch(raw, rawType)
  }

  if (kind === 'boolean') {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1' || raw === '是') return ok(true, raw, rawType)
    if (raw === false || raw === 'false' || raw === 0 || raw === '0' || raw === '否') return ok(false, raw, rawType)
    return mismatch(raw, rawType)
  }

  if (kind === 'datetime') {
    const ms = parseCompatibleTimestamp(raw)
    if (ms != null) return ok(ms, raw, rawType)
    return mismatch(raw, rawType)
  }

  if (kind === 'select') {
    if (typeof raw === 'string' || typeof raw === 'number') {
      const text = String(raw).trim()
      return text ? ok(text, raw, rawType) : ok('', raw, rawType)
    }
    if (Array.isArray(raw)) {
      const list = raw.map((item) => String(item ?? '').trim()).filter(Boolean)
      if (list.length === 1) return ok(list[0]!, raw, rawType)
      return mismatch(raw, rawType)
    }
    return mismatch(raw, rawType)
  }

  if (kind === 'multi-select') {
    if (Array.isArray(raw)) {
      const allScalar = raw.every((item) => typeof item === 'string' || typeof item === 'number')
      if (allScalar) return ok(raw.map((item) => String(item).trim()).filter(Boolean), raw, rawType)
      return mismatch(raw, rawType)
    }
    if (typeof raw === 'string' || typeof raw === 'number') {
      const list = asStringList(String(raw))
      return list.length ? ok(list, raw, rawType) : mismatch(raw, rawType)
    }
    return mismatch(raw, rawType)
  }

  if (kind === 'url') {
    if (typeof raw === 'string') {
      const href = asHttpHref(raw)
      if (href) return ok(href, raw, rawType)
    }
    return mismatch(raw, rawType)
  }

  if (kind === 'person') {
    const person = asPerson(raw)
    if (person) return ok(person, raw, rawType)
    return mismatch(raw, rawType)
  }

  if (kind === 'image') {
    const srcs = asImageSrcList(raw)
    if (srcs.length) return ok(srcs.length === 1 ? srcs[0] : srcs, raw, rawType)
    return mismatch(raw, rawType)
  }

  if (kind === 'attachment' || kind === 'document') {
    const list = asAttachmentList(raw)
    if (list.length) return ok(list.length === 1 ? list[0] : list, raw, rawType)
    return mismatch(raw, rawType)
  }

  if (kind === 'ref') {
    if (typeof raw === 'string' || typeof raw === 'number') return ok(String(raw).trim(), raw, rawType)
    if (Array.isArray(raw) && raw.length === 1 && (typeof raw[0] === 'string' || typeof raw[0] === 'number')) {
      return ok(String(raw[0]).trim(), raw, rawType)
    }
    return mismatch(raw, rawType)
  }

  if (kind === 'multi-ref') {
    if (Array.isArray(raw) && raw.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return ok([...new Set(raw.map((item) => String(item).trim()).filter(Boolean))], raw, rawType)
    }
    if (typeof raw === 'string' || typeof raw === 'number') {
      return ok(asStringList(String(raw)), raw, rawType)
    }
    return mismatch(raw, rawType)
  }

  if (kind === 'tag') {
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as Record<string, unknown>).tags)) {
      return ok(raw, raw, rawType)
    }
    return mismatch(raw, rawType)
  }

  return ok(raw, raw, rawType)
}

/** 评估从一种字段类型切到另一种字段类型是否可能产生不兼容旧值。 */
export function isLossyFieldTypeChange(from: AtomicFieldType, to: AtomicFieldType): boolean {
  if (from === to) return false
  if (to === 'string') return false
  if (from === 'select' && to === 'multi-select') return false
  if (from === 'ref' && to === 'multi-ref') return false
  if (from === 'number' && to === 'select') return false
  if (from === 'number' && to === 'multi-select') return false
  return true
}
