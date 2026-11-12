import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CodeBracketIcon, EyeIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import {
  fieldIsWritable,
  sanitizeRecordPatch,
  type CollectionSchema,
  type DbRecord,
  type FieldSpec,
} from '@biu/type-file-system'
import {
  DEFAULT_RECORD_PROP_VIEW_ID,
  defaultPropSandboxSource,
  parseRecordLayouts,
  parseRecordSandboxes,
  type RecordSandboxView,
} from '@biu/type-file-system/record-views'
import type { FsPropertiesProps } from '@biu/type-file-system/ui'
import { FieldValuePop } from './field-value-pop.tsx'
import { bindSandboxPickPane, recordPropHostPickKey } from './sandbox-pick-pane.ts'
import { compileHostSource, loadHostComponent } from './tag-host-compile.ts'
import {
  peekRecordViewFile,
  putRecordViewFile,
  readRecordViewFile,
  writeRecordViewCatalog,
} from './record-sandboxes.ts'
import { loadRecordLayouts, useActiveRecordLayout } from './record-layouts.ts'
import { TAGS_COLLECTION_PATH } from './database-path.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'
import { SplitResize, splitPaneStyle } from './split-resize.tsx'

type HostTab = 'preview' | 'code' | 'split'

const PROP_FIELD_SKIP = new Set(['emoji', 'views', 'propViews', 'layouts', 'file', 'tablePath', 'sourceId'])

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

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

function HostField({
  name,
  record,
  schema,
  writable,
  collectionPath,
  onSet,
}: {
  name: string
  record: DbRecord
  schema?: CollectionSchema
  writable: boolean
  collectionPath: string
  onSet: (key: string, value: unknown) => void
}) {
  const key = String(name ?? '').trim()
  const field = schema?.fields?.[key] as FieldSpec | undefined
  if (!field) {
    return (
      <div className="page-host-missing" data-testid="record-prop-host-missing">
        找不到属性 {key}
      </div>
    )
  }
  return (
    <FieldValuePop
      record={record}
      fieldKey={key}
      field={{ ...field, writable: writable !== false && fieldIsWritable(field) }}
      value={record[key]}
      collectionPath={collectionPath}
      onSubmit={(next) => onSet(key, next)}
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
            data-testid="record-prop-host-edit"
            onMouseDown={hold}
            onClick={() => onTab(coding ? 'preview' : 'code')}
          >
            {coding ? <EyeIcon aria-hidden className="page-slide-ico" /> : <CodeBracketIcon aria-hidden className="page-slide-ico" />}
          </button>
          <button
            type="button"
            className={`page-slide-icon${tab === 'split' ? ' is-on' : ''}`}
            data-testid="record-prop-host-split"
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
        data-testid="record-prop-host-expand"
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

export function RecordPropHostView({
  record,
  view,
  schema,
  collectionPath,
  writable = true,
}: {
  record: DbRecord
  view: RecordSandboxView
  schema?: CollectionSchema
  collectionPath: string
  writable?: boolean
}) {
  const recordId = String(record.id ?? '').trim()
  const fallback = defaultPropSandboxSource(String(record.title ?? ''))
  const [source, setSource] = useState(() => peekRecordViewFile(collectionPath, recordId, view.file) || fallback)
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
    const cached = peekRecordViewFile(collectionPath, recordId, view.file)
    if (cached != null) {
      setSource(cached)
      return
    }
    void readRecordViewFile(collectionPath, recordId, view.file, fallback).then((text) => {
      if (!gone) setSource(text)
    })
    return () => {
      gone = true
    }
  }, [collectionPath, recordId, view.file, fallback])

  const writeRecord = useCallback(
    async (bag: Record<string, unknown>) => {
      try {
        if (!schema) throw new Error('missing collection schema')
        const patch = sanitizeRecordPatch(schema, bag)
        const res = await fetch('/api/db/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: `${collectionPath}/${recordId}`, content: patch }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || res.statusText)
        }
        setLive((prev) => ({ ...prev, ...patch }))
        setPatchError('')
        window.dispatchEvent(new Event('fsdb:change'))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPatchError(message)
        throw error
      }
    },
    [collectionPath, recordId, schema],
  )

  const compiled = useMemo(() => compileHostSource(source), [source])
  const biu = useMemo(
    () => ({
      record: () => ({ id: live.id, title: live.title, path: `${collectionPath}/${live.id}` }),
      fields: () => fields.map(({ spec: _spec, ...item }) => item),
      values: () => Object.fromEntries(fields.map((item) => [item.key, live[item.key]])),
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
        if (!view.dataFile) return null
        try {
          const text = await readRecordViewFile(collectionPath, recordId, view.dataFile, 'null')
          if (!text.trim() || text.trim() === 'null') return null
          return JSON.parse(text) as unknown
        } catch {
          return null
        }
      },
      write: async (value: unknown) => {
        if (!view.dataFile) return
        await putRecordViewFile(collectionPath, recordId, view.dataFile, JSON.stringify(value ?? null, null, 2), 'application/json')
      },
    }),
    [collectionPath, fields, live, recordId, view.dataFile, writeRecord],
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
    [collectionPath, live, schema, writable, writeRecord],
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
        Preview: loadHostComponent(compiled.code, React, FieldProxy, biuProxy) as ComponentType,
        error: '',
      }
    } catch (err) {
      return { Preview: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [compiled])

  useLayoutEffect(() => {
    if (!showPreview) return
    return bindSandboxPickPane(previewRef.current, recordPropHostPickKey(collectionPath, recordId, view.id), {
      path: collectionPath,
      name: view.file,
      title: view.title,
    })
  }, [showPreview, collectionPath, recordId, view.id, view.file, view.title, preview.Preview])

  const card = (
    <div
      ref={hostRef}
      className={`page-host-view page-prop-host${expanded ? ' is-expanded' : ''}`}
      data-testid="record-prop-host"
    >
      <div className="page-block-expand-nav" data-testid={expanded ? 'record-prop-host-expand-nav' : 'record-prop-host-side-bar'} data-biu-ignore>
        <div className="page-block-expand-nav-type" title="属性沙盒" aria-label="属性沙盒">
          <SandboxKindIcon className="size-[14px]" />
        </div>
        <input
          className="page-block-expand-nav-title"
          data-testid="record-prop-host-title"
          readOnly={!writable}
          defaultValue={view.name?.trim() || '属性沙盒'}
          key={view.id}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim()
            if (!next || next === view.name) return
            const listed = parseRecordSandboxes((live as { propViews?: unknown }).propViews).map((item) =>
              item.id === view.id ? { ...item, name: next } : item,
            )
            void writeRecordViewCatalog(collectionPath, recordId, 'propViews', listed)
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
            data-testid="record-prop-host-preview"
            data-sandbox=""
            data-biu-path={collectionPath}
            data-biu-name={view.file}
            data-biu-title={view.title}
          >
            {preview.Preview ? (
              <>
                <preview.Preview />
                {patchError ? (
                  <div className="page-host-error" data-testid="record-prop-host-patch-error">
                    写入失败 · {patchError}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="page-host-error" data-testid="record-prop-host-error">
                {preview.error || '无法渲染'}
              </div>
            )}
            {showCode ? <SplitResize paneRef={previewRef} onWidth={setPreviewWidth} testId="record-prop-host-split-resize" /> : null}
          </div>
        ) : null}
        {showCode ? (
          <div
            className={`page-host-code-pane${showPreview ? ' is-split' : ''}`}
            data-testid="record-prop-host-code"
            data-biu-kind="sandbox"
            data-biu-id={`sandbox:${recordPropHostPickKey(collectionPath, recordId, view.id)}:code`}
            data-biu-path={collectionPath}
            data-biu-name={view.file}
            data-biu-title={view.title}
            data-biu-label={view.title}
          >
            <textarea
              className="page-tag-host-source"
              value={source}
              readOnly={!writable}
              spellCheck={false}
              onChange={(event) => {
                const next = event.target.value
                setSource(next)
                if (writable) void putRecordViewFile(collectionPath, recordId, view.file, next, 'text/plain; charset=utf-8')
              }}
            />
            <div className="page-host-compile" data-testid="record-prop-host-compile" data-ok={compiled.ok && !patchError ? '1' : '0'}>
              {compiled.ok ? (patchError ? `写入失败 · ${patchError}` : '编译通过') : `编译失败 · ${compiled.error}`}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return expanded ? createPortal(card, document.body) : card
}

export function RecordProperties({ record, schema, collectionPath, writable, children }: FsPropertiesProps) {
  const path = String(collectionPath ?? '').trim()
  const id = String(record.id ?? '').trim()
  const fallback = path === TAGS_COLLECTION_PATH ? 'table' : 'doc'
  const layout = useActiveRecordLayout(path, id, fallback)
  const listed = parseRecordSandboxes(record.propViews)
  const stored = parseRecordLayouts(record.layouts, fallback)
  const storedLayout = stored.find((item) => item.id === layout.id) ?? stored[0]
  const rawProp = [layout.propViewId, storedLayout?.propViewId].find((item) => item && item !== DEFAULT_RECORD_PROP_VIEW_ID)
  const sandbox = listed.find((item) => item.id === rawProp)
  useEffect(() => {
    if (!path || !id) return
    void loadRecordLayouts(path, id, record.layouts, fallback)
  }, [path, id, record.layouts, fallback])
  if (rawProp === 'hidden') return null
  if (!path || !sandbox) return children
  return (
    <RecordPropHostView
      record={record}
      view={sandbox}
      schema={schema}
      collectionPath={path}
      writable={writable !== false}
    />
  )
}
