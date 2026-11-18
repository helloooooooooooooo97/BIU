import { asPersonList, normalizeSchemaValue, personKey, type CollectionSchema, type CollectionSchemaPack, type DbRecord } from '@biu/type-file-system'
import { parseTagFlatColumnKey, readTagFieldValue } from '../query-logic.ts'
import { resolveGroupField, strategyForField } from './group-strategies.ts'

/** Seed the actual writable field, including the tag bag for custom attributes. */
export function seedGroupRecord(base: Record<string, unknown>, groupBy: string, key: string,
  schema?: CollectionSchema, packs: CollectionSchemaPack[] = [], sample?: DbRecord,
): Record<string, unknown> | null {
  const group = resolveGroupField(schema, groupBy, packs)
  if (!group) return null
  const custom = parseTagFlatColumnKey(group.key)
  if (group.field.computed || (custom ? group.field.writable === false || schema?.fields.tag?.writable === false : !group.field.writable)) return null
  const strategy = strategyForField(group.field)
  if (!strategy) return null
  const ctx = { fieldKey: group.key, groupBy, field: group.field, packs }
  const kind = strategy.kind
  let value: unknown = key
  if (!key) {
    if (kind === 'boolean') return null // Boolean writes coerce empty values to false.
    value = ['multi-select', 'multi-ref'].includes(kind) ? [] : kind === 'tag' ? { tags: [], values: {} } : null
  } else if (kind === 'multi-select' || kind === 'multi-ref') value = [key]
  else if (kind === 'tag') value = { tags: [key], values: {} }
  else if (kind === 'boolean') value = key === 'true'
  else if (kind === 'person') {
    const people = asPersonList(sample && readTagFieldValue(sample, group.key)).filter(person => personKey(person) === key)
    if (!people.length) return null
    value = group.field.multiple ? people : people[0]
  } else if (kind === 'number' || kind === 'datetime') {
    const filters = strategy.filter(key, ctx)
    const tree = filters.$tree as { children?: Array<{ op: string; value: string }> } | undefined
    const lower = tree?.children?.find(rule => rule.op === 'gt')
    if (!lower) return null
    value = Number(lower.value) + 1
  }
  const out = { ...base }
  if (custom) {
    const tag = normalizeSchemaValue(out.tag)
    out.tag = { tags: [...new Set([...tag.tags, custom.packId])], values: {
      ...tag.values, [custom.packId]: { ...tag.values[custom.packId], [custom.fieldKey]: value },
    } }
  } else out[group.key] = value
  return out
}
