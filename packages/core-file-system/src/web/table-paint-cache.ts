export type RowStampEntry = { keys: string[]; vals: unknown[]; body: string }

export type CellStampEntry<T = unknown> = {
  /** Fallback row-level stamp for composite/custom columns */
  rowStamp?: string
  /** Per-cell value reference (fast path for single-field columns) */
  value?: unknown
  /** Serialized value when value is a non-null object/array */
  valueJson?: string
  /** Row-level structural metadata (tree depth/fold/emoji/icon) */
  meta: string
  element: T
}

/** Compute whether a cached cell can be reused for (row, colKey) without invalidating untouched columns. */
export function isCellStampSame<T>(
  cached: CellStampEntry<T> | undefined,
  row: Record<string, unknown>,
  colKey: string,
  meta: string,
  rowStamp: string,
  composite: boolean,
): boolean {
  if (!cached || cached.meta !== meta) return false
  if (composite) return cached.rowStamp === rowStamp
  const nextVal = row[colKey]
  if (Object.is(cached.value, nextVal)) return true
  if (nextVal !== null && typeof nextVal === 'object' && cached.valueJson !== undefined) {
    return JSON.stringify(nextVal) === cached.valueJson
  }
  return false
}

export function makeCellStampEntry<T>(
  row: Record<string, unknown>,
  colKey: string,
  meta: string,
  rowStamp: string,
  composite: boolean,
  element: T,
): CellStampEntry<T> {
  if (composite) {
    return { rowStamp, meta, element }
  }
  const value = row[colKey]
  const valueJson = value !== null && typeof value === 'object' ? JSON.stringify(value) : undefined
  return { value, valueJson, meta, element }
}

/** 行对象换成新的、字段值还是同一批引用时，不再 JSON.stringify。 */
export function reuseRowStamp(
  cache: Map<string, RowStampEntry>,
  id: string,
  row: Record<string, unknown>,
) {
  const keys = Object.keys(row)
  const prev = cache.get(id)
  if (prev && prev.keys.length === keys.length) {
    let same = true
    for (let i = 0; i < keys.length; i += 1) {
      if (prev.keys[i] !== keys[i] || prev.vals[i] !== row[keys[i]!]) {
        same = false
        break
      }
    }
    if (same) return { body: prev.body, fresh: false }
  }
  const body = JSON.stringify(row)
  cache.set(id, { keys, vals: keys.map((key) => row[key]), body })
  return { body, fresh: true }
}

/** 不在当前行窗口或列窗口里的格子马上丢掉。 */
export function evictCellCache(cache: Map<string, unknown>, rows: Set<string>, cols: Set<string>) {
  let removed = 0
  for (const key of cache.keys()) {
    const sep = key.indexOf('\0')
    const row = sep === -1 ? key : key.slice(0, sep)
    const col = sep === -1 ? '' : key.slice(sep + 1)
    if (!rows.has(row) || !cols.has(col)) {
      cache.delete(key)
      removed += 1
    }
  }
  return removed
}
