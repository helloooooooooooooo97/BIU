import { useState, useSyncExternalStore } from 'react'
import { PickPanel } from '@biu/database-ui/search'
import { Square2StackIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import {
  copyViewCatalog,
  deleteViewCatalog,
  listViewCatalogOptions,
  selectViewCatalog,
  selectedViewCatalogId,
  subscribeViewCatalog,
} from './view-catalog.ts'
import { ViewCatalogGlyph } from './view-catalog-glyph.tsx'

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
      <div className="tasks-sort-list">
        {available.map((item) => (
          <div key={item.id} className={`tasks-viewdd-item${item.id === selected ? ' is-active' : ''}`}>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={item.id === selected}
              className="tasks-viewdd-item-main fsdb-tool-row"
              onClick={() => {
                selectViewCatalog(collectionPath, record, fieldKey, item.id)
                onPicked?.()
              }}
            >
              <ViewCatalogGlyph icon={item.icon} />
              <span className="tasks-viewdd-item-name">{item.name}</span>
            </button>
            <span className="tasks-viewdd-item-actions">
              <button
                type="button"
                className="tasks-viewdd-act"
                title="拷贝视图"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  copyViewCatalog(collectionPath, record, fieldKey, item.id)
                }}
              >
                <Square2StackIcon aria-hidden className="size-[14px]" />
              </button>
              {item.builtin ? null : (
                <button
                  type="button"
                  className="tasks-viewdd-act is-danger"
                  title="删除"
                  aria-label={`删除 ${item.name}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    deleteViewCatalog(collectionPath, record, fieldKey, item.id)
                  }}
                >
                  <TrashGlyph aria-hidden className="size-[14px]" />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </PickPanel>
  )
}
