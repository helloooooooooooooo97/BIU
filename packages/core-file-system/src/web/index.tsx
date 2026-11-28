import { apiFetch } from '@biu/biu-ui/api-client'
import { registerWorkspaceCache } from '@biu/biu-ui/cache'
import { registerShellDataBridge, type ShellDatabaseUi, type ShellShareButtonProps } from '@biu/web-app-shell/data-bridge'
import { ShareButton } from './share-popover.tsx'
import { getPagePrefs, getWorkspaceProfile, hydratePagePrefs, resetWorkspaceProfileGet, subscribePageWidth } from './page-width.ts'
import { overlayDataRoute } from './main-data-route.ts'
import { loadTags } from './tag-catalog.ts'
import { LayoutPrefsMenu } from './layout-prefs-menu.tsx'
import {
  getInspectorDbPath,
  isInspectorPaneAbandoned,
  restoreInspectorDbPaths,
  reuseInspectorOfferPane,
  snapshotInspectorDbPaths,
  subscribeInspectorDbPath,
} from './inspector-db-route.ts'
import {
  bindInspectorPaneMenuDismiss,
  getInspectorPaneMenu,
  getInspectorPaneMenuVersion,
  subscribeInspectorPaneMenu,
} from './inspector-pane-menu.tsx'
import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react'
import type { Context } from 'cordis'
import { useLocation, useNavigate } from 'react-router-dom'
import { CircleStackIcon } from '@heroicons/react/16/solid'
import type { SlotProps } from '@biu/types/slots'
import {
  DATABASE_CHANNEL,
  channelNeedsCollectionSync,
  emitAssetChanged,
  emitFsdbChange,
  fsdbChangeDetail,
  parseDatabaseChannel,
  type CollectionInfo,
} from '@biu/type-file-system'
import { DEFAULT_CHROME_PATH, type CollectionChrome } from '@biu/type-file-system/ui'
import { isLegacyDatabasePath, parseAppPath } from '@biu/web-session-view'
import { pathForCenter, pathForCrumbTarget, type CrumbTarget } from './sidebar-nav.ts'
import { parseSharePath } from '../share-snapshot.ts'
import { DatabaseInspectorBrowse, DatabaseInspectorTab, bindInspectorSnapshot, collectionTabIcon } from './inspector-database.tsx'
import { applyDatabaseChannelPayload } from './inspector-db-route.ts'
import { InspectorFollowToggle } from './inspector-follow.tsx'
import { DatabaseUiService, getDatabaseUi } from './database-ui.ts'
import { invalidateListCacheForFsdbChange } from './browser-list-cache.ts'
import { invalidateListReads } from './db-client.ts'
import { invalidatePreviewTotalsForFsdbChange } from './sidebar-preview.ts'

registerShellDataBridge({
  hydratePagePrefs,
  getPagePrefs,
  subscribePageWidth,
  getWorkspaceProfile,
  resetWorkspaceProfileGet,
  overlayDataRoute,
  getDatabaseUi: () => (getDatabaseUi() as unknown as ShellDatabaseUi) ?? null,
  loadTags,
  LayoutPrefsMenu: LayoutPrefsMenu as unknown as ComponentType<Record<string, unknown>>,
  ShareButton: ShareButton as unknown as ComponentType<ShellShareButtonProps>,
  getInspectorDbPath,
  isInspectorPaneAbandoned,
  restoreInspectorDbPaths,
  reuseInspectorOfferPane: (tabId, opened) => reuseInspectorOfferPane(tabId, opened) ?? null,
  snapshotInspectorDbPaths,
  subscribeInspectorDbPath,
  bindInspectorPaneMenuDismiss,
  getInspectorPaneMenu,
  getInspectorPaneMenuVersion,
  subscribeInspectorPaneMenu,
})
import {
  bootLoadCollections,
  collectionNavKey,
} from './nav-boot.ts'
import { defaultViewId } from './view-storage.ts'
import { DATA_COLLECTION_PATH, DATA_MODULE, DATA_MODULE_ID, DATA_MODULE_PATH, TAGS_COLLECTION_PATH, PAGE_BLOCKS_COLLECTION_PATH, VIEWS_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH, sortDataCollections } from './database-path.ts'
import { dataChrome, setViaDataCrumbs, subscribeViaDataCrumbs, viaDataCrumbsOn, viaDataViewId } from './data-chrome.ts'
import { writeMainDataRoute } from './main-data-route.ts'
import { memberChrome } from './member-chrome.tsx'
import { tagsChrome } from './tag-chrome.tsx'
import { RecordProperties } from './record-prop-host.tsx'
import { viewsChrome } from './views-chrome.ts'
import { pageBlocksChrome } from './page-blocks-chrome.ts'
import { viewsForRegisteredCollection } from './collection-nav.ts'
import { stampRowOpenTarget } from '../catalog-views.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { ensureFsdbStyle } from './fsdb-style.ts'
import { listenOpenTag } from './tag-catalog.ts'
import { DataSidebarSlot } from './data-sidebar-slot.tsx'

const ShareRoot = lazy(() => import('./share-page.tsx').then((m) => ({ default: m.ShareRoot })))
const CollectionBrowser = lazy(() => import('./browser.tsx').then((m) => ({ default: m.CollectionBrowser })))
const DataOverview = lazy(() => import('./data-overview.tsx').then((m) => ({ default: m.DataOverview })))
const LazyDatabaseBlockView = lazy(() => import('./database-block.tsx').then((m) => ({ default: m.DatabaseBlockView })))

function DatabaseBlockSlot(props: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>, opts?: { replace?: boolean }) => void
  writable: boolean
  selected?: boolean
}) {
  return (
    <Suspense fallback={null}>
      <LazyDatabaseBlockView {...props} />
    </Suspense>
  )
}

if (typeof window !== 'undefined' && /(?:^|\/)database(?:\/|$)/.test(window.location.pathname)) {
  void import('./browser.tsx')
}

function ShareRootSlot(props: {
  chrome?: CollectionChrome
  chromeFor?: (collection: string) => CollectionChrome | undefined
  loadPlugins?: (token: string, pluginIds: string[], password: string) => Promise<void>
}) {
  const location = useLocation()
  if (!parseSharePath(location.pathname)) return null
  return (
    <Suspense fallback={null}>
      <ShareRoot {...props} />
    </Suspense>
  )
}

type SlotsService = {
  place: (slot: string, view: unknown, opts: { key: string; order?: number; props?: () => Record<string, unknown> }) => { dispose?: () => unknown }
}

type AppModule = {
  id: string
  label: string
  path: string
}

type AppModulesService = {
  list: () => AppModule[]
  register: (mod: {
    id: string
    label: string
    path: string
    description?: string
    order?: number
    Icon?: ComponentType<{ className?: string }>
  }) => { dispose?: () => unknown }
  markNavReady?: () => void
}

type SnapshotService = {
  onMessage: (type: string, handler: (payload: unknown) => void) => () => void
  get?: () => { collections?: CollectionInfo[] }
  subscribe?: (fn: () => void) => () => void
}

const EMPTY_CHROME: CollectionChrome = {}
const EMPTY_FILTERS: Record<string, string> = {}

function CollectionPage(props: SlotProps) {
  const tables = (props.tables as CollectionInfo[] | undefined) ?? []
  const orderedTables = useMemo(() => {
    const { user, public: publicTables, system } = sortDataCollections(tables)
    return [...user, ...publicTables, ...system]
  }, [tables])
  const ui = getDatabaseUi()
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedViewKey, setExpandedViewKey] = useState<string | null>(null)
  const viaDataCrumbs = useSyncExternalStore(subscribeViaDataCrumbs, viaDataCrumbsOn, () => false)
  const parsed = useMemo(() => parseAppPath(location.pathname, [DATA_MODULE]), [location.pathname])
  const dataHome = parsed.kind === 'module' && parsed.moduleId === DATA_MODULE_ID
  const routeCollection = parsed.kind === 'collection-view' || parsed.kind === 'record' ? parsed : null
  const collectionFromRoute = routeCollection?.collection ?? ''
  const viewFromRoute = routeCollection
    ? routeCollection.viewId || defaultViewId(routeCollection.collection)
    : undefined
  const recordFromRoute = parsed.kind === 'record' ? parsed.recordId : null
  const currentPath = collectionFromRoute
  const row = orderedTables.find((item) => item.path === currentPath)
  const chrome = useSyncExternalStore(
    (fn) => (ui ? ui.subscribe(fn) : () => undefined),
    () => ui?.chrome(currentPath) ?? EMPTY_CHROME,
    () => ui?.chrome(currentPath) ?? EMPTY_CHROME,
  )

  const go = (
    next: { collection: string; viewId?: string; recordId?: string | null },
    opts?: { replace?: boolean },
  ) => {
    navigate(
      pathForCenter({
        collection: next.collection,
        viewId: next.viewId,
        recordId: next.recordId ?? undefined,
      }),
      opts,
    )
  }

  useEffect(() => {
    if (isLegacyDatabasePath(location.pathname) && (parsed.kind === 'collection-view' || parsed.kind === 'record')) {
      go(
        {
          collection: parsed.collection,
          viewId: parsed.kind === 'record' ? parsed.viewId : parsed.kind === 'collection-view' ? parsed.viewId : undefined,
          recordId: parsed.kind === 'record' ? parsed.recordId : null,
        },
        { replace: true },
      )
    }
  }, [location.pathname, parsed])

  useEffect(() => {
    if (parsed.kind === 'collection-view' || parsed.kind === 'record') writeMainDataRoute(location.pathname)
  }, [location.pathname, parsed])

  useEffect(() => {
    if (dataHome) {
      go({ collection: DATA_COLLECTION_PATH, viewId: defaultViewId(DATA_COLLECTION_PATH) }, { replace: true })
      return
    }
    if (parsed.kind !== 'collection-view' || recordFromRoute) return
    if (!parsed.collection) return
    const next = defaultViewId(parsed.collection, parsed.viewId)
    if (!next) return
    if (parsed.viewId === next) return
    if (!parsed.viewId) {
      go({ collection: parsed.collection, viewId: next }, { replace: true })
    }
  }, [dataHome, parsed, recordFromRoute])

  useEffect(() => {
    if (!orderedTables.length || !collectionFromRoute) return
    if (collectionFromRoute === DATA_COLLECTION_PATH) return
    if (orderedTables.some((item) => item.path === collectionFromRoute)) return
    const first = orderedTables[0]!
    go({ collection: first.path, viewId: defaultViewId(first.path) }, { replace: true })
  }, [collectionFromRoute, orderedTables])

  const lockedFilters = chrome.lockedFiltersFromSearch?.(location.search) ?? EMPTY_FILTERS
  const dataOverview = dataHome || collectionFromRoute === DATA_COLLECTION_PATH
  useEffect(() => {
    if (!dataOverview || !recordFromRoute) {
      if (dataOverview) setViaDataCrumbs(false)
      return
    }
    const stamp = stampRowOpenTarget({ id: recordFromRoute })
    if (!stamp) return
    setViaDataCrumbs(true, viewFromRoute || defaultViewId(DATA_COLLECTION_PATH))
    go(
      {
        collection: stamp.collection,
        viewId: defaultViewId(stamp.collection),
        recordId: stamp.recordId,
      },
      { replace: true },
    )
  }, [dataOverview, recordFromRoute])
  if (dataOverview) {
    return (
      <Suspense fallback={null}>
        <DataOverview
          tables={orderedTables}
          routeViewId={dataHome ? defaultViewId(DATA_COLLECTION_PATH) : viewFromRoute}
          routeRecordId={recordFromRoute}
          onOpenTable={(path, viewId) => {
            setViaDataCrumbs(false)
            go({ collection: path, viewId: viewId ?? defaultViewId(path) })
          }}
          onOpenView={(viewId) => go({ collection: DATA_COLLECTION_PATH, viewId })}
          onOpenRecord={(path, view, recordId) => {
            const stamp = stampRowOpenTarget({ id: recordId, tablePath: path })
            const collection = stamp?.collection ?? path
            go({
              collection,
              viewId: view.id || defaultViewId(collection),
              recordId: stamp?.recordId ?? recordId,
            })
          }}
          onCrumbTarget={(target) => navigate(pathForCrumbTarget(target))}
          expandedViewKey={expandedViewKey}
          onExpandedViewKeyChange={setExpandedViewKey}
        />
      </Suspense>
    )
  }
  if (!currentPath) return null
  const title = row?.view?.title ?? row?.label ?? currentPath.replace(/^\//, '')
  return (
    <Suspense fallback={null}>
    <CollectionBrowser
      moduleId={DATA_MODULE_ID}
      collectionPath={currentPath}
      title={title}
      blurb={row?.view?.blurb ?? ''}
      chrome={chrome}
      tables={orderedTables}
      lockedFilters={lockedFilters}
      routeRecordId={recordFromRoute}
      routeViewId={viewFromRoute}
      expandedViewKey={expandedViewKey}
      onExpandedViewKeyChange={setExpandedViewKey}
      crumbFromData={viaDataCrumbs}
      onOpenTable={(path, viewId) => {
          setViaDataCrumbs(false)
          go({
            collection: path,
            viewId: viewId ?? defaultViewId(path),
          })
        }}
      onOpenView={(viewId) => go({ collection: currentPath, viewId })}
      onOpenRecord={(recordId, viewId, collection) =>
        go({ collection: collection ?? currentPath, viewId: viewId ?? viewFromRoute, recordId })
      }
      resolveViews={(path, user) => viewsForRegisteredCollection(path, orderedTables, user)}
      onCloseRecord={() => {
        if (viaDataCrumbs) {
          const dataViewId = viaDataViewId()
          setViaDataCrumbs(false)
          go({ collection: DATA_COLLECTION_PATH, viewId: dataViewId }, { replace: true })
          return
        }
        go({ collection: currentPath, viewId: viewFromRoute ?? defaultViewId(currentPath) }, { replace: true })
      }}
      onCrumbTarget={(target: CrumbTarget) => navigate(pathForCrumbTarget(target))}
    />
    </Suspense>
  )
}

let collectionsInflight: Promise<CollectionInfo[]> | null = null

registerWorkspaceCache('core-fs-collections-inflight', () => {
  collectionsInflight = null
})

async function loadCollections(): Promise<CollectionInfo[]> {
  if (collectionsInflight) return collectionsInflight
  collectionsInflight = (async () => {
    const res = await apiFetch('/api/db/stat?path=/')
    const body = (await res.json()) as { collections?: CollectionInfo[]; error?: string }
    if (!res.ok) throw new Error(body.error || res.statusText)
    return body.collections ?? []
  })()
  try {
    return await collectionsInflight
  } finally {
    collectionsInflight = null
  }
}

let navErrors: string[] = []
const errorListeners = new Set<() => void>()

function setNavErrors(next: string[]) {
  navErrors = next
  for (const fn of errorListeners) fn()
}

function RegisterErrorBanner() {
  const errors = useSyncExternalStore(
    (fn) => {
      errorListeners.add(fn)
      return () => errorListeners.delete(fn)
    },
    () => navErrors,
    () => navErrors,
  )
  if (!errors.length) return null
  return (
    <div className="fsdb-nav-errors" role="alert">
      <strong>Core-File System</strong>
      <ul>
        {errors.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export const name = 'core-file-system-ui'
export const inject = ['slots', 'appModules']

export function apply(ctx: Context) {
  ensureFsdbStyle()
  new DatabaseUiService(ctx)
  ctx.effect(() => {
    const ui = getDatabaseUi()
    if (!ui) return () => undefined
    const defaults = ui.decorate(DEFAULT_CHROME_PATH, { Properties: RecordProperties })
    const dataUi = ui.decorate(DATA_COLLECTION_PATH, dataChrome)
    const views = ui.decorate(VIEWS_COLLECTION_PATH, viewsChrome)
    const tagsUi = ui.decorate(TAGS_COLLECTION_PATH, tagsChrome)
    const membersUi = ui.decorate(WORKSPACE_MEMBERS_COLLECTION_PATH, memberChrome)
    const blocksUi = ui.decorate(
      PAGE_BLOCKS_COLLECTION_PATH,
      pageBlocksChrome(),
    )
    return () => {
      defaults.dispose()
      dataUi.dispose()
      views.dispose()
      tagsUi.dispose()
      membersUi.dispose()
      blocksUi.dispose()
    }
  })
  ctx.inject(['blockEditor'], (inner) => {
    const editor = inner.get('blockEditor')
    if (!editor) return () => undefined
    const dbBlock = editor.registerBlock({
      kind: 'database',
      plugin: name,
      label: '数据库',
      blockType: 'basic',
      hint: '嵌入数据表视图，视图配置保存在附件 JSON 中',
      aliases: ['db', 'database', 'table', '数据', '数据库', '数据表'],
      assets: ['file'],
      defaults: () => {
        const id =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(36).slice(2, 10)
        return {
          collection: DATA_COLLECTION_PATH,
          file: `assets/database-${id}.json`,
        }
      },
      View: DatabaseBlockSlot,
    })
    const stopOpen = listenOpenTag()
    let sig = ''
    const stop = editor.subscribe(() => {
      const next = editor
        .blocks()
        .map((item) => item.kind)
        .sort()
        .join('\0')
      if (next === sig) return
      sig = next
      getDatabaseUi()?.refresh()
    })
    return () => {
      void dbBlock?.()
      stop()
      stopOpen()
    }
  })
  const slots = ctx.get('slots') as SlotsService
  slots.place('module-sidebar', DataSidebarSlot, { key: 'fsdb-data-sidebar' })
  const appModules = ctx.get('appModules') as AppModulesService
  const mounted = new Map<string, () => void>()
  const inspectorOffers = new Map<string, () => void>()
  let liveTables: CollectionInfo[] = []
  let snapshotCollections: CollectionInfo[] = []

  function syncInspectorOffers(tables: CollectionInfo[]) {
    const wanted = tables.filter((row) => row.view?.inspector)
    const live = new Set(wanted.map((row) => row.path))
    for (const [path, dispose] of inspectorOffers) {
      if (live.has(path)) continue
      dispose()
      inspectorOffers.delete(path)
    }
    for (const table of wanted) {
      if (inspectorOffers.has(table.path)) continue
      const path = table.path
      const slot = slots.place('inspector-panels', DatabaseInspectorBrowse, {
        key: `fsdb-inspector:${path}`,
        order: -40 + (table.view?.order ?? 50),
        props: () => {
          const current = liveTables.find((item) => item.path === path)
          return {
            tabId: `database:${path}`,
            tabLabel: current?.view?.title ?? current?.label ?? path.replace(/^\//, ''),
            tabIcon: collectionTabIcon(current?.view?.icon),
            Tab: DatabaseInspectorTab,
            seedCollection: path,
            requiresSession: true,
            centerKinds: ['session'],
            repeatable: true,
          }
        },
      })
      inspectorOffers.set(path, () => {
        void slot.dispose?.()
      })
    }
  }

  slots.place('root-overlays', RegisterErrorBanner, { key: 'fsdb-nav-errors', order: 80 })
  slots.place('root-overlays', ShareRootSlot, {
    key: 'fsdb-share-root',
    order: 90,
    props: () => ({
      chromeFor: (collection: string) => getDatabaseUi()?.chrome(collection),
    }),
  })
  slots.place('header-tools', InspectorFollowToggle, {
    key: 'inspector-follow',
    order: 11,
  })
  let stopped = false
  let readyTimer = 0
  const runSync = async (rows: CollectionInfo[]) => {
    const views = rows
      .filter((row) => row.view?.moduleId && row.view.route)
      .slice()
      .sort((a, b) => (a.view?.order ?? 50) - (b.view?.order ?? 50) || a.path.localeCompare(b.path))
    liveTables = views
    syncInspectorOffers(views)
    const live = views.length ? new Set([DATA_MODULE_ID]) : new Set<string>()
    for (const [id, dispose] of mounted) {
      if (live.has(id)) continue
      dispose()
      mounted.delete(id)
    }
    const errors: string[] = []
    if (!views.length) {
      setNavErrors(errors)
      return
    }
    const occupied = appModules.list()
    const pathHit = occupied.find((item) => item.id !== DATA_MODULE_ID && normalizeCollectionPath(item.path) === DATA_MODULE_PATH)
    if (pathHit) {
      errors.push(`路由重复：${DATA_MODULE_PATH} 已被「${pathHit.label}」占用`)
      setNavErrors(errors)
      return
    }
    const nameHit = occupied.find((item) => item.id !== DATA_MODULE_ID && item.label === DATA_MODULE.label)
    if (nameHit) {
      errors.push(`名称重复：导航已有「${DATA_MODULE.label}」`)
      setNavErrors(errors)
      return
    }
    if (!mounted.has(DATA_MODULE_ID)) {
      try {
        const order = Math.min(...views.map((row) => row.view?.order ?? 50))
        const mod = appModules.register({
          id: DATA_MODULE.id,
          label: DATA_MODULE.label,
          path: DATA_MODULE.path,
          description: '任务、页面和插件',
          order,
          Icon: CircleStackIcon,
        })
        const slot = slots.place('app-modules', CollectionPage, {
          key: 'fsdb-database',
          order,
          props: () => ({
            moduleId: DATA_MODULE_ID,
            tables: liveTables,
          }),
        })
        mounted.set(DATA_MODULE_ID, () => {
          void mod.dispose?.()
          void slot.dispose?.()
        })
      } catch (err) {
        errors.push(`无法挂到导航：${String(err)}`)
      }
    }
    setNavErrors(errors)
  }

  const sync = async (rows?: CollectionInfo[]) => {
    let next = rows
    if (!next) {
      if (collectionNavKey(snapshotCollections)) next = snapshotCollections
      else {
        try {
          next = await loadCollections()
        } catch {
          return
        }
      }
    } else {
      snapshotCollections = next
    }
    await runSync(next)
    if (!collectionNavKey(next)) return
    window.clearTimeout(readyTimer)
    readyTimer = window.setTimeout(() => appModules.markNavReady?.(), 80)
  }

  ctx.effect(() => () => {
    stopped = true
    window.clearTimeout(readyTimer)
    for (const dispose of mounted.values()) dispose()
    mounted.clear()
    for (const dispose of inspectorOffers.values()) dispose()
    inspectorOffers.clear()
    setNavErrors([])
  })
  ctx.inject(['snapshot'], (inner) => {
    const snapshot = inner.get('snapshot') as SnapshotService
    bindInspectorSnapshot({
      subscribe: snapshot.subscribe ?? (() => () => undefined),
      get: () => snapshot.get?.() ?? {},
    })
    let lastKey = ''
    const fromSnap = () => {
      const rows = (snapshot.get?.().collections ?? []) as CollectionInfo[]
      snapshotCollections = rows
      const key = collectionNavKey(rows)
      if (!key || key === lastKey) return
      lastKey = key
      void sync(rows)
    }
    fromSnap()
    const offSnap = snapshot.subscribe?.(fromSnap)
    let debounce = 0
    const off = snapshot.onMessage(DATABASE_CHANNEL, (payload) => {
      const parsed = parseDatabaseChannel(payload)
      const sessionId = (
        ctx.get('sessionView') as { get?: () => { sessionId?: string | null } } | undefined
      )?.get?.()?.sessionId
      applyDatabaseChannelPayload(payload, sessionId)
      if (parsed?.asset) emitAssetChanged(parsed.asset)
      if (!parsed) return
      const change = fsdbChangeDetail(parsed)
      if (change) {
        invalidateListReads()
        invalidateListCacheForFsdbChange(change)
        invalidatePreviewTotalsForFsdbChange(change)
        emitFsdbChange(change)
      }
      if (!channelNeedsCollectionSync(parsed)) return
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => void sync(), 40)
    })
    return () => {
      window.clearTimeout(debounce)
      offSnap?.()
      off()
    }
  })
  void bootLoadCollections(loadCollections, {
    stopped: () => stopped || Boolean(collectionNavKey(snapshotCollections)),
    onUpdate: (rows) => {
      if (stopped || collectionNavKey(snapshotCollections) || !collectionNavKey(rows)) return
      void sync(rows)
    },
  }).then((rows) => {
    if (stopped || collectionNavKey(snapshotCollections)) return
    return sync(rows)
  })
}

if (typeof document !== 'undefined') {
  const id = 'biu-core-file-system-nav-error-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.fsdb-nav-errors{position:fixed;right:16px;bottom:16px;z-index:var(--biu-z-float);max-width:360px;border:var(--biu-stroke-width) solid var(--biu-color-danger);border-radius:12px;padding:12px 14px;background:var(--biu-color-surface);color:var(--biu-color-text);box-shadow:var(--biu-shadow-md)}
.fsdb-nav-errors strong{display:block;margin-bottom:6px;color:var(--biu-color-danger);font-size:var(--biu-font-size-2)}
.fsdb-nav-errors ul{margin:0;padding-left:18px;font-size:var(--biu-font-size-2);line-height:1.5}
`
  if (!document.getElementById(id)) document.head.appendChild(style)
}
