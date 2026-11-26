import {
  CircleStackIcon,
  ShareIcon,
  TableCellsIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import type { ViewMode } from './fields.ts'
import type { CrumbKind } from './sidebar-nav.ts'
import { RecordMark, recordMarkStub } from './record-mark.tsx'
import { getDatabaseUi } from './database-ui.ts'
import { TableGlyph } from './table-glyph.tsx'
export { TableGlyph, idleTableIconKind } from './table-glyph.tsx'

export function UiGlyph({ icon, className }: { icon: string; className?: string }) {
  return <span aria-hidden className={['fsdb-ui-glyph', className].filter(Boolean).join(' ')} data-icon={icon} />
}

export function ViewModeGlyph({ mode, className = 'size-4' }: { mode?: ViewMode; className?: string }) {
  if (mode === 'table' || !mode) return <TableCellsIcon aria-hidden className={className} />
  return <ShareIcon aria-hidden className={className} />
}

export function CrumbItemGlyph({
  kind,
  icon,
  avatar,
  avatarSeed,
  mode,
  emoji,
  mascot,
  collection,
  recordId,
  className = 'chat-view-project-icon',
}: {
  kind: CrumbKind
  icon?: string
  avatar?: string
  avatarSeed?: string
  mode?: ViewMode
  emoji?: string
  mascot?: unknown
  collection?: string
  recordId?: string
  className?: string
}) {
  if (kind === 'record') {
    const Icon = collection ? getDatabaseUi()?.chrome(collection).Icon : undefined
    const record = recordId ? recordMarkStub({ id: recordId, emoji, mascot }) : undefined
    return <RecordMark record={record} emoji={emoji} tableIcon={icon} Icon={Icon} className={className} />
  }
  if (kind === 'scope') {
    if (avatar) {
      return <img src={avatar} alt="" aria-hidden className="size-4 shrink-0 rounded-full object-cover" />
    }
    if (avatarSeed) {
      return <AiAvatar seed={avatarSeed} size={16} className="size-4 shrink-0 rounded-full" />
    }
    if (icon === 'workspace') return <UsersIcon aria-hidden className={className} />
    if (icon === 'shared') return <ShareIcon aria-hidden className={className} />
    return <UserIcon aria-hidden className={className} />
  }
  if (kind === 'view') return <ViewModeGlyph mode={mode} className={className} />
  if (kind === 'collection') return <TableGlyph icon={icon} className={className} />
  return <CircleStackIcon aria-hidden className={className} />
}
