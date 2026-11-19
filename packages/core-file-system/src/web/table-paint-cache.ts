export type RowStampEntry = { keys: string[]; vals: unknown[]; body: string }

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
