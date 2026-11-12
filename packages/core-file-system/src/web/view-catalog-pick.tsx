import { useState, useSyncExternalStore } from 'react'
import { Square2StackIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import {
  canCopyViewCatalogItem,
  copyViewCatalog,
  deleteViewCatalog,
  listViewCatalogOptions,
  selectViewCatalog,
  selectedViewCatalogId,
  subscribeViewCatalog,
} from './view-catalog.ts'
import { ensureDbSearchStyle } from '@biu/database-ui/search'
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
  ensureDbSearchStyle()
  return (
    <div className="fsdb-viewcat-pick">
      <label className="db-search-field">
        <input
          value={query}
          autoFocus
          placeholder="搜索视图"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            const hit = available[0]
            if (!hit) return
            selectViewCatalog(collectionPath, record, fieldKey, hit.id)
            onPicked?.()
          }}
        />
      </label>
      <div className="fsdb-viewcat-pick-list">
        {!available.length ? <div className="db-search-empty">没有匹配项</div> : null}
        {available.map((item) => {
          const canCopy = canCopyViewCatalogItem(fieldKey, item)
          const canDelete = !item.builtin
          return (
            <div
              key={item.id}
              className={`fsdb-viewcat-pick-row${item.id === selected ? ' is-active' : ''}`}
              style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', width: '100%' }}
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={item.id === selected}
                className="fsdb-viewcat-pick-main"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'nowrap',
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
                }}
                onClick={() => {
                  selectViewCatalog(collectionPath, record, fieldKey, item.id)
                  onPicked?.()
                }}
              >
                <ViewCatalogGlyph icon={item.icon} Icon={item.Icon} className="fsdb-viewcat-pick-ico" />
                <span className="fsdb-viewcat-pick-name">{item.name}</span>
              </button>
              {canCopy || canDelete ? (
                <span className="fsdb-viewcat-pick-actions" style={{ display: 'inline-flex', flexShrink: 0, marginLeft: 'auto' }}>
                  {canCopy ? (
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
                  ) : null}
                  {canDelete ? (
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
                  ) : null}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
