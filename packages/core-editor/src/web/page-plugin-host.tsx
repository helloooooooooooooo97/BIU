import { useEffect, useLayoutEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { PlayIcon } from '@heroicons/react/16/solid'
import { RenderBoundary } from '@biu/biu-ui'
import { getPageEditor, usePageEditorVersion, type PageBlockViewProps } from './service.ts'
import {
  ENABLE_PAGE_BLOCK_PLUGIN,
  requestEnablePageBlockPlugin,
  usePageBlockPluginPhase,
  type PageBlockPluginPhase,
} from './page-block-meta.ts'
import { bindPageBlockPlugin } from './page-block-plugin-host.ts'
import { SourceEditor } from './source-editor.tsx'

export function pagePluginPickId(plugin: string, kind: string, blockId = '') {
  const id = blockId.trim()
  if (id) return id
  return `${plugin.trim() || 'page-block'}:${kind || 'block'}`
}

export function pagePluginHostAttrs(opts: {
  kind: string
  plugin: string
  blockId?: string
  label?: string
  testId?: string
}) {
  const kind = opts.kind.trim()
  const plugin = opts.plugin.trim()
  const blockId = String(opts.blockId ?? '').trim()
  return {
    className: 'page-block',
    'data-page-block': kind || undefined,
    'data-page-block-plugin': plugin || undefined,
    'data-page-block-id': blockId || undefined,
    'data-page-block-capture': '',
    'data-biu-plugin': plugin || undefined,
    'data-biu-kind': 'plugin' as const,
    'data-biu-id': pagePluginPickId(plugin, kind, blockId),
    'data-biu-label': opts.label || kind || undefined,
    ...(opts.testId ? { 'data-testid': opts.testId } : {}),
  }
}

export function usePagePluginResolve(kind: string, plugin: string) {
  usePageEditorVersion()
  const spec = getPageEditor()?.block(kind)
  const View = spec?.View
  const phase = usePageBlockPluginPhase(plugin)
  const retriedReady = useRef(false)
  useEffect(() => {
    if (View) {
      retriedReady.current = false
      return
    }
    if (!plugin || phase === 'loading' || phase === 'failed' || phase === 'missing') return
    if (phase === 'ready') {
      if (retriedReady.current) return
      retriedReady.current = true
      window.dispatchEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN, { detail: { plugin, kind } }))
      return
    }
    requestEnablePageBlockPlugin(plugin, kind)
  }, [View, kind, phase, plugin])
  return { spec, View, phase }
}

export function useBindPagePlugin<T extends HTMLElement = HTMLElement>(plugin: string) {
  const hostRef = useRef<T | null>(null)
  useLayoutEffect(() => bindPageBlockPlugin(hostRef.current, plugin), [plugin])
  return hostRef
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
  const source = JSON.stringify(data, null, 2)
  const loading = phase === 'loading'
  const missing = phase === 'missing'
  return (
    <div className="page-block-missing" data-testid="page-block-missing" data-plugin-phase={phase}>
      <div className="page-block-missing-head">
        {plugin ? (
          <code className="page-block-missing-id">{plugin}</code>
        ) : (
          <span className="page-block-missing-state">没有插件 id</span>
        )}
        {loading ? <span className="page-block-missing-state">正在加载</span> : null}
        {missing ? <span className="page-block-missing-state">插件不存在</span> : null}
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
              requestEnablePageBlockPlugin(plugin, kind, { force: true })
            }}
          >
            <PlayIcon aria-hidden className="page-block-missing-enable-icon" />
          </button>
        ) : null}
      </div>
      {loading ? null : (
        <div className="page-block-missing-source">
          <SourceEditor value={source} language="json" writable={false} compact />
        </div>
      )}
    </div>
  )
}

export function PagePluginSurface({
  kind,
  plugin,
  data,
  update,
  writable,
  selected,
  View,
  phase,
  pending,
}: {
  kind: string
  plugin: string
  data: Record<string, unknown>
  update: PageBlockViewProps['update']
  writable: boolean
  selected?: boolean
  View?: ComponentType<PageBlockViewProps>
  phase: PageBlockPluginPhase
  pending?: ReactNode
}) {
  if (pending) return pending
  if (View) {
    return (
      <RenderBoundary label={plugin || kind}>
        <View data={data} update={update} writable={writable} selected={selected} />
      </RenderBoundary>
    )
  }
  return <PageBlockMissing kind={kind || 'unknown'} plugin={plugin} data={data} phase={phase} />
}
