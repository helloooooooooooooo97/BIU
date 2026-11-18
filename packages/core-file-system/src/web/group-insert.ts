import type { CollectionSchema, CollectionSchemaPack, DbRecord } from '@biu/type-file-system'
import { groupRecords, groupRowBucketKeys, type GroupBucket } from './fields.ts'

const SHARE_SCOPE_ORDER = ['私人', '空间', '共享']

export function createdRowGroupKey(
  row: DbRecord,
  groupBy: string,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  if (!groupBy) return ''
  return groupRowBucketKeys(row, groupBy, schema, packs)[0] ?? ''
}

export function placeCreatedRow(
  groups: GroupBucket[],
  row: DbRecord,
  groupBy: string,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
  parentId = '',
) {
  if (!groupBy) return groups
  const parentKey = String(parentId ?? '').trim()
  if (parentKey) {
    const parentIndex = groups.findIndex((group) =>
      group.rows.some((item) => String(item.id) === parentKey || String(item.sourceId ?? '') === parentKey),
    )
    if (parentIndex >= 0) {
      if (groups[parentIndex].rows.some((item) => item.id === row.id)) return groups
      return groups.map((group, i) =>
        i !== parentIndex
          ? group
          : {
              ...group,
              rows: [row, ...group.rows],
              total: group.total != null ? group.total + 1 : group.rows.length + 1,
            },
      )
    }
  }
  // One record can belong to several groups; insert once in each matching bucket.
  const labels = new Map(groupRecords([row], schema, groupBy, packs).map(group => [group.key, group.label]))
  const memberships = [...new Set(groupRowBucketKeys(row, groupBy, schema, packs))]
  let next = groups
  for (const key of memberships) {
    const index = next.findIndex((group) => group.key === key)
    if (index >= 0) {
      if (next[index].rows.some((item) => item.id === row.id)) continue
      next = next.map((group, i) => i !== index ? group : {
        ...group, rows: [row, ...group.rows], total: (group.total ?? group.rows.length) + 1,
      })
      continue
    }
    const bucket: GroupBucket = { key, label: labels.get(key) ?? (key || '未填'), rows: [row], total: 1 }
    if (groupBy === 'shareScope') {
      const order = SHARE_SCOPE_ORDER.indexOf(key)
      const insertAt = order < 0 ? next.length : next.findIndex((group) => SHARE_SCOPE_ORDER.indexOf(group.key) > order)
      const at = insertAt < 0 ? next.length : insertAt
      next = [...next.slice(0, at), bucket, ...next.slice(at)]
      continue
    }
    next = [bucket, ...next]
  }
  return next
}

