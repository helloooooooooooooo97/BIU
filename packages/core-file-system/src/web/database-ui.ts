import { Service, type Context } from 'cordis'
import type {
  CollectionChrome,
  CollectionRowViewType,
  CollectionViewType,
  DatabaseUi,
  FsDetailTools,
  FsRecordContentView,
} from '@biu/type-file-system/ui'
import { DEFAULT_CHROME_PATH } from '@biu/type-file-system/ui'
import { normalizeCollectionPath } from '../paths.ts'

export { normalizeCollectionPath, DEFAULT_CHROME_PATH }

export const ALL_ROW_VIEWS_PATH = '*'

function mergeChrome(layers: CollectionChrome[]): CollectionChrome {
  const cells: CollectionChrome['cells'] = {}
  let Action: CollectionChrome['Action']
  let Actions: CollectionChrome['Actions']
  let DetailTools: CollectionChrome['DetailTools']
  let DetailBar: CollectionChrome['DetailBar']
  let Properties: CollectionChrome['Properties']
  let Icon: CollectionChrome['Icon']
  let Title: CollectionChrome['Title']
  let Board: CollectionChrome['Board']
  let Content: CollectionChrome['Content']
  let openRow: CollectionChrome['openRow']
  let listViews: CollectionChrome['listViews']
  let lockedFiltersFromSearch: CollectionChrome['lockedFiltersFromSearch']
  const panes: NonNullable<CollectionChrome['panes']> = []
  for (const layer of layers) {
    Object.assign(cells, layer.cells)
    if (layer.Action) Action = layer.Action
    if (layer.Actions) Actions = layer.Actions
    if (layer.DetailTools) DetailTools = layer.DetailTools
    if (layer.DetailBar) DetailBar = layer.DetailBar
    if (layer.Properties) Properties = layer.Properties
    if (layer.Icon) Icon = layer.Icon
    if (layer.Title) Title = layer.Title
    if (layer.Board) Board = layer.Board
    if (layer.Content) Content = layer.Content
    if (layer.openRow) openRow = layer.openRow
    if (layer.listViews) listViews = layer.listViews
    if (layer.lockedFiltersFromSearch) lockedFiltersFromSearch = layer.lockedFiltersFromSearch
    if (layer.panes?.length) {
      for (const pane of layer.panes) {
        const i = panes.findIndex((item) => item.id === pane.id)
        if (i >= 0) panes[i] = pane
        else panes.push(pane)
      }
    }
  }
  return { cells, Action, Actions, DetailTools, DetailBar, Properties, Icon, Title, Board, Content, panes: panes.length ? panes : undefined, openRow, listViews, lockedFiltersFromSearch }
}

function mergeViews<T extends { id: string }>(layers: T[], excludedId?: string): T[] {
  const byId = new Map<string, T>()
  for (const view of layers) {
    if (!view.id || view.id === excludedId) continue
    byId.set(view.id, view)
  }
  return [...byId.values()]
}

function mergeDetailTools(layers: FsDetailTools[]): FsDetailTools {
  const out: FsDetailTools = {}
  for (const layer of layers) {
    if (layer.Search) out.Search = layer.Search
    if (layer.sorts) out.sorts = layer.sorts
    if (layer.filters) out.filters = layer.filters
    if (layer.filterAllLabel) out.filterAllLabel = layer.filterAllLabel
  }
  return out
}

function rowViewScope(path: string) {
  const raw = String(path ?? '').trim()
  if (!raw || raw === ALL_ROW_VIEWS_PATH) return ALL_ROW_VIEWS_PATH
  return normalizeCollectionPath(raw)
}

class RegistrationLayers<T> {
  private entries = new Map<string, Array<{ value: T }>>()

  get(key: string) {
    return this.entries.get(key)?.map((entry) => entry.value)
  }

  add(key: string, value: T) {
    const entry = { value }
    this.entries.set(key, [...(this.entries.get(key) ?? []), entry])
    return () => {
      const current = this.entries.get(key)
      if (!current?.includes(entry)) return false
      const next = current.filter((item) => item !== entry)
      if (next.length) this.entries.set(key, next)
      else this.entries.delete(key)
      return true
    }
  }
}

let boundDatabaseUi: DatabaseUiService | undefined

export function getDatabaseUi() {
  return boundDatabaseUi
}

export function recordContentFallback(collectionPath: string) {
  const id = getDatabaseUi()?.contentViews(collectionPath)[0]?.id
  return String(id ?? '').trim() || 'doc'
}

export class DatabaseUiService extends Service implements DatabaseUi {
  private layers = new RegistrationLayers<CollectionChrome>()
  private viewLayers = new RegistrationLayers<CollectionViewType>()
  private rowLayers = new RegistrationLayers<CollectionRowViewType>()
  private contentLayers = new RegistrationLayers<FsRecordContentView>()
  private toolLayers = new RegistrationLayers<FsDetailTools>()
  private snapshot = new Map<string, CollectionChrome>()
  private viewSnapshot = new Map<string, CollectionViewType[]>()
  private rowSnapshot = new Map<string, CollectionRowViewType[]>()
  private contentSnapshot = new Map<string, FsRecordContentView[]>()
  private toolSnapshot = new Map<string, FsDetailTools>()
  private listeners = new Set<() => void>()

  constructor(ctx: Context) {
    super(ctx, 'databaseUi')
    boundDatabaseUi = this
  }

  private registerLayer<T>(layers: RegistrationLayers<T>, key: string, value: T) {
    const remove = layers.add(key, value)
    this.emit()
    return { dispose: () => { if (remove()) this.emit() } }
  }

  decorate(path: string, chrome: CollectionChrome) {
    return this.registerLayer(this.layers, normalizeCollectionPath(path), chrome)
  }

  registerView(path: string, view: CollectionViewType) {
    return this.registerLayer(this.viewLayers, normalizeCollectionPath(path), view)
  }

  registerRowView(path: string, view: CollectionRowViewType) {
    return this.registerLayer(this.rowLayers, rowViewScope(path), view)
  }

  registerContentView(path: string, view: FsRecordContentView) {
    return this.registerLayer(this.contentLayers, normalizeCollectionPath(path), view)
  }

  registerDetailTools(path: string, tools: FsDetailTools) {
    return this.registerLayer(this.toolLayers, normalizeCollectionPath(path), tools)
  }

  chrome(path: string): CollectionChrome {
    const key = normalizeCollectionPath(path)
    const cached = this.snapshot.get(key)
    if (cached) return cached
    const defaults = key === DEFAULT_CHROME_PATH ? [] : (this.layers.get(DEFAULT_CHROME_PATH) ?? [])
    const merged = mergeChrome([...defaults, ...(this.layers.get(key) ?? [])])
    this.snapshot.set(key, merged)
    return merged
  }

  views(path: string): CollectionViewType[] {
    const key = normalizeCollectionPath(path)
    const cached = this.viewSnapshot.get(key)
    if (cached) return cached
    const merged = mergeViews(this.viewLayers.get(key) ?? [])
    this.viewSnapshot.set(key, merged)
    return merged
  }

  rowViews(path: string): CollectionRowViewType[] {
    const key = normalizeCollectionPath(path)
    const cached = this.rowSnapshot.get(key)
    if (cached) return cached
    const merged = mergeViews([...(this.rowLayers.get(ALL_ROW_VIEWS_PATH) ?? []), ...(this.rowLayers.get(key) ?? [])])
    this.rowSnapshot.set(key, merged)
    return merged
  }

  contentViews(path: string): FsRecordContentView[] {
    const key = normalizeCollectionPath(path)
    const cached = this.contentSnapshot.get(key)
    if (cached) return cached
    const own = this.contentLayers.get(key)
    const layers = own?.length ? own : key === DEFAULT_CHROME_PATH ? [] : (this.contentLayers.get(DEFAULT_CHROME_PATH) ?? [])
    const merged = mergeViews(layers, 'hidden')
    this.contentSnapshot.set(key, merged)
    return merged
  }

  detailTools(path: string): FsDetailTools {
    const key = normalizeCollectionPath(path)
    const cached = this.toolSnapshot.get(key)
    if (cached) return cached
    const ownContent = Boolean(this.contentLayers.get(key)?.length)
    const layers = ownContent
      ? (this.toolLayers.get(key) ?? [])
      : key === DEFAULT_CHROME_PATH
        ? (this.toolLayers.get(key) ?? [])
        : [...(this.toolLayers.get(DEFAULT_CHROME_PATH) ?? []), ...(this.toolLayers.get(key) ?? [])]
    const merged = mergeDetailTools(layers)
    this.toolSnapshot.set(key, merged)
    return merged
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  refresh() {
    this.emit()
  }

  private emit() {
    this.snapshot.clear()
    this.viewSnapshot.clear()
    this.rowSnapshot.clear()
    this.contentSnapshot.clear()
    this.toolSnapshot.clear()
    for (const fn of this.listeners) fn()
  }
}
