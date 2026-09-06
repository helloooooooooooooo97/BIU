import type { Context } from 'cordis'
import type { SlotProps } from '@biu/web-slots'
import { bindSnapshot, type Snapshot, type SnapshotService } from '@biu/web-snapshot'

export const name = 'event-log'
export const inject = ['slots', 'snapshot']

function EventLog(props: SlotProps) {
  const useSnapshot = props.useSnapshot as ReturnType<typeof bindSnapshot>
  const events = useSnapshot((state: Snapshot) => state.events)
  return (
    <ol className="m-0 list-none p-0">
      {(events || []).map((item, index) => (
        <li className="px-2 py-1.5" key={`${item.ts}-${index}`}>
          <span className="settings-muted">{item.mode}</span> {item.name}
        </li>
      ))}
    </ol>
  )
}

export function apply(ctx: Context) {
  ctx.slots.place('log', EventLog, {
    key: 'event-log',
    props: () => ({ useSnapshot: bindSnapshot(ctx.snapshot as SnapshotService) }),
  })
}
