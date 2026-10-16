import { useSyncExternalStore } from 'react'
import type { Context } from 'cordis'
import type { SlotProps } from '@biu/web-slots'
import { bindSnapshot, type Snapshot, type SnapshotService } from '@biu/web-snapshot'
import { clientLogSnapshot, subscribeClientLogs } from './log.ts'

export const name = 'event-log'
export const inject = ['slots', 'snapshot']

function formatLogTime(ts: number) {
  const date = new Date(ts)
  const part = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}.${part(date.getMilliseconds(), 3)}`
}

function ClientLogList() {
  const logs = useSyncExternalStore(subscribeClientLogs, clientLogSnapshot, clientLogSnapshot)
  return (
    <section>
      <p className="settings-muted">浏览器</p>
      {logs.length === 0 ? <p className="settings-muted">还没有浏览器诊断。</p> : null}
      <ol className="m-0 list-none p-0">
        {logs.map((item, index) => (
          <li className="px-2 py-1.5" key={`${item.ts}-${index}`}>
            <span className="settings-muted">{formatLogTime(item.ts)} {item.level} {item.scope}</span> {item.message}
          </li>
        ))}
      </ol>
    </section>
  )
}

function EventLog(props: SlotProps) {
  const useSnapshot = props.useSnapshot as ReturnType<typeof bindSnapshot>
  const events = useSnapshot((state: Snapshot) => state.events)
  return (
    <div>
      <ClientLogList />
      <section>
        <p className="settings-muted">宿主</p>
        {(events || []).length === 0 ? <p className="settings-muted">还没有宿主事件。</p> : null}
        <ol className="m-0 list-none p-0">
          {(events || []).map((item, index) => (
            <li className="px-2 py-1.5" key={`${item.ts}-${index}`}>
              <span className="settings-muted">{item.mode}</span> {item.name}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

export function apply(ctx: Context) {
  ctx.slots.place('log', EventLog, {
    key: 'event-log',
    props: () => ({ useSnapshot: bindSnapshot(ctx.snapshot as SnapshotService) }),
  })
}
