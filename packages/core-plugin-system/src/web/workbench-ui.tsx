import { useMemo, useState, type CSSProperties } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome, FsViewProps } from '@biu/type-file-system/ui'
import { parseClicks, parseTree, WORKBENCH_STAGES, type WorkbenchTree } from '../workbench.ts'

const STAGE_LABEL: Record<string, string> = {
  brief: '需求',
  wireframe: '线框',
  palette: '色彩',
  demo: '演示',
  plugin: '生成',
}

function treeOf(record: DbRecord) {
  try {
    return parseTree(record.tree)
  } catch {
    return null
  }
}

function clicksOf(record: DbRecord) {
  try {
    return parseClicks(record.clicks)
  } catch {
    return []
  }
}

function TreePreview({
  node,
  colors,
  on,
  toggled,
}: {
  node: WorkbenchTree
  colors: { bg: string; ink: string; muted: string; accent: string }
  on: (id: string) => void
  toggled: Set<string>
}) {
  const id = node.id
  const hit = id ? toggled.has(id) : false
  const kids = node.kids?.map((kid, i) => (
    <TreePreview key={kid.id || `${kid.t}-${i}`} node={kid} colors={colors} on={on} toggled={toggled} />
  ))
  const label = node.label || node.t
  if (node.t === 'btn') {
    return (
      <button type="button" className="plugin-wb-btn" data-on={hit || undefined} onClick={() => id && on(id)}>
        {label}
      </button>
    )
  }
  if (node.t === 'field') {
    return <div className="plugin-wb-field">{label}</div>
  }
  if (node.t === 'text' || node.t === 'stat') {
    return <div className={node.t === 'stat' ? 'plugin-wb-stat' : 'plugin-wb-text'}>{label}</div>
  }
  if (node.t === 'row') {
    return <div className="plugin-wb-row">{kids ?? label}</div>
  }
  if (node.t === 'list') {
    return <div className="plugin-wb-list">{kids ?? label}</div>
  }
  if (node.t === 'tabs') {
    return <div className="plugin-wb-tabs">{kids ?? label}</div>
  }
  return <div className={node.t === 'card' ? 'plugin-wb-card' : 'plugin-wb-stack'}>{kids ?? label}</div>
}

export function PluginWorkbenchDemo({ record }: { record: DbRecord }) {
  const tree = treeOf(record)
  const clicks = clicksOf(record)
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  const colors = useMemo(
    () => ({
      bg: String(record.bg || '#ffffff'),
      ink: String(record.ink || '#171717'),
      muted: String(record.muted || '#737373'),
      accent: String(record.accent || '#171717'),
    }),
    [record.bg, record.ink, record.muted, record.accent],
  )
  if (!tree) return null
  return (
    <div
      className="plugin-wb-demo"
      data-testid="plugin-workbench-demo"
      style={{
        '--wb-bg': colors.bg,
        '--wb-ink': colors.ink,
        '--wb-muted': colors.muted,
        '--wb-accent': colors.accent,
      } as CSSProperties}
    >
      <TreePreview
        node={tree}
        colors={colors}
        toggled={toggled}
        on={(id) => {
          const click = clicks.find((item) => item.on === id)
          if (!click) return
          setToggled((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }}
      />
    </div>
  )
}

export function PluginWorkbenchBoard({ record }: { record: DbRecord }) {
  const stage = String(record.stage ?? '')
  if (!stage && !record.who && !record.tree) return null
  return (
    <div className="plugin-wb-board" data-testid="plugin-workbench">
      <ol className="plugin-wb-steps">
        {WORKBENCH_STAGES.map((id) => (
          <li key={id} data-on={stage === id || undefined}>
            {STAGE_LABEL[id]}
          </li>
        ))}
      </ol>
      {record.who || record.job ? (
        <p className="plugin-wb-brief">
          {String(record.who || '')}
          {record.who && record.job ? ' · ' : ''}
          {String(record.job || '')}
        </p>
      ) : null}
      <PluginWorkbenchDemo record={record} />
    </div>
  )
}

function PluginTitle({ record, label }: { record: DbRecord; label: string }) {
  const enabled = record.enabled === true || record.enabled === 'true'
  const stage = String(record.stage ?? '')
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {enabled ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-(--dsw-ok,#22c55e)"
          data-testid="plugin-enabled-dot"
          aria-hidden
        />
      ) : null}
      <span className="truncate font-medium">{label}</span>
      {stage ? (
        <span className="plugin-wb-pill" data-testid="plugin-workbench-stage">
          {STAGE_LABEL[stage] || stage}
        </span>
      ) : null}
    </span>
  )
}

export const pluginsChrome: CollectionChrome = {
  Title: PluginTitle,
  Board: PluginWorkbenchBoard,
}

export function PluginWorkbenchView({ rows, onOpen }: FsViewProps) {
  return (
    <div className="plugin-wb-view" data-testid="plugin-workbench-view">
      {rows.map((row) => (
        <button key={row.id} type="button" className="plugin-wb-card-btn" onClick={() => onOpen(row)}>
          <span className="truncate font-medium">{String(row.title || row.id)}</span>
          <span className="plugin-wb-pill">{STAGE_LABEL[String(row.stage ?? '')] || '未开始'}</span>
        </button>
      ))}
    </div>
  )
}
