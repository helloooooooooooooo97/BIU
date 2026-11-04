import React, { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { CodeBracketIcon, EyeIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import { pageBlockRecordId } from '../page-block-fence.ts'
import { compileHostSource, loadHostComponent } from './page-host-compile.ts'
import { PageBlockStage } from './page-blocks-view.tsx'
import { getPageViews, readPageFile, writePageFile, type PageSandboxView } from './page-views.ts'
import { getLivePageEditor } from './page-live-editor.ts'
import { getPageEditor, usePageEditorVersion } from './service.ts'
import { SourceEditor } from './source-editor.tsx'
import { defaultSandboxSource } from '../page-views.ts'

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

export function listPageHostBlocks(pageId: string): HostBlockInfo[] {
  const editor = getLivePageEditor()
  const out: HostBlockInfo[] = []
  editor?.state.doc.descendants((node) => {
    if (node.type.name !== 'pageBlock') return
    const blockId = String(node.attrs.id ?? '').trim()
    if (!blockId) return
    const data = asData(node.attrs.data)
    out.push({
      id: pageBlockRecordId('/pages', pageId, blockId),
      pageId,
      blockId,
      kind: String(node.attrs.kind ?? ''),
      plugin: String(node.attrs.plugin ?? ''),
      title: String(data.title ?? '').trim(),
      data,
    })
  })
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
  return <PageBlockStage row={row} writable={writable} />
}

function viewOf(pageId: string, viewId: string): PageSandboxView | undefined {
  return getPageViews(pageId).find((item) => item.id === viewId)
}

export function PageHostView({
  record,
  viewId,
  writable = true,
}: {
  record: DbRecord
  viewId: string
  writable?: boolean
}) {
  usePageEditorVersion()
  const pageId = String(record.id)
  const view = viewOf(pageId, viewId)
  const [source, setSource] = useState('')
  const [mode, setMode] = useState<'preview' | 'code'>('preview')
  const [tick, setTick] = useState(0)
  const blocks = useMemo(() => listPageHostBlocks(pageId), [pageId, tick, record])

  useEffect(() => {
    let gone = false
    const file = view?.file
    if (!file) {
      setSource(defaultSandboxSource(String(record.title ?? '')))
      return
    }
    void readPageFile(file)
      .then((text) => {
        if (!gone) setSource(text)
      })
      .catch(() => {
        if (!gone) setSource(defaultSandboxSource(String(record.title ?? '')))
      })
    return () => {
      gone = true
    }
  }, [pageId, view?.file, record.title])

  const compiled = useMemo(() => compileHostSource(source), [source])
  const biu = useMemo(
    () => ({
      page: () => ({ id: pageId, title: String(record.title ?? '').trim() }),
      blocks: () => blocks.map((item) => ({ ...item })),
      kinds: () => getPageEditor()?.blocks().map((item) => ({ kind: item.kind, plugin: item.plugin, label: item.label })) ?? [],
      read: async () => {
        if (!view?.dataFile) return null
        try {
          const text = await readPageFile(view.dataFile)
          return text.trim() ? JSON.parse(text) : null
        } catch {
          return null
        }
      },
      write: async (value: unknown) => {
        if (!view?.dataFile) return
        await writePageFile(view.dataFile, JSON.stringify(value ?? null, null, 2), 'application/json')
      },
    }),
    [blocks, pageId, record.title, view?.dataFile],
  )

  const Block = useCallback(
    (props: { id: string; writable?: boolean }) => (
      <HostBlock id={String(props.id ?? '')} blocks={blocks} writable={props.writable ?? writable} />
    ),
    [blocks, writable],
  )

  const preview = useMemo(() => {
    if (!compiled.ok) return { Preview: null as ComponentType | null, error: compiled.error }
    try {
      return {
        Preview: loadHostComponent(compiled.code, React, Block, biu) as ComponentType,
        error: '',
      }
    } catch (err) {
      return { Preview: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [Block, biu, compiled])

  return (
    <div className="page-host-view" data-testid="page-host-view">
      <div className="page-host-view-bar" data-biu-ignore>
        <span className="page-host-view-name">{view?.name || '沙盒'}</span>
        <button
          type="button"
          className={mode === 'preview' ? 'is-on' : ''}
          data-testid="page-host-preview"
          onClick={() => {
            setMode('preview')
            setTick((n) => n + 1)
          }}
        >
          <EyeIcon aria-hidden className="size-[14px]" />
          预览
        </button>
        <button
          type="button"
          className={mode === 'code' ? 'is-on' : ''}
          data-testid="page-host-code"
          onClick={() => setMode('code')}
        >
          <CodeBracketIcon aria-hidden className="size-[14px]" />
          代码
        </button>
      </div>
      {mode === 'code' ? (
        <SourceEditor
          value={source}
          language="javascript"
          writable={writable}
          onChange={(next) => {
            setSource(next)
            if (view?.file && writable) void writePageFile(view.file, next)
          }}
        />
      ) : preview.Preview ? (
        <preview.Preview />
      ) : (
        <div className="page-host-error" data-testid="page-host-error">
          {preview.error || '无法渲染'}
        </div>
      )}
    </div>
  )
}
