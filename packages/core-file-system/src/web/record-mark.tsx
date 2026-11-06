import { TagIcon } from '@heroicons/react/16/solid'
import { tagTone } from '@biu/biu-ui'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { resolveSessionMascot, SidebarMascot } from '@biu/public-mascot'
import { TableGlyph } from './table-glyph.tsx'
import { recordPreviewEmoji } from './sidebar-preview.ts'

export function recordPreviewMascot(row: Pick<DbRecord, 'id'> & Record<string, unknown> | DbRecord) {
  const raw = row.mascot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const mascot = raw as { shape?: unknown; color?: unknown; eye?: unknown }
  if (typeof mascot.shape !== 'string' || typeof mascot.color !== 'string') return undefined
  return {
    shape: mascot.shape,
    color: mascot.color,
    ...(typeof mascot.eye === 'number' ? { eye: mascot.eye } : {}),
  }
}

export function recordMarkStub(row: { id: string; emoji?: string; mascot?: unknown }): DbRecord {
  const stub: DbRecord = { id: row.id }
  const emoji = recordPreviewEmoji(row as DbRecord)
  if (emoji) stub.emoji = emoji
  const mascot = recordPreviewMascot(row as DbRecord)
  if (mascot) stub.mascot = mascot
  return stub
}

/** 记录的独立图标属性：有 emoji 用 emoji，否则用集合 Icon（会话小人），再否则表 glyph。 */
export function RecordMark({
  record,
  emoji,
  tableIcon,
  Icon,
  className,
  size = 'sm',
}: {
  record?: DbRecord
  emoji?: string
  tableIcon?: string
  Icon?: CollectionChrome['Icon']
  className?: string
  size?: 'sm' | 'lg'
}) {
  const mascot = record ? recordPreviewMascot(record) : undefined
  const sessionId = String(record?.sourceId || record?.id || '')
  const agent = record?.tablePath === '/agents' || Boolean(mascot)
  if (record && sessionId && agent) {
    return (
      <span className={`fsdb-record-mark is-${size}`}>
        <SidebarMascot
          size={size === 'lg' ? 32 : 16}
          sessionId={sessionId}
          identity={resolveSessionMascot(sessionId, mascot)}
          animate={false}
          title=""
        />
      </span>
    )
  }
  const mark = (emoji ?? (record ? recordPreviewEmoji(record) : '')).trim()
  if (mark) return <span className="fsdb-record-emoji">{mark}</span>
  const tagId = String(record?.sourceId || record?.id || '')
  if (record?.tablePath === '/tags' && tagId) {
    const px = size === 'lg' ? 32 : 16
    return (
      <span className={`fsdb-record-mark is-${size}`}>
        <TagIcon aria-hidden style={{ width: px, height: px, color: tagTone(tagId) }} />
      </span>
    )
  }
  if (Icon && record) {
    return (
      <span className={`fsdb-record-mark is-${size}`}>
        <Icon record={record} />
      </span>
    )
  }
  return (
    <span className={`fsdb-record-mark is-${size}`}>
      <TableGlyph icon={tableIcon} className={className ?? (size === 'lg' ? 'size-8' : 'size-4')} />
    </span>
  )
}
