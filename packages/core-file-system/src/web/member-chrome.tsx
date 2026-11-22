import { lazy, Suspense } from 'react'
import type { CollectionChrome } from '@biu/type-file-system/ui'

const MemberActivityPaneLazy = lazy(() =>
  import('./member-activity-pane.tsx').then((m) => ({ default: m.MemberActivityPane })),
)

export const memberChrome: CollectionChrome = {
  panes: [
    {
      id: 'member-activity',
      label: '活动与统计',
      Pane: (props) => (
        <Suspense fallback={<p className="fsdb-member-empty">正在加载活动统计…</p>}>
          <MemberActivityPaneLazy record={props.record} openRecord={props.openRecord} />
        </Suspense>
      ),
    },
  ],
}
