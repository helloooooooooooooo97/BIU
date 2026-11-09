import { useState, useSyncExternalStore } from 'react'
import { PickOption, PickPanel } from '@biu/database-ui/search'
import type { DbRecord } from '@biu/type-file-system'
import {
  listViewCatalogOptions,
  selectViewCatalog,
  selectedViewCatalogId,
  subscribeViewCatalog,
} from './view-catalog.ts'

export function ViewCatalogPickPanel({
  record,
  fieldKey,
  collectionPath,
  onPicked,
}: {
  record: DbRecord
  fieldKey: string
  collectionPath: string
  onPicked?: () => void
}) {
  useSyncExternalStore(
    (fn) => subscribeViewCatalog(collectionPath, fn),
    () =>
      `${selectedViewCatalogId(collectionPath, record, fieldKey)}\0${listViewCatalogOptions(collectionPath, record, fieldKey)
        .map((item) => `${item.id}:${item.name}`)
        .join('|')}`,
  )
  const [query, setQuery] = useState('')
  const options = listViewCatalogOptions(collectionPath, record, fieldKey)
  const selected = selectedViewCatalogId(collectionPath, record, fieldKey)
  const q = query.trim().toLowerCase()
  const available = options.filter(
    (item) => !q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q),
  )
  return (
    <PickPanel
      className="fsdb-cell-pop-tags"
      query={query}
      onQuery={setQuery}
      placeholder="搜索视图"
      onEnter={() => {
        const hit = available[0]
        if (!hit) return
        selectViewCatalog(collectionPath, record, fieldKey, hit.id)
        onPicked?.()
      }}
      empty={!available.length ? <div className="db-search-empty">没有匹配项</div> : null}
    >
      {available.map((item) => (
        <PickOption
          key={item.id}
          selected={item.id === selected}
          onClick={() => {
            selectViewCatalog(collectionPath, record, fieldKey, item.id)
            onPicked?.()
          }}
        >
          {item.name}
        </PickOption>
      ))}
    </PickPanel>
  )
}
