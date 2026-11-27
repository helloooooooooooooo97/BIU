import { lazy, memo, Suspense, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentType } from 'react'
import { CircleStackIcon, XMarkIcon } from '@heroicons/react/16/solid'
import type { SlotProps } from '@biu/types/slots'
import { FSDB_CHANGE_EVENT, fsdbChangeHitsPane, parseFsdbChange, type CollectionInfo, type DbRecord } from '@biu/type-file-system'
import { FSDB_CRUMB_LABELS_EVENT, INSPECTOR_CAPTION_EVENT, onFsdbEvent } from './fsdb-events.ts'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { parseAppPath } from '@biu/web-session-view'
import { buildCrumbs, crumbHotkeyPane, crumbParentHotkey, parentCrumbTarget, pathForCrumbTarget, type Crumb, type CrumbTarget } from './sidebar-nav.ts'
import { CrumbTrail } from './crumb-trail.tsx'
import { defaultViewId, loadRecords, loadViews, peekRecord, rememberRecords, subscribeCrumbs, viewForPath } from './view-storage.ts'
import { readJson } from './db-client.ts'
import { displayNameForView, stampRecordId, stampRowOpenTarget } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH, DATA_MODULE, DATA_MODULE_ID, databaseAllViewPath, databaseRecordPath, databaseViewPath } from './database-path.ts'
import { subscribeViaDataCrumbs, viaDataCrumbsOn, viaDataViewId } from './data-chrome.ts'
import {
  getInspectorDbPath,
  isInspectorAgentWorking,
  isInspectorPaneAbandoned,
  setInspectorDbPath,
  subscribeInspectorAgentWorking,
  subscribeInspectorDbPath,
} from './inspector-db-route.ts'
import { getDatabaseUi } from './database-ui.ts'
import { TableGlyph } from './nav-glyphs.tsx'
import { paintCollectionViews, viewsForRegisteredCollection } from './collection-nav.ts'
import { ensureFsdbStyle } from './fsdb-style.ts'

const CollectionBrowser = lazy(() => import('./browser.tsx').then((m) => ({ default: m.CollectionBrowser })))
const DataOverview = lazy(() => import('./data-overview.tsx').then((m) => ({ default: m.DataOverview })))

if (typeof window !== 'undefined') ensureFsdbStyle()

const tabIcons = new Map<string, ComponentType<{ className?: string }>>()
const hydratedTabRecords = new Set<string>()

export function collectionTabIcon(icon?: string) {
  const key = icon ?? ''
  const cached = tabIcons.get(key)
  if (cached) return cached
  function Icon({ className }: { className?: string }) {
    return <TableGlyph icon={icon} className={className ?? 'size-4'} />
  }
  tabIcons.set(key, Icon)
  return Icon
}

const EMPTY_CHROME: CollectionChrome = {}
const EMPTY_FILTERS: Record<string, string> = {}

type InspectorSnapshot = {
  subscribe: (fn: () => void) => () => void
  get: () => { collections?: CollectionInfo[] }
}

let snapshotRef: InspectorSnapshot | undefined

export function bindInspectorSnapshot(source: InspectorSnapshot) {
  snapshotRef = source
}

function subscribeInspectorSnapshot(fn: () => void) {
  if (!snapshotRef) return () => undefined
  return snapshotRef.subscribe(fn)
}

function readInspectorCollections() {
  return (snapshotRef?.get().collections ?? []) as CollectionInfo[]
}

function useInspectorCollections() {
  return useSyncExternalStore(subscribeInspectorSnapshot, readInspectorCollections, () => [] as CollectionInfo[])
}

let viewTick = 0

type ViewTickSub = {
  collectionPath: string
  recordId: string
  notify: () => void
}

const viewTickSubs = new Set<ViewTickSub>()
let uninstallViewTickHub: (() => void) | null = null

function dispatchViewTick(event?: Event) {
  const change = event && event.type === FSDB_CHANGE_EVENT ? parseFsdbChange(event) : null
  let bumped = false
  for (const sub of viewTickSubs) {
    if (change && !fsdbChangeHitsPane(change, sub.collectionPath, sub.recordId)) continue
    if (!bumped) {
      viewTick += 1
      bumped = true
    }
    sub.notify()
  }
}

function ensureViewTickHub() {
  if (uninstallViewTickHub || typeof window === 'undefined') return
  const onEvent = (event: Event) => dispatchViewTick(event)
  const onCrumb = () => dispatchViewTick()
  window.addEventListener(FSDB_CHANGE_EVENT, onEvent)
  const stopCrumbEvent = onFsdbEvent(FSDB_CRUMB_LABELS_EVENT, (_detail, event) => dispatchViewTick(event))
  window.addEventListener('storage', onEvent)
  const stopCrumbs = subscribeCrumbs(onCrumb)
  uninstallViewTickHub = () => {
    window.removeEventListener(FSDB_CHANGE_EVENT, onEvent)
    stopCrumbEvent()
    window.removeEventListener('storage', onEvent)
    stopCrumbs()
    uninstallViewTickHub = null
  }
}

function tableLabel(table: CollectionInfo) {
  return table.view?.title ?? table.label ?? table.path.replace(/^\//, '')
}

function useViewTick(collectionPath = '', recordId = '') {
  return useSyncExternalStore(
    (fn) => {
      const sub: ViewTickSub = { collectionPath, recordId, notify: fn }
      viewTickSubs.add(sub)
      ensureViewTickHub()
      return () => {
        viewTickSubs.delete(sub)
        if (!viewTickSubs.size) uninstallViewTickHub?.()
      }
    },
    () => viewTick,
    () => 0,
  )
}

function useInspectorDbPath(paneId: string) {
  return useSyncExternalStore(
    subscribeInspectorDbPath,
    () => getInspectorDbPath(paneId),
    () => '',
  )
}

function defaultInspectorDbPath(tables: CollectionInfo[], seedCollection?: string) {
  const seeded = seedCollection ? tables.find((item) => item.path === seedCollection) : undefined
  const first = seeded ?? tables[0]
  if (!first?.path) return ''
  return databaseViewPath(first.path, defaultViewId(first.path))
}

function useBindInspectorDbPath(paneId: string, tables: CollectionInfo[], seedCollection?: string) {
  const inspectorPath = useInspectorDbPath(paneId)
  useEffect(() => {
    if (inspectorPath) return
    if (isInspectorPaneAbandoned(paneId)) return
    const fallback = defaultInspectorDbPath(tables, seedCollection)
    if (fallback) setInspectorDbPath(paneId, fallback)
  }, [inspectorPath, paneId, seedCollection, tables])
  if (isInspectorPaneAbandoned(paneId)) return inspectorPath
  return inspectorPath || defaultInspectorDbPath(tables, seedCollection)
}

function useInspectorAgentWorking(collection: string) {
  return useSyncExternalStore(
    subscribeInspectorAgentWorking,
    () => isInspectorAgentWorking(collection),
    () => false,
  )
}

function paneOf(props: { paneId?: unknown }) {
  return String(props.paneId || 'database')
}

function seedOf(props: { seedCollection?: unknown }) {
  return typeof props.seedCollection === 'string' ? props.seedCollection : ''
}

function splitHref(href: string) {
  const cut = href.indexOf('?')
  if (cut < 0) return { pathname: href, search: '' }
  return { pathname: href.slice(0, cut), search: href.slice(cut) }
}

function hrefForInspectorCrumb(target: CrumbTarget) {
  if (target.kind === 'record' && viaDataCrumbsOn()) {
    const stamp = stampRowOpenTarget({ id: target.recordId, tablePath: target.collection })
    if (stamp) return databaseRecordPath(stamp.collection, stamp.recordId)
  }
  return pathForCrumbTarget(target)
}

function crumbsForRoute(
  href: string,
  tables: CollectionInfo[],
  viaData = false,
  lightweight = false,
): { crumbs: Crumb[]; collection: string; viewId?: string; recordId?: string } {
  const pathname = href.split('?')[0] || href
  const parsed = parseAppPath(pathname, [DATA_MODULE])
  const collection = parsed.kind === 'collection-view' || parsed.kind === 'record' ? parsed.collection : ''
  const table = tables.find((item) => item.path === collection)
  const urlViewId =
    parsed.kind === 'collection-view' || parsed.kind === 'record' ? parsed.viewId : undefined
  const recordId = parsed.kind === 'record' ? parsed.recordId : undefined
  const resolvedView = collection ? viewForPath(collection, urlViewId) : null
  const activeViewId = resolvedView?.id ?? urlViewId
  if (lightweight) {
    const recordHit = recordId
      ? peekRecord(collection, recordId) ?? loadRecords(collection, activeViewId).find((row) => row.id === recordId)
      : undefined
    const crumbs = buildCrumbs({
      collection: viaData && collection && collection !== DATA_COLLECTION_PATH && recordId ? DATA_COLLECTION_PATH : collection,
      collectionLabel:
        viaData && collection && collection !== DATA_COLLECTION_PATH && recordId
          ? '数据'
          : table
            ? tableLabel(table)
            : collection,
      tables: table ? [{ path: table.path, label: tableLabel(table), icon: table.view?.icon }] : [],
      viewId:
        viaData && collection && collection !== DATA_COLLECTION_PATH && recordId
          ? viaDataViewId()
          : collection
            ? activeViewId
            : undefined,
      viewName:
        viaData && collection && collection !== DATA_COLLECTION_PATH && recordId
          ? displayNameForView(
              viaDataViewId(),
              { path: DATA_COLLECTION_PATH, label: '数据', view: { title: '数据' } },
              viewForPath(DATA_COLLECTION_PATH, viaDataViewId())?.name,
            )
          : resolvedView?.name,
      views: resolvedView ? [{ id: resolvedView.id, name: resolvedView.name, mode: resolvedView.mode }] : [],
      recordId:
        viaData && collection && collection !== DATA_COLLECTION_PATH && recordId
          ? stampRecordId(collection, recordId)
          : recordId,
      recordLabel: recordHit?.label,
      records: recordHit ? [recordHit] : [],
    })
    return { crumbs, collection, viewId: activeViewId, recordId }
  }
  const stored = collection ? loadViews(collection) : []
  const views = collection ? paintCollectionViews(collection, tables, stored) : []
  const listed = collection ? loadRecords(collection, activeViewId) : []
  const recordHit =
    recordId ? listed.find((row) => row.id === recordId) ?? peekRecord(collection, recordId) : undefined
  const records =
    recordId && recordHit && !listed.some((row) => row.id === recordId) ? [...listed, recordHit] : listed
  const crumbs = viaData && collection && collection !== DATA_COLLECTION_PATH && recordId
    ? buildCrumbs({
        collection: DATA_COLLECTION_PATH,
        collectionLabel: '数据',
        tables: tables.map((item) => ({ path: item.path, label: tableLabel(item), icon: item.view?.icon })),
        viewId: viaDataViewId(),
        viewName: displayNameForView(
          viaDataViewId(),
          { path: DATA_COLLECTION_PATH, label: '数据', view: { title: '数据' } },
          viewForPath(DATA_COLLECTION_PATH, viaDataViewId())?.name,
        ),
        views: paintCollectionViews(DATA_COLLECTION_PATH, tables, loadViews(DATA_COLLECTION_PATH)).map((item) => ({
          id: item.id,
          name: item.name,
          mode: item.mode,
        })),
        recordId: stampRecordId(collection, recordId),
        recordLabel: recordHit?.label,
        records: loadRecords(DATA_COLLECTION_PATH, viaDataViewId()),
      })
    : buildCrumbs({
        collection,
        collectionLabel: table ? tableLabel(table) : collection,
        tables: tables.map((item) => ({ path: item.path, label: tableLabel(item), icon: item.view?.icon })),
        viewId: collection ? activeViewId : undefined,
        viewName: resolvedView?.name,
        views: views.map((item) => ({ id: item.id, name: item.name, mode: item.mode })),
        recordId,
        recordLabel: recordHit?.label,
        records,
      })
  return { crumbs, collection, viewId: activeViewId, recordId }
}

function goInspector(paneId: string, target: CrumbTarget) {
  setInspectorDbPath(paneId, hrefForInspectorCrumb(target))
}

export const DatabaseInspectorTab = memo(function DatabaseInspectorTab({
  active,
  onActivate,
  onClose,
  paneId,
  seedCollection,
}: {
  active?: boolean
  onActivate?: () => void
  onClose?: () => void
  paneId?: string
  seedCollection?: string
}) {
  const id = paneOf({ paneId })
  const collections = useInspectorCollections()
  const tables = useMemo(
    () => collections.filter((row) => row.path && row.path !== '/'),
    [collections],
  )
  const inspectorPath = useBindInspectorDbPath(id, tables, seedCollection)
  const viaData = useSyncExternalStore(subscribeViaDataCrumbs, viaDataCrumbsOn, () => false)
  const parsedRoute = useMemo(() => {
    const pathname = inspectorPath.split('?')[0] || inspectorPath
    const parsed = parseAppPath(pathname, [DATA_MODULE])
    return {
      collection: parsed.kind === 'collection-view' || parsed.kind === 'record' ? parsed.collection : '',
      recordId: parsed.kind === 'record' ? parsed.recordId : '',
    }
  }, [inspectorPath])
  const agentWorking = useInspectorAgentWorking(parsedRoute.collection || seedCollection || '')
  const crumbRef = useRef<HTMLElement>(null)
  const tabRef = useRef<HTMLDivElement>(null)
  const tick = useViewTick(parsedRoute.collection, parsedRoute.recordId)
  // 未激活的 Inspector 标签页在点击前不会挂载正文编辑器；若其记录标题尚未进缓存，主动拉一次轻量元数据补齐面包屑名称。
  useEffect(() => {
    const col = parsedRoute.collection
    const rid = parsedRoute.recordId
    if (!col || !rid) return
    if (peekRecord(col, rid)?.label) return
    const key = `${col}/${rid}`
    if (hydratedTabRecords.has(key)) return
    hydratedTabRecords.add(key)
    void readJson<{ value?: DbRecord }>(`/api/db/read?path=${encodeURIComponent(key)}`)
      .then((data) => {
        const row = data?.value
        if (!row) {
          hydratedTabRecords.delete(key)
          return
        }
        const label = String(row.title ?? row.name ?? '').trim()
        const emoji = typeof row.emoji === 'string' ? row.emoji : undefined
        const mascot = row.mascot
        if (label || emoji || mascot != null) {
          rememberRecords(col, [{ id: rid, label, ...(emoji ? { emoji } : {}), ...(mascot != null ? { mascot } : {}) }])
        }
      })
      .catch(() => {
        hydratedTabRecords.delete(key)
      })
  }, [parsedRoute.collection, parsedRoute.recordId, tick])
  const { crumbs } = useMemo(() => {
    void tick
    return crumbsForRoute(inspectorPath, tables, viaData, !active)
  }, [active, inspectorPath, tables, tick, viaData])
  const leaf = crumbs.at(-1)
  const leafChoice = leaf?.choices.find((item) => item.id === leaf.id)
  const crumbsRef = useRef(crumbs)
  crumbsRef.current = crumbs
  useEffect(() => {
    if (!active) return
    const onCrumbBack = (event: KeyboardEvent) => {
      if (!crumbParentHotkey(event)) return
      if (crumbHotkeyPane(event.target) !== 'inspector') return
      const parent = parentCrumbTarget(crumbsRef.current)
      if (!parent) return
      event.preventDefault()
      event.stopPropagation()
      onActivate?.()
      goInspector(id, parent)
    }
    window.addEventListener('keydown', onCrumbBack, true)
    return () => window.removeEventListener('keydown', onCrumbBack, true)
  }, [active, id, onActivate])
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(INSPECTOR_CAPTION_EVENT, {
        detail: {
          id,
          label: leaf?.label ?? '数据',
          kind: leaf?.kind,
          mode: leafChoice?.mode,
          icon: leafChoice?.icon,
          emoji: leafChoice?.emoji,
        },
      }),
    )
  }, [id, leaf?.id, leaf?.kind, leaf?.label, leafChoice?.emoji, leafChoice?.icon, leafChoice?.mode])

  return (
    <div
      ref={tabRef}
      className={`inspector-tab inspector-crumb-tab${active ? ' is-active' : ''}${agentWorking ? ' is-agent-working' : ''}`}
      role="tab"
      aria-selected={Boolean(active)}
      data-testid="inspector-tab-database"
      data-pane={id}
      onClick={() => onActivate?.()}
    >
      {crumbs.length ? (
        <CrumbTrail
          crumbs={crumbs}
          onActivate={onActivate}
          allowMenu={Boolean(active)}
          lockRootCrumb
          onPick={(target) => {
            onActivate?.()
            goInspector(id, target)
          }}
          navRef={crumbRef}
          className="inspector-crumb-full fsdb-crumbs"
          label="数据库位置"
        />
      ) : (
        <span className="inspector-crumb-leaf">
          <CircleStackIcon aria-hidden className="chat-view-project-icon" />
          <span className="chat-view-project-name">数据</span>
        </span>
      )}
      <span className="inspector-crumb-actions">
        {onClose ? (
          <button
            type="button"
            className="inspector-crumb-close"
            title="关闭"
            aria-label="关闭此栏"
            data-testid="inspector-tab-close"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }}
          >
            <XMarkIcon aria-hidden className="size-4" />
          </button>
        ) : null}
      </span>
    </div>
  )
})

export function DatabaseInspectorBrowse(props: SlotProps) {
  const extra = props as SlotProps & { paneId?: unknown; seedCollection?: unknown }
  const id = paneOf(extra)
  const ui = getDatabaseUi()
  const collections = useInspectorCollections()
  const tables = useMemo(
    () => collections.filter((row) => row.path && row.path !== '/'),
    [collections],
  )
  const inspectorPath = useBindInspectorDbPath(id, tables, seedOf(extra))
  const agentWorking = useInspectorAgentWorking(seedOf(extra) || '')
  const { pathname, search } = splitHref(inspectorPath)
  const viaData = useSyncExternalStore(subscribeViaDataCrumbs, viaDataCrumbsOn, () => false)
  const { collection, viewId, recordId } = crumbsForRoute(pathname, tables, viaData)
  const currentPath = collection
  useViewTick(currentPath, recordId ?? '')
  const chrome = useSyncExternalStore(
    (fn) => (ui ? ui.subscribe(fn) : () => undefined),
    () => (currentPath ? ui?.chrome(currentPath) ?? EMPTY_CHROME : EMPTY_CHROME),
    () => (currentPath ? ui?.chrome(currentPath) ?? EMPTY_CHROME : EMPTY_CHROME),
  )
  const lockedFilters = chrome.lockedFiltersFromSearch?.(search) ?? EMPTY_FILTERS
  const table = tables.find((item) => item.path === currentPath)
  const title = table ? tableLabel(table) : '数据'
  const liveWorking = useInspectorAgentWorking(currentPath)
  useEffect(() => {
    ensureFsdbStyle()
    void import('./browser.tsx')
    void import('./data-overview.tsx')
  }, [])

  if (!currentPath) {
    return <p className="fsdb-inspector-empty">没有数据表</p>
  }

  return (
    <div
      key={id}
      className={`fsdb-agent-follow${liveWorking || agentWorking ? ' is-working' : ''}`}
      data-testid="fsdb-agent-follow"
      aria-busy={liveWorking || agentWorking}
    >
    <Suspense fallback={null}>
    {currentPath === DATA_COLLECTION_PATH && !recordId ? (
    <DataOverview
      embed
      inspectorPaneId={id}
      tables={tables}
      routeViewId={viewId}
      routeRecordId={recordId ?? null}
      onOpenTable={(path, nextViewId) => {
        setInspectorDbPath(id, databaseViewPath(path, nextViewId ?? defaultViewId(path)))
      }}
      onOpenView={(nextViewId) => setInspectorDbPath(id, databaseViewPath(DATA_COLLECTION_PATH, nextViewId))}
      onOpenRecord={(path, view, recordIdNext) => {
        setInspectorDbPath(id, databaseRecordPath(path, recordIdNext, view.id))
      }}
      onCrumbTarget={(target) => goInspector(id, target)}
    />
    ) : (
    <CollectionBrowser
      embed
      moduleId={DATA_MODULE_ID}
      collectionPath={currentPath}
      title={title}
      blurb={table?.view?.blurb ?? ''}
      chrome={chrome}
      tables={tables}
      lockedFilters={lockedFilters}
      routeRecordId={recordId ?? null}
      routeViewId={viewId}
      crumbFromData={viaData && currentPath !== DATA_COLLECTION_PATH}
      onOpenTable={(path, nextViewId) => {
        setInspectorDbPath(id, databaseViewPath(path, nextViewId ?? defaultViewId(path)))
      }}
      onOpenView={(nextViewId) => setInspectorDbPath(id, databaseViewPath(currentPath, nextViewId))}
      onOpenRecord={(recordIdNext, nextViewId, nextCollection) => {
        setInspectorDbPath(
          id,
          databaseRecordPath(nextCollection ?? currentPath, recordIdNext, nextViewId ?? viewId),
        )
      }}
      resolveViews={(path, user) => viewsForRegisteredCollection(path, tables, user)}
      onCloseRecord={() => {
        if (viaData) {
          const dataViewId = viaDataViewId()
          setInspectorDbPath(id, databaseViewPath(DATA_COLLECTION_PATH, dataViewId))
          return
        }
        setInspectorDbPath(
          id,
          viewId ? databaseViewPath(currentPath, viewId) : databaseAllViewPath(currentPath),
        )
      }}
      onCrumbTarget={(target) => goInspector(id, target)}
      inspectorPaneId={id}
    />
    )}
    </Suspense>
    </div>
  )
}
