import { ArchiveBoxArrowDownIcon, PlayIcon, StopIcon } from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { asHttpHref } from '@biu/type-file-system'
import type { CollectionActionInfo, DbRecord } from '@biu/type-file-system'
import type { CollectionChrome, FsActionProps, FsActionsProps, FsCellProps } from '@biu/type-file-system/ui'

function PluginTitle({ label }: { record: DbRecord; label: string }) {
  return <span className="truncate font-medium">{label}</span>
}

function PluginAuthorCell({ record, fallback }: FsCellProps) {
  const name = fallback === '—' ? '' : fallback
  const href = asHttpHref(record.authorUrl)
  if (!name && !href) return <span className="text-(--dsw-label-3)">—</span>
  if (!href) return <span>{name || '—'}</span>
  return (
    <a
      className="min-w-0 truncate text-(--dsw-accent) underline-offset-2 hover:underline"
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
    >
      {name || href}
    </a>
  )
}

function runningOf(record: DbRecord) {
  return record.running === true || record.running === 'true'
}

function matchWhen(record: DbRecord, when?: Record<string, unknown>) {
  if (!when) return true
  for (const [key, expected] of Object.entries(when)) {
    const actual = record[key]
    if (expected === true || expected === false) {
      const flag = actual === true || actual === 'true'
      if (flag !== expected) return false
      continue
    }
    if (String(actual ?? '') !== String(expected)) return false
  }
  return true
}

function btnClass(place: 'row' | 'detail', danger?: boolean) {
  const base = place === 'detail' ? 'dock-icon-btn' : 'tasks-icon-btn'
  return `${base}${danger ? ' is-danger' : ''}`
}

function PluginAction({ action, busy, run, className }: FsActionProps & { className: string }) {
  const icon =
    action.id === 'uninstall' ? (
      <TrashGlyph aria-hidden className="size-[14px]" />
    ) : action.id === 'pack' ? (
      <ArchiveBoxArrowDownIcon aria-hidden className="size-[14px]" />
    ) : null
  return (
    <button
      type="button"
      className={className}
      title={action.label}
      data-dock-tip={action.label}
      aria-label={action.label}
      disabled={busy}
      onClick={run}
    >
      {icon ?? action.label}
    </button>
  )
}

function PluginRunButton({
  running,
  busy,
  className,
  onClick,
}: {
  running: boolean
  busy: boolean
  className: string
  onClick: () => void
}) {
  const label = running ? '停止' : '运行'
  return (
    <button
      type="button"
      className={className}
      title={label}
      data-dock-tip={label}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
    >
      {running ? <StopIcon aria-hidden className="size-[14px]" /> : <PlayIcon aria-hidden className="size-[14px]" />}
    </button>
  )
}

function PluginActions({ actions, record, busy, place, run }: FsActionsProps) {
  const cls = btnClass(place)
  const start = actions.find((action) => action.id === 'start')
  const stop = actions.find((action) => action.id === 'stop')
  const running = runningOf(record)
  const current: CollectionActionInfo | undefined = running ? stop : start
  const rest = actions.filter(
    (action) => action.id !== 'start' && action.id !== 'stop' && matchWhen(record, action.when),
  )
  return (
    <>
      {start || stop ? (
        <PluginRunButton
          running={running}
          busy={busy}
          className={cls}
          onClick={() => {
            if (current) run(current)
          }}
        />
      ) : null}
      {rest.map((action) => (
        <PluginAction
          key={action.id}
          action={action}
          record={record}
          busy={busy}
          run={() => run(action)}
          className={btnClass(place, action.tone === 'danger')}
        />
      ))}
    </>
  )
}

export const pluginsChrome: CollectionChrome = {
  cells: {
    author: PluginAuthorCell,
  },
  Title: PluginTitle,
  Actions: PluginActions,
}
