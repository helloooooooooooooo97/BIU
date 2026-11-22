import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import {
  fieldIsWritable,
  pruneSchemaValue,
  resolveSchemaFieldKey,
  sanitizeRecordPatch,
  type CollectionSchema,
  type DbRecord,
  type FieldSpec,
  emitFsdbChange,
} from '@biu/type-file-system'
import {
  DEFAULT_RECORD_PROP_VIEW_ID,
  SOURCE_RECORD_PROP_VIEW_ID,
  defaultPropSandboxSource,
  parseRecordSandboxes,
  type RecordSandboxView,
} from '@biu/type-file-system/record-views'
import { RenderBoundary } from '@biu/biu-ui'
import { SidebarFold } from '@biu/biu-ui/sidebar-fold'
import type { FsPropertiesProps } from '@biu/type-file-system/ui'
import { FieldValuePop } from './field-value-pop.tsx'
import { loadTags } from './tag-catalog.ts'
import { recordResourcePath } from './cell-media.tsx'
import { bindSandboxPickPane, recordPropHostPickKey } from './sandbox-pick-pane.ts'
import { compileHostSource, loadSandboxComponent, SandboxPreview } from './sandbox-compile.ts'
import { createBiuProxy, createRecordSandboxBiu } from './sandbox-biu.ts'
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
} from './sandbox-host-shell.tsx'
import { writeRecordViewCatalog } from './record-sandboxes.ts'
import { loadRecordLayouts, useActiveRecordLayout } from './record-layouts.ts'
import { getRecordViewCatalog, hydrateRecordViewCatalog, useRecordViewCatalog } from './record-view-catalog.ts'
import { recordContentFallback } from './database-ui.ts'
import { HostSourceEditor } from './host-source-editor.tsx'
import { useLiveDbRecord } from './live-db-record.ts'

export { useLiveDbRecord, readDbRecord } from './live-db-record.ts'

const PROP_FIELD_SKIP = new Set(['emoji', 'views', 'propViews', 'layouts', 'file', 'tablePath', 'sourceId'])
const SOURCE_FIELD_SKIP = new Set(['emoji', 'file', 'tablePath', 'sourceId'])
const SOURCE_VIEW_KEYS = ['views', 'propViews', 'layouts'] as const
const SOURCE_VIEW_KEY_SET = new Set<string>(SOURCE_VIEW_KEYS)

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

export function recordSandboxFields(schema?: CollectionSchema) {
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

export function SandboxHostField({
  name,
  record,
  schema,
  writable,
  collectionPath,
  onSet,
  missingTestId = 'record-prop-host-missing',
}: {
  name: string
  record: DbRecord
  schema?: CollectionSchema
  writable: boolean
  collectionPath: string
  onSet: (key: string, value: unknown) => void
  missingTestId?: string
}) {
  const key = resolveSchemaFieldKey(schema, name)
  const field = schema?.fields?.[key] as FieldSpec | undefined
  if (!field) {
    return (
      <div className="page-host-missing" data-testid={missingTestId}>
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
  const fallback = useMemo(() => defaultPropSandboxSource(String(record.title ?? '')), [record.title])
  const { source, compiledSource, onSourceChange } = useDebouncedSandboxSource({
    collectionPath,
    recordId,
    file: view.file,
    fallback,
    writable,
  })
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const [previewWidth, setPreviewWidth] = useState(0)
  const [live, setLive] = useLiveDbRecord(collectionPath, record)
  const [patchError, setPatchError] = useState('')
  const { toast, showToast } = useSandboxToast()
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'
  const hostRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const fields = useMemo(() => recordSandboxFields(schema), [schema])

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
        emitFsdbChange({ scope: 'content', path: `${collectionPath}/${recordId}` })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPatchError(message)
        throw error
      }
    },
    [collectionPath, recordId, schema, setLive],
  )

  const compiled = useMemo(() => compileHostSource(compiledSource, 'Field'), [compiledSource])
  const biu = useMemo(
    () =>
      createRecordSandboxBiu({
        collectionPath,
        recordId,
        live,
        fields,
        dataFile: view.dataFile,
        writeRecord,
        subscribeRecord,
        getLiveRecord,
        onToast: showToast,
      }),
    [collectionPath, fields, getLiveRecord, live, recordId, showToast, subscribeRecord, view.dataFile, writeRecord],
  )

  const Field = useCallback(
    (props: { name?: string }) => (
      <SandboxHostField
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

  useSandboxEscapeExpand(expanded, setExpanded)
  useScopedSandboxStyles(previewRef, showPreview)

  const envRef = useRef({ Field, biu })
  envRef.current = { Field, biu }

  useLayoutEffect(() => {
    if (!showPreview) return
    return bindSandboxPickPane(previewRef.current, recordPropHostPickKey(collectionPath, recordId, view.id), {
      path: recordPath,
      name: view.file,
      title: view.name || '属性沙盒',
    })
  }, [showPreview, collectionPath, recordId, recordPath, view.id, view.file, view.name, compiled, expanded])

  const renameView = useCallback(
    (next: string) => {
      const nextName = next.trim()
      if (!nextName || nextName === view.name) return
      const listed = getRecordViewCatalog(collectionPath, recordId).propViews.map((item) =>
        item.id === view.id ? { ...item, name: nextName } : item,
      )
      void writeRecordViewCatalog(collectionPath, recordId, 'propViews', listed)
    },
    [collectionPath, recordId, view.id, view.name],
  )

  const card = (
    <div
      ref={hostRef}
      className={`page-host-view page-prop-host${expanded ? ' is-expanded' : ''}`}
      data-testid="record-prop-host"
      data-page-host-expanded={expanded ? '1' : undefined}
    >
      <SandboxHostBar
        tab={tab}
        onTab={setTab}
        ro={!writable}
        expanded={expanded}
        onExpand={() => setExpanded((open) => !open)}
        title={view.name || '属性沙盒'}
        onTitle={renameView}
        testIdPrefix="record-prop-host"
        kindLabel="属性沙盒"
      />
      <SandboxToastBanner toast={toast} testId="record-prop-host-toast" />
      <div className="page-host-stage">
        {showPreview ? (
          <div
            ref={previewRef}
            className="page-host-preview-pane"
            style={splitPaneStyle(showCode ? previewWidth : 0)}
            data-testid="record-prop-host-preview"
            data-sandbox=""
            data-page-path={recordPath}
            data-biu-path={recordPath}
            data-biu-name={view.file}
            data-biu-title={view.name || '属性沙盒'}
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
                      const biuProxy = createBiuProxy(envRef)
                      return loadSandboxComponent(compiled, {
                        React,
                        Field: FieldProxy,
                        biu: biuProxy,
                        getPreview: () => previewRef.current,
                      }) as ComponentType
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
            {showCode ? <SandboxSplitResize paneRef={previewRef} onWidth={setPreviewWidth} testId="record-prop-host-split-resize" /> : null}
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
            data-biu-title={view.name || '属性沙盒'}
            data-biu-label={view.name || '属性沙盒'}
          >
            <HostSourceEditor
              value={source}
              language="javascript"
              writable={writable}
              pickHost={{
                path: recordPath,
                name: view.file,
                title: view.name || '属性沙盒',
              }}
              onChange={onSourceChange}
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
  const fallback = recordContentFallback(path)
  const layout = useActiveRecordLayout(path, id, fallback)
  const catalog = useRecordViewCatalog(path, id)
  const listed = catalog.propViews.length ? catalog.propViews : parseRecordSandboxes(liveRecord.propViews)
  const present = catalog.propViewId.trim() || layout.propViewId || DEFAULT_RECORD_PROP_VIEW_ID
  const sandbox = listed.find((item) => item.id === present)
  useEffect(() => {
    if (!path || !id) return
    hydrateRecordViewCatalog(path, id, liveRecord)
    void loadRecordLayouts(path, id, liveRecord.layouts, fallback)
  }, [path, id, liveRecord, fallback])
  const hidden = present === 'hidden'
  const body =
    present === SOURCE_RECORD_PROP_VIEW_ID ? (
      <HostSourceEditor value={recordPropSourceText(liveRecord, schema)} language="json" writable={false} testId="record-prop-source" />
    ) : !path || !sandbox ? (
      children
    ) : (
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
  return <SidebarFold open={!hidden}>{body}</SidebarFold>
}
