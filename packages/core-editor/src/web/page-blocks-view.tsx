import { useEffect, useState } from 'react'
import { RectangleGroupIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionViewType, FsViewProps } from '@biu/type-file-system/ui'
import { PageBlockMissing } from './page-block-view.tsx'
import { getPageEditor, usePageEditorVersion } from './service.ts'

export const PAGE_BLOCKS_VIEW_ID = 'blocks'

export function parsePageBlockRowData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  return {}
}

async function writeBlockData(id: string, data: Record<string, unknown>) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/page-blocks/${id}`, content: { data } }),
  })
  const body = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
}

function BlockCard({
  row,
  onOpen,
}: {
  row: DbRecord
  onOpen: (row: DbRecord) => void
}) {
  usePageEditorVersion()
  const kind = String(row.blockKind ?? row.kind ?? '').trim()
  const plugin = String(row.plugin ?? '').trim()
  const spec = getPageEditor()?.block(kind)
  const View = spec?.View
  const [data, setData] = useState(() => parsePageBlockRowData(row.data))
  useEffect(() => {
    setData(parsePageBlockRowData(row.data))
  }, [row.data])
  const title = String(row.title ?? spec?.label ?? kind)
  const update = (patch: Record<string, unknown>, opts?: { replace?: boolean }) => {
    const next = opts?.replace ? patch : { ...data, ...patch }
    setData(next)
    void writeBlockData(String(row.id), next)
  }
  return (
    <article className="page-blocks-view-card" data-testid="page-blocks-view-card">
      <button type="button" className="page-blocks-view-title" onClick={() => onOpen(row)}>
        {title}
      </button>
      <div
        className="page-block"
        data-page-block={kind || undefined}
        data-page-block-plugin={plugin || undefined}
        data-page-block-id={String(row.blockId ?? '') || undefined}
      >
        {View ? (
          <View data={data} update={update} writable />
        ) : (
          <PageBlockMissing kind={kind || 'unknown'} plugin={plugin} data={data} />
        )}
      </div>
    </article>
  )
}

export function PageBlocksView({ rows, onOpen }: FsViewProps) {
  usePageEditorVersion()
  if (!rows.length) return <p className="fsdb-empty">暂无组件</p>
  return (
    <div className="page-editor page-blocks-view" data-testid="page-blocks-view">
      {rows.map((row) => (
        <BlockCard key={row.id} row={row} onOpen={onOpen} />
      ))}
    </div>
  )
}

export const pageBlocksCollectionView: CollectionViewType = {
  id: PAGE_BLOCKS_VIEW_ID,
  label: '组件',
  Icon: RectangleGroupIcon,
  View: PageBlocksView,
}
