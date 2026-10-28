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
  ArrowTopRightOnSquareIcon,
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
  ['kind', '类型', 'tag'],
  ['id', 'ID', 'id'],
  ['label', '名称', 'text'],
  ['title', '页面', 'page'],
  ['path', '路径', 'file'],
  ['plugin', '插件', 'plugin'],
  ['field', '字段', 'tag'],
  ['action', '动作', 'action'],
  ['route', '路由', 'file'],
  ['selection', '选区', 'text'],
  ['element', '节点', 'text'],
  ['text', '源码', 'text'],
  ['start_line', '起行', 'id'],
  ['end_line', '止行', 'id'],
  ['insert', '插入点', 'id'],
] as const

const INSPECT_STYLE_ID = 'biu-pick-chip-data'
const INSPECT_CSS = `
.pick-chip-data{z-index:var(--biu-z-dropdown,80);box-sizing:border-box;width:min(380px,calc(100vw - 24px));max-height:min(72vh,560px);overflow:auto;padding:14px 14px 10px;background:var(--biu-color-bg-elevated,var(--biu-color-bg-subtle));border:0;border-radius:16px;box-shadow:var(--biu-shadow-md);color:var(--biu-color-text);font-family:inherit;font-size:var(--biu-font-size-4);font-weight:500;line-height:20px}
.pick-chip-data-head{display:flex;align-items:center;gap:10px;min-width:0;min-height:32px;margin:0 0 8px}
.pick-chip-data-mark{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--biu-tag,var(--biu-color-emphasis)) 22%,transparent);color:var(--biu-tag,var(--biu-color-emphasis))}
.pick-chip-data-mark .pick-kind-icon{width:14px;height:14px}
.pick-chip-data-copy{min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center;gap:0}
.pick-chip-data-kind,.pick-chip-data-title,.pick-chip-data-k,.pick-chip-data-v{margin:0;font:inherit;font-size:var(--biu-font-size-4);font-weight:500;line-height:20px}
.pick-chip-data-kind{color:var(--biu-color-text-subtle);letter-spacing:.04em;text-transform:uppercase}
.pick-chip-data-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--biu-color-text)}
.pick-chip-data-fields{margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.pick-chip-data-row{display:grid;grid-template-columns:108px minmax(0,1fr);align-items:center;gap:8px;min-height:32px;margin:0;font:inherit;font-size:var(--biu-font-size-4);font-weight:500;line-height:20px}
.pick-chip-data-row.is-stack{align-items:flex-start}
.pick-chip-data-row.is-stack .pick-chip-data-k{min-height:32px}
.pick-chip-data-k{display:inline-flex;align-items:center;gap:6px;min-width:0;min-height:32px;color:var(--biu-color-text-muted)}
.pick-chip-data-k svg{flex:none;width:14px;height:14px;color:var(--biu-color-icon)}
.pick-chip-data-k span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pick-chip-data-v{display:flex;align-items:center;box-sizing:border-box;min-width:0;min-height:32px;padding:0 10px;border-radius:8px;background:color-mix(in srgb,var(--biu-color-text) 6%,transparent);color:var(--biu-color-text);white-space:pre-wrap;word-break:break-word;user-select:text}
.pick-chip-data-v.is-stack{align-items:flex-start;padding:6px 10px;max-height:160px;overflow:auto}
.pick-chip-data-v.is-jump{gap:4px;padding-right:4px}
.pick-chip-data-v-text{min-width:0;flex:1}
.pick-chip-data-jump{flex:none;display:grid;place-items:center;width:24px;height:24px;margin:0;border:0;padding:0;border-radius:6px;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.pick-chip-data-jump:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.pick-chip-data-jump svg{width:14px;height:14px}
`

function inspectFieldIcon(kind: (typeof INSPECT_FIELDS)[number][2]) {
  const cls = 'size-[14px]'
  if (kind === 'id') return <HashtagIcon aria-hidden className={cls} />
  if (kind === 'page') return <DocumentIcon aria-hidden className={cls} />
  if (kind === 'file') return <DocumentIcon aria-hidden className={cls} />
  if (kind === 'plugin') return <PuzzlePieceIcon aria-hidden className={cls} />
  if (kind === 'action') return <WrenchScrewdriverIcon aria-hidden className={cls} />
  if (kind === 'tag') return <TagIcon aria-hidden className={cls} />
  return <DocumentTextIcon aria-hidden className={cls} />
}

const INSPECTOR_REVEAL = 'biu:inspector-reveal'

/** db_content 路径 `/pages/p002` → 右侧检查器打开该记录。 */
export function inspectPathTarget(path: string) {
  const parts = String(path ?? '').trim().split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { collection: `/${parts[0]}`, recordId: parts.slice(1).join('/'), unique: true as const }
}

export function revealInspectPath(path: string) {
  const detail = inspectPathTarget(path)
  if (!detail || typeof window === 'undefined') return detail
  window.dispatchEvent(new Event('biu:inspector-open'))
  window.dispatchEvent(new CustomEvent(INSPECTOR_REVEAL, { detail }))
  return detail
}

export function pickInspectCard(ref: PickRef) {
  const title = chipCaption(ref).name || ref.label || ref.kind
  const fields: {
    key: string
    label: string
    value: string
    glyph: (typeof INSPECT_FIELDS)[number][2]
    stack: boolean
    jump: boolean
  }[] = []
  for (const [key, label, glyph] of INSPECT_FIELDS) {
    const raw = ref[key]
    if (raw == null || raw === '') continue
    const value = String(raw)
    fields.push({
      key,
      label,
      value,
      glyph,
      stack: value.includes('\n'),
      jump: key === 'path' && Boolean(inspectPathTarget(value)),
    })
  }
  return {
    kind: canonicalPickKind(ref.kind) || ref.kind,
    title,
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
      <div className="pick-chip-data-fields">
        {card.fields.map((item) => (
          <div key={item.key} className={item.stack ? 'pick-chip-data-row is-stack' : 'pick-chip-data-row'}>
            <span className="pick-chip-data-k" title={item.label}>
              {inspectFieldIcon(item.glyph)}
              <span>{item.label}</span>
            </span>
            <span
              className={`pick-chip-data-v${item.stack ? ' is-stack' : ''}${item.jump ? ' is-jump' : ''}`}
              title={item.value}
            >
              <span className="pick-chip-data-v-text">{item.value}</span>
              {item.jump ? (
                <button
                  type="button"
                  className="pick-chip-data-jump"
                  data-testid="pick-chip-path-jump"
                  aria-label={`在检查器打开 ${item.value}`}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    revealInspectPath(item.value)
                  }}
                >
                  <ArrowTopRightOnSquareIcon aria-hidden />
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
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
