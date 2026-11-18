import { useEffect, useRef } from 'react'
import { HeadlessDismiss } from '@biu/biu-ui'
import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import type { FsDetailSearchProps } from '@biu/type-file-system/ui'
import { patchPageFind, usePageFind } from './page-view-state.ts'

export function EditorDetailSearch({ record }: FsDetailSearchProps) {
  const find = usePageFind(record.id)
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!find.open) return
    searchInput.current?.focus({ preventScroll: true })
    searchInput.current?.select()
  }, [find.open])
  return (
    <HeadlessDismiss
      enabled={find.open}
      onDismiss={() => {
        if (!find.query) patchPageFind(record.id, { open: false, index: 0, total: 0 })
      }}
    >
      <div className={`tasks-search-wrap${find.open ? ' is-open is-find' : ''}`}>
        <button
          type="button"
          className={`tasks-sort-btn${find.open ? ' is-active' : ''}`}
          aria-label="搜索"
          aria-expanded={find.open}
          title="搜索"
          onClick={() => patchPageFind(record.id, find.open ? { open: false, query: '', index: 0, total: 0 } : { open: true })}
        >
          <MagnifyingGlassIcon aria-hidden className="size-[14px]" />
        </button>
        {find.open ? (
          <>
            <input
              ref={searchInput}
              className="tasks-search"
              value={find.query}
              placeholder="搜索"
              aria-label="正文搜索"
              data-testid="page-find"
              onChange={(event) => patchPageFind(record.id, { query: event.target.value, index: 0 })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  patchPageFind(record.id, { open: false, query: '', index: 0, total: 0 })
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  patchPageFind(record.id, { index: find.index + (event.shiftKey ? -1 : 1) })
                }
              }}
            />
            <span className="page-find-count" data-testid="page-find-count">
              {find.query.trim() ? `${find.total ? find.index + 1 : 0}/${find.total}` : ''}
            </span>
            <button type="button" className="page-find-btn" title="上一个" aria-label="上一个" onClick={() => patchPageFind(record.id, { index: find.index - 1 })}>
              <ChevronUpIcon aria-hidden className="size-3.5" />
            </button>
            <button type="button" className="page-find-btn" title="下一个" aria-label="下一个" onClick={() => patchPageFind(record.id, { index: find.index + 1 })}>
              <ChevronDownIcon aria-hidden className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>
    </HeadlessDismiss>
  )
}
