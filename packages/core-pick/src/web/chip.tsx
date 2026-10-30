import {
  CircleStackIcon,
  StopCircleIcon,
  HashtagIcon,
  Square3Stack3DIcon,
  DocumentIcon,
  DocumentTextIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  ChatBubbleLeftIcon,
  CursorArrowRaysIcon,
  PuzzlePieceIcon,
  TagIcon,
  WrenchScrewdriverIcon,
  ArrowTopRightOnSquareIcon,
  AcademicCapIcon,
  LinkIcon,
  BellIcon,
  UserGroupIcon,
  RectangleGroupIcon,
} from '@heroicons/react/16/solid'
import { useState, type ComponentType } from 'react'
import { ensureTagChipStyle, HeadlessPopover, TagChipCloseMark, overlayZ, tagTone } from '@biu/biu-ui'
import type { PickRef } from './types.ts'
import { chipCaption, chipLabel } from './types.ts'

/** 注入侧可能写 tasks / sessions-db，芯片按规范 kind 取色和图标。 */
const PICK_KIND_ALIAS: Record<string, string> = {
  tasks: 'task',
  pages: 'page',
  plugins: 'plugin',
  sessions: 'session',
  agents: 'session',
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
  session: CursorArrowRaysIcon,
  text: Bars3BottomLeftIcon,
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
  skill: AcademicCapIcon,
  mcp: LinkIcon,
  member: UserGroupIcon,
  notice: BellIcon,
  widgets: RectangleGroupIcon,
}

const COLLECTION_KIND: Record<string, string> = {
  agents: 'session',
  sessions: 'session',
  tasks: 'task',
  pages: 'page',
  plugins: 'plugin',
  skills: 'skill',
  mcp: 'mcp',
  events: 'event',
  views: 'view',
  facets: 'facet',
  tags: 'facet',
  members: 'member',
  'workspace-members': 'member',
  notices: 'notice',
  notifications: 'notice',
  'page-blocks': 'widgets',
  usage: 'usage',
}

/** 侧栏表 / 视图芯片用路径选图标，不要一律标签。 */
export function collectionPickKind(hint?: string) {
  const raw = String(hint ?? '').trim()
  if (!raw) return ''
  const path = raw.includes('::') ? raw.slice(0, raw.indexOf('::')) : raw
  const key = path.replace(/^\//, '').split('/')[0]?.trim().toLowerCase() ?? ''
  if (!key) return ''
  return COLLECTION_KIND[key] ?? canonicalPickKind(key)
}

export function pickKindIcon(kind: string, hint?: string): Glyph {
  const canon = canonicalPickKind(kind)
  if (canon === 'collection' || canon === 'view') {
    const mapped = collectionPickKind(hint)
    if (mapped && KIND_ICONS[mapped]) return KIND_ICONS[mapped]
  }
  return KIND_ICONS[canon] ?? TagIcon
}

export function PickKindGlyph({ kind, hint }: { kind: string; hint?: string }) {
  const Icon = pickKindIcon(kind, hint)
  return <Icon className="pick-kind-icon" aria-hidden data-testid="pick-kind-icon" data-pick-kind={kind} />
}

export function PickChipLabel({ pick }: { pick: PickRef }) {
  const { name, span } = chipCaption(pick)
  const field = pick.field ? pick.label?.trim() || pick.field : ''
  const host = pick.field ? pick.title?.trim() ?? '' : ''
  const split = Boolean(field && host && host !== field)
  return (
    <>
      <PickKindGlyph kind={pick.kind} hint={pick.path || pick.id} />
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
.pick-chip-data{position:relative;z-index:300;box-sizing:border-box;width:min(360px,calc(100vw - 24px));max-height:min(72vh,560px);overflow:auto;padding:0;background:var(--biu-color-bg-subtle);border:0;border-radius:10px;box-shadow:none;color:var(--biu-color-text);font-family:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:20px}
.pick-chip-data-head{display:flex;align-items:center;gap:8px;margin:0;padding:10px 12px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px 10px 0 0;background:color-mix(in srgb,var(--biu-tag,var(--biu-color-emphasis)) 22%,transparent);color:var(--biu-tag,var(--biu-color-emphasis));font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:20px}
.pick-chip-data-head .pick-kind-icon{width:14px;height:14px;color:var(--biu-tag,var(--biu-color-emphasis))}
.pick-chip-data-head span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pick-chip-data-k,.pick-chip-data-v{margin:0;font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:20px}
.pick-chip-data-fields{margin:0;padding:8px 12px;display:flex;flex-direction:column;gap:0}
.pick-chip-data-row{display:grid;grid-template-columns:72px minmax(0,1fr);align-items:flex-start;gap:8px;min-height:28px;margin:0;font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:20px}
.pick-chip-data-row.is-stack{align-items:flex-start}
.pick-chip-data-row.is-stack .pick-chip-data-k{min-height:28px}
.pick-chip-data-k{display:inline-flex;align-items:center;gap:6px;min-width:0;min-height:28px;color:var(--biu-color-text-muted)}
.pick-chip-data-k svg{flex:none;width:14px;height:14px;color:var(--biu-color-icon)}
.pick-chip-data-k span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pick-chip-data-v{display:flex;align-items:flex-start;box-sizing:border-box;min-width:0;min-height:28px;padding:4px 0 0;border:0;border-radius:0;background:transparent;color:var(--biu-color-text);overflow:hidden;user-select:text}
.pick-chip-data-v.is-stack{align-items:flex-start;padding:4px 0 0}
.pick-chip-data-v.is-jump{gap:4px;padding-right:0}
.pick-chip-data-v-text{min-width:0;flex:1;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:pre-wrap;word-break:break-word}
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
  const existing = document.getElementById(INSPECT_STYLE_ID)
  if (existing) {
    if (existing.textContent !== INSPECT_CSS) existing.textContent = INSPECT_CSS
    return
  }
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
      style={{ zIndex: overlayZ(300) }}
    >
      <p className="pick-chip-data-head" style={{ ['--biu-tag' as string]: pickKindTone(pick.kind) }}>
        <PickKindGlyph kind={pick.kind} hint={pick.path || pick.id} />
        <span>{card.kind}</span>
      </p>
      <div className="pick-chip-data-fields">
        {card.fields.filter((item) => item.key !== 'kind').map((item) => (
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
  const [open, setOpen] = useState(false)
  const label = chipLabel(pick)
  const chip = (
    <button
      type="button"
      className="biu-tag composer-tool-chip is-pick"
      data-testid="user-pick-chip"
      data-pick-kind={pick.kind}
      title={pick.kind === 'file' && pick.path ? pick.path : `${pick.kind} · ${label}`}
      style={{ ['--biu-tag' as string]: pickKindTone(pick.kind), cursor: inspect ? 'pointer' : undefined }}
      contentEditable={false}
      onMouseDown={(event) => {
        if (!inspect) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={(event) => {
        if (!inspect) return
        event.stopPropagation()
      }}
    >
      <PickChipLabel pick={pick} />
      {onRemove ? (
        <span
          role="button"
          tabIndex={-1}
          className="biu-tag-x"
          aria-label={`移除 ${label}`}
          contentEditable={false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
            onRemove()
          }}
        >
          <TagChipCloseMark />
        </span>
      ) : null}
    </button>
  )
  if (!inspect) return chip
  return (
    <HeadlessPopover
      open={open}
      onOpenChange={setOpen}
      trigger={chip}
      side="top"
      align="start"
      sideOffset={10}
      avoidCollisions={false}
      container={typeof document === 'undefined' ? null : document.body}
    >
      <PickChipData pick={pick} />
    </HeadlessPopover>
  )
}
