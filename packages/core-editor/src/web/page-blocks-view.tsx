import { useCallback, useEffect, useRef, useState } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import { blockDataUnchanged } from './page-block-meta.ts'
import { PagePluginSurface, pagePluginHostAttrs, useBindPagePlugin, usePagePluginResolve } from './page-plugin-host.tsx'

const INDEX_BODY_KEYS = new Set(['html', 'script', 'code', 'source', 'body'])

export function isSlimBlockIndexData(value: Record<string, unknown>) {
  if (!value.attrs || typeof value.attrs !== 'object' || Array.isArray(value.attrs)) return false
  if (!Array.isArray(value.assets)) return false
  if (typeof value.blockId !== 'string' && typeof value.kind !== 'string') return false
  for (const key of INDEX_BODY_KEYS) {
    if (key in value) return false
  }
  return true
}

export function parsePageBlockRowData(raw: unknown): Record<string, unknown> {
  let parsed: Record<string, unknown> | null = null
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = { ...(raw as Record<string, unknown>) }
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const next = JSON.parse(raw) as unknown
      if (next && typeof next === 'object' && !Array.isArray(next)) parsed = next as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  if (!parsed) return {}
  if (isSlimBlockIndexData(parsed)) return { ...(parsed.attrs as Record<string, unknown>) }
  return parsed
}

export async function writeBlockData(id: string, data: Record<string, unknown>) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/editor-blocks/${id}`, content: { data } }),
  })
  const body = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  window.dispatchEvent(new Event('fsdb:change'))
}

export function mergeLiveBlockData(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  opts?: { replace?: boolean; title?: string },
) {
  const next = opts?.replace ? { ...patch } : { ...current, ...patch }
  const title = typeof opts?.title === 'string' ? opts.title.trim() : ''
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) return next
  if (title) next.title = title
  else delete next.title
  return next
}

export function persistBlockDataPatch(data: Record<string, unknown>, patch: Record<string, unknown>) {
  const out = { ...data }
  if (!Object.prototype.hasOwnProperty.call(patch, 'title')) delete out.title
  return out
}

export function PageBlockStage({
  row,
  raw,
  writable = true,
  onChange,
}: {
  row: DbRecord
  raw?: unknown
  writable?: boolean
  onChange?: (next: Record<string, unknown>) => void
}) {
  const kind = String(row.blockKind ?? row.kind ?? '').trim()
  const plugin = String(row.plugin ?? '').trim()
  const { spec, View, phase } = usePagePluginResolve(kind, plugin)
  const hostRef = useBindPagePlugin<HTMLDivElement>(plugin)
  const source = raw ?? row.data
  const packed = typeof source === 'string' ? source : JSON.stringify(source ?? {})
  const recordTitle = String(row.title ?? '').trim()
  const [data, setData] = useState(() => {
    const parsed = parsePageBlockRowData(source)
    if (recordTitle) parsed.title = recordTitle
    return parsed
  })
  const dataRef = useRef(data)
  dataRef.current = data
  useEffect(() => {
    const parsed = parsePageBlockRowData(source)
    if (recordTitle) parsed.title = recordTitle
    setData((prev) => (blockDataUnchanged(prev, parsed) ? prev : parsed))
  }, [packed, recordTitle])
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const rowId = String(row.id)
  const writeQ = useRef(Promise.resolve())
  const update = useCallback((patch: Record<string, unknown>, opts?: { replace?: boolean }) => {
    const report = onChangeRef.current
    if (report) {
      const next = mergeLiveBlockData(dataRef.current, patch, { replace: opts?.replace, title: recordTitle })
      if (blockDataUnchanged(dataRef.current, next)) return
      dataRef.current = next
      setData(next)
      report(persistBlockDataPatch(next, patch))
      return
    }
    writeQ.current = writeQ.current.then(async () => {
      const next = mergeLiveBlockData(dataRef.current, patch, { replace: opts?.replace, title: recordTitle })
      if (blockDataUnchanged(dataRef.current, next)) return
      await writeBlockData(rowId, persistBlockDataPatch(next, patch))
      dataRef.current = next
      setData(next)
    }).catch(() => undefined)
  }, [recordTitle, rowId])
  return (
    <div
      ref={hostRef}
      {...pagePluginHostAttrs({
        kind,
        plugin,
        blockId: String(row.blockId ?? ''),
        label: spec?.label || kind,
        testId: 'page-block-stage',
      })}
    >
      <PagePluginSurface
        kind={kind}
        plugin={plugin}
        data={data}
        update={update}
        writable={writable}
        View={View}
        phase={phase}
      />
    </div>
  )
}
