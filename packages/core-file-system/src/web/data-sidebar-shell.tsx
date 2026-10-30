import { useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChatCount } from '@biu/biu-ui/chat-count'
import type { CollectionInfo } from '@biu/type-file-system'
import { sortDataCollections } from './database-path.ts'
import { getStarredRecords, getStarredViews } from './view-storage.ts'

function SectionHead({ label, count, testId }: { label: string; count: number; testId?: string }) {
  return (
    <section className="min-w-0">
      <div className="sidebar-section-head min-w-0">
        <div className="flex min-h-8 min-w-0 flex-1 items-center">
          <button
            type="button"
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
            data-testid={testId}
          >
            <span className="min-w-0 flex-1 truncate tracking-normal">{label}</span>
          </button>
        </div>
        <ChatCount count={count} />
      </div>
    </section>
  )
}

/** 数据侧栏外壳：不跟主列表就绪绑定，分组标题和计数立刻出现。 */
export function DataSidebarShell({
  tables,
  collectionPath,
  title,
}: {
  tables: CollectionInfo[]
  collectionPath: string
  title: string
}) {
  const grouped = useMemo(() => {
    const raw = tables.length ? tables : ([{ path: collectionPath, label: title, view: { title } }] as CollectionInfo[])
    return sortDataCollections(raw)
  }, [collectionPath, tables, title])
  const favCount = getStarredViews().length + getStarredRecords().length
  const [slot, setSlot] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.getElementById('shell-module-sidebar'),
  )
  useLayoutEffect(() => {
    setSlot(document.getElementById('shell-module-sidebar'))
  }, [])
  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
      <div className="mt-2 space-y-1.5">
        {favCount ? <SectionHead label="收藏" count={favCount} /> : null}
        <SectionHead label="用户数据" count={grouped.user.length} testId="sidebar-user-home" />
        <SectionHead label="索引数据" count={grouped.index.length} testId="sidebar-index-home" />
        <SectionHead label="系统数据" count={grouped.system.length} />
      </div>
    </div>
  )
  if (slot) {
    return createPortal(
      <div className="fsdb-views flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label="数据">
        {body}
      </div>,
      slot,
    )
  }
  return (
    <aside
      className="app-side-bar fsdb-views flex min-h-0 flex-col overflow-hidden border-r border-(--biu-color-border) bg-(--biu-color-bg-subtle)"
      aria-label="数据"
    >
      {body}
    </aside>
  )
}
