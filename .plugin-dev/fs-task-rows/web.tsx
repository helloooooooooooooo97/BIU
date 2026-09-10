const React = globalThis.React

export const name = 'fs-task-rows'
export const inject = ['databaseUi']

function fieldOf(fields: Array<{ key: string; value: unknown }>, key: string) {
  return fields.find((item) => item.key === key)?.value
}

function asText(value: unknown) {
  if (value == null || value === '') return ''
  return String(value)
}

function statusTone(status: string) {
  if (status === 'doing') return '#3b82f6'
  if (status === 'done') return '#22c55e'
  if (status === 'failed') return '#ff375f'
  return '#6e7681'
}

function TaskCardRow({
  record,
  fields,
  onOpen,
}: {
  record: { id?: string; title?: unknown }
  fields: Array<{ key: string; value: unknown; label: string }>
  onOpen: () => void
}) {
  const title = asText(fieldOf(fields, 'title') ?? record.title) || String(record.id ?? '')
  const status = asText(fieldOf(fields, 'status'))
  const priority = asText(fieldOf(fields, 'priority'))
  const extras = fields.filter((item) => item.key !== 'title' && item.key !== 'status' && item.key !== 'priority')
  return (
    <button type="button" className="fs-task-card" onClick={onOpen} data-testid="fs-task-card">
      <span className="fs-task-card-top">
        <span className="fs-task-card-title">{title}</span>
        {status ? (
          <span className="fs-task-card-status" style={{ color: statusTone(status) }}>
            {status}
          </span>
        ) : null}
      </span>
      {priority ? <span className="fs-task-card-priority">{priority}</span> : null}
      {extras.map((item) => {
        const text = asText(item.value)
        if (!text) return null
        return (
          <span key={item.key} className="fs-task-card-extra">
            {item.label} {text}
          </span>
        )
      })}
    </button>
  )
}

export function apply(ctx: {
  effect: (fn: () => () => void) => void
  get: (name: string) => {
    registerRowView: (
      path: string,
      view: { id: string; label: string; Row: typeof TaskCardRow },
    ) => { dispose: () => void }
  }
}) {
  const ui = ctx.get('databaseUi')
  ctx.effect(() =>
    ui
      .registerRowView('/tasks', {
        id: 'task-card',
        label: '任务卡',
        plugin: name,
        Row: TaskCardRow,
      })
      .dispose,
  )
}

if (typeof document !== 'undefined') {
  const id = 'fs-task-rows-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.fs-task-card{display:flex;flex-direction:column;gap:6px;width:100%;margin:0;border:1px solid var(--dsw-border);border-radius:12px;padding:12px 14px;background:var(--dsw-surface);color:inherit;font:inherit;text-align:left;cursor:pointer}
.fs-task-card:hover{background:var(--dsw-hover)}
.fs-task-card-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}
.fs-task-card-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:700}
.fs-task-card-status{flex:none;font-size:12px;font-weight:700}
.fs-task-card-priority{color:var(--dsw-label-2);font-size:12px;font-weight:650}
.fs-task-card-extra{color:var(--dsw-label-3);font-size:12px;font-weight:600}
`
  if (!document.getElementById(id)) document.head.appendChild(style)
}
