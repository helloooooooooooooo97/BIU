export const DEFAULT_RECORD_LAYOUT_ID = 'builtin-default'
export const DEFAULT_RECORD_PROP_VIEW_ID = 'table'

export type RecordLayoutSort = 'doc' | 'title-asc' | 'title-desc' | 'kind'

export type RecordSandboxView = {
  id: string
  name: string
  kind: 'sandbox'
  file: string
  dataFile: string
}

export type RecordLayoutView = {
  id: string
  name: string
  builtin?: boolean
  kind?: 'sandbox'
  file?: string
  dataFile?: string
  contentViewId: string
  propViewId: string
  sort: RecordLayoutSort
  filterKinds: string[]
}

const SORTS = new Set<RecordLayoutSort>(['doc', 'title-asc', 'title-desc', 'kind'])

export function uniqueViewName(base: string, names: Iterable<string>) {
  const taken = new Set(names)
  const root = String(base ?? '').trim() || '新视图'
  if (!taken.has(root)) return root
  let n = 2
  while (taken.has(`${root} ${n}`)) n += 1
  return `${root} ${n}`
}

export function defaultRecordLayout(contentViewId = 'doc'): RecordLayoutView {
  return {
    id: DEFAULT_RECORD_LAYOUT_ID,
    name: '默认视图',
    builtin: true,
    contentViewId,
    propViewId: DEFAULT_RECORD_PROP_VIEW_ID,
    sort: 'doc',
    filterKinds: [],
  }
}

export function parseRecordSandboxes(raw: unknown, fallbackName = '新视图'): RecordSandboxView[] {
  let list: unknown = raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      list = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: RecordSandboxView[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    const id = String(rec.id ?? '').trim()
    const file = String(rec.file ?? '').trim()
    if (!id || seen.has(id) || !file) continue
    seen.add(id)
    out.push({
      id,
      name: String(rec.name ?? '').trim() || fallbackName,
      kind: 'sandbox',
      file,
      dataFile: String(rec.dataFile ?? '').trim() || `view-data-${id}.json`,
    })
  }
  return out
}

export function parseRecordLayouts(raw: unknown, fallbackContent = 'doc'): RecordLayoutView[] {
  let list: unknown = raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      list = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: RecordLayoutView[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    const id = String(rec.id ?? '').trim()
    if (!id || id === DEFAULT_RECORD_LAYOUT_ID || seen.has(id)) continue
    seen.add(id)
    const sort = SORTS.has(rec.sort as RecordLayoutSort) ? (rec.sort as RecordLayoutSort) : 'doc'
    const filterKinds = Array.isArray(rec.filterKinds)
      ? rec.filterKinds.map((kind) => String(kind ?? '').trim()).filter(Boolean)
      : []
    const file = String(rec.file ?? '').trim()
    const sandbox = rec.kind === 'sandbox' && Boolean(file)
    out.push({
      id,
      name: String(rec.name ?? '').trim() || '新视图',
      ...(sandbox ? { kind: 'sandbox' as const, file, dataFile: String(rec.dataFile ?? '').trim() || `layout-data-${id}.json` } : {}),
      contentViewId: String(rec.contentViewId ?? '').trim() || fallbackContent,
      propViewId: String(rec.propViewId ?? '').trim() || DEFAULT_RECORD_PROP_VIEW_ID,
      sort,
      filterKinds,
    })
  }
  return out
}

export function listedRecordLayouts(raw: unknown, fallbackContent = 'doc'): RecordLayoutView[] {
  return [defaultRecordLayout(fallbackContent), ...parseRecordLayouts(raw, fallbackContent)]
}
