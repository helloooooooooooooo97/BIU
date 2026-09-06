const React = globalThis.React

export const name = 'page-req-cards'
export const inject = ['pageEditor']

type ReqViewProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

/* ---------------- 枚举与配色 ---------------- */

const TYPES: Record<string, { label: string; color: string }> = {
  ui: { label: 'UI 调整', color: '#7c5cfc' },
  bug: { label: 'Bug', color: '#ff375f' },
  feature: { label: '功能', color: '#00b8a3' },
  idea: { label: '插件构想', color: '#ffc01e' },
  other: { label: '其他', color: '#6e7681' },
}

const STATUSES = [
  { id: 'backlog', label: '待确认', color: '#6e7681' },
  { id: 'todo', label: '待处理', color: '#3b82f6' },
  { id: 'doing', label: '进行中', color: '#f59e0b' },
  { id: 'done', label: '已完成', color: '#22c55e' },
  { id: 'closed', label: '已关闭', color: '#30363d' },
] as const

const PRIORITIES = [
  { id: 'p0', label: 'P0', color: '#ff375f' },
  { id: 'p1', label: 'P1', color: '#f59e0b' },
  { id: 'p2', label: 'P2', color: '#3b82f6' },
  { id: 'p3', label: 'P3', color: '#6e7681' },
] as const

const REQ_DEFAULTS: Record<string, unknown> = {
  title: '',
  type: 'ui',
  status: 'backlog',
  priority: 'p2',
  spec: '',
  links: [],
  owner: '',
}

const cardBase = {
  display: 'flex',
  flexDirection: 'column' as const,
  minHeight: 108,
  borderRadius: 10,
  overflow: 'hidden' as const,
  border: '1px solid #30363d',
  borderLeft: '4px solid #7c5cfc',
  background: '#1e1e1e',
  color: '#e6edf3',
  font: '13px/1.6 ui-sans-serif, system-ui, sans-serif',
  padding: '10px 12px',
  gap: 8,
}

const field = {
  width: '100%',
  boxSizing: 'border-box' as const,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  resize: 'vertical' as const,
}

const chip = (color: string, active: boolean, onClick?: () => void) => ({
  cursor: onClick ? 'pointer' : 'default',
  border: active ? `1px solid ${color}` : '1px solid #30363d',
  borderRadius: 999,
  padding: '1px 9px',
  background: active ? color : 'transparent',
  color: active ? '#0d1117' : '#8b949e',
  fontWeight: 700,
  fontSize: 11,
  lineHeight: '18px',
  whiteSpace: 'nowrap' as const,
  transition: 'all .12s ease',
})

function ReqCard({ data, update, writable }: ReqViewProps) {
  const ro = !writable
  const title = String(data.title ?? '')
  const spec = String(data.spec ?? '')
  const owner = String(data.owner ?? '')
  const links = Array.isArray(data.links) ? (data.links as string[]) : []

  const typeId = typeof data.type === 'string' && data.type in TYPES ? data.type : 'other'
  const statusId = STATUSES.some((s) => s.id === data.status) ? String(data.status) : 'backlog'
  const prioId = PRIORITIES.some((p) => p.id === data.priority) ? String(data.priority) : 'p2'

  const typeMeta = TYPES[typeId]
  const stMeta = STATUSES.find((s) => s.id === statusId)!
  const prioMeta = PRIORITIES.find((p) => p.id === prioId)!

  const setStatus = (next: string) => update({ status: next })

  return (
    <div
      data-testid="page-req-card"
      style={{ ...cardBase, borderLeftColor: typeMeta.color }}
    >
      {/* 顶栏：状态点 + 类型徽章 + 优先级 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          title={`状态：${stMeta.label}`}
          style={{ width: 9, height: 9, borderRadius: '50%', background: stMeta.color, boxShadow: `0 0 6px ${stMeta.color}` }}
        />
        {ro ? (
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: typeMeta.color }}>{typeMeta.label.toUpperCase()}</span>
        ) : (
          <select
            data-testid="page-req-type"
            value={typeId}
            onChange={(e) => update({ type: e.target.value })}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: typeMeta.color, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          >
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k} style={{ background: '#1e1e1e', color: v.color }}>
                {v.label}
              </option>
            ))}
          </select>
        )}
        {!ro && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {PRIORITIES.map((p) => (
              <button key={p.id} data-testid={`page-req-prio-${p.id}`} onClick={() => update({ priority: p.id })} style={chip(p.color, p.id === prioId)}>
                {p.label}
              </button>
            ))}
          </span>
        )}
        {ro && prioId !== 'p2' && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: prioMeta.color }}>{prioMeta.label}</span>
        )}
      </div>

      {/* 标题 */}
      <input
        data-testid="page-req-title"
        readOnly={ro}
        value={title}
        placeholder="一句话需求…"
        onChange={(e) => update({ title: e.target.value })}
        style={{ ...field, fontSize: 15, fontWeight: 700, opacity: title || !ro ? 1 : 0.55 }}
      />

      {/* 详情描述 */}
      {ro ? (
        spec ? (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#c9d1d9', fontSize: 12.5 }}>{spec}</div>
        ) : null
      ) : (
        <textarea
          data-testid="page-req-spec"
          value={spec}
          placeholder="详细描述 / 期望行为 / 复现步骤…（可选）"
          onChange={(e) => update({ spec: e.target.value })}
          style={{ ...field, minHeight: 44, color: '#c9d1d9', fontSize: 12.5 }}
        />
      )}

      {/* 底部：状态切换 + owner + links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4 }}>
        <span style={{ fontSize: 11, opacity: 0.5, letterSpacing: '0.05em' }}>状态</span>
        {STATUSES.map((s) =>
          ro ? null : (
            <button key={s.id} data-testid={`page-req-status-${s.id}`} onClick={() => setStatus(s.id)} style={chip(s.color, s.id === statusId)}>
              {s.label}
            </button>
          ),
        )}
        {ro && (
          <span style={{ fontSize: 11, fontWeight: 700, color: stMeta.color }}>● {stMeta.label}</span>
        )}
        {owner && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b949e' }}>👤 {owner}</span>
        )}
        {links.length > 0 && (
          <span style={{ display: 'inline-flex', gap: 4, marginLeft: owner ? 8 : 'auto', flexWrap: 'wrap' }}>
            {links.map((lk, i) => (
              <span key={i} style={{ fontSize: 11, border: '1px solid #30363d', borderRadius: 6, padding: '0 7px', color: '#8b949e' }}>
                #{lk}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

/* ---------------- apply ---------------- */

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      label: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown> | (() => Record<string, unknown>)
      View: (props: ReqViewProps) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'req',
    label: '需求卡片',
    hint: '结构化记录一条需求/待办：类型·状态·优先级',
    aliases: ['需求', 'req', 'requirement', 'todo', '任务'],
    defaults: REQ_DEFAULTS,
    View: ReqCard,
  })
}
