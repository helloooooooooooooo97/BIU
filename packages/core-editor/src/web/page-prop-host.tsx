import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CodeBracketIcon, EyeIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import { fieldIsWritable, sanitizeRecordPatch, type CollectionSchema, type DbRecord, type FieldSpec } from '@biu/type-file-system'
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

type HostTab = 'preview' | 'code' | 'split'

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function viewOf(pageId: string, viewId: string): PagePropSandboxView | undefined {
  return getPagePropViews(pageId).find((item) => item.id === viewId)
}

function propFields(schema?: CollectionSchema) {
  return Object.entries(schema?.fields ?? {})
    .filter(([key, field]) => key !== 'emoji' && key !== schema?.contentField && field.type !== 'file')
    .map(([key, field]) => ({
      key,
      type: field.type,
      label: field.label ?? key,
      writable: fieldIsWritable(field),
      spec: field,
    }))
}

function formatValue(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseValue(raw: string, spec?: FieldSpec) {
  const text = raw.trim()
  if (spec?.type === 'number') {
    const n = Number(text)
    return Number.isFinite(n) ? n : text
  }
  if (spec?.type === 'boolean') return text === 'true' || text === '1'
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return raw
    }
  }
  return raw
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

function HostField({
  name,
  record,
  schema,
  writable,
  onSet,
}: {
  name: string
  record: DbRecord
  schema?: CollectionSchema
  writable: boolean
  onSet: (key: string, value: unknown) => void
}) {
  const key = String(name ?? '').trim()
  const spec = schema?.fields?.[key]
  if (!key || !spec) {
    return (
      <div className="page-host-missing" data-testid="page-prop-missing">
        找不到属性 {key}
      </div>
    )
  }
  return (
    <input
      className="page-prop-host-field"
      data-testid={`page-prop-field-${key}`}
      defaultValue={formatValue(record[key])}
      readOnly={!writable || !fieldIsWritable(spec)}
      onBlur={(event) => {
        if (!writable || !fieldIsWritable(spec)) return
        onSet(key, parseValue(event.currentTarget.value, spec))
      }}
    />
  )
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
}: {
  record: DbRecord
  viewId: string
  schema?: CollectionSchema
  writable?: boolean
}) {
  const fileTick = usePageFileTick()
  const pageId = String(record.id)
  usePagePropViews(pageId)
  const view = viewOf(pageId, viewId)
  const fallback = defaultPropSandboxSource(String(record.title ?? ''))
  const [source, setSource] = useState(() => peekPageFile(view?.file ?? '') || fallback)
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const [live, setLive] = useState(record)
  const [patchError, setPatchError] = useState('')
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'
  const hostRef = useRef<HTMLDivElement | null>(null)
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

  const card = (
    <div
      ref={hostRef}
      className={`page-host-view page-prop-host${expanded ? ' is-expanded' : ''}`}
      data-testid="page-prop-host"
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
          <div className="page-host-preview-pane" data-testid="page-prop-host-preview">
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
          </div>
        ) : null}
        {showCode ? (
          <div className={`page-host-code-pane${showPreview ? ' is-split' : ''}`} data-testid="page-prop-host-code">
            <SourceEditor
              value={source}
              language="javascript"
              writable={writable}
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
    <PagePropHostView record={record} viewId={sandbox.id} schema={schema} writable={writable !== false} />
  )
}
