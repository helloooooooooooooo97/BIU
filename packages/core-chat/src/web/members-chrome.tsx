import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/16/solid'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import type { DbRecord } from '@biu/type-file-system'
import { channelAppPath } from '@biu/web-session-view'
import { openOrCreateDm } from './channel-store.ts'

function MemberDmAction({ record }: { record: DbRecord }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const memberId = String(record.id ?? '').trim()
  if (!memberId) return null
  return (
    <button
      type="button"
      className="tasks-icon-btn"
      title={`与 ${String(record.title ?? '该成员')} 私聊`}
      aria-label={`与 ${String(record.title ?? '该成员')} 私聊`}
      data-testid={`member-dm-action-${memberId}`}
      disabled={busy}
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
      <ChatBubbleLeftRightIcon className="size-[14px]" aria-hidden />
    </button>
  )
}

export function membersChrome(): CollectionChrome {
  return {
    Actions: MemberDmAction,
  }
}
