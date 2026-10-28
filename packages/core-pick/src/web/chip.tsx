import {
  CircleStackIcon,
  StopCircleIcon,
  HashtagIcon,
  Square3Stack3DIcon,
  DocumentIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  ChatBubbleLeftIcon,
  PuzzlePieceIcon,
  TagIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/16/solid'
import type { ComponentType } from 'react'
import { ensureTagChipStyle, HeadlessPopover, TagChipCloseMark, tagTone } from '@biu/biu-ui'
import type { PickRef } from './types.ts'
import { chipCaption, chipLabel } from './types.ts'

/** 注入侧可能写 tasks / sessions-db，芯片按规范 kind 取色和图标。 */
const PICK_KIND_ALIAS: Record<string, string> = {
  tasks: 'task',
  pages: 'page',
  plugins: 'plugin',
  sessions: 'session',
  'sessions-db': 'session',
  events: 'event',
  'events-db': 'event',
  views: 'view',
  'views-db': 'view',
  tags: 'tag',
  facets: 'facet',
  'facets-db': 'facet',
}

export function canonicalPickKind(kind: string) {
  const key = String(kind ?? '').trim()
  return PICK_KIND_ALIAS[key] ?? key.replace(/-db$/, '')
}

/** 采集点 kind 字符串映射到分面色板。 */
export function pickKindTone(kind: string) {
  return tagTone(canonicalPickKind(kind))
}

type Glyph = ComponentType<{ className?: string }>

const KIND_ICONS: Record<string, Glyph> = {
  session: ChatBubbleLeftIcon,
  text: DocumentTextIcon,
  task: CheckCircleIcon,
  page: DocumentIcon,
  collection: TagIcon,
  view: Square3Stack3DIcon,
  plugin: PuzzlePieceIcon,
  message: ChatBubbleLeftIcon,
  reply: ChatBubbleLeftIcon,
  tool: WrenchScrewdriverIcon,
  step: Square3Stack3DIcon,
  event: StopCircleIcon,
  turn: HashtagIcon,
  usage: CircleStackIcon,
  tag: TagIcon,
  facet: TagIcon,
  record: ClipboardDocumentCheckIcon,
  html: DocumentIcon,
  block: DocumentTextIcon,
  file: DocumentIcon,
}

export function pickKindIcon(kind: string): Glyph {
  return KIND_ICONS[canonicalPickKind(kind)] ?? TagIcon
}

export function PickKindGlyph({ kind }: { kind: string }) {
  const Icon = pickKindIcon(kind)
  return <Icon className="pick-kind-icon" aria-hidden data-testid="pick-kind-icon" data-pick-kind={kind} />
}

export function PickChipLabel({ pick }: { pick: PickRef }) {
  const { name, span } = chipCaption(pick)
  const field = pick.field ? pick.label?.trim() || pick.field : ''
  const host = pick.field ? pick.title?.trim() ?? '' : ''
  const split = Boolean(field && host && host !== field)
  return (
    <>
      <PickKindGlyph kind={pick.kind} />
      <span className="pick-chip-name">
        {split ? (
          <>
            <span className="pick-chip-host">{host}</span>
            <span className="pick-chip-field">{` · ${field}`}</span>
          </>
        ) : (
          <span className="pick-chip-host">{name}</span>
        )}
      </span>
      {span ? <span className="pick-chip-lines">({span})</span> : null}
    </>
  )
}

const INSPECT_KEYS = [
  'kind',
  'id',
  'label',
  'title',
  'path',
  'plugin',
  'field',
  'action',
  'route',
  'selection',
  'element',
  'text',
  'start_line',
  'end_line',
  'insert',
] as const

const INSPECT_STYLE_ID = 'biu-pick-chip-data'
const INSPECT_CSS = `
.pick-chip-data{z-index:var(--biu-z-dropdown,80);box-sizing:border-box;min-width:240px;max-width:min(420px,calc(100vw - 24px));max-height:min(52vh,360px);overflow:auto;padding:8px 10px;background:var(--biu-color-bg-subtle);border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;box-shadow:var(--biu-shadow-md);color:var(--biu-color-text);font-size:var(--biu-font-size-3);line-height:1.45}
.pick-chip-data-h{margin:0 0 8px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-1);font-weight:600}
.pick-chip-data-row{display:grid;grid-template-columns:72px minmax(0,1fr);gap:6px 10px;margin:0 0 6px}
.pick-chip-data-row:last-child{margin:0}
.pick-chip-data-k{color:var(--biu-color-text-muted);font-weight:600}
.pick-chip-data-v{min-width:0;white-space:pre-wrap;word-break:break-word}
`

export function pickInspectRows(ref: PickRef) {
  const rows: { key: string; value: string }[] = []
  for (const key of INSPECT_KEYS) {
    const raw = ref[key]
    if (raw == null || raw === '') continue
    rows.push({ key, value: String(raw) })
  }
  return rows
}

function ensurePickInspectStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(INSPECT_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = INSPECT_STYLE_ID
  style.textContent = INSPECT_CSS
  document.head.appendChild(style)
}

function PickChipData({ pick }: { pick: PickRef }) {
  ensurePickInspectStyle()
  const rows = pickInspectRows(pick)
  return (
    <div className="pick-chip-data" data-testid="pick-chip-data" role="dialog" aria-label="选取数据">
      <div className="pick-chip-data-h">选取数据</div>
      {rows.map((row) => (
        <div key={row.key} className="pick-chip-data-row">
          <div className="pick-chip-data-k">{row.key}</div>
          <div className="pick-chip-data-v">{row.value}</div>
        </div>
      ))}
    </div>
  )
}

export function PickChip({
  pick,
  onRemove,
  inspect = true,
}: {
  pick: PickRef
  onRemove?: () => void
  inspect?: boolean
}) {
  ensureTagChipStyle()
  const label = chipLabel(pick)
  const chip = (
    <span
      className="biu-tag composer-tool-chip is-pick"
      data-testid="user-pick-chip"
      data-pick-kind={pick.kind}
      title={pick.kind === 'file' && pick.path ? pick.path : `${pick.kind} · ${label}`}
      style={{ ['--biu-tag' as string]: pickKindTone(pick.kind), cursor: inspect ? 'pointer' : undefined }}
    >
      <PickChipLabel pick={pick} />
      {onRemove ? (
        <button
          type="button"
          className="biu-tag-x"
          aria-label={`移除 ${label}`}
          contentEditable={false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove()
          }}
        >
          <TagChipCloseMark />
        </button>
      ) : null}
    </span>
  )
  if (!inspect) return chip
  return (
    <HeadlessPopover trigger={chip} side="top" align="start" sideOffset={6}>
      <PickChipData pick={pick} />
    </HeadlessPopover>
  )
}
