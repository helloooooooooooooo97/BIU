import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { RenderBoundary } from '@biu/biu-ui'
import { apiFetch } from '@biu/biu-ui/api-client'
import { emitFsdbChange, type CollectionSchema, type DbRecord, type FieldSpec, type FieldType } from '@biu/type-file-system'
import { defaultTableSandboxCode, type TableSandboxItem } from '../shared/table-sandbox-model.ts'
import { HostSourceEditor } from './host-source-editor.tsx'
import { createBiuProxy } from './sandbox-biu.ts'
import { compileHostSource, loadSandboxComponent, SandboxPreview } from './sandbox-compile.ts'
import {
  SandboxHostBar,
  SandboxSplitResize,
  SandboxToastBanner,
  splitPaneStyle,
  useSandboxEscapeExpand,
  useSandboxToast,
  useScopedSandboxStyles,
  type HostTab,
} from './sandbox-host-shell.tsx'

export type CollectionSandboxColumn = {
  key: string
  kind: FieldType
  field: FieldSpec
}

export function CollectionSandboxHost({
  view,
  collectionPath,
  title,
  rows,
  total,
  schema,
  columns,
  canCreate,
  readOnly = false,
  onOpenRow,
  onOpenRowSplit,
  onCreateRecord,
  onRequestDeleteRecord,
  onPatchView,
  onReload,
}: {
  view: TableSandboxItem
  collectionPath: string
  title: string
  rows: DbRecord[]
  total: number
  schema?: CollectionSchema
  columns: CollectionSandboxColumn[]
  canCreate: boolean
  readOnly?: boolean
  onOpenRow: (row: DbRecord) => void
  onOpenRowSplit: (row: DbRecord) => void
  onCreateRecord: () => Promise<void> | void
  onRequestDeleteRecord?: (row: DbRecord) => void
  onPatchView: (next: TableSandboxItem) => void
  onReload?: () => Promise<void> | void
}) {
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const [splitWidth, setSplitWidth] = useState(0)
  const [source, setSource] = useState(view.code || defaultTableSandboxCode(title))
  const [dataState, setDataState] = useState<Record<string, unknown>>(() => view.data ?? {})
  const previewRef = useRef<HTMLDivElement>(null)
  const splitPaneRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<number | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const { toast, showToast } = useSandboxToast()

  useEffect(() => {
    setSource(view.code || defaultTableSandboxCode(title))
    setDataState(view.data ?? {})
  }, [view.id, title])

  useEffect(() => () => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
  }, [])

  useSandboxEscapeExpand(expanded, setExpanded)
  useScopedSandboxStyles(previewRef, tab !== 'code')

  const commitSource = useCallback(
    (nextCode: string) => {
      setSource(nextCode)
      if (readOnly) return
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        onPatchView({ ...viewRef.current, code: nextCode })
      }, 360)
    },
    [onPatchView, readOnly],
  )

  const compiled = useMemo(() => compileHostSource(source, 'Block'), [source])

  const resolveRow = useCallback((rowOrId: DbRecord | string) => {
    if (typeof rowOrId === 'string') {
      return rowsRef.current.find((item) => String(item.id) === rowOrId) ?? ({ id: rowOrId } as DbRecord)
    }
    return rowOrId
  }, [])

  const biuBagRef = useRef<{ biu: Record<string, unknown> }>({ biu: {} })
  const biuProxy = useMemo(() => createBiuProxy(biuBagRef), [])

  const biuRaw = useMemo(() => {
    const colInfo = columns.map((col) => ({
      key: col.key,
      label: String(col.field.label ?? col.key),
      type: col.kind,
      writable: Boolean(col.field.writable),
      spec: col.field,
    }))
    return {
      rows,
      total,
      columns: colInfo,
      schema,
      path: collectionPath,
      title,
      canCreate,
      data: dataState,
      setData(next: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) {
        setDataState((prev) => {
          const resolved = typeof next === 'function' ? next(prev) : next
          if (!readOnly) onPatchView({ ...viewRef.current, data: resolved })
          return resolved
        })
      },
      open(rowOrId: DbRecord | string) {
        onOpenRow(resolveRow(rowOrId))
      },
      openSplit(rowOrId: DbRecord | string) {
        onOpenRowSplit(resolveRow(rowOrId))
      },
      async create() {
        await Promise.resolve(onCreateRecord())
      },
      async update(rowOrId: DbRecord | string, patch: Record<string, unknown>) {
        const target = resolveRow(rowOrId)
        const id = String(target.id ?? '').trim()
        if (!id) return
        const targetPath = `${collectionPath.replace(/\/+$/, '')}/${id}`
        const res = await apiFetch('/api/db/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: targetPath, content: patch }),
        })
        if (!res.ok) throw new Error(`update failed (${res.status})`)
        emitFsdbChange({ scope: 'content', path: targetPath })
        await Promise.resolve(onReload?.())
      },
      delete(rowOrId: DbRecord | string) {
        onRequestDeleteRecord?.(resolveRow(rowOrId))
      },
      toast: showToast,
    }
  }, [
    canCreate,
    collectionPath,
    columns,
    dataState,
    onCreateRecord,
    onOpenRow,
    onOpenRowSplit,
    onPatchView,
    onReload,
    onRequestDeleteRecord,
    readOnly,
    resolveRow,
    rows,
    schema,
    showToast,
    title,
    total,
  ])
  biuBagRef.current.biu = biuRaw

  const revision = useMemo(
    () => `${rows.length}:${total}:${rows.map((r) => `${r.id}:${String(r.updatedAt ?? '')}:${String(r.title ?? '')}`).join('|')}:${JSON.stringify(dataState)}`,
    [dataState, rows, total],
  )

  const loadPreview = useCallback((): ComponentType => {
    if (!compiled.ok) throw new Error(compiled.error)
    return loadSandboxComponent(compiled, {
      React,
      biu: biuProxy,
      getPreview: () => previewRef.current,
    }) as ComponentType
  }, [biuProxy, compiled])

  const previewNode = (
    <div className="fsdb-collection-sandbox-preview" ref={previewRef}>
      {compiled.ok ? (
        <RenderBoundary key={compiled.code}>
          <SandboxPreview
            code={compiled.code}
            load={loadPreview}
            errorTestId="collection-sandbox-error"
            revision={revision}
          />
        </RenderBoundary>
      ) : (
        <div className="page-host-error" data-testid="collection-sandbox-error">
          {compiled.error}
        </div>
      )}
    </div>
  )

  const editorNode = (
    <div className="fsdb-collection-sandbox-editor">
      <HostSourceEditor
        value={source}
        writable={!readOnly}
        onChange={commitSource}
        testId="collection-sandbox-editor"
      />
    </div>
  )

  const content = (
    <div
      className={`fsdb-collection-sandbox${expanded ? ' is-expanded' : ''}${tab === 'split' ? ' is-split' : ''}`}
      data-testid="collection-sandbox-host"
    >
      <SandboxHostBar
        tab={tab}
        onTab={setTab}
        ro={readOnly}
        expanded={expanded}
        onExpand={() => setExpanded((prev) => !prev)}
        title={view.name}
        onTitle={(nextName) => {
          const trimmed = nextName.trim()
          if (!trimmed || trimmed === view.name) return
          onPatchView({ ...viewRef.current, name: trimmed })
        }}
        testIdPrefix="collection-sandbox"
        kindLabel="表级沙箱视图"
      />
      <SandboxToastBanner toast={toast} testId="collection-sandbox-toast" />
      <div className={`fsdb-collection-sandbox-stage${tab === 'split' ? ' is-split' : ''}`}>
        {tab === 'preview' ? previewNode : null}
        {tab === 'code' ? editorNode : null}
        {tab === 'split' ? (
          <>
            <div className="fsdb-collection-sandbox-pane" ref={splitPaneRef} style={splitPaneStyle(splitWidth)}>
              {previewNode}
            </div>
            <SandboxSplitResize paneRef={splitPaneRef} onWidth={setSplitWidth} testId="collection-sandbox-split-resize" />
            <div className="fsdb-collection-sandbox-pane is-code">{editorNode}</div>
          </>
        ) : null}
      </div>
    </div>
  )

  if (expanded && typeof document !== 'undefined') {
    return createPortal(<div className="page-block-expand-backdrop">{content}</div>, document.body)
  }
  return content
}
