import type { Context } from 'cordis'
import type { SlotProps } from '@biu/web-slots'
import { bindSnapshot, type Snapshot, type SnapshotService } from '@biu/web-snapshot'

export const name = 'routes-panel'
export const inject = ['slots', 'snapshot']

function RoutesPanel(props: SlotProps) {
  const useSnapshot = props.useSnapshot as ReturnType<typeof bindSnapshot>
  const routes = useSnapshot((state: Snapshot) => state.routes)
  if (!routes.length) {
    return <div className="settings-muted px-2 py-2">暂无已注册的路由</div>
  }
  return (
    <ul className="m-0 list-none p-0">
      {routes.map((route) => (
        <li
          key={`${route.method}:${route.pattern}`}
          className="flex items-baseline gap-3 rounded-md px-2 py-1.5"
        >
          <span className="settings-muted w-14 shrink-0">{route.method}</span>
          <span className="min-w-0 truncate">{route.pattern}</span>
        </li>
      ))}
    </ul>
  )
}

export function apply(ctx: Context) {
  ctx.slots.place('routes', RoutesPanel, {
    key: 'routes',
    props: () => ({ useSnapshot: bindSnapshot(ctx.snapshot as SnapshotService) }),
  })
}
