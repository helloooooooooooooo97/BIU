import { BoolBox } from '@biu/biu-ui/bool-box'
import { TagChip, TagChips } from '@biu/biu-ui/tag-chip'
import {
  ArchiveBoxArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CheckIcon,
  Bars3BottomLeftIcon,
  LinkIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import type { CollectionSchema, DbRecord, FieldSpec, FieldType } from '@biu/type-file-system'
import { actionVisibleToUser, asAttachmentList, asHttpHref, asImageSrc, asImageSrcList, asPerson, asPersonList, commitAttachments } from '@biu/type-file-system'
import type { CollectionRowViewType, CollectionViewType } from '@biu/type-file-system/ui'
import {
  asStringList,
  enumDisplayLabel,
  formatField,
  isRecordLinkField,
  matchActionWhen,
  resolveFieldType,
  type ViewMode,
} from './fields.ts'
import { AttachmentFile, UrlHref } from './cell-media.tsx'
import { PersonFace } from './person-cell.tsx'
import { RecordLinkChips } from './record-link-cell.tsx'

export function actionIcon(id: string, opts?: { fallback?: boolean; className?: string }) {
  const cls = opts?.className ?? 'size-[14px]'
  if (id === 'start' || id === 'play' || id === 'run' || id === 'open' || id === 'enable') return <PlayIcon aria-hidden className={cls} />
  if (id === 'stop' || id === 'close' || id === 'pause' || id === 'disable') return <StopIcon aria-hidden className={cls} />
  if (id === 'pack') return <ArchiveBoxArrowDownIcon aria-hidden className={cls} />
  if (id === 'uninstall' || id === 'delete' || id === 'remove') return <TrashGlyph aria-hidden className={cls} />
  if (id === 'edit' || id === 'rename') return <PencilSquareIcon aria-hidden className={cls} />
  if (id === 'refresh') return <ArrowPathIcon aria-hidden className={cls} />
  if (id === 'sync-from-directory') return <ArrowDownTrayIcon aria-hidden className={cls} />
  if (id === 'sync-to-directory') return <ArrowUpTrayIcon aria-hidden className={cls} />
  if (id === 'deliver') return <PaperAirplaneIcon aria-hidden className={cls} />
  if (id === 'report' || id === 'progress') return <ChatBubbleLeftRightIcon aria-hidden className={cls} />
  if (opts?.fallback === false) return null
  return <BoltIcon aria-hidden className={cls} />
}

export function ModeGlyph({
  id,
  extra,
  rows,
}: {
  id: ViewMode
  extra?: CollectionViewType[]
  rows?: CollectionRowViewType[]
}) {
  const cls = 'size-[14px]'
  const Custom = extra?.find((item) => item.id === id)?.Icon ?? rows?.find((item) => item.id === id)?.Icon
  if (Custom) return <Custom className={cls} />
  if (id === 'table') return <span aria-hidden className="fsdb-ui-glyph" data-icon="table" />
  return <span aria-hidden className="fsdb-ui-glyph" data-icon="share" />
}

export const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'table', label: '表格' },
]

export function fieldDraftValue(field: FieldSpec, value: unknown): string {
  const kind = resolveFieldType(field)
  if (kind === 'multi-select') return asStringList(value).join(', ')
  if (kind === 'boolean') return value === true || value === 'true' ? 'true' : 'false'
  if (kind === 'url') return asHttpHref(value)
  if (kind === 'image') {
    const list = asImageSrcList(value)
    if (list.length <= 1) return list[0] ?? ''
    return JSON.stringify(list)
  }
  if (kind === 'attachment') {
    const list = asAttachmentList(value)
    if (list.length <= 1) return list[0] ? JSON.stringify(list[0]) : ''
    return JSON.stringify(list)
  }
  if (kind === 'person') {
    const person = asPerson(value)
    return person ? JSON.stringify(person) : ''
  }
  if (kind === 'multi-ref') return asStringList(value).join(', ')
  if (kind === 'ref') return String(value ?? '')
  if (kind === 'file') {
    if (value == null || value === '') return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2)
  }
  if (value == null) return ''
  return String(value)
}

export function draftFromRecord(schema: CollectionSchema, row: DbRecord, bodyKey: string | null | undefined, detailBody: unknown) {
  const next: Record<string, string> = {}
  for (const [key, field] of Object.entries(schema.fields)) {
    const value = key === bodyKey ? detailBody : row[key]
    next[key] = fieldDraftValue(field, value)
  }
  return next
}

export function fieldGlyphKind(kind: FieldType) {
  if (kind === 'person') return 'person'
  if (kind === 'datetime') return 'date'
  if (kind === 'number') return 'num'
  if (kind === 'action') return 'play'
  if (kind === 'select' || kind === 'multi-select') return 'stack'
  if (kind === 'facet') return 'tag'
  if (kind === 'url') return 'link'
  if (kind === 'ref' || kind === 'multi-ref') return 'ref'
  if (kind === 'image' || kind === 'attachment' || kind === 'file') return 'file'
  return 'text'
}

export function FieldGlyph({ kind }: { kind: FieldType }) {
  if (kind === 'boolean') return <CheckCircleIcon aria-hidden className="fsdb-field-hero" />
  if (kind === 'url') return <LinkIcon aria-hidden className="fsdb-field-hero" />
  if (fieldGlyphKind(kind) === 'text') return <Bars3BottomLeftIcon aria-hidden className="fsdb-field-hero" />
  return <span aria-hidden className="fsdb-field-glyph" data-kind={fieldGlyphKind(kind)} />
}

export function BoolCell({
  on,
  writable,
  onToggle,
}: {
  on: boolean
  writable?: boolean
  onToggle?: () => void
}) {
  const mark = (
    <BoolBox on={on} locked={!writable}>
      {on ? <CheckIcon aria-hidden className="size-3" /> : null}
    </BoolBox>
  )
  if (!writable || !onToggle) {
    return (
      <span className="fsdb-bool" title={on ? '是' : '否'}>
        {mark}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="fsdb-boolbtn"
      aria-pressed={on}
      aria-label={on ? '是，点击改为否' : '否，点击改为是'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {mark}
    </button>
  )
}

function ImageThumb({ src }: { src: string }) {
  return (
    <span className="fsdb-thumb-btn" onPointerDown={(event) => event.stopPropagation()}>
      <img src={src} alt="" width={28} height={18} className="fsdb-thumb" />
    </span>
  )
}

function ImageThumbs({ srcs, compact }: { srcs: string[]; compact?: boolean }) {
  if (!srcs.length) return null
  const shown = compact ? srcs.slice(0, 4) : srcs
  if (compact) {
    return (
      <span className="fsdb-thumbs">
        {shown.map((src, index) => (
          <ImageThumb key={`${src}-${index}`} src={src} />
        ))}
        {srcs.length > 4 ? <span className="fsdb-meta">+{srcs.length - 4}</span> : null}
      </span>
    )
  }
  return (
    <div className="fsdb-fileview-imgs">
      {shown.map((src, index) => (
        <img key={`${src}-${index}`} className="fsdb-fileview-img" src={src} alt="" />
      ))}
    </div>
  )
}

export function parseFieldValue(field: FieldSpec, raw: string): unknown {
  const kind = resolveFieldType(field)
  if (kind === 'boolean') return raw === 'true'
  if (kind === 'number' || kind === 'datetime') return raw === '' ? null : Number(raw)
  if (kind === 'multi-select') return asStringList(raw)
  if (kind === 'facet') {
    const trimmed = raw.trim()
    if (!trimmed) return { tags: [], values: {} }
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return { tags: [], values: {} }
    }
  }
  if (kind === 'file' || kind === 'attachment' || kind === 'image' || kind === 'person') {
    const trimmed = raw.trim()
    if (!trimmed) return kind === 'file' ? null : ''
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed) as unknown
      } catch {
        return raw
      }
    }
    return raw
  }
  return raw
}

function previewImageSrc(kind: FieldType | undefined, value: unknown): string {
  if (kind === 'attachment' || kind === 'url' || kind === 'image') return ''
  const src = asImageSrc(value)
  if (!src) return ''
  if (!kind) return src
  if (/^data:image\//i.test(src)) return src
  if (/\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#]|$)/i.test(src)) return src
  return ''
}

export function FilePreview({
  value,
  compact = false,
  kind,
  onChange,
}: {
  value: unknown
  compact?: boolean
  kind?: FieldType
  onChange?: (next: unknown) => void
}) {
  if (value == null || value === '') return null
  if (kind === 'url') {
    const href = asHttpHref(value)
    if (!href) return null
    return <UrlHref href={href} />
  }
  if (kind === 'image') {
    const list = asImageSrcList(value)
    if (!list.length) return null
    return <ImageThumbs srcs={list} compact={compact} />
  }
  const src = previewImageSrc(kind, value)
  if (src) {
    if (compact) return <ImageThumb src={src} />
    return <img className="fsdb-fileview-img" src={src} alt="" />
  }
  const files = asAttachmentList(value)
  if (files.length) {
    return (
      <span className="fsdb-files">
        {files.map((file, index) => (
          <AttachmentFile
            key={`${file.href}-${index}`}
            file={file}
            onRemove={
              onChange
                ? () => onChange(commitAttachments(files.filter((_, i) => i !== index)))
                : undefined
            }
          />
        ))}
      </span>
    )
  }
  const href = asHttpHref(value)
  if (href && typeof value !== 'object') {
    return (
      <a className="fsdb-link" href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        {href}
      </a>
    )
  }
  if (kind === 'url' || kind === 'attachment' || kind === 'image') return null
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, compact ? 0 : 2)
  if (compact) return <span className="fsdb-meta">{text.length > 80 ? `${text.slice(0, 80)}…` : text}</span>
  return text ? <pre className="fsdb-fileview-pre">{text}</pre> : null
}

export function DefaultCell({
  field,
  value,
  fieldKey,
  records,
  collectionPath,
  labelField,
  onRun,
  onChange,
  plain,
  onOpenLink,
}: {
  field: FieldSpec
  value: unknown
  fieldKey?: string
  records?: DbRecord[]
  collectionPath?: string
  labelField?: string
  onRun?: () => void
  onChange?: (next: unknown) => void
  plain?: boolean
  onOpenLink?: (id: string) => void
}) {
  const kind = resolveFieldType(field)
  if (kind === 'action') {
    return <ActionCell field={field} fieldKey={fieldKey ?? ''} onRun={onRun} />
  }
  if (fieldKey && isRecordLinkField(field, fieldKey)) {
    return (
      <RecordLinkChips
        field={field}
        fieldKey={fieldKey}
        value={value}
        collectionPath={collectionPath}
        records={records}
        labelField={labelField}
        deferMissing={plain}
        onOpen={onOpenLink}
      />
    )
  }
  if (kind === 'select' || kind === 'multi-select') {
    const tags = kind === 'multi-select' ? asStringList(value) : String(value ?? '') ? [String(value)] : []
    if (!tags.length) return null
    if (plain) {
      return <span className="fsdb-select-text">{tags.map((tag) => enumDisplayLabel(field, tag)).join('、')}</span>
    }
    return (
      <TagChips>
        {tags.map((tag) => (
          <TagChip key={tag} id={tag} label={enumDisplayLabel(field, tag)} />
        ))}
      </TagChips>
    )
  }
  if (kind === 'boolean') {
    return <BoolCell on={value === true || value === 'true'} />
  }
  if (kind === 'person') {
    if (plain) {
      const text = asPersonList(value)
        .map((item) => item.name)
        .filter(Boolean)
        .join('、')
      if (!text) return null
      return <span className="fsdb-person-text">{text}</span>
    }
    return <PersonFace value={value} />
  }
  if (kind === 'datetime') {
    const text = formatField(field, value)
    if (!text) return null
    return <span className="fsdb-datetime-text">{text}</span>
  }
  if (kind === 'url' || kind === 'image' || kind === 'attachment' || kind === 'file') {
    return <FilePreview value={value} compact kind={kind} onChange={kind === 'attachment' ? onChange : undefined} />
  }
  const text = formatField(field, value)
  if (!text) return null
  return <span>{text}</span>
}

export function fieldActionId(fieldKey: string, field: FieldSpec) {
  return String(field.action ?? fieldKey).trim() || fieldKey
}

export function ActionCell({
  field,
  fieldKey,
  onRun,
}: {
  field: FieldSpec
  fieldKey: string
  onRun?: () => void
}) {
  const label = field.label || fieldKey
  return (
    <button
      type="button"
      className="fsdb-action-btn"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onRun?.()
      }}
    >
      {label}
    </button>
  )
}

export function placedActions(schema: CollectionSchema | undefined, place: 'row' | 'detail') {
  return (schema?.actions ?? []).filter((action) => {
    if (!actionVisibleToUser(action)) return false
    const places = action.placement ?? ['row', 'detail']
    return places.includes(place)
  })
}

export function visibleActions(schema: CollectionSchema | undefined, row: DbRecord, place: 'row' | 'detail') {
  return placedActions(schema, place).filter((action) => matchActionWhen(row, action.when))
}
