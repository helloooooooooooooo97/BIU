export type ColumnPolicy = {
  readable: '*' | Set<string>
  writable: '*' | Set<string>
}

export type ColumnGrantSpec = {
  readableColumns?: string[] | null
  writableColumns?: string[] | null
}

/** 始终保留的记录骨架字段，避免前端表格、链接与时间戳崩溃。 */
const SKELETON_FIELDS = new Set(['id', 'createdAt', 'updatedAt'])

export function fullColumnPolicy(): ColumnPolicy {
  return {
    readable: '*',
    writable: '*',
  }
}

export function parseColumnList(raw: unknown): string[] | null {
  if (raw == null) return null
  if (Array.isArray(raw)) {
    const items = raw.map((item) => String(item ?? '').trim()).filter(Boolean)
    return items.length ? [...new Set(items)] : null
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const items = parsed.map((item) => String(item ?? '').trim()).filter(Boolean)
        return items.length ? [...new Set(items)] : null
      }
    } catch {
      return null
    }
  }
  return null
}

function matchesColumnSet(field: string, set: ReadonlySet<string>): boolean {
  if (set.has(field)) return true
  if (field.startsWith('tag::') && set.has('tag::*')) return true
  return false
}

export function isColumnReadable(field: string, policy: ColumnPolicy): boolean {
  if (SKELETON_FIELDS.has(field)) return true
  if (policy.readable === '*') return true
  return matchesColumnSet(field, policy.readable)
}

export function isColumnWritable(field: string, policy: ColumnPolicy): boolean {
  if (policy.writable === '*') return true
  return matchesColumnSet(field, policy.writable)
}

export function isContentReadable(policy: ColumnPolicy): boolean {
  return isColumnReadable('$content', policy)
}

export function isContentWritable(policy: ColumnPolicy): boolean {
  return isColumnWritable('$content', policy)
}

/**
 * 合并同一条记录命中的多条列级策略：
 * - readable 取并集（任意一条为 '*' 则为 '*'）
 * - writable 取并集（任意一条为 '*' 则为 '*'）
 */
export function mergeColumnPolicies(policies: ColumnPolicy[]): ColumnPolicy {
  if (!policies.length) return fullColumnPolicy()
  let readable: '*' | Set<string> = new Set<string>()
  let writable: '*' | Set<string> = new Set<string>()
  for (const policy of policies) {
    if (policy.readable === '*') {
      readable = '*'
    } else if (readable !== '*') {
      for (const col of policy.readable) readable.add(col)
    }
    if (policy.writable === '*') {
      writable = '*'
    } else if (writable !== '*') {
      for (const col of policy.writable) writable.add(col)
    }
  }
  return { readable, writable }
}

/** 后端真裁剪：从记录对象中移除不可读字段。 */
export function projectRecordColumns<T extends Record<string, unknown>>(record: T, policy: ColumnPolicy): T {
  if (policy.readable === '*') return record
  const projected: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (isColumnReadable(key, policy)) projected[key] = value
  }
  return projected as T
}

/** 写入列级守卫：逐字段校验 patch 中的 key 是否允许写入。 */
export function assertWritableColumns(patch: Record<string, unknown>, policy: ColumnPolicy): void {
  if (policy.writable === '*') return
  for (const key of Object.keys(patch)) {
    if (!isColumnWritable(key, policy)) {
      throw new Error(`permission denied: FIELD_FORBIDDEN (${key})`)
    }
  }
}
