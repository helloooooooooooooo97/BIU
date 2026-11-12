import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CodeBracketIcon, EyeIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import {
  fieldIsWritable,
  matchSchemaField,
  resolveSchemaFieldKey,
  sanitizeRecordPatch,
  withBuiltinFields,
  type CollectionSchema,
  type DbRecord,
} from '@biu/type-file-system'
import { defaultContentSandboxSource } from '@biu/type-file-system/record-views'
import { listPageBlockFences, pageBlockData, pageBlockRecordId } from '../page-block-fence.ts'
import { compileHostSource, loadHostComponent, SandboxPreview } from './page-host-compile.ts'
import { PageBlockStage, writeBlockData } from './page-blocks-view.tsx'
import { ExpandNavTitle } from './expand-nav-title.tsx'
import { getPageViews, peekPageFile, readPageFile, renamePageSandboxView, usePageFileTick, usePageViews, writePageFile, type PageSandboxView } from './page-views.ts'
import { getPageLayouts, usePageLayouts } from './page-layouts.ts'
import { capturePageScroll } from './page-scroll-pin.ts'
import { getBlockEditor, useBlockEditorVersion } from './service.ts'
import { RenderBoundary } from '@biu/biu-ui'
import { HostSourceEditor } from '@biu/core-file-system/host-source-editor'
import { useLiveDbRecord } from '@biu/core-file-system/record-prop-host'
import { createSandboxDocsApi, createSandboxFilesApi } from '@biu/core-file-system/sandbox-files'
import { bindSandboxPickPane, pageHostPickKey } from './page-host-pick.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'
import { HostField } from './host-field.tsx'
import { SplitResize, splitPaneStyle } from './sandbox/split-resize.tsx'

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

async function patchPageRecord(pageId: string, bag: Record<string, unknown>) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `/pages/${pageId}`, content: bag }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  window.dispatchEvent(new Event('fsdb:change'))
}

export async function writePageHostBlock(pageId: string, blockId: string, patch: Record<string, unknown>) {
  const id = String(blockId ?? '').trim()
  if (!id) return false
  await writeBlockData(pageBlockRecordId('/pages', pageId, id), patch)
  return true
}

export function listPageHostBlocks(pageId: string, markdown = ''): HostBlockInfo[] {
  const out: HostBlockInfo[] = []
  for (const fence of listPageBlockFences(markdown)) {
    const blockId = String(fence.id ?? '').trim()
    if (!blockId) continue
    const data = asData(pageBlockData(fence))
    out.push({
      id: pageBlockRecordId('/pages', pageId, blockId),
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
}: {
  id: string
  blocks: HostBlockInfo[]
  writable: boolean
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
        void writePageHostBlock(hit.pageId, hit.blockId, next).catch(() => undefined)
      }}
      key={hit.blockId}
    />
  )
}

function layoutSandboxOf(pageId: string, viewId: string) {
  return getPageLayouts(pageId).find((item) => item.id === viewId && item.kind === 'sandbox' && item.file)
}

function viewOf(pageId: string, viewId: string): PageSandboxView | undefined {
  const content = getPageViews(pageId).find((item) => item.id === viewId)
  if (content) return content
  const layout = layoutSandboxOf(pageId, viewId)
  if (!layout?.file) return
  return {
    id: layout.id,
    name: layout.name,
    kind: 'sandbox',
    file: layout.file,
    dataFile: layout.dataFile || `layout-data-${layout.id}.json`,
  }
}

type HostTab = 'preview' | 'code' | 'split'

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function HostTools({
  tab,
  onTab,
  ro,
  expanded,
  onExpand,
}: {
  tab: HostTab
  onTab: (next: HostTab) => void
  ro: boolean
  expanded: boolean
  onExpand: () => void
}) {
  const coding = tab === 'code'
  return (
    <>
      {ro ? null : (
        <>
          <button
            type="button"
            className={`page-slide-icon${coding ? ' is-on' : ''}`}
            title={coding ? '预览' : '编辑'}
            aria-label={coding ? '预览' : '编辑'}
            aria-pressed={coding}
            data-testid="page-host-edit"
            onMouseDown={hold}
            onClick={() => onTab(coding ? 'preview' : 'code')}
          >
            {coding ? <EyeIcon aria-hidden className="page-slide-ico" /> : <CodeBracketIcon aria-hidden className="page-slide-ico" />}
          </button>
          <button
            type="button"
            className={`page-slide-icon${tab === 'split' ? ' is-on' : ''}`}
            data-testid="page-host-split"
            title={tab === 'split' ? '取消分栏' : '分栏：左预览，右代码'}
            aria-label={tab === 'split' ? '取消分栏' : '分栏'}
            aria-pressed={tab === 'split'}
            onMouseDown={hold}
            onClick={() => onTab(tab === 'split' ? 'preview' : 'split')}
          >
            <ViewColumnsIcon aria-hidden className="page-slide-ico" />
          </button>
        </>
      )}
      <button
        type="button"
        className="page-slide-icon"
        data-page-block-expand=""
        data-testid="page-host-expand"
        title={expanded ? '缩小' : '放大'}
        aria-label={expanded ? '缩小' : '放大'}
        onMouseDown={hold}
        onClick={onExpand}
      >
        {expanded ? <ArrowsPointingInIcon aria-hidden className="page-slide-ico" /> : <ArrowsPointingOutIcon aria-hidden className="page-slide-ico" />}
      </button>
    </>
  )
}

function HostBar({
  tab,
  onTab,
  ro,
  expanded,
  onExpand,
  title,
  onTitle,
}: {
  tab: HostTab
  onTab: (next: HostTab) => void
  ro: boolean
  expanded: boolean
  onExpand: () => void
  title: string
  onTitle: (next: string) => void
}) {
  const tools = <HostTools tab={tab} onTab={onTab} ro={ro} expanded={expanded} onExpand={onExpand} />
  return (
    <div
      className="page-block-expand-nav"
      data-testid={expanded ? 'page-host-expand-nav' : 'page-host-side-bar'}
      data-biu-ignore
    >
      <div className="page-block-expand-nav-type" data-testid="page-host-type-icon" title="沙箱" aria-label="沙箱">
        <SandboxKindIcon />
      </div>
      <ExpandNavTitle value={title} readOnly={ro} testId="page-host-title" onCommit={onTitle} />
      <div className="page-block-expand-nav-tools">{tools}</div>
    </div>
  )
}

export function PageHostView({
  record,
  viewId,
  writable = true,
  markdown = '',
  schema,
}: {
  record: DbRecord
  viewId: string
  writable?: boolean
  markdown?: string
  schema?: CollectionSchema
}) {
  const editorVersion = useBlockEditorVersion()
  const fileTick = usePageFileTick()
  const pageId = String(record.id)
  usePageViews(pageId)
  usePageLayouts(pageId)
  const view = viewOf(pageId, viewId)
  const layoutView = layoutSandboxOf(pageId, viewId)
  const fallback = defaultContentSandboxSource(String(record.title ?? ''))
  const [source, setSource] = useState(() => peekPageFile(view?.file ?? '') || fallback)
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(0)
  const [live, setLive] = useLiveDbRecord('/pages', record)
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'
  const hostRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const blocks = useMemo(() => listPageHostBlocks(pageId, markdown), [pageId, markdown])
  const [patchError, setPatchError] = useState('')
  const fields = useMemo(() => layoutFields(live, schema), [live, schema])

  const setHostTab = useCallback((next: HostTab) => {
    capturePageScroll(hostRef.current)
    setTab(next)
  }, [])

  useEffect(() => {
    let gone = false
    const file = view?.file
    const next = defaultContentSandboxSource(String(record.title ?? ''))
    if (!file) {
      setSource(next)
      return
    }
    const cached = peekPageFile(file)
    if (cached != null) {
      setSource(cached)
      return
    }
    void readPageFile(file, next).then((text) => {
      if (!gone) setSource(text)
    })
    return () => {
      gone = true
    }
  }, [pageId, view?.file, layoutView, record.title, fileTick])

  const writeRecord = useCallback(
    async (bag: Record<string, unknown>) => {
      try {
        const patch = sanitizeRecordPatch(hostSchema(schema), bag)
        await patchPageRecord(pageId, patch)
        setLive((cur) => ({ ...cur, ...patch }))
        setPatchError('')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPatchError(message)
        throw error
      }
    },
    [pageId, schema],
  )

  const compiled = useMemo(() => compileHostSource(source, layoutView ? 'Layout' : 'Block'), [source, layoutView])
  const biu = useMemo(
    () => ({
      page: () => ({ id: pageId, title: String(live.title ?? record.title ?? '').trim() }),
      record: () => ({ ...live }),
      fields: () => fields.map((item) => ({ ...item })),
      values: () => Object.fromEntries(fields.map((item) => [item.key, live[item.key]])),
      findFieldByName: (name: string) => matchSchemaField(fields, name),
      fieldKey: (name: string) => matchSchemaField(fields, name)?.key ?? '',
      get: (key: string) => live[resolveSchemaFieldKey(fields, key)],
      set: (key: string, value: unknown) => writeRecord({ [resolveSchemaFieldKey(fields, key)]: value }),
      patch: (bag: unknown) => writeRecord(bag as Record<string, unknown>),
      blocks: () => blocks.map((item) => ({ ...item })),
      kinds: () => getBlockEditor()?.blocks().map((item) => ({ kind: item.kind, plugin: item.plugin, label: item.label })) ?? [],
      read: async () => {
        if (!view?.dataFile) return null
        try {
          const text = await readPageFile(view.dataFile, 'null')
          if (!text.trim() || text.trim() === 'null') return null
          return JSON.parse(text) as unknown
        } catch {
          return null
        }
      },
      write: async (value: unknown) => {
        if (!view?.dataFile) return
        await writePageFile(view.dataFile, JSON.stringify(value ?? null, null, 2), 'application/json')
      },
      files: createSandboxFilesApi(() => `/pages/${pageId}`),
      docs: createSandboxDocsApi(() => `/pages/${pageId}`),
      update: (id: string, patch: Record<string, unknown>) => writePageHostBlock(pageId, id, patch),
    }),
    [blocks, editorVersion, fields, live, pageId, record.title, view?.dataFile, writeRecord],
  )

  const Block = useCallback(
    (props: { id: string; writable?: boolean }) => (
      <HostBlock id={String(props.id ?? '')} blocks={blocks} writable={props.writable ?? writable} />
    ),
    [blocks, writable],
  )

  const Field = useCallback(
    (props: { name?: string }) => (
      <HostField
        name={String(props.name ?? '')}
        record={live}
        schema={hostSchema(schema)}
        writable={writable}
        onSet={(key, value) => {
          void writeRecord({ [key]: value })
        }}
      />
    ),
    [live, schema, writable, writeRecord],
  )

  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setExpanded(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [expanded])

  const envRef = useRef({ Block, Field, biu })
  envRef.current = { Block, Field, biu }

  useLayoutEffect(() => {
    if (!showPreview) return
    return bindSandboxPickPane(previewRef.current, pageHostPickKey(pageId, viewId), {
      path: `/pages/${pageId}`,
      ...(view?.file ? { name: view.file } : {}),
      ...(view?.name ? { title: view.name } : {}),
    })
  }, [showPreview, pageId, viewId, view?.file, view?.name, compiled])

  const card = (
    <div
      ref={hostRef}
      className={`page-host-view${expanded ? ' is-expanded' : ''}`}
      data-testid="page-host-view"
      data-page-host-expanded={expanded ? '1' : undefined}
    >
      <HostBar
        tab={tab}
        onTab={setHostTab}
        ro={!writable}
        expanded={expanded}
        onExpand={() => setExpanded((open) => !open)}
        title={view?.name?.trim() || '沙盒'}
        onTitle={(next) => {
          if (view) void renamePageSandboxView(pageId, view.id, next)
        }}
      />
      <div className="page-host-stage">
        {showPreview ? (
          <div
            ref={previewRef}
            className="page-host-preview-pane"
            style={splitPaneStyle(showCode ? previewWidth : 0)}
            data-testid="page-host-preview"
            data-sandbox=""
            data-page-path={`/pages/${pageId}`}
            data-biu-path={`/pages/${pageId}`}
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
                      const biuProxy = {
                        page: () => envRef.current.biu.page(),
                        record: () => envRef.current.biu.record(),
                        fields: () => envRef.current.biu.fields(),
                        values: () => envRef.current.biu.values(),
                        findFieldByName: (name: string) => envRef.current.biu.findFieldByName(name),
                        fieldKey: (name: string) => envRef.current.biu.fieldKey(name),
                        get: (key: string) => envRef.current.biu.get(key),
                        set: (key: string, value: unknown) => envRef.current.biu.set(key, value),
                        patch: (bag: unknown) => envRef.current.biu.patch(bag),
                        blocks: () => envRef.current.biu.blocks(),
                        kinds: () => envRef.current.biu.kinds(),
                        read: () => envRef.current.biu.read(),
                        write: (value: unknown) => envRef.current.biu.write(value),
                        files: envRef.current.biu.files,
                        docs: envRef.current.biu.docs,
                        update: (id: string, patch: Record<string, unknown>) => envRef.current.biu.update(id, patch),
                      }
                      return loadHostComponent(compiled.code, React, BlockProxy, FieldProxy, biuProxy) as ComponentType
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
            {showCode ? <SplitResize paneRef={previewRef} onWidth={setPreviewWidth} testId="page-host-split-resize" /> : null}
          </div>
        ) : null}
        {showCode ? (
          <div
            className={`page-host-code-pane${showPreview ? ' is-split' : ''}`}
            data-testid="page-host-code"
            data-biu-kind="sandbox"
            data-biu-id={`sandbox:${pageHostPickKey(pageId, viewId)}:source`}
            data-biu-label={view?.name || '沙盒'}
            data-biu-path={`/pages/${pageId}`}
            data-biu-name={view?.file || undefined}
            data-biu-title={view?.name || undefined}
          >
            <HostSourceEditor
              value={source}
              language="javascript"
              writable={writable}
              pickHost={{
                path: `/pages/${pageId}`,
                name: view?.file,
                title: view?.name || String(record.title ?? '').trim(),
              }}
              onChange={(next) => {
                setSource(next)
                if (view?.file && writable) void writePageFile(view.file, next)
              }}
            />
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
