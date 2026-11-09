import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CodeBracketIcon, EyeIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import type { CollectionSchemaPack, FieldSpec } from '@biu/type-file-system'
import { FieldValuePop } from './field-value-pop.tsx'
import { compileHostSource, loadHostComponent } from './tag-host-compile.ts'
import {
  defaultTagSandboxSource,
  getTagViews,
  peekTagFile,
  readTagFile,
  renameTagSandboxView,
  useTagFileTick,
  useTagViews,
  writeTagFile,
  type TagSandboxView,
} from './tag-views.ts'

type HostTab = 'preview' | 'code' | 'split'

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function viewOf(tagId: string, viewId: string): TagSandboxView | undefined {
  return getTagViews(tagId).find((item) => item.id === viewId)
}

function SandboxKindIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="var(--biu-color-ink-purple)" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.628 1.349a.75.75 0 0 1 .744 0l1.247.712a.75.75 0 1 1-.744 1.303L8 2.864l-.875.5a.75.75 0 0 1-.744-1.303l1.247-.712Z"
      />
    </svg>
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
            data-testid="tag-host-edit"
            onMouseDown={hold}
            onClick={() => onTab(coding ? 'preview' : 'code')}
          >
            {coding ? <EyeIcon aria-hidden className="page-slide-ico" /> : <CodeBracketIcon aria-hidden className="page-slide-ico" />}
          </button>
          <button
            type="button"
            className={`page-slide-icon${tab === 'split' ? ' is-on' : ''}`}
            data-testid="tag-host-split"
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
        data-testid="tag-host-expand"
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

function HostField({
  name,
  pack,
  values,
  writable,
  onSet,
}: {
  name: string
  pack: CollectionSchemaPack | undefined
  values: Record<string, unknown>
  writable: boolean
  onSet: (key: string, value: unknown) => void
}) {
  const key = String(name ?? '').trim()
  const field = (pack?.fields ?? []).find((item) => item.key === key) as FieldSpec | undefined
  if (!field) {
    return (
      <div className="page-host-missing" data-testid="tag-host-missing">
        找不到属性 {key}
      </div>
    )
  }
  return (
    <FieldValuePop
      record={{ id: 'page-tag-block', title: pack?.label ?? '' }}
      fieldKey={key}
      field={{ ...field, writable: writable !== false }}
      value={values[key]}
      collectionPath="/pages"
      onSubmit={(next) => onSet(key, next)}
    />
  )
}

export function TagHostView({
  tagId,
  viewId,
  pack,
  values,
  writable = true,
  onValues,
}: {
  tagId: string
  viewId: string
  pack?: CollectionSchemaPack
  values: Record<string, unknown>
  writable?: boolean
  onValues: (next: Record<string, unknown>) => void
}) {
  const fileTick = useTagFileTick()
  useTagViews(tagId)
  const view = viewOf(tagId, viewId)
  const fallback = defaultTagSandboxSource(pack?.label ?? '')
  const [source, setSource] = useState(() => peekTagFile(view?.file ?? '') || fallback)
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'
  const hostRef = useRef<HTMLDivElement | null>(null)
  const fields = (pack?.fields ?? []).filter((field) => !field.deleted)

  useEffect(() => {
    let gone = false
    const file = view?.file
    const next = defaultTagSandboxSource(pack?.label ?? '')
    if (!file) {
      setSource(next)
      return
    }
    const cached = peekTagFile(file)
    if (cached != null) {
      setSource(cached)
      return
    }
    void readTagFile(tagId, file, next).then((text) => {
      if (!gone) setSource(text)
    })
    return () => {
      gone = true
    }
  }, [tagId, view?.file, pack?.label, fileTick])

  const compiled = useMemo(() => compileHostSource(source), [source])
  const biu = useMemo(
    () => ({
      tag: () => ({ id: tagId, title: pack?.label ?? '' }),
      fields: () => fields.map((item) => ({ key: item.key, type: item.type, label: item.label ?? item.key })),
      values: () => ({ ...values }),
      get: (key: string) => values[String(key ?? '').trim()],
      set: (key: string, value: unknown) => {
        const nextKey = String(key ?? '').trim()
        if (!nextKey) return
        onValues({ ...values, [nextKey]: value })
      },
      read: async () => {
        if (!view?.dataFile) return null
        try {
          const text = await readTagFile(tagId, view.dataFile, 'null')
          if (!text.trim() || text.trim() === 'null') return null
          return JSON.parse(text) as unknown
        } catch {
          return null
        }
      },
      write: async (value: unknown) => {
        if (!view?.dataFile) return
        await writeTagFile(tagId, view.dataFile, JSON.stringify(value ?? null, null, 2), 'application/json')
      },
    }),
    [fields, onValues, pack?.label, tagId, values, view?.dataFile],
  )

  const Field = useCallback(
    (props: { name?: string }) => (
      <HostField name={String(props.name ?? '')} pack={pack} values={values} writable={writable} onSet={(key, value) => onValues({ ...values, [key]: value })} />
    ),
    [onValues, pack, values, writable],
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
        tag: () => envRef.current.biu.tag(),
        fields: () => envRef.current.biu.fields(),
        values: () => envRef.current.biu.values(),
        get: (key: string) => envRef.current.biu.get(key),
        set: (key: string, value: unknown) => envRef.current.biu.set(key, value),
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

  const card = (
    <div
      ref={hostRef}
      className={`page-host-view page-tag-host-view${expanded ? ' is-expanded' : ''}`}
      data-testid="tag-host-view"
    >
      <div className="page-block-expand-nav" data-testid={expanded ? 'tag-host-expand-nav' : 'tag-host-side-bar'} data-biu-ignore>
        <div className="page-block-expand-nav-type" title="沙箱" aria-label="沙箱">
          <SandboxKindIcon />
        </div>
        <input
          className="page-block-expand-nav-title"
          data-testid="tag-host-title"
          readOnly={!writable}
          defaultValue={view?.name?.trim() || '沙盒'}
          key={view?.id}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim()
            if (view && next && next !== view.name) void renameTagSandboxView(tagId, view.id, next)
          }}
        />
        <div className="page-block-expand-nav-tools">
          <HostTools tab={tab} onTab={setTab} ro={!writable} expanded={expanded} onExpand={() => setExpanded((open) => !open)} />
        </div>
      </div>
      <div className="page-host-stage">
        {showPreview ? (
          <div className="page-host-preview-pane" data-testid="tag-host-preview">
            {preview.Preview ? (
              <preview.Preview />
            ) : (
              <div className="page-host-error" data-testid="tag-host-error">
                {preview.error || '无法渲染'}
              </div>
            )}
          </div>
        ) : null}
        {showCode ? (
          <div className={`page-host-code-pane${showPreview ? ' is-split' : ''}`} data-testid="tag-host-code">
            <textarea
              className="page-tag-host-source"
              value={source}
              readOnly={!writable}
              spellCheck={false}
              onChange={(event) => {
                const next = event.target.value
                setSource(next)
                if (view?.file && writable) void writeTagFile(tagId, view.file, next)
              }}
            />
            <div className="page-host-compile" data-testid="tag-host-compile" data-ok={compiled.ok ? '1' : '0'}>
              {compiled.ok ? '编译通过' : `编译失败 · ${compiled.error}`}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return expanded ? createPortal(card, document.body) : card
}
