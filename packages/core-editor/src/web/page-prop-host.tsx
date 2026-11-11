import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CodeBracketIcon, EyeIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import { fieldIsWritable, sanitizeRecordPatch, type CollectionSchema, type DbRecord } from '@biu/type-file-system'
import { compileHostSource, loadHostComponent } from './page-host-compile.ts'
import { ExpandNavTitle } from './expand-nav-title.tsx'
import { SourceEditor } from './source-editor.tsx'
import { defaultPropSandboxSource } from '../page-prop-views.ts'
import {
  getPagePropViews,
  peekPageFile,
  readPageFile,
  renamePagePropSandboxView,
  usePagePropViews,
  writePageFile,
  type PagePropSandboxView,
} from './page-prop-views.ts'
import { usePageFileTick } from './page-views.ts'
import { PAGE_PROP_HIDDEN_VIEW_ID, usePagePropPresentMode } from './page-prop-present.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'
import { bindSandboxPickPane, pagePropHostPickKey } from './page-host-pick.ts'
import { HostField } from './host-field.tsx'
import { SplitResize, splitPaneStyle } from './sandbox/split-resize.tsx'

type HostTab = 'preview' | 'code' | 'split'

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function viewOf(pageId: string, viewId: string): PagePropSandboxView | undefined {
  return getPagePropViews(pageId).find((item) => item.id === viewId)
}

const PROP_FIELD_SKIP = new Set(['emoji', 'views', 'propViews', 'layouts', 'file', 'tablePath', 'sourceId'])

function propFields(schema?: CollectionSchema) {
  return Object.entries(schema?.fields ?? {})
    .filter(([key, field]) => !PROP_FIELD_SKIP.has(key) && key !== schema?.contentField && field.type !== 'file')
    .map(([key, field]) => ({
      key,
      type: field.type,
      label: field.label ?? key,
      writable: fieldIsWritable(field),
      spec: field,
    }))
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
            data-testid="page-prop-host-edit"
            onMouseDown={hold}
            onClick={() => onTab(coding ? 'preview' : 'code')}
          >
            {coding ? <EyeIcon aria-hidden className="page-slide-ico" /> : <CodeBracketIcon aria-hidden className="page-slide-ico" />}
          </button>
          <button
            type="button"
            className={`page-slide-icon${tab === 'split' ? ' is-on' : ''}`}
            data-testid="page-prop-host-split"
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
        data-testid="page-prop-host-expand"
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

export function PagePropHostView({
  record,
  viewId,
  schema,
  writable = true,
  collectionPath = '/pages',
}: {
  record: DbRecord
  viewId: string
  schema?: CollectionSchema
  writable?: boolean
  collectionPath?: string
}) {
  const fileTick = usePageFileTick()
  const pageId = String(record.id)
  usePagePropViews(pageId)
  const view = viewOf(pageId, viewId)
  const fallback = defaultPropSandboxSource(String(record.title ?? ''))
  const [source, setSource] = useState(() => peekPageFile(view?.file ?? '') || fallback)
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(0)
  const [live, setLive] = useState(record)
  const [patchError, setPatchError] = useState('')
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'
  const hostRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const fields = propFields(schema)

  useEffect(() => {
    setLive(record)
  }, [record])

  useEffect(() => {
    let gone = false
    const file = view?.file
    const next = defaultPropSandboxSource(String(record.title ?? ''))
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
  }, [pageId, view?.file, record.title, fileTick])

  const writeRecord = useCallback(
    async (bag: Record<string, unknown>) => {
      try {
        if (!schema) throw new Error('missing collection schema')
        const patch = sanitizeRecordPatch(schema, bag)
        await patchPageRecord(pageId, patch)
        setLive((prev) => ({ ...prev, ...patch }))
        setPatchError('')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPatchError(message)
        throw error
      }
    },
    [pageId, schema],
  )

  const compiled = useMemo(() => compileHostSource(source, 'Field'), [source])
  const biu = useMemo(
    () => ({
      record: () => ({ id: pageId, title: String(live.title ?? '').trim(), path: `/pages/${pageId}` }),
      fields: () => fields.map((item) => ({ key: item.key, type: item.type, label: item.label, writable: item.writable })),
      values: () => {
        const out: Record<string, unknown> = {}
        for (const item of fields) out[item.key] = live[item.key]
        return out
      },
      get: (key: string) => live[String(key ?? '').trim()],
      set: (key: string, value: unknown) => {
        const nextKey = String(key ?? '').trim()
        if (!nextKey) return
        void writeRecord({ [nextKey]: value })
      },
      patch: async (bag: unknown) => {
        if (!bag || typeof bag !== 'object' || Array.isArray(bag)) throw new Error('patch values must be an object')
        await writeRecord(bag as Record<string, unknown>)
      },
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
    }),
    [fields, live, pageId, view?.dataFile, writeRecord],
  )

  const Field = useCallback(
    (props: { name?: string }) => (
      <HostField
        name={String(props.name ?? '')}
        record={live}
        schema={schema}
        writable={writable}
        collectionPath={collectionPath}
        onSet={(key, value) => {
          void writeRecord({ [key]: value })
        }}
      />
    ),
    [live, schema, writable, writeRecord, collectionPath],
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

  const envRef = useRef({ Field, biu })
  envRef.current = { Field, biu }
  const preview = useMemo(() => {
    if (!compiled.ok) return { Preview: null as ComponentType | null, error: compiled.error }
    try {
      const FieldProxy = (props: { name?: string }) => envRef.current.Field(props)
      const biuProxy = {
        record: () => envRef.current.biu.record(),
        fields: () => envRef.current.biu.fields(),
        values: () => envRef.current.biu.values(),
        get: (key: string) => envRef.current.biu.get(key),
        set: (key: string, value: unknown) => envRef.current.biu.set(key, value),
        patch: (bag: unknown) => envRef.current.biu.patch(bag),
        read: () => envRef.current.biu.read(),
        write: (value: unknown) => envRef.current.biu.write(value),
      }
      return {
        Preview: loadHostComponent(compiled.code, React, () => null, FieldProxy, biuProxy) as ComponentType,
        error: '',
      }
    } catch (err) {
      return { Preview: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [compiled])

  useLayoutEffect(() => {
    if (!showPreview) return
    return bindSandboxPickPane(previewRef.current, pagePropHostPickKey(pageId, viewId), {
      path: `/pages/${pageId}`,
      ...(view?.file ? { name: view.file } : {}),
      ...(view?.name ? { title: view.name } : {}),
    })
  }, [showPreview, pageId, viewId, view?.file, view?.name, preview.Preview])

  const card = (
    <div
      ref={hostRef}
      className={`page-host-view page-prop-host${expanded ? ' is-expanded' : ''}`}
      data-testid="page-prop-host"
      data-page-host-expanded={expanded ? '1' : undefined}
    >
      <div className="page-block-expand-nav" data-testid={expanded ? 'page-prop-host-expand-nav' : 'page-prop-host-side-bar'} data-biu-ignore>
        <div className="page-block-expand-nav-type" data-testid="page-prop-host-type-icon" title="属性沙盒" aria-label="属性沙盒">
          <SandboxKindIcon className="size-[14px]" />
        </div>
        <ExpandNavTitle
          value={view?.name?.trim() || '属性沙盒'}
          readOnly={!writable}
          testId="page-prop-host-title"
          onCommit={(next) => {
            if (view && next && next !== view.name) void renamePagePropSandboxView(pageId, view.id, next)
          }}
        />
        <div className="page-block-expand-nav-tools">
          <HostTools tab={tab} onTab={setTab} ro={!writable} expanded={expanded} onExpand={() => setExpanded((open) => !open)} />
        </div>
      </div>
      <div className="page-host-stage">
        {showPreview ? (
          <div
            ref={previewRef}
            className="page-host-preview-pane"
            style={splitPaneStyle(showCode ? previewWidth : 0)}
            data-testid="page-prop-host-preview"
            data-sandbox=""
            data-page-path={`/pages/${pageId}`}
            data-biu-path={`/pages/${pageId}`}
            data-biu-name={view?.file || undefined}
            data-biu-title={view?.name || undefined}
          >
            {preview.Preview ? (
              <>
                <preview.Preview />
                {patchError ? (
                  <div className="page-host-error" data-testid="page-prop-host-patch-error">
                    写入失败 · {patchError}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="page-host-error" data-testid="page-prop-host-error">
                {preview.error || '无法渲染'}
              </div>
            )}
            {showCode ? <SplitResize paneRef={previewRef} onWidth={setPreviewWidth} testId="page-prop-host-split-resize" /> : null}
          </div>
        ) : null}
        {showCode ? (
          <div
            className={`page-host-code-pane${showPreview ? ' is-split' : ''}`}
            data-testid="page-prop-host-code"
            data-biu-kind="sandbox"
            data-biu-id={`sandbox:${pagePropHostPickKey(pageId, viewId)}:source`}
            data-biu-label={view?.name || '属性沙盒'}
            data-biu-path={`/pages/${pageId}`}
            data-biu-name={view?.file || undefined}
            data-biu-title={view?.name || undefined}
          >
            <SourceEditor
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
            <div className="page-host-compile" data-testid="page-prop-host-compile" data-ok={compiled.ok && !patchError ? '1' : '0'}>
              {compiled.ok ? (patchError ? `写入失败 · ${patchError}` : '编译通过') : `编译失败 · ${compiled.error}`}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return expanded ? createPortal(card, document.body) : card
}

export function PageProperties({
  record,
  schema,
  collectionPath,
  writable,
  children,
}: {
  record: DbRecord
  schema?: CollectionSchema
  collectionPath?: string
  writable?: boolean
  children: ReactNode
}) {
  const page = !collectionPath || collectionPath === '/pages'
  const present = usePagePropPresentMode(record.id)
  const views = usePagePropViews(record.id)
  const sandbox = views.find((item) => item.id === present)
  if (present === PAGE_PROP_HIDDEN_VIEW_ID) return null
  if (!page || !sandbox) return children
  return (
    <PagePropHostView
      record={record}
      viewId={sandbox.id}
      schema={schema}
      writable={writable !== false}
      collectionPath={collectionPath}
    />
  )
}
