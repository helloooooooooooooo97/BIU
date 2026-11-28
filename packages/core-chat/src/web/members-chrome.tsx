import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatBubbleLeftRightIcon, TrashIcon } from '@heroicons/react/16/solid'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import type { CollectionActionInfo, DbRecord } from '@biu/type-file-system'
import { channelAppPath } from '@biu/web-session-view'
import { openOrCreateDm } from './channel-store.ts'

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
    Actions: MemberDmAction,
  }
}
