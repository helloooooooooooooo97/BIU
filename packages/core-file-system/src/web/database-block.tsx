import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CollectionInfo, DbRecord } from '@biu/type-file-system'
import { stampRowOpenTarget } from '../catalog-views.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { CollectionBrowser } from './browser.tsx'
import { DATA_COLLECTION_PATH, sortDataCollections } from './database-path.ts'
import { getDatabaseUi } from './database-ui.ts'
import { readJson } from './db-client.ts'
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

let cachedTables: CollectionInfo[] | null = null
let tablesInflight: Promise<CollectionInfo[]> | null = null

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

async function saveJsonAsset(file: string, payload: PersistedBlockViews, etag: string, path: string): Promise<string> {
  const name = assetName(file)
  if (!name) return etag
  const url = assetFileUrl(name, path)
  const body = JSON.stringify(payload, null, 2)
  const put = (match: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' }
    if (path) headers['x-biu-resource-path'] = path
    if (match) headers['If-Match'] = match
    return fetch(url, { method: 'PUT', headers, body })
  }
  let res = await put(etag)
  if (res.status === 409) {
    let next = await readResponseEtag(res)
    if (!next) {
      const current = await fetch(url)
      next = assetEtag(String(current.headers.get('etag') ?? ''))
    }
    if (next) res = await put(next)
  }
  if (!res.ok) return etag
  return (await readResponseEtag(res)) || etag
}

function loadBlockTables(): Promise<CollectionInfo[]> {
  if (cachedTables) return Promise.resolve(cachedTables)
  if (tablesInflight) return tablesInflight
  tablesInflight = readJson<{ collections?: CollectionInfo[] }>('/api/db/stat?path=/')
    .then((body) => {
      cachedTables = body.collections ?? []
      return cachedTables
    })
    .catch(() => [])
    .finally(() => {
      tablesInflight = null
    })
  return tablesInflight
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

  const [tables, setTables] = useState<CollectionInfo[]>(() => cachedTables ?? [])
  const [loadedViews, setLoadedViews] = useState<PersistedBlockViews | null>(() =>
    !file ? parseBlockViews(data, collectionPath) : null,
  )
  const etagRef = useRef('')
  const saveQueueRef = useRef(Promise.resolve())
  const fileRef = useRef(file)
  fileRef.current = file

  useEffect(() => {
    if (cachedTables) {
      setTables(cachedTables)
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

  // Ensure the block always has a JSON asset file pointer; migrate any inline views out of the page fence.
  useEffect(() => {
    if (file || !writable) return
    const created = newDatabaseBlockFile()
    const seed = parseBlockViews(data, collectionPath)
    setLoadedViews(seed)
    const path = resolvePageResourcePath(rootRef.current)
    saveQueueRef.current = saveQueueRef.current
      .then(() => saveJsonAsset(created, seed, '', path))
      .then((nextEtag) => {
        etagRef.current = nextEtag
      })
      .catch(() => undefined)
    update({
      file: created,
      ...(hasInlineLegacy ? { views: undefined, activeViewId: undefined, view: undefined } : {}),
    })
  }, [collectionPath, data, file, hasInlineLegacy, update, writable])

  // Load persisted views from the JSON asset file.
  useEffect(() => {
    if (!file) return
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
        etagRef.current = await saveJsonAsset(file, fallback, '', path).catch(() => '')
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
        .then(() => saveJsonAsset(targetFile, payload, etagRef.current, path))
        .then((nextEtag) => {
          etagRef.current = nextEtag
        })
        .catch(() => undefined)
    },
    [writable],
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
