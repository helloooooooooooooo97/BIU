import { apiFetch } from '@biu/biu-ui/api-client'
import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import {
  fieldIsWritable,
  sanitizeRecordPatch,
  withBuiltinFields,
  type CollectionSchema,
  type DbRecord,
  emitFsdbChange,
} from '@biu/type-file-system'
import { defaultContentSandboxSource } from '@biu/type-file-system/record-views'
import type { RecordSandboxView } from '@biu/type-file-system/record-views'
import { RenderBoundary } from '@biu/biu-ui'
const HostSourceEditor = lazy(() =>
  import('@biu/core-file-system/host-source-editor').then((m) => ({ default: m.HostSourceEditor })),
)
import { getRecordViewCatalog, useRecordViewCatalog } from '@biu/core-file-system/record-view-catalog'
import { writeRecordViewCatalog } from '@biu/core-file-system/record-sandboxes'
import { SandboxHostField, useLiveDbRecord } from '@biu/core-file-system/record-prop-host'
import { compileHostSource, loadSandboxComponent, SandboxPreview } from '@biu/core-file-system/sandbox-compile'
import { createBiuProxy, createRecordSandboxBiu } from '@biu/core-file-system/sandbox-biu'
import {
  SandboxHostBar,
  SandboxSplitResize,
  SandboxToastBanner,
  splitPaneStyle,
  useDebouncedSandboxSource,
  useSandboxEscapeExpand,
  useSandboxToast,
  useScopedSandboxStyles,
  type HostTab,
} from '@biu/core-file-system/sandbox-host-shell'
import { listPageBlockFences, pageBlockData, pageBlockRecordId } from '../page-block-fence.ts'
import { PageBlockStage, writeBlockData } from './page-blocks-view.tsx'
import { capturePageScroll } from './editor-scroll-pin.ts'
import { getBlockEditor, useBlockEditorVersion } from './service.ts'
import { bindSandboxPickPane, pageHostPickKey } from './page-host-pick.ts'

export type HostBlockInfo = {
  id: string
  pageId: string
  blockId: string
  kind: string
  plugin: string
  title: string
  data: Record<string, unknown>
}

function asData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

const LAYOUT_FIELD_SKIP = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'content',
  'emoji',
  'views',
  'propViews',
  'layouts',
  'parentId',
  'dependsOn',
  'createdBy',
  'updatedBy',
  'file',
  'tablePath',
  'sourceId',
])

function hostSchema(schema?: CollectionSchema): CollectionSchema {
  if (schema?.fields) return schema
  return { fields: withBuiltinFields({}) }
}

function layoutFields(record: DbRecord, schema?: CollectionSchema) {
  const fields = hostSchema(schema).fields
  const keys = Object.keys(fields).filter((key) => !LAYOUT_FIELD_SKIP.has(key))
  if (!keys.includes('title')) keys.unshift('title')
  for (const key of Object.keys(record)) {
    if (LAYOUT_FIELD_SKIP.has(key) || keys.includes(key) || !fields[key]) continue
    keys.push(key)
  }
  return keys.map((key) => {
    const spec = fields[key]
    return {
      key,
      type: spec?.type ?? 'string',
      label: spec?.label ?? (key === 'title' ? '标题' : key === 'tag' ? '标签' : key),
      writable: fieldIsWritable(spec),
    }
  })
}

async function patchPageRecord(collectionPath: string, pageId: string, bag: Record<string, unknown>) {
  const path = `${collectionPath}/${pageId}`
  const res = await apiFetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, content: bag }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  emitFsdbChange({ scope: 'content', path })
}

export async function writePageHostBlock(pageId: string, blockId: string, patch: Record<string, unknown>, collectionPath = '') {
  const id = String(blockId ?? '').trim()
  if (!id) return false
  await writeBlockData(pageBlockRecordId(collectionPath, pageId, id), patch)
  return true
}

export function listPageHostBlocks(pageId: string, markdown = '', collectionPath = ''): HostBlockInfo[] {
  const out: HostBlockInfo[] = []
  for (const fence of listPageBlockFences(markdown)) {
    const blockId = String(fence.id ?? '').trim()
    if (!blockId) continue
    const data = asData(pageBlockData(fence))
    out.push({
      id: pageBlockRecordId(collectionPath, pageId, blockId),
      pageId,
      blockId,
      kind: fence.kind,
      plugin: fence.plugin,
      title: String(data.title ?? '').trim(),
      data,
    })
  }
  return out
}

function HostBlock({
  id,
  blocks,
  writable,
  collectionPath,
}: {
  id: string
  blocks: HostBlockInfo[]
  writable: boolean
  collectionPath: string
}) {
  const hit = blocks.find((item) => item.blockId === id || item.id === id || item.id.endsWith(`::${id}`))
  if (!hit) {
    return (
      <div className="page-host-missing" data-testid="page-host-missing">
        找不到块 {id}
      </div>
    )
  }
  const row: DbRecord = {
    id: hit.id,
    title: hit.title || hit.kind,
    pageId: hit.pageId,
    blockId: hit.blockId,
    blockKind: hit.kind,
    plugin: hit.plugin,
    data: hit.data,
  }
  return (
    <PageBlockStage
      row={row}
      writable={writable}
      onChange={(next) => {
        void writePageHostBlock(hit.pageId, hit.blockId, next, collectionPath).catch(() => undefined)
      }}
      key={hit.blockId}
    />
  )
}

function viewOf(collectionPath: string, pageId: string, viewId: string): RecordSandboxView | undefined {
  return getRecordViewCatalog(collectionPath, pageId).views.find((item) => item.id === viewId)
}

async function renameSandboxView(collectionPath: string, pageId: string, viewId: string, name: string) {
  const nextName = name.trim()
  if (!nextName) return
  const listed = getRecordViewCatalog(collectionPath, pageId).views.map((item) =>
    item.id === viewId ? { ...item, name: nextName } : item,
  )
  await writeRecordViewCatalog(collectionPath, pageId, 'views', listed)
}

export function PageHostView({
  record,
  viewId,
  writable = true,
  markdown = '',
  schema,
  collectionPath = '',
}: {
  record: DbRecord
  viewId: string
  writable?: boolean
  markdown?: string
  schema?: CollectionSchema
  collectionPath?: string
}) {
  const editorVersion = useBlockEditorVersion()
  const pageId = String(record.id)
  const path = String(collectionPath ?? '').trim()
  useRecordViewCatalog(path, pageId)
  const view = viewOf(path, pageId, viewId)
  const fallback = useMemo(() => defaultContentSandboxSource(String(record.title ?? '')), [record.title])
  const { source, compiledSource, onSourceChange } = useDebouncedSandboxSource({
    collectionPath: path,
    recordId: pageId,
    file: view?.file ?? '',
    fallback,
    writable,
  })
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(0)
  const [live, setLive] = useLiveDbRecord(path, record)
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'
  const hostRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const blocks = useMemo(() => listPageHostBlocks(pageId, markdown, path), [pageId, markdown, path])
  const [patchError, setPatchError] = useState('')
  const { toast, showToast } = useSandboxToast()
  const fields = useMemo(() => layoutFields(live, schema), [live, schema])

  const liveRef = useRef(live)
  const recordListenersRef = useRef(new Set<() => void>())
  liveRef.current = live
  useEffect(() => {
    for (const fn of recordListenersRef.current) fn()
  }, [live])
  const subscribeRecord = useCallback((fn: () => void) => {
    recordListenersRef.current.add(fn)
    return () => {
      recordListenersRef.current.delete(fn)
    }
  }, [])
  const getLiveRecord = useCallback(() => liveRef.current, [])

  const setHostTab = useCallback((next: HostTab) => {
    capturePageScroll(hostRef.current)
    setTab(next)
  }, [])

  const writeRecord = useCallback(
    async (bag: Record<string, unknown>) => {
      try {
        const patch = sanitizeRecordPatch(hostSchema(schema), bag)
        await patchPageRecord(path, pageId, patch)
        setLive((cur) => ({ ...cur, ...patch }))
        setPatchError('')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPatchError(message)
        throw error
      }
    },
    [pageId, path, schema, setLive],
  )

  const compiled = useMemo(() => compileHostSource(compiledSource, 'Block'), [compiledSource])
  const biu = useMemo(
    () =>
      createRecordSandboxBiu({
        collectionPath: path,
        recordId: pageId,
        live,
        fields,
        dataFile: view?.dataFile,
        writeRecord,
        subscribeRecord,
        getLiveRecord,
        onToast: showToast,
        extra: {
          page: () => ({ id: pageId, title: String(liveRef.current.title ?? record.title ?? '').trim() }),
          blocks: () => blocks.map((item) => ({ ...item })),
          kinds: () => getBlockEditor()?.blocks().map((item) => ({ kind: item.kind, plugin: item.plugin, label: item.label })) ?? [],
          update: (id: string, patch: Record<string, unknown>) => writePageHostBlock(pageId, id, patch, path),
        },
      }),
    [blocks, editorVersion, fields, getLiveRecord, live, pageId, path, record.title, showToast, subscribeRecord, view?.dataFile, writeRecord],
  )

  const Block = useCallback(
    (props: { id?: string; writable?: boolean }) => (
      <HostBlock id={String(props.id ?? '')} blocks={blocks} writable={props.writable ?? writable} collectionPath={path} />
    ),
    [blocks, writable, path],
  )

  const Field = useCallback(
    (props: { name?: string }) => (
      <SandboxHostField
        name={String(props.name ?? '')}
        record={live}
        schema={hostSchema(schema)}
        writable={writable}
        collectionPath={path}
        missingTestId="page-host-missing"
        onSet={(key, value) => {
          void writeRecord({ [key]: value })
        }}
      />
    ),
    [live, path, schema, writable, writeRecord],
  )

  useSandboxEscapeExpand(expanded, setExpanded)
  useScopedSandboxStyles(previewRef, showPreview)

  const envRef = useRef({ Block, Field, biu })
  envRef.current = { Block, Field, biu }

  useLayoutEffect(() => {
    if (!showPreview) return
    return bindSandboxPickPane(previewRef.current, pageHostPickKey(pageId, viewId), {
      path: `${path}/${pageId}`,
      ...(view?.file ? { name: view.file } : {}),
      ...(view?.name ? { title: view.name } : {}),
    })
  }, [showPreview, pageId, path, viewId, view?.file, view?.name, compiled, expanded])

  const card = (
    <div
      ref={hostRef}
      className={`page-host-view${expanded ? ' is-expanded' : ''}`}
      data-testid="page-host-view"
      data-page-host-expanded={expanded ? '1' : undefined}
    >
      <SandboxHostBar
        tab={tab}
        onTab={setHostTab}
        ro={!writable}
        expanded={expanded}
        onExpand={() => setExpanded((open) => !open)}
        title={view?.name?.trim() || '沙盒'}
        onTitle={(next) => {
          if (view) void renameSandboxView(path, pageId, view.id, next)
        }}
        testIdPrefix="page-host"
        kindLabel="沙盒"
      />
      <SandboxToastBanner toast={toast} testId="page-host-toast" />
      <div className="page-host-stage">
        {showPreview ? (
          <div
            ref={previewRef}
            className="page-host-preview-pane"
            style={splitPaneStyle(showCode ? previewWidth : 0)}
            data-testid="page-host-preview"
            data-sandbox=""
            data-page-path={`${path}/${pageId}`}
            data-biu-path={`${path}/${pageId}`}
            data-biu-name={view?.file || undefined}
            data-biu-title={view?.name || undefined}
          >
            {compiled.ok ? (
              <>
                <RenderBoundary key={compiled.code} label={view?.name || view?.file || '页面沙盒'}>
                  <SandboxPreview
                    code={compiled.code}
                    revision={`${live.updatedAt ?? ''}:${JSON.stringify(live.tag ?? '')}`}
                    errorTestId="page-host-error"
                    load={() => {
                      const BlockProxy = (props: { id?: string; writable?: boolean }) => envRef.current.Block(props)
                      const FieldProxy = (props: { name?: string }) => envRef.current.Field(props)
                      const biuProxy = createBiuProxy(envRef)
                      return loadSandboxComponent(compiled, {
                        React,
                        Block: BlockProxy,
                        Field: FieldProxy,
                        biu: biuProxy,
                        getPreview: () => previewRef.current,
                      }) as ComponentType
                    }}
                  />
                </RenderBoundary>
                {patchError ? (
                  <div className="page-host-error" data-testid="page-host-patch-error">
                    写入失败 · {patchError}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="page-host-error" data-testid="page-host-error">
                {compiled.error || '无法渲染'}
              </div>
            )}
            {showCode ? <SandboxSplitResize paneRef={previewRef} onWidth={setPreviewWidth} testId="page-host-split-resize" /> : null}
          </div>
        ) : null}
        {showCode ? (
          <div
            className={`page-host-code-pane${showPreview ? ' is-split' : ''}`}
            data-testid="page-host-code"
            data-biu-kind="sandbox"
            data-biu-id={`sandbox:${pageHostPickKey(pageId, viewId)}:source`}
            data-biu-label={view?.name || '沙盒'}
            data-biu-path={`${path}/${pageId}`}
            data-biu-name={view?.file || undefined}
            data-biu-title={view?.name || undefined}
          >
            <Suspense fallback={null}>
              <HostSourceEditor
                value={source}
                language="javascript"
                writable={writable}
                pickHost={{
                  path: `${path}/${pageId}`,
                  name: view?.file,
                  title: view?.name || String(record.title ?? '').trim(),
                }}
                onChange={onSourceChange}
              />
            </Suspense>
            <div
              className="page-host-compile"
              data-testid="page-host-compile"
              data-ok={compiled.ok && !patchError ? '1' : '0'}
            >
              {compiled.ok ? (patchError ? `写入失败 · ${patchError}` : '编译通过') : `编译失败 · ${compiled.error}`}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return expanded ? createPortal(card, document.body) : card
}
