export { defaultContentSandboxSource, defaultPropSandboxSource } from './record-sandbox-templates.ts'
import { defaultContentSandboxSource, defaultPropSandboxSource } from './record-sandbox-templates.ts'

export const DEFAULT_RECORD_LAYOUT_ID = 'builtin-default'
export const DEFAULT_RECORD_PROP_VIEW_ID = 'table'
/** 属性区只读 JSON 源码。不用插件登记。 */
export const SOURCE_RECORD_PROP_VIEW_ID = 'source'
export const SOURCE_RECORD_PROP_VIEW_LABEL = '源码'
/** 文件系统内置内容模式：不画正文。不用插件登记。 */
export const HIDDEN_CONTENT_VIEW_ID = 'hidden'
export const HIDDEN_CONTENT_VIEW_LABEL = '隐藏'

export type RecordLayoutSort = 'doc' | 'title-asc' | 'title-desc' | 'kind' | 'time-desc' | 'time-asc'
export type RecordLayoutGroup = '' | 'kind' | 'heading'

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
  contentViewId: string
  propViewId: string
  sort: RecordLayoutSort
  filterKinds: string[]
  group?: RecordLayoutGroup
}

const SORTS = new Set<RecordLayoutSort>(['doc', 'title-asc', 'title-desc', 'kind', 'time-desc', 'time-asc'])

export function uniqueViewName(base: string, names: Iterable<string>) {
  const taken = new Set(names)
  const root = String(base ?? '').trim() || '新视图'
  if (root === '新视图') return root
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
    sort: contentViewId === 'chat' ? 'time-desc' : 'doc',
    filterKinds: [],
    group: '',
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

export function recordSandboxSource(fieldKey: 'views' | 'propViews', title = '') {
  return fieldKey === 'propViews' ? defaultPropSandboxSource(title) : defaultContentSandboxSource(title)
}

export function allocateRecordSandbox(
  fieldKey: 'views' | 'propViews',
  recordId: string,
  name: string,
  taken: Iterable<string>,
): RecordSandboxView {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  const prefix = fieldKey === 'propViews' ? 'prop-view' : 'view'
  const rec = String(recordId ?? '').trim() || 'record'
  return {
    id,
    name: uniqueViewName(name, taken),
    kind: 'sandbox',
    file: `${prefix}-${rec}-${id}.jsx`,
    dataFile: `${prefix}-data-${rec}-${id}.json`,
  }
}

export async function seedRecordSandbox(args: {
  fieldKey: 'views' | 'propViews'
  recordId: string
  listed: RecordSandboxView[]
  name?: string
  title?: string
  source?: RecordSandboxView | null
  readFile?: (name: string, fallback: string) => Promise<string>
  writeFile: (name: string, body: string, type: string) => Promise<void>
}): Promise<RecordSandboxView> {
  const title = args.title ?? ''
  const fallback = recordSandboxSource(args.fieldKey, title)
  const view = allocateRecordSandbox(
    args.fieldKey,
    args.recordId,
    args.name?.trim() || '新视图',
    args.listed.map((item) => item.name),
  )
  const jsx = args.source && args.readFile ? await args.readFile(args.source.file, fallback) : fallback
  const data = args.source && args.readFile ? await args.readFile(args.source.dataFile, 'null') : 'null'
  await Promise.all([
    args.writeFile(view.file, jsx, 'text/plain; charset=utf-8'),
    args.writeFile(view.dataFile, data, 'application/json'),
  ])
  return view
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
    const group = rec.group === 'kind' || rec.group === 'heading' ? rec.group : ''
    out.push({
      id,
      name: String(rec.name ?? '').trim() || '新视图',
      contentViewId: String(rec.contentViewId ?? '').trim() || fallbackContent,
      propViewId: String(rec.propViewId ?? '').trim() || DEFAULT_RECORD_PROP_VIEW_ID,
      sort,
      filterKinds,
      ...(group ? { group } : {}),
    })
  }
  return out
}

export function parseRecordLayoutDefaultName(raw: unknown) {
  let list: unknown = raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      list = JSON.parse(raw) as unknown
    } catch {
      return ''
    }
  }
  if (!Array.isArray(list)) return ''
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    if (String(rec.id ?? '').trim() !== DEFAULT_RECORD_LAYOUT_ID) continue
    return String(rec.name ?? '').trim()
  }
  return ''
}

export function listedRecordLayouts(raw: unknown, fallbackContent = 'doc'): RecordLayoutView[] {
  const base = defaultRecordLayout(fallbackContent)
  const name = parseRecordLayoutDefaultName(raw)
  return [{ ...base, ...(name ? { name } : {}) }, ...parseRecordLayouts(raw, fallbackContent)]
}

function sandboxFileBaseName(raw: unknown) {
  return String(raw ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
}

export function recordSandboxFileNames(record: { views?: unknown; propViews?: unknown }): string[] {
  const out: string[] = []
  for (const view of [...parseRecordSandboxes(record.views), ...parseRecordSandboxes(record.propViews)]) {
    for (const raw of [view.file, view.dataFile]) {
      const name = sandboxFileBaseName(raw)
      if (name) out.push(name)
    }
  }
  return out
}
