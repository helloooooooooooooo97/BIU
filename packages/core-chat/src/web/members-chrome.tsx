import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatBubbleLeftRightIcon, TrashIcon } from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { actionTone } from '@biu/biu-ui/tag-chip'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import type { CollectionActionInfo, DbRecord } from '@biu/type-file-system'
import { channelAppPath } from '@biu/web-session-view'
import { openOrCreateDm } from './channel-store.ts'

export function MemberIcon({ record, size = 16 }: { record: DbRecord; size?: number }) {
  const memberId = String(record.id ?? '').trim()
  const avatar = typeof record.avatar === 'string' ? record.avatar.trim() : ''
  const online = record.status === 'online'
  const dotSize = Math.max(5, Math.round(size * 0.3))

  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      data-testid={memberId ? `member-row-avatar-${memberId}` : 'member-row-avatar'}
      data-online={online ? 'true' : 'false'}
    >
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <AiAvatar seed={memberId || 'biu-ai'} size={size} className="rounded-full" />
      )}
      {online ? (
        <span
          className="pointer-events-none absolute right-0 bottom-0 rounded-full bg-emerald-500 ring-1 ring-(--biu-color-bg)"
          style={{ width: dotSize, height: dotSize }}
          title="在线"
          aria-label="在线"
          data-testid={memberId ? `member-online-dot-${memberId}` : 'member-online-dot'}
        />
      ) : null}
    </span>
  )
}

export function MemberDmAction({
  actions = [],
  record,
  busy: actionBusy = false,
  run,
}: {
  actions?: CollectionActionInfo[]
  record: DbRecord
  busy?: boolean
  place?: 'row' | 'detail'
  run?: (action: CollectionActionInfo) => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const memberId = String(record.id ?? '').trim()
  if (!memberId) return null
  const label = String(record.title ?? '该成员')
  const deleteAction = actions.find((a) => a.id === 'delete' && record.canRemove === true)

  return (
    <>
      <button
        type="button"
        className="fsdb-action-btn"
        style={{ ['--biu-tag' as string]: actionTone('chat') }}
        title={`与 ${label} 私聊`}
        aria-label={`会话 ${label}`}
        data-testid={`member-dm-action-${memberId}`}
        disabled={busy || actionBusy}
        onClick={(event) => {
          event.stopPropagation()
          if (busy) return
          setBusy(true)
          void openOrCreateDm(memberId)
            .then((detail) => navigate(channelAppPath(detail.channel.id)))
            .catch(() => undefined)
            .finally(() => setBusy(false))
        }}
      >
        <ChatBubbleLeftRightIcon className="size-[14px] shrink-0" aria-hidden />
        <span>{busy ? '打开中…' : '会话'}</span>
      </button>
      {deleteAction && run ? (
        <button
          type="button"
          className="fsdb-action-btn is-danger"
          style={{ ['--biu-tag' as string]: actionTone(deleteAction.id, 'danger') }}
          title={`${deleteAction.label} ${label}`}
          aria-label={`${deleteAction.label} ${label}`}
          disabled={actionBusy}
          onClick={(event) => {
            event.stopPropagation()
            run(deleteAction)
          }}
        >
          <TrashIcon className="size-[14px] shrink-0" aria-hidden />
          <span>{deleteAction.label}</span>
        </button>
      ) : null}
    </>
  )
}

export function membersChrome(): CollectionChrome {
  return {
    Icon: MemberIcon,
    Actions: MemberDmAction,
  }
}
