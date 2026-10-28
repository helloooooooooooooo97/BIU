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
  sandbox: DocumentTextIcon,
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

const INSPECT_FIELDS = [
  ['kind', '类型'],
  ['id', 'id'],
  ['label', '名称'],
  ['title', '页面'],
  ['path', '路径'],
  ['plugin', '插件'],
  ['field', '字段'],
  ['action', '动作'],
  ['route', '路由'],
  ['selection', '选区'],
  ['element', '节点'],
  ['text', '源码'],
  ['start_line', '起行'],
  ['end_line', '止行'],
  ['insert', '插入点'],
] as const

const INSPECT_STYLE_ID = 'biu-pick-chip-data'
const INSPECT_CSS = `
.pick-chip-data{z-index:var(--biu-z-dropdown,80);box-sizing:border-box;width:min(360px,calc(100vw - 24px));max-height:min(72vh,520px);overflow:auto;padding:14px 14px 12px;background:var(--biu-color-bg-elevated,var(--biu-color-bg-subtle));border:0;border-radius:16px;box-shadow:var(--biu-shadow-md);color:var(--biu-color-text)}
.pick-chip-data-head{display:flex;align-items:center;gap:10px;min-width:0;margin:0 0 12px}
.pick-chip-data-mark{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--biu-tag,var(--biu-color-emphasis)) 22%,transparent);color:var(--biu-tag,var(--biu-color-emphasis))}
.pick-chip-data-mark .pick-kind-icon{width:14px;height:14px}
.pick-chip-data-copy{min-width:0;flex:1}
.pick-chip-data-kind{margin:0 0 2px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-medium);letter-spacing:.04em;text-transform:uppercase}
.pick-chip-data-title{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);letter-spacing:-.02em}
.pick-chip-data-quote{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--biu-color-text) 5%,transparent);color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-regular);line-height:1.5;white-space:pre-wrap;word-break:break-word;user-select:text}
.pick-chip-data-fields{margin:0;padding:10px 0 0;border-top:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-text) 8%,transparent);display:flex;flex-direction:column;gap:8px}
.pick-chip-data-row{display:grid;grid-template-columns:52px minmax(0,1fr);gap:6px 10px;margin:0;align-items:start}
.pick-chip-data-k{padding-top:1px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-medium);letter-spacing:.02em}
.pick-chip-data-v{min-width:0;margin:0;color:var(--biu-color-text);font-size:var(--biu-font-size-2);line-height:1.45;white-space:pre-wrap;word-break:break-word;user-select:text}
.pick-chip-data-v.is-code{font-family:var(--font-mono);font-size:var(--biu-font-size-1);color:var(--biu-color-text-muted);max-height:160px;overflow:auto;padding:6px 8px;border-radius:8px;background:var(--biu-color-bg-code,var(--biu-color-bg-hover))}
`

const CODE_FIELDS = new Set(['id', 'path', 'route', 'element', 'text', 'plugin'])

export function pickInspectCard(ref: PickRef) {
  const title = chipCaption(ref).name || ref.label || ref.kind
  const quote = (ref.selection || '').trim()
  const fields: { key: string; label: string; value: string; code: boolean }[] = []
  for (const [key, label] of INSPECT_FIELDS) {
    const raw = ref[key]
    if (raw == null || raw === '') continue
    fields.push({ key, label, value: String(raw), code: CODE_FIELDS.has(key) })
  }
  return {
    kind: canonicalPickKind(ref.kind) || ref.kind,
    title,
    quote: quote && quote !== title ? quote : '',
    fields,
  }
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
  const card = pickInspectCard(pick)
  return (
    <div
      className="pick-chip-data"
      data-testid="pick-chip-data"
      role="dialog"
      aria-label={card.title}
      style={{ ['--biu-tag' as string]: pickKindTone(pick.kind) }}
    >
      <div className="pick-chip-data-head">
        <div className="pick-chip-data-mark">
          <PickKindGlyph kind={pick.kind} />
        </div>
        <div className="pick-chip-data-copy">
          <p className="pick-chip-data-kind">{card.kind}</p>
          <p className="pick-chip-data-title">{card.title}</p>
        </div>
      </div>
      {card.quote ? <p className="pick-chip-data-quote">{card.quote}</p> : null}
      <dl className="pick-chip-data-fields">
        {card.fields.map((item) => (
          <div key={item.key} className="pick-chip-data-row">
            <dt className="pick-chip-data-k">{item.label}</dt>
            <dd className={item.code ? 'pick-chip-data-v is-code' : 'pick-chip-data-v'}>{item.value}</dd>
          </div>
        ))}
      </dl>
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
