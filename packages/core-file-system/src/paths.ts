/** 集合路径：补前导斜杠、去掉尾斜杠。host 与 web 共用。 */
export function normalizeCollectionPath(path: string) {
  const raw = String(path || '/').trim() || '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  if (withSlash === '/') return '/'
  return withSlash.replace(/\/+$/, '') || '/'
}

export type DatabaseReveal = {
  collection: string
  recordId?: string
  viewId?: string
}

function resultPathOf(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ''
  const path = (result as { path?: unknown }).path
  return typeof path === 'string' ? path : ''
}

/** 工具路径：根目录不算；/<表> 切表，/<表>/<id> 切到该行。 */
export function databaseRevealFromPath(path: string): DatabaseReveal | null {
  const normalized = normalizeCollectionPath(path)
  if (normalized === '/') return null
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length) return null
  const collection = `/${parts[0]}`
  const recordId = parts[1]
  return recordId ? { collection, recordId } : { collection }
}

/** 删除后记录没了只切表；创建/读取可跟结果 path。新建视图切到来源表的该视图。 */
export function databaseRevealForTool(opts: {
  path: string
  result?: unknown
  dropRecord?: boolean
}): DatabaseReveal | null {
  if (opts.dropRecord) {
    const fromPath = databaseRevealFromPath(opts.path)
    return fromPath ? { collection: fromPath.collection } : null
  }
  const fromView = revealFromSavedViewRow(opts.result)
  if (fromView) return fromView
  return databaseRevealFromPath(resultPathOf(opts.result) || opts.path)
}

function viewRowFromResult(result: unknown): { tablePath?: unknown; viewId?: unknown } | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const rec = result as { kind?: unknown; items?: unknown; value?: unknown }
  if (rec.kind === 'created') {
    const items = rec.items
    if (!Array.isArray(items) || !items.length) return null
    const first = items[0]
    if (!first || typeof first !== 'object' || Array.isArray(first)) return null
    const value = (first as { value?: unknown }).value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as { tablePath?: unknown; viewId?: unknown }
  }
  if (rec.kind === 'record') {
    const value = rec.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as { tablePath?: unknown; viewId?: unknown }
  }
  return null
}

/** /views 行属于来源表；通知 tablePath 上的那条视图，而不是 /views 自己。 */
function revealFromSavedViewRow(result: unknown): DatabaseReveal | null {
  const row = viewRowFromResult(result)
  if (!row) return null
  const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
  const viewId = String(row.viewId ?? '').trim()
  if (!collection || collection === '/' || collection === '/views' || !viewId) return null
  return { collection, viewId }
}
