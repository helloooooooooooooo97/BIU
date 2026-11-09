export const PAGE_DEFAULT_LAYOUT_ID = 'builtin-default'

export type PageLayoutSort = 'doc' | 'title-asc' | 'title-desc' | 'kind'

export type PageLayoutView = {
  id: string
  name: string
  builtin?: boolean
  contentViewId: string
  propViewId: string
  sort: PageLayoutSort
  filterKinds: string[]
}

const SORTS = new Set<PageLayoutSort>(['doc', 'title-asc', 'title-desc', 'kind'])

export function layoutsAssetName(pageId: string) {
  return `page-layouts-${String(pageId ?? '').trim()}.json`
}

export function defaultPageLayout(): PageLayoutView {
  return {
    id: PAGE_DEFAULT_LAYOUT_ID,
    name: '默认',
    builtin: true,
    contentViewId: 'doc',
    propViewId: 'table',
    sort: 'doc',
    filterKinds: [],
  }
}

export function parsePageLayouts(raw: unknown): PageLayoutView[] {
  let list: unknown = raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      list = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: PageLayoutView[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    const id = String(rec.id ?? '').trim()
    if (!id || id === PAGE_DEFAULT_LAYOUT_ID || seen.has(id)) continue
    seen.add(id)
    const sort = SORTS.has(rec.sort as PageLayoutSort) ? (rec.sort as PageLayoutSort) : 'doc'
    const filterKinds = Array.isArray(rec.filterKinds)
      ? rec.filterKinds.map((kind) => String(kind ?? '').trim()).filter(Boolean)
      : []
    out.push({
      id,
      name: String(rec.name ?? '').trim() || '新视图',
      contentViewId: String(rec.contentViewId ?? '').trim() || 'doc',
      propViewId: String(rec.propViewId ?? '').trim() || 'table',
      sort,
      filterKinds,
    })
  }
  return out
}

export function listedPageLayouts(raw: unknown): PageLayoutView[] {
  return [defaultPageLayout(), ...parsePageLayouts(raw)]
}
