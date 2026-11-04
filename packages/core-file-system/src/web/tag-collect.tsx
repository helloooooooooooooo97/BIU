import type { CollectionChrome } from '@biu/type-file-system/ui'
import { CollectionBrowser } from './browser.tsx'
import { stampRowOpenTarget } from '../catalog-views.ts'
import { TAGS_COLLECTION_PATH } from './database-path.ts'

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
  if (!tagId || tagId.includes('::')) return null
  return (
    <div className="fsdb-tag-collect" data-testid="fsdb-tag-collect">
      <CollectionBrowser
        embed
        sheet
        chrome={collectChrome}
        collectionPath={TAGS_COLLECTION_PATH}
        title={String(record.title ?? tagId)}
        blurb=""
        lockedFilters={{ tagId }}
        onOpenRow={(row) => {
          const stamp = stampRowOpenTarget(row)
          if (stamp) openRecord?.(stamp.recordId, stamp.collection)
          return true
        }}
      />
    </div>
  )
}
