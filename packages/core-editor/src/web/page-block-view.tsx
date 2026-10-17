import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { PlayIcon } from '@heroicons/react/16/solid'
import { RenderBoundary } from '@biu/public-ui'
import { getPageEditor, usePageEditorVersion } from './service.ts'
import {
  blockDataUnchanged,
  formatPageBlockFence,
  requestEnablePageBlockPlugin,
  setPageBlockPluginPhase,
  usePageBlockPluginPhase,
  type PageBlockPluginPhase,
} from './page-block-meta.ts'
import { bindPageBlockPlugin } from './page-block-plugin-host.ts'
import { PAGE_BLOCK_IDLE_MIN_PX, PAGE_BLOCK_IDLE_ROOT_MARGIN, schedulePageBlockMount } from './page-block-idle.ts'

function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

async function copyPageAsset(from: string, to: string) {
  const src = assetName(from)
  const dest = assetName(to)
  const res = await fetch(`/api/page/file/${encodeURIComponent(src)}`)
  let payload: unknown = { elements: [], appState: { theme: 'dark' }, files: {} }
  if (res.ok) {
    try {
      payload = JSON.parse(await res.text())
    } catch {
      /* keep empty */
    }
  }
  await fetch(`/api/page/file/${encodeURIComponent(dest)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function PageBlockMissing({
  kind,
  plugin,
  data,
  phase = 'idle',
}: {
  kind: string
  plugin: string
  data: Record<string, unknown>
  phase?: PageBlockPluginPhase
}) {
  const source = formatPageBlockFence(kind, plugin, data)
  const loading = phase === 'loading'
  return (
    <div className="page-block-missing" data-testid="page-block-missing" data-plugin-phase={phase}>
      <div className="page-block-missing-head">
        {plugin ? (
          <code className="page-block-missing-id">{plugin}</code>
        ) : (
          <span className="page-block-missing-state">没有插件 id</span>
        )}
        {loading ? <span className="page-block-missing-state">正在加载</span> : null}
        {plugin && !loading ? (
          <button
            type="button"
            className="page-block-missing-enable"
            data-testid="page-block-enable"
            title="启用"
            aria-label="启用"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setPageBlockPluginPhase(plugin, 'idle')
              requestEnablePageBlockPlugin(plugin, kind, { force: true })
            }}
          >
            <PlayIcon aria-hidden className="page-block-missing-enable-icon" />
          </button>
        ) : null}
      </div>
      {loading ? null : <pre className="page-block-missing-source">{source}</pre>}
    </div>
  )
}

function PageBlockIdle() {
  return (
    <div
      className="page-block-idle"
      data-page-block-idle=""
      aria-hidden
      style={{ minHeight: PAGE_BLOCK_IDLE_MIN_PX }}
    />
  )
}

function useNearPageBlock(active: boolean, host: RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(!active)
  useEffect(() => {
    if (!active) {
      setNear(true)
      return
    }
    if (near) return
    let gone = false
    let io: IntersectionObserver | null = null
    let tries = 0
    const start = () => {
      if (gone) return
      const el = host.current
      if (!el) {
        if (tries++ < 8) requestAnimationFrame(start)
        return
      }
      if (typeof IntersectionObserver === 'undefined') {
        setNear(true)
        return
      }
      io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((row) => row.isIntersecting)) return
          io?.disconnect()
          setNear(true)
        },
        { rootMargin: PAGE_BLOCK_IDLE_ROOT_MARGIN, threshold: 0 },
      )
      io.observe(el)
    }
    start()
    return () => {
      gone = true
      io?.disconnect()
    }
  }, [active, host, near])
  return near
}

function samePageBlockProps(prev: NodeViewProps, next: NodeViewProps) {
  return (
    prev.node.attrs.kind === next.node.attrs.kind &&
    prev.node.attrs.plugin === next.node.attrs.plugin &&
    prev.node.attrs.id === next.node.attrs.id &&
    JSON.stringify(prev.node.attrs.data) === JSON.stringify(next.node.attrs.data) &&
    prev.editor.isEditable === next.editor.isEditable
  )
}

export const PageBlockView = memo(function PageBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  usePageEditorVersion()
  const kind = String(node.attrs.kind ?? 'card')
  const plugin = String(node.attrs.plugin ?? '').trim()
  const data = (node.attrs.data && typeof node.attrs.data === 'object' ? node.attrs.data : {}) as Record<string, unknown>
  const spec = getPageEditor()?.block(kind)
  const cloneFrom = typeof data.cloneFrom === 'string' ? data.cloneFrom : ''
  const file = typeof data.file === 'string' ? data.file : ''
  const blockId = String(node.attrs.id ?? '').trim()
  const pickId = blockId || `${plugin || 'page-block'}:${kind}`
  const pickLabel = spec?.label || kind
  const View = spec?.View
  const phase = usePageBlockPluginPhase(plugin)
  const dataRef = useRef(data)
  dataRef.current = data
  const updateAttributesRef = useRef(updateAttributes)
  updateAttributesRef.current = updateAttributes
  const update = useCallback((patch: Record<string, unknown>, opts?: { replace?: boolean }) => {
    const current = dataRef.current
    const next = opts?.replace ? { ...patch } : { ...current, ...patch }
    if (!Object.prototype.hasOwnProperty.call(patch, 'title') && typeof current.title === 'string') {
      next.title = current.title
    }
    if (blockDataUnchanged(current, next)) return
    updateAttributesRef.current({ data: next })
  }, [])
  const hostRef = useRef<HTMLElement | null>(null)
  const near = useNearPageBlock(Boolean(plugin), hostRef)
  const [showView, setShowView] = useState(false)
  useEffect(() => {
    if (!near || !View || showView) return
    let gone = false
    schedulePageBlockMount(() => {
      if (!gone) setShowView(true)
    })
    return () => {
      gone = true
    }
  }, [View, near, showView])
  useLayoutEffect(() => bindPageBlockPlugin(hostRef.current, plugin), [plugin])
  useEffect(() => {
    if (!near || View || !plugin || phase !== 'idle') return
    requestEnablePageBlockPlugin(plugin, kind)
  }, [View, kind, near, phase, plugin])

  useEffect(() => {
    if (!cloneFrom || !file) return
    let gone = false
    void copyPageAsset(cloneFrom, file).then(() => {
      if (gone) return
      update({ cloneFrom: undefined })
    })
    return () => {
      gone = true
    }
  }, [cloneFrom, file])

  const onMouseDown = (event: MouseEvent) => {
    if (!editor.isEditable || editor.isDestroyed) return
    if (event.target instanceof Element && event.target.closest('textarea, input, select, button, a')) return
    // Pick overlay resolves the inner html node. A node selection here becomes
    // a markdown fence pick on pointerup and hides that node.
    if (document.documentElement.classList.contains('pick-mode')) return
    const pos = getPos()
    if (typeof pos !== 'number') return
    editor.chain().setNodeSelection(pos).run()
  }

  return (
    <NodeViewWrapper
      ref={hostRef}
      className="page-block"
      data-page-block={kind}
      data-page-block-plugin={plugin}
      data-page-block-id={blockId || undefined}
      data-page-block-capture=""
      data-biu-plugin={plugin || undefined}
      data-biu-kind="plugin"
      data-biu-id={pickId}
      data-biu-label={pickLabel}
      contentEditable={false}
      data-testid={`page-block-${kind}`}
      onMouseDown={onMouseDown}
    >
      {cloneFrom ? (
        <div className="page-block-missing">正在复制附件…</div>
      ) : !near ? (
        <PageBlockIdle />
      ) : View && showView ? (
        // 文档里的插件块崩了只烂这一块，不该让整个应用白屏。
        <RenderBoundary label={plugin || kind}>
          <View data={data} update={update} writable />
        </RenderBoundary>
      ) : View ? (
        <PageBlockIdle />
      ) : (
        <PageBlockMissing kind={kind} plugin={plugin} data={data} phase={phase} />
      )}
    </NodeViewWrapper>
  )
}, samePageBlockProps)
