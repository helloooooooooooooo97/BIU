export type PageViewMode = 'document' | 'outline'

export type PageView = {
  id: string
  name: string
  mode: PageViewMode
  query?: string
  filterLevels?: Array<1 | 2 | 3>
  sort?: 'doc' | 'title'
}

export type PageViewState = {
  views: PageView[]
  activeId: string
}

const KEY = 'fsdb.pageViews'

export const PAGE_VIEW_MODES: { id: PageViewMode; label: string }[] = [
  { id: 'document', label: '正文' },
  { id: 'outline', label: '大纲' },
]

export function defaultPageViews(): PageView[] {
  return [
    { id: 'page-view-document', name: '正文', mode: 'document', sort: 'doc', filterLevels: [1, 2, 3] },
    { id: 'page-view-outline', name: '大纲', mode: 'outline', sort: 'doc', filterLevels: [1, 2, 3] },
  ]
}

export function emptyPageViewState(): PageViewState {
  const views = defaultPageViews()
  return { views, activeId: views[0]!.id }
}

function readAll(): Record<string, PageViewState> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, PageViewState>) : {}
  } catch {
    return {}
  }
}

function writeAll(next: Record<string, PageViewState>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

function normalize(state: PageViewState | undefined): PageViewState {
  const fallback = emptyPageViewState()
  if (!state || !Array.isArray(state.views) || !state.views.length) return fallback
  const views = state.views
    .filter((view) => view && typeof view.id === 'string' && (view.mode === 'document' || view.mode === 'outline'))
    .map((view) => ({
      id: view.id,
      name: String(view.name || (view.mode === 'outline' ? '大纲' : '正文')),
      mode: view.mode,
      query: typeof view.query === 'string' ? view.query : '',
      filterLevels: view.filterLevels?.length ? view.filterLevels : ([1, 2, 3] as Array<1 | 2 | 3>),
      sort: view.sort === 'title' ? 'title' : 'doc',
    }))
  if (!views.length) return fallback
  const activeId = views.some((view) => view.id === state.activeId) ? state.activeId : views[0]!.id
  return { views, activeId }
}

export function readPageViewState(path: string): PageViewState {
  if (!path) return emptyPageViewState()
  return normalize(readAll()[path])
}

export function writePageViewState(path: string, next: PageViewState) {
  if (!path) return
  const all = readAll()
  all[path] = normalize(next)
  writeAll(all)
}

export function newPageViewId() {
  return `page-view-${Date.now().toString(36)}`
}
