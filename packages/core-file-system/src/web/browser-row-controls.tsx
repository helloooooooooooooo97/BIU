import { memo, type ReactNode } from 'react'
import { CheckIcon } from '@heroicons/react/16/solid'
import { BoolBox } from '@biu/biu-ui/bool-box'
import type { CollectionActionInfo, CollectionSchema, DbRecord } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { actionIcon, placedActions, visibleActions } from './fsdb-cells.tsx'

export const RowCheck = memo(function RowCheck({
  id,
  ids,
  pickedIdSet,
  onTogglePicked,
}: {
  id?: string
  ids?: string[]
  pickedIdSet: ReadonlySet<string>
  onTogglePicked: (ids: string[], on: boolean) => void
}) {
  const on = id
    ? pickedIdSet.has(id)
    : Boolean(ids && ids.length > 0 && ids.every((item) => pickedIdSet.has(item)))
  const some = id ? on : Boolean(ids && ids.some((item) => pickedIdSet.has(item)))
  const marked = id ? on : some
  const header = !id
  return (
    <button
      type="button"
      data-testid="fsdb-row-check"
      className={`fsdb-boolbtn fsdb-row-check${marked ? ' is-on' : ''}`}
      aria-pressed={marked}
      aria-label={id ? (on ? '取消选择记录' : '选择记录') : some ? '取消选择' : '全选'}
      title={id ? (on ? '取消选择' : '选择') : some ? '取消选择' : '全选'}
      onClick={(event) => {
        event.stopPropagation()
        onTogglePicked(id ? [id] : (ids ?? []), header ? !some : !on)
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <BoolBox on={marked}>{marked ? <CheckIcon aria-hidden className="size-3" /> : null}</BoolBox>
    </button>
  )
})

export const RecordActions = memo(function RecordActions({
  row,
  paintSchema,
  chrome,
  useChrome,
  busy,
  nested,
  labelOf,
  onRunAction,
}: {
  row: DbRecord
  paintSchema?: CollectionSchema
  chrome?: CollectionChrome
  useChrome: boolean
  busy: boolean
  nested: boolean
  labelOf: (row: DbRecord) => string
  onRunAction: (row: DbRecord, action: CollectionActionInfo) => void
}) {
  const Actions = useChrome ? chrome?.Actions : undefined
  const Action = useChrome ? chrome?.Action : undefined
  const placed = placedActions(paintSchema, 'row').filter(
    (action) => !nested || (action.id !== 'open-split' && action.id !== 'open-page'),
  )
  const finish = (action: CollectionActionInfo) => {
    onRunAction(row, action)
  }
  const wrap = (body: ReactNode) => (
    <div className="tasks-row-actions" data-biu-ignore onClick={(event) => event.stopPropagation()}>
      {body}
    </div>
  )
  if (Actions) {
    if (!placed.length) return null
    return wrap(<Actions actions={placed} record={row} busy={busy} place="row" run={finish} />)
  }
  const allowedActionIds = Array.isArray(row.actionIds) ? new Set(row.actionIds.map(String)) : null
  const rowSource = String(row.tablePath ?? '')
  const rowShown = visibleActions(paintSchema, row, 'row')
    .filter((action) => !allowedActionIds || allowedActionIds.has(action.id))
    .filter((action) => !action.collection || !rowSource || action.collection === rowSource)
    .filter((action) => !nested || (action.id !== 'open-split' && action.id !== 'open-page'))
    .filter((action) => Action || actionIcon(action.id) || action.id === 'open-split' || action.id === 'open-page')
  if (!rowShown.length) return null
  return wrap(
    rowShown.map((action) => {
      const run = () => finish(action)
      if (Action) return <Action key={action.id} action={action} record={row} busy={busy} run={run} />
      const glyph = actionIcon(action.id)
      return (
        <button
          key={action.id}
          type="button"
          className={`fsdb-action-btn${action.tone === 'danger' ? ' is-danger' : ''}`}
          aria-label={`${action.label} ${labelOf(row)}`}
          disabled={busy}
          onClick={run}
        >
          {glyph}
          <span>{action.label}</span>
        </button>
      )
    }),
  )
})
