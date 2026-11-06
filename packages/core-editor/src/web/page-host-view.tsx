import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CodeBracketIcon, EyeIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import { listPageBlockFences, pageBlockData, pageBlockRecordId } from '../page-block-fence.ts'
import { compileHostSource, loadHostComponent } from './page-host-compile.ts'
import { PageBlockStage, writeBlockData } from './page-blocks-view.tsx'
import { ExpandNavTitle } from './expand-nav-title.tsx'
import { getPageViews, peekPageFile, readPageFile, renamePageSandboxView, usePageFileTick, usePageViews, writePageFile, type PageSandboxView } from './page-views.ts'
import { capturePageScroll } from './page-scroll-pin.ts'
import { getPageEditor, usePageEditorVersion } from './service.ts'
import { SourceEditor } from './source-editor.tsx'
import { defaultSandboxSource } from '../page-views.ts'
import { pageHostPickKey, stampPageHostPickSurfaces } from './page-host-pick.ts'

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

function viewOf(pageId: string, viewId: string): PageSandboxView | undefined {
  return getPageViews(pageId).find((item) => item.id === viewId)
}

type HostTab = 'preview' | 'code' | 'split'

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function SandboxKindIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="var(--biu-color-ink-purple)" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.628 1.349a.75.75 0 0 1 .744 0l1.247.712a.75.75 0 1 1-.744 1.303L8 2.864l-.875.5a.75.75 0 0 1-.744-1.303l1.247-.712ZM4.65 3.914a.75.75 0 0 1-.279 1.023L4.262 5l.11.063a.75.75 0 0 1-.744 1.302l-.13-.073A.75.75 0 0 1 2 6.25V5a.75.75 0 0 1 .378-.651l1.25-.714a.75.75 0 0 1 1.023.279Zm6.698 0a.75.75 0 0 1 1.023-.28l1.25.715A.75.75 0 0 1 14 5v1.25a.75.75 0 0 1-1.499.042l-.129.073a.75.75 0 0 1-.744-1.302l.11-.063-.11-.063a.75.75 0 0 1-.28-1.023ZM6.102 6.915a.75.75 0 0 1 1.023-.279l.875.5.875-.5a.75.75 0 0 1 .744 1.303l-.869.496v.815a.75.75 0 0 1-1.5 0v-.815l-.869-.496a.75.75 0 0 1-.28-1.024ZM2.75 9a.75.75 0 0 1 .75.75v.815l.872.498a.75.75 0 0 1-.744 1.303l-1.25-.715A.75.75 0 0 1 2 11V9.75A.75.75 0 0 1 2.75 9Zm10.5 0a.75.75 0 0 1 .75.75V11a.75.75 0 0 1-.378.651l-1.25.715a.75.75 0 0 1-.744-1.303l.872-.498V9.75a.75.75 0 0 1 .75-.75Zm-4.501 3.708.126-.072a.75.75 0 0 1 .744 1.303l-1.247.712a.75.75 0 0 1-.744 0L6.38 13.94a.75.75 0 0 1 .744-1.303l.126.072a.75.75 0 0 1 1.498 0Z"
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
}: {
  record: DbRecord
  viewId: string
  writable?: boolean
  markdown?: string
}) {
  const editorVersion = usePageEditorVersion()
  const fileTick = usePageFileTick()
  const pageId = String(record.id)
  usePageViews(pageId)
  const view = viewOf(pageId, viewId)
  const fallback = defaultSandboxSource(String(record.title ?? ''))
  const [source, setSource] = useState(() => peekPageFile(view?.file ?? '') || fallback)
  const [tab, setTab] = useState<HostTab>('preview')
  const [expanded, setExpanded] = useState(false)
  const showPreview = tab !== 'code'
  const showCode = tab !== 'preview'
  const hostRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const blocks = useMemo(() => listPageHostBlocks(pageId, markdown), [pageId, markdown])

  const setHostTab = useCallback((next: HostTab) => {
    capturePageScroll(hostRef.current)
    setTab(next)
  }, [])

  useEffect(() => {
    let gone = false
    const file = view?.file
    const next = defaultSandboxSource(String(record.title ?? ''))
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

  const compiled = useMemo(() => compileHostSource(source), [source])
  const biu = useMemo(
    () => ({
      page: () => ({ id: pageId, title: String(record.title ?? '').trim() }),
      blocks: () => blocks.map((item) => ({ ...item })),
      kinds: () => getPageEditor()?.blocks().map((item) => ({ kind: item.kind, plugin: item.plugin, label: item.label })) ?? [],
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
      update: (id: string, patch: Record<string, unknown>) => writePageHostBlock(pageId, id, patch),
    }),
    [blocks, editorVersion, pageId, record.title, view?.dataFile],
  )

  const Block = useCallback(
    (props: { id: string; writable?: boolean }) => (
      <HostBlock id={String(props.id ?? '')} blocks={blocks} writable={props.writable ?? writable} />
    ),
    [blocks, writable],
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

  const envRef = useRef({ Block, biu })
  envRef.current = { Block, biu }
  const preview = useMemo(() => {
    if (!compiled.ok) return { Preview: null as ComponentType | null, error: compiled.error }
    try {
      const BlockProxy = (props: { id?: string; writable?: boolean }) => envRef.current.Block(props)
      const biuProxy = {
        page: () => envRef.current.biu.page(),
        blocks: () => envRef.current.biu.blocks(),
        kinds: () => envRef.current.biu.kinds(),
        read: () => envRef.current.biu.read(),
        write: (value: unknown) => envRef.current.biu.write(value),
        update: (id: string, patch: Record<string, unknown>) => envRef.current.biu.update(id, patch),
      }
      return {
        Preview: loadHostComponent(compiled.code, React, BlockProxy, biuProxy) as ComponentType,
        error: '',
      }
    } catch (err) {
      return { Preview: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [compiled])

  useLayoutEffect(() => {
    const pane = previewRef.current
    if (!pane || !showPreview) return
    const key = pageHostPickKey(pageId, viewId)
    const source = {
      path: `/pages/${pageId}`,
      ...(view?.file ? { name: view.file } : {}),
      ...(view?.name ? { title: view.name } : {}),
    }
    const observer = new MutationObserver(() => {
      observer.disconnect()
      stampPageHostPickSurfaces(pane, key, source)
      observer.observe(pane, { childList: true, subtree: true })
    })
    stampPageHostPickSurfaces(pane, key, source)
    observer.observe(pane, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [showPreview, pageId, viewId, view?.file, view?.name, preview.Preview])

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
            data-testid="page-host-preview"
            data-sandbox=""
            data-page-path={`/pages/${pageId}`}
            data-biu-path={`/pages/${pageId}`}
            data-biu-name={view?.file || undefined}
            data-biu-title={view?.name || undefined}
          >
            {preview.Preview ? (
              <preview.Preview />
            ) : (
              <div className="page-host-error" data-testid="page-host-error">
                {preview.error || '无法渲染'}
              </div>
            )}
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
            <div
              className="page-host-compile"
              data-testid="page-host-compile"
              data-ok={compiled.ok ? '1' : '0'}
            >
              {compiled.ok ? '编译通过' : `编译失败 · ${compiled.error}`}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return expanded ? createPortal(card, document.body) : card
}
