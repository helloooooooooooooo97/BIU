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
import { chipCaption, chipLabel, pathLeaf, pickPreview } from './types.ts'

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

const INSPECT_STYLE_ID = 'biu-pick-chip-data'
const INSPECT_CSS = `
.pick-chip-data{z-index:var(--biu-z-dropdown,80);box-sizing:border-box;width:min(320px,calc(100vw - 24px));max-height:min(56vh,420px);overflow:auto;padding:14px 14px 12px;background:var(--biu-color-bg-elevated,var(--biu-color-bg-subtle));border:0;border-radius:16px;box-shadow:var(--biu-shadow-md);color:var(--biu-color-text)}
.pick-chip-data-head{display:flex;align-items:center;gap:10px;min-width:0;margin:0 0 12px}
.pick-chip-data-mark{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--biu-tag,var(--biu-color-emphasis)) 22%,transparent);color:var(--biu-tag,var(--biu-color-emphasis))}
.pick-chip-data-mark .pick-kind-icon{width:14px;height:14px}
.pick-chip-data-copy{min-width:0;flex:1}
.pick-chip-data-kind{margin:0 0 2px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-medium);letter-spacing:.04em;text-transform:uppercase}
.pick-chip-data-title{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);letter-spacing:-.02em}
.pick-chip-data-quote{margin:0 0 10px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--biu-color-text) 5%,transparent);color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-regular);line-height:1.5;white-space:pre-wrap;word-break:break-word}
.pick-chip-data-code{margin:0 0 10px;padding:8px 10px;border-radius:10px;background:var(--biu-color-bg-code,var(--biu-color-bg-hover));color:var(--biu-color-text-muted);font-family:var(--font-mono);font-size:var(--biu-font-size-1);line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:140px;overflow:auto}
.pick-chip-data-meta{display:flex;flex-wrap:wrap;gap:6px}
.pick-chip-data-pill{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;height:22px;padding:0 8px;border-radius:var(--biu-radius-full);background:var(--biu-color-bg-hover);color:var(--biu-color-text-muted);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-medium)}
.pick-chip-data-pill b{color:var(--biu-color-text-subtle);font-weight:var(--biu-font-weight-medium)}
.pick-chip-data-pill span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

export function pickInspectCard(ref: PickRef) {
  const title = chipCaption(ref).name || ref.label || ref.kind
  const quote = (ref.selection || '').trim()
  const snippet = (ref.element || '').trim()
  const meta: { key: string; label: string; value: string }[] = []
  const page = ref.title?.trim()
  if (page && page !== title) meta.push({ key: 'title', label: '页面', value: page })
  const file = pathLeaf(ref.path || '')
  if (file) meta.push({ key: 'path', label: '路径', value: file })
  if (ref.plugin?.trim()) meta.push({ key: 'plugin', label: '插件', value: ref.plugin.trim() })
  if (ref.field?.trim()) meta.push({ key: 'field', label: '字段', value: ref.field.trim() })
  if (ref.action?.trim()) meta.push({ key: 'action', label: '动作', value: ref.action.trim() })
  return {
    kind: canonicalPickKind(ref.kind) || ref.kind,
    title,
    quote: quote && quote !== title ? quote : '',
    snippet: snippet ? pickPreview(snippet, 280) : '',
    meta,
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
      {card.snippet ? <pre className="pick-chip-data-code">{card.snippet}</pre> : null}
      {card.meta.length ? (
        <div className="pick-chip-data-meta">
          {card.meta.map((item) => (
            <span key={item.key} className="pick-chip-data-pill">
              <b>{item.label}</b>
              <span>{item.value}</span>
            </span>
          ))}
        </div>
      ) : null}
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
