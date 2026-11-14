import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CodeBracketIcon, EyeIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import {
  fieldIsWritable,
  matchSchemaField,
  normalizeSchemaValue,
  pruneSchemaValue,
  resolveSchemaFieldKey,
  sanitizeRecordPatch,
  type CollectionSchema,
  type DbRecord,
  type FieldSpec,
} from '@biu/type-file-system'
import {
  DEFAULT_RECORD_PROP_VIEW_ID,
  SOURCE_RECORD_PROP_VIEW_ID,
  defaultPropSandboxSource,
  parseRecordLayouts,
  parseRecordSandboxes,
  type RecordSandboxView,
} from '@biu/type-file-system/record-views'
import { RenderBoundary } from '@biu/biu-ui'
import type { FsPropertiesProps } from '@biu/type-file-system/ui'
import { FieldValuePop } from './field-value-pop.tsx'
import { loadTags } from './tag-catalog.ts'
import { recordResourcePath } from './cell-media.tsx'
import { bindSandboxPickPane, recordPropHostPickKey } from './sandbox-pick-pane.ts'
import { compileHostSource, loadHostComponent, SandboxPreview } from './tag-host-compile.ts'
import {
  peekRecordViewFile,
  putRecordViewFile,
  readRecordViewFile,
  useRecordViewFileTick,
  writeRecordViewCatalog,
} from './record-sandboxes.ts'
import { loadRecordLayouts, useActiveRecordLayout } from './record-layouts.ts'
import { TAGS_COLLECTION_PATH } from './database-path.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'
import { SplitResize, splitPaneStyle } from './split-resize.tsx'
import { HostSourceEditor } from './host-source-editor.tsx'
import { createSandboxDocsApi, createSandboxFilesApi } from './sandbox-files.ts'
import { useLiveDbRecord } from './live-db-record.ts'

export { useLiveDbRecord, readDbRecord } from './live-db-record.ts'

type HostTab = 'preview' | 'code' | 'split'

const PROP_FIELD_SKIP = new Set(['emoji', 'views', 'propViews', 'layouts', 'file', 'tablePath', 'sourceId'])
const SOURCE_FIELD_SKIP = new Set(['emoji', 'file', 'tablePath', 'sourceId'])
const SOURCE_VIEW_KEYS = ['views', 'propViews', 'layouts'] as const
const SOURCE_VIEW_KEY_SET = new Set<string>(SOURCE_VIEW_KEYS)

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

/** 库里有的列是 JSON 字符串（如标签 fields），源码里展开成对象，避免二次转义。 */
export function reviveJsonValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const text = value.trim()
    if (
      (text.startsWith('{') && text.endsWith('}')) ||
      (text.startsWith('[') && text.endsWith(']'))
    ) {
      try {
        return reviveJsonValue(JSON.parse(text) as unknown)
      } catch {
        return value
      }
    }
    return value
  }
  if (Array.isArray(value)) return value.map(reviveJsonValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, next]) => [key, reviveJsonValue(next)]))
  }
  return value
}

export function recordPropSourceText(record: DbRecord, schema?: CollectionSchema) {
  const bag: Record<string, unknown> = {}
  for (const field of sourceFields(schema)) {
    if (!(field.key in record) && !SOURCE_VIEW_KEY_SET.has(field.key)) continue
    const raw = field.key in record ? reviveJsonValue(record[field.key]) : []
    bag[field.key] = field.type === 'tag' ? pruneSchemaValue(raw, loadTags()) : raw
  }
  for (const key of SOURCE_VIEW_KEYS) {
    if (key in bag) continue
    bag[key] = key in record ? reviveJsonValue(record[key]) : []
  }
  return JSON.stringify(bag, null, 2)
}

function sourceFields(schema?: CollectionSchema) {
  return Object.entries(schema?.fields ?? {})
    .filter(([key, field]) => !SOURCE_FIELD_SKIP.has(key) && key !== schema?.contentField && field.type !== 'file')
    .map(([key, field]) => ({
      key,
      type: field.type,
      label: field.label ?? key,
      writable: fieldIsWritable(field),
      spec: field,
    }))
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
  const key = resolveSchemaFieldKey(schema, name)
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
  const recordPath = recordResourcePath(collectionPath, recordId)
  const fileTick = useRecordViewFileTick()
  const fallback = defaultPropSandboxSource(String(record.title ?? ''))
  const [source, setSource] = useState(() => peekRecordViewFile(collectionPath, recordId, view.file) || fallback)
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(0)
  const [live, setLive] = useLiveDbRecord(collectionPath, record)
  const [patchError, setPatchError] = useState('')
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'
  const hostRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const fields = propFields(schema)

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
  }, [collectionPath, recordId, view.file, fallback, fileTick])

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
      findFieldByName: (name: string) => {
        const hit = matchSchemaField(fields, name)
        if (!hit) return undefined
        const { spec: _spec, ...info } = hit
        return info
      },
      fieldKey: (name: string) => matchSchemaField(fields, name)?.key ?? '',
      get: (key: string) => live[resolveSchemaFieldKey(fields, key)],
      set: (key: string, value: unknown) => {
        const nextKey = resolveSchemaFieldKey(fields, key)
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
      files: createSandboxFilesApi(() => `${collectionPath}/${recordId}`),
      docs: createSandboxDocsApi(() => `${collectionPath}/${recordId}`),
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

  useLayoutEffect(() => {
    if (!showPreview) return
    return bindSandboxPickPane(previewRef.current, recordPropHostPickKey(collectionPath, recordId, view.id), {
      path: recordPath,
      name: view.file,
      title: view.title,
    })
  }, [showPreview, collectionPath, recordId, view.id, view.file, view.title, compiled, expanded])

  const card = (
    <div
      ref={hostRef}
      className={`page-host-view page-prop-host${expanded ? ' is-expanded' : ''}`}
      data-testid="record-prop-host"
      data-page-host-expanded={expanded ? '1' : undefined}
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
            data-biu-path={recordPath}
            data-biu-name={view.file}
            data-biu-title={view.title}
          >
            {compiled.ok ? (
              <>
                <RenderBoundary key={compiled.code} label={view.name || view.file || '属性沙盒'}>
                  <SandboxPreview
                    code={compiled.code}
                    revision={`${live.updatedAt ?? ''}:${JSON.stringify(live.tag ?? '')}`}
                    errorTestId="record-prop-host-error"
                    load={() => {
                      const FieldProxy = (props: { name?: string }) => envRef.current.Field(props)
                      const biuProxy = {
                        record: () => envRef.current.biu.record(),
                        fields: () => envRef.current.biu.fields(),
                        values: () => envRef.current.biu.values(),
                        findFieldByName: (name: string) => envRef.current.biu.findFieldByName(name),
                        fieldKey: (name: string) => envRef.current.biu.fieldKey(name),
                        get: (key: string) => envRef.current.biu.get(key),
                        set: (key: string, value: unknown) => envRef.current.biu.set(key, value),
                        patch: (bag: unknown) => envRef.current.biu.patch(bag),
                        read: () => envRef.current.biu.read(),
                        write: (value: unknown) => envRef.current.biu.write(value),
                        files: envRef.current.biu.files,
                        docs: envRef.current.biu.docs,
                      }
                      return loadHostComponent(compiled.code, React, FieldProxy, biuProxy) as ComponentType
                    }}
                  />
                </RenderBoundary>
                {patchError ? (
                  <div className="page-host-error" data-testid="record-prop-host-patch-error">
                    写入失败 · {patchError}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="page-host-error" data-testid="record-prop-host-error">
                {compiled.error || '无法渲染'}
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
            data-biu-path={recordPath}
            data-biu-name={view.file}
            data-biu-title={view.title}
            data-biu-label={view.title}
          >
            <HostSourceEditor
              value={source}
              language="javascript"
              writable={writable}
              pickHost={{
                path: recordPath,
                name: view.file,
                title: view.title,
              }}
              onChange={(next) => {
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
  const [liveRecord] = useLiveDbRecord(path, record)
  const id = String(record.id ?? '').trim()
  const fallback = path === TAGS_COLLECTION_PATH ? 'table' : 'doc'
  const layout = useActiveRecordLayout(path, id, fallback)
  const listed = parseRecordSandboxes(liveRecord.propViews)
  const stored = parseRecordLayouts(liveRecord.layouts, fallback)
  const storedLayout = stored.find((item) => item.id === layout.id) ?? stored[0]
  const rawProp = [layout.propViewId, storedLayout?.propViewId].find((item) => item && item !== DEFAULT_RECORD_PROP_VIEW_ID)
  const sandbox = listed.find((item) => item.id === rawProp)
  useEffect(() => {
    if (!path || !id) return
    void loadRecordLayouts(path, id, liveRecord.layouts, fallback)
  }, [path, id, liveRecord.layouts, fallback])
  if (rawProp === 'hidden') return null
  if (rawProp === SOURCE_RECORD_PROP_VIEW_ID) {
    return <HostSourceEditor value={recordPropSourceText(liveRecord, schema)} language="json" writable={false} testId="record-prop-source" />
  }
  if (!path || !sandbox) return children
  return (
    <RenderBoundary label={sandbox.name || sandbox.file || '属性沙盒'}>
      <RecordPropHostView
        record={liveRecord}
        view={sandbox}
        schema={schema}
        collectionPath={path}
        writable={writable !== false}
      />
    </RenderBoundary>
  )
}
