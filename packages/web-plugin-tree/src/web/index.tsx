import type { Context } from 'cordis'
import type { SlotProps } from '@biu/web-slots'
import { bindSnapshot, type Snapshot } from '@biu/web-snapshot'

export const name = 'plugin-tree'
export const inject = ['slots', 'snapshot']

const SECTIONS = [
  { layer: 'host', title: '内核 · Host' },
  { layer: 'web', title: '内核 · Web' },
  { layer: 'core', title: '内核 · Core' },
  { layer: 'capability', title: '能力插件' },
] as const

function PluginTree(props: SlotProps) {
  const useSnapshot = props.useSnapshot as ReturnType<typeof bindSnapshot>
  const setEnabled = props.setEnabled as (id: string, enabled: boolean) => Promise<void>
  const snap = useSnapshot((state: Snapshot) => state.plugins)
  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => {
        const rows = snap.filter((plugin) => plugin.layer === section.layer)
        if (!rows.length) return null
        return (
          <section key={section.layer}>
            <h2 className="m-0 mb-1.5 text-[11px] font-semibold tracking-wide text-(--dsw-label-3)">{section.title}</h2>
            <ul className="m-0 list-none p-0">
              {rows.map((plugin) => (
                <li
                  className="flex items-start justify-between gap-3 rounded-md px-2 py-1.5"
                  key={`${plugin.layer}:${plugin.id}`}
                >
                  <div className="min-w-0">
                    <h3 className="m-0 text-[13px] font-medium text-(--dsw-label)">{plugin.name}</h3>
                    <div className="mt-0.5 truncate text-[11px] text-(--dsw-label-3)">
                      {plugin.id} · {plugin.state}
                    </div>
                    <p className="mt-1 mb-0 text-[12px] leading-[1.45] text-(--dsw-label-3)">{plugin.blurb}</p>
                  </div>
                  {plugin.togglable ? (
                    <button
                      className="toggle"
                      type="button"
                      aria-label={plugin.enabled ? `关闭 ${plugin.name}` : `打开 ${plugin.name}`}
                      aria-checked={plugin.enabled}
                      onClick={() => void setEnabled(plugin.id, !plugin.enabled)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function apply(ctx: Context) {
  ctx.slots.place('sidebar', PluginTree, {
    key: 'plugin-tree',
    props: () => ({
      useSnapshot: bindSnapshot(ctx.snapshot),
      setEnabled: (id: string, enabled: boolean) => ctx.snapshot.setEnabled(id, enabled),
    }),
  })
}
