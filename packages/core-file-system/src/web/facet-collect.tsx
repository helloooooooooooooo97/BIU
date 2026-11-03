import type { CollectionChrome } from '@biu/type-file-system/ui'
import { CollectionBrowser } from './browser.tsx'
import { stampRowOpenTarget } from '../catalog-views.ts'
import { FACETS_COLLECTION_PATH } from './database-path.ts'

function collectOpenRow(row: { id?: unknown; tablePath?: unknown; sourceId?: unknown }) {
  const stamp = stampRowOpenTarget(row)
  if (!stamp) return false
  return { kind: 'record' as const, recordId: stamp.recordId, collection: stamp.collection }
}

const collectChrome: CollectionChrome = {
  openRow: collectOpenRow,
}

export function FacetCollectBoard({
  record,
  openRecord,
}: {
  record: { id: string; title?: unknown }
  openRecord?: (recordId: string, collection?: string) => void
}) {
  const facetId = String(record.id ?? '').trim()
  if (!facetId || facetId.includes('::')) return null
  return (
    <div className="fsdb-tag-collect" data-testid="fsdb-tag-collect">
      <CollectionBrowser
        embed
        sheet
        chrome={collectChrome}
        collectionPath={FACETS_COLLECTION_PATH}
        title={String(record.title ?? facetId)}
        blurb=""
        lockedFilters={{ facetId: facetId }}
        onOpenRow={(row) => {
          const stamp = stampRowOpenTarget(row)
          if (stamp) openRecord?.(stamp.recordId, stamp.collection)
          return true
        }}
      />
    </div>
  )
}
