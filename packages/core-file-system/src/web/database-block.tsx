import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CollectionInfo, DbRecord } from '@biu/type-file-system'
import { stampRowOpenTarget } from '../catalog-views.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { CollectionBrowser } from './browser.tsx'
import { DATA_COLLECTION_PATH, sortDataCollections } from './database-path.ts'
import { getDatabaseUi } from './database-ui.ts'
import { loadRootCollections, peekRootCollections } from './db-client.ts'
import { showRecordInInspector } from './inspector-db-route.ts'
import { normalizeSavedView, type SavedView } from './saved-view.ts'

export type DatabaseBlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>, opts?: { replace?: boolean }) => void
  writable: boolean
  selected?: boolean
}

type PersistedBlockViews = {
  views: SavedView[]
  activeViewId: string
}

export function newDatabaseBlockFile() {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `assets/database-${id}.json`
}

function assetName(file: string) {
  return String(file ?? '').trim().replace(/^assets\//, '')
}

function assetEtag(raw: string) {
  return raw.replace(/^W\//, '').replaceAll('"', '')
}

function resolvePageResourcePath(el: HTMLElement | null) {
  const host = (el?.closest('.page-editor') ?? (typeof document !== 'undefined' ? document.querySelector('.page-editor') : null)) as HTMLElement | null
  if (!host) return ''
  const stamped = String(host.dataset.livePath || host.dataset.pagePath || '').trim()
  if (stamped) return stamped
  const rec = String(host.dataset.pageRecord || '').trim()
  return rec ? `/pages/${rec}` : ''
}

function assetFileUrl(name: string, path: string, bust = false) {
  const params = new URLSearchParams()
  if (bust) params.set('t', String(Date.now()))
  if (path) params.set('path', path)
  const q = params.toString()
  return `/api/db/file/${encodeURIComponent(name)}${q ? `?${q}` : ''}`
}

async function readResponseEtag(res: Response) {
  const header = assetEtag(String(res.headers.get('etag') ?? ''))
  if (header) return header
  const text = await res.clone().text().catch(() => '')
  if (!text) return ''
  try {
    const parsed = JSON.parse(text) as { etag?: unknown }
    return assetEtag(String(parsed?.etag ?? ''))
  } catch {
    return ''
  }
}

async function loadJsonAsset(file: string, path: string): Promise<{ data: Record<string, unknown> | null; etag: string; missing: boolean }> {
  const name = assetName(file)
  if (!name) return { data: null, etag: '', missing: true }
  const res = await fetch(assetFileUrl(name, path))
  if (res.ok) {
    const etag = assetEtag(String(res.headers.get('etag') ?? ''))
    try {
      const parsed = (await res.json()) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { data: parsed as Record<string, unknown>, etag, missing: false }
      }
    } catch {
      /* fall through */
    }
    return { data: null, etag, missing: false }
  }
  return { data: null, etag: '', missing: res.status === 404 }
}

export function mergeBlockViewsOnConflict(remote: PersistedBlockViews, local: PersistedBlockViews): PersistedBlockViews {
  const remoteById = new Map(remote.views.map((view) => [view.id, normalizeSavedView(view)]))
  const mergedViews: SavedView[] = []
  const seen = new Set<string>()
  for (const localView of local.views) {
    const normLocal = normalizeSavedView(localView)
    const remoteView = remoteById.get(normLocal.id)
    seen.add(normLocal.id)
    const remoteVersion = Number(remoteView?.revision) || Number(remoteView?.updatedAt) || 0
    const localVersion = Number(normLocal.revision) || Number(normLocal.updatedAt) || 0
    mergedViews.push(remoteView && remoteVersion > localVersion ? remoteView : normLocal)
  }
  for (const remoteView of remote.views) {
    const normRemote = normalizeSavedView(remoteView)
    if (!seen.has(normRemote.id)) mergedViews.push(normRemote)
  }
  const activeViewId = mergedViews.some((view) => view.id === local.activeViewId)
    ? local.activeViewId
    : mergedViews[0]?.id ?? remote.activeViewId
  return { views: mergedViews, activeViewId }
}

async function saveJsonAsset(
  file: string,
  payload: PersistedBlockViews,
  etag: string,
  path: string,
  collectionPath: string,
): Promise<{ ok: boolean; etag: string; merged?: PersistedBlockViews }> {
  const name = assetName(file)
  if (!name) return { ok: false, etag }
  const url = assetFileUrl(name, path)
  const put = (match: string, data: PersistedBlockViews) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' }
    if (path) headers['x-biu-resource-path'] = path
    if (match) headers['If-Match'] = match
    return fetch(url, { method: 'PUT', headers, body: JSON.stringify(data, null, 2) })
  }
  let res = await put(etag, payload)
  let merged: PersistedBlockViews | undefined
  if (res.status === 409) {
    const latest = await loadJsonAsset(file, path)
    const nextEtag = latest.etag || (await readResponseEtag(res))
    if (latest.data) {
      merged = mergeBlockViewsOnConflict(parseBlockViews(latest.data, collectionPath), payload)
    }
    if (nextEtag) res = await put(nextEtag, merged ?? payload)
  }
  if (!res.ok) return { ok: false, etag }
  return { ok: true, etag: (await readResponseEtag(res)) || etag, merged }
}

function loadBlockTables(): Promise<CollectionInfo[]> {
  return loadRootCollections()
}

function defaultBlockView(collectionPath: string, legacyView?: unknown): SavedView {
  const extra = legacyView && typeof legacyView === 'object' && !Array.isArray(legacyView) ? (legacyView as Partial<SavedView>) : {}
  return normalizeSavedView({
    id: 'default',
    name: collectionPath === DATA_COLLECTION_PATH ? '全部数据' : '全部',
    mode: 'table',
    sortField: 'updatedAt',
    sortDir: 'desc',
    filters: {},
    columns: [],
    groupBy: '',
    pageSize: 20,
    ...extra,
  })
}

function parseBlockViews(raw: Record<string, unknown> | null | undefined, collectionPath: string): PersistedBlockViews {
  const source = raw ?? {}
  const rawViews = Array.isArray(source.views) ? source.views : []
  const views = rawViews
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item, idx) =>
      normalizeSavedView({
        id: String(item.id ?? `view-${idx + 1}`),
        name: String(item.name ?? `视图 ${idx + 1}`),
        mode: 'table',
        sortField: 'updatedAt',
        sortDir: 'desc',
        filters: {},
        columns: [],
        groupBy: '',
        pageSize: 20,
        ...(item as Partial<SavedView>),
      }),
    )
  if (!views.length) {
    const fallback = defaultBlockView(collectionPath, source.view)
    return { views: [fallback], activeViewId: fallback.id }
  }
  const wantId = String(source.activeViewId ?? '').trim()
  const activeViewId = views.some((item) => item.id === wantId) ? wantId : views[0]!.id
  return { views, activeViewId }
}

export function DatabaseBlockView({ data, update, writable, selected }: DatabaseBlockProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const rawPath = String(data.collection ?? DATA_COLLECTION_PATH).trim()
  const collectionPath = normalizeCollectionPath(rawPath) || DATA_COLLECTION_PATH
  const file = typeof data.file === 'string' ? data.file.trim() : ''
  const hasInlineLegacy = Boolean(data.views !== undefined || data.view !== undefined || data.activeViewId !== undefined)

  const [tables, setTables] = useState<CollectionInfo[]>(() => peekRootCollections() ?? [])
  const [loadedViews, setLoadedViews] = useState<PersistedBlockViews | null>(() =>
    !file ? parseBlockViews(data, collectionPath) : null,
  )
  const etagRef = useRef('')
  const saveQueueRef = useRef(Promise.resolve())
  const fileRef = useRef(file)
  fileRef.current = file
  const migratingRef = useRef(false)
  const migratedFileRef = useRef('')

  useEffect(() => {
    const cached = peekRootCollections()
    if (cached) {
      setTables(cached)
      return
    }
    let alive = true
    void loadBlockTables().then((listed) => {
      if (alive && listed.length) setTables(listed)
    })
    return () => {
      alive = false
    }
  }, [])

  // Ensure the block always has a JSON asset file pointer; wait for PUT to finish BEFORE
  // clearing inline views so the subsequent load effect cannot hit 404 and overwrite with defaults.
  useEffect(() => {
    if (file || !writable || migratingRef.current) return
    migratingRef.current = true
    let alive = true
    const created = newDatabaseBlockFile()
    const seed = parseBlockViews(data, collectionPath)
    setLoadedViews(seed)
    const path = resolvePageResourcePath(rootRef.current)
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        const result = await saveJsonAsset(created, seed, '', path, collectionPath)
        if (!alive) return
        if (!result.ok) {
          migratingRef.current = false
          return
        }
        etagRef.current = result.etag
        migratedFileRef.current = created
        update({
          file: created,
          ...(hasInlineLegacy ? { views: undefined, activeViewId: undefined, view: undefined } : {}),
        })
      })
      .catch(() => {
        migratingRef.current = false
      })
    return () => {
      alive = false
    }
  }, [collectionPath, data, file, hasInlineLegacy, update, writable])

  // Load persisted views from the JSON asset file.
  useEffect(() => {
    if (!file) return
    if (migratedFileRef.current === file) {
      migratedFileRef.current = ''
      return
    }
    let alive = true
    const path = resolvePageResourcePath(rootRef.current)
    void loadJsonAsset(file, path).then(async (loaded) => {
      if (!alive) return
      etagRef.current = loaded.etag
      if (loaded.data) {
        setLoadedViews(parseBlockViews(loaded.data, collectionPath))
        if (hasInlineLegacy && writable) {
          update({ views: undefined, activeViewId: undefined, view: undefined })
        }
        return
      }
      const fallback = parseBlockViews(hasInlineLegacy ? data : null, collectionPath)
      setLoadedViews(fallback)
      if (loaded.missing && writable) {
        const res = await saveJsonAsset(file, fallback, '', path, collectionPath).catch(() => ({ ok: false, etag: '' }))
        if (res.ok) etagRef.current = res.etag
      }
      if (hasInlineLegacy && writable) {
        update({ views: undefined, activeViewId: undefined, view: undefined })
      }
    })
    return () => {
      alive = false
    }
  }, [collectionPath, file]) // eslint-disable-line react-hooks/exhaustive-deps

  const orderedTables = useMemo(() => {
    const { user, index, system } = sortDataCollections(tables)
    return [...user, ...index, ...system]
  }, [tables])

  const chrome = getDatabaseUi()?.chrome(collectionPath)

  const handleViewsChange = useCallback(
    (nextViews: SavedView[], nextActiveViewId: string) => {
      if (!writable) return
      const targetFile = fileRef.current
      if (!targetFile) return
      const path = resolvePageResourcePath(rootRef.current)
      const payload: PersistedBlockViews = { views: nextViews, activeViewId: nextActiveViewId }
      saveQueueRef.current = saveQueueRef.current
        .then(async () => {
          const result = await saveJsonAsset(targetFile, payload, etagRef.current, path, collectionPath)
          if (result.ok) {
            etagRef.current = result.etag
            if (result.merged) setLoadedViews(result.merged)
          }
        })
        .catch(() => undefined)
    },
    [collectionPath, writable],
  )

  const externalViews = useMemo(
    () =>
      loadedViews
        ? {
            views: loadedViews.views,
            activeViewId: loadedViews.activeViewId,
            onChange: writable ? handleViewsChange : undefined,
          }
        : undefined,
    [handleViewsChange, loadedViews, writable],
  )

  const handleOpenRow = useCallback(
    (row: DbRecord) => {
      if (collectionPath === DATA_COLLECTION_PATH) {
        const stamp = stampRowOpenTarget(row)
        if (stamp) showRecordInInspector(stamp.collection, stamp.recordId)
        return true
      }
      const id = String(row.id ?? '').trim()
      if (id) showRecordInInspector(collectionPath, id)
      return true
    },
    [collectionPath],
  )

  return (
    <div
      ref={rootRef}
      className="fsdb-page-db-block"
      data-testid="fsdb-page-db-block"
      data-database-selected={selected ? '' : undefined}
    >
      {externalViews ? (
        <CollectionBrowser
          key={`${collectionPath}:${file || 'inline'}`}
          embed
          sheet
          chrome={chrome}
          collectionPath={collectionPath}
          title="全部数据"
          blurb=""
          tables={orderedTables}
          externalViews={externalViews}
          onOpenRecord={(recordId, _viewId, collection) => {
            showRecordInInspector(collection || collectionPath, recordId)
          }}
          onOpenRow={handleOpenRow}
        />
      ) : null}
    </div>
  )
}
