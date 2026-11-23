import { useEffect, useMemo, useState } from 'react'
import type { CollectionInfo } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { CollectionBrowser } from './browser.tsx'
import { stampRowOpenTarget } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH } from './database-path.ts'
import { readJson } from './db-client.ts'

let cachedTables: CollectionInfo[] | null = null
let tablesInflight: Promise<CollectionInfo[]> | null = null

function loadCollectTables(): Promise<CollectionInfo[]> {
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

function collectOpenRow(row: { id?: unknown; tablePath?: unknown; sourceId?: unknown }) {
  const stamp = stampRowOpenTarget(row)
  if (!stamp) return false
  return { kind: 'record' as const, recordId: stamp.recordId, collection: stamp.collection }
}

const collectChrome: CollectionChrome = {
  openRow: collectOpenRow,
}

export function TagCollectBoard({
  record,
  openRecord,
}: {
  record: { id: string; title?: unknown }
  openRecord?: (recordId: string, collection?: string) => void
}) {
  const tagId = String(record.id ?? '').trim()
  const lockedFilters = useMemo(() => ({ tag: tagId }), [tagId])
  const [tables, setTables] = useState<CollectionInfo[]>(() => cachedTables ?? [])
  useEffect(() => {
    if (cachedTables) {
      setTables(cachedTables)
      return
    }
    let alive = true
    void loadCollectTables().then((listed) => {
      if (alive && listed.length) setTables(listed)
    })
    return () => {
      alive = false
    }
  }, [])
  if (!tagId || tagId.includes('::')) return null
  return (
    <div className="fsdb-tag-collect" data-testid="fsdb-tag-collect">
      <CollectionBrowser
        embed
        sheet
        chrome={collectChrome}
        collectionPath={DATA_COLLECTION_PATH}
        title={String(record.title ?? tagId)}
        blurb=""
        tables={tables}
        lockedFilters={lockedFilters}
        onOpenRecord={(recordId, _viewId, collection) => openRecord?.(recordId, collection)}
        onOpenRow={(row) => {
          const stamp = stampRowOpenTarget(row)
          if (stamp) openRecord?.(stamp.recordId, stamp.collection)
          return true
        }}
      />
    </div>
  )
}
