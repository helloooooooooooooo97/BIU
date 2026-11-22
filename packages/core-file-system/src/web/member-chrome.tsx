import { lazy, Suspense } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'

const MemberActivityPaneLazy = lazy(() =>
  import('./member-activity-pane.tsx').then((m) => ({ default: m.MemberActivityPane })),
)

function EmptyMemberContent() {
  return null
}

function MemberActivityBoard({
  record,
  openRecord,
}: {
  record: DbRecord
  openRecord?: (recordId: string, collection?: string) => void
}) {
  return (
    <Suspense fallback={<p className="fsdb-member-empty">正在加载活动统计…</p>}>
      <MemberActivityPaneLazy record={record} openRecord={openRecord} />
    </Suspense>
  )
}

export const memberChrome: CollectionChrome = {
  Content: EmptyMemberContent,
  Board: MemberActivityBoard,
}
