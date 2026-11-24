export type TableSandboxItem = {
  id: string
  name: string
  code: string
  data?: Record<string, unknown>
}

export function isTableSandboxModeId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('sandbox-')
}

export function defaultTableSandboxCode(title = '') {
  const heading = title ? `${title}` : '业务工作台'
  return `export default function App() {
  const [keyword, setKeyword] = React.useState('')
  const [activeBucket, setActiveBucket] = React.useState('__all__')

  const rows = biu.rows || []
  const cols = (biu.columns || []).filter(
    (c) => c.key !== 'title' && c.key !== 'actions' && c.key !== '__rowNumber',
  )

  const facetCol =
    cols.find((c) => c.type === 'select' || c.type === 'boolean') ||
    cols.find((c) => c.key === 'table' || c.key === 'status' || c.key === 'type') ||
    cols[0]

  const formatVal = (val) => {
    if (val == null || val === '') return '未填写'
    if (typeof val === 'boolean') return val ? '是' : '否'
    if (Array.isArray(val)) return val.map((v) => (typeof v === 'object' ? v?.label || v?.name || '' : String(v))).filter(Boolean).join(', ') || '未填写'
    if (typeof val === 'object') return val.label || val.name || val.title || JSON.stringify(val)
    return String(val)
  }

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const recentCount = rows.filter((r) => {
    const ts = Number(r.updatedAt || r.createdAt || 0)
    return ts > 0 && now - ts <= 7 * dayMs
  }).length

  const bucketMap = new Map()
  if (facetCol) {
    for (const r of rows) {
      const label = formatVal(r[facetCol.key])
      bucketMap.set(label, (bucketMap.get(label) || 0) + 1)
    }
  }
  const buckets = [...bucketMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const maxBucket = buckets[0]?.[1] || 1

  const filtered = rows.filter((r) => {
    if (activeBucket !== '__all__' && facetCol) {
      if (formatVal(r[facetCol.key]) !== activeBucket) return false
    }
    const q = keyword.trim().toLowerCase()
    if (!q) return true
    const hay = [r.title, r.name, r.id, ...cols.slice(0, 4).map((c) => formatVal(r[c.key]))]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  const cardStyle = {
    borderRadius: 12,
    border: '1px solid var(--biu-color-border)',
    background: 'var(--biu-color-surface)',
    padding: 16,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0 24px', color: 'var(--biu-color-text)' }}>
      {/* 顶部业务工作台 Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>${heading} · 工作台</div>
          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--biu-color-bg-hover)', color: 'var(--biu-color-text-muted)' }}>
            实时数据 · {biu.total} 条
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="快速检索工作台…"
            style={{
              height: 32,
              width: 200,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid var(--biu-color-border)',
              background: 'transparent',
              color: 'var(--biu-color-text)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          {biu.canCreate ? (
            <button
              type="button"
              onClick={() => biu.create()}
              style={{
                height: 32,
                padding: '0 14px',
                borderRadius: 8,
                border: 0,
                background: 'var(--biu-color-emphasis)',
                color: 'var(--biu-color-on-emphasis, #fff)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + 新建记录
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI 指标概览条 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: '数据总量', value: biu.total, hint: '当前视图范围' },
          { label: '近 7 天活跃', value: recentCount, hint: rows.length ? Math.round((recentCount / rows.length) * 100) + '% 占比' : '暂无记录' },
          { label: facetCol ? facetCol.label + '分类' : '字段维度', value: facetCol ? buckets.length : cols.length, hint: facetCol ? '点击下方条形图可筛选' : '可用属性数' },
          { label: '当前展示', value: filtered.length, hint: activeBucket === '__all__' ? '全部分类' : '已按「' + activeBucket + '」筛选' },
        ].map((kpi) => (
          <div key={kpi.label} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--biu-color-text-muted)' }}>{kpi.label}</span>
            <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</span>
            <span style={{ fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>{kpi.hint}</span>
          </div>
        ))}
      </div>

      {/* 主工作区：左侧分布分析 + 右侧业务动态流 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        {/* 分布分析面板 */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{facetCol ? '按「' + facetCol.label + '」分布' : '数据分布'}</span>
            {activeBucket !== '__all__' ? (
              <button
                type="button"
                onClick={() => setActiveBucket('__all__')}
                style={{ border: 0, background: 'transparent', color: 'var(--biu-color-emphasis)', fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                查看全部
              </button>
            ) : null}
          </div>
          {buckets.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {buckets.map(([label, count]) => {
                const selected = activeBucket === label
                const pct = Math.max(6, Math.round((count / maxBucket) * 100))
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActiveBucket(selected ? '__all__' : label)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      padding: '6px 8px',
                      borderRadius: 8,
                      border: selected ? '1px solid var(--biu-color-emphasis)' : '1px solid transparent',
                      background: selected ? 'var(--biu-color-bg-hover)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--biu-color-text)', fontWeight: selected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      <span style={{ color: 'var(--biu-color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--biu-color-bg-hover)', overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', borderRadius: 999, background: 'var(--biu-color-emphasis)', opacity: selected ? 1 : 0.72 }} />
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--biu-color-text-subtle)' }}>暂无可聚合维度</div>
          )}
        </div>

        {/* 近期业务动态列表 */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>工作项动态</span>
            <span style={{ fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>{filtered.length} 项</span>
          </div>
          {filtered.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.slice(0, 10).map((row) => (
                <div
                  key={row.id}
                  onClick={() => biu.open(row)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--biu-color-border)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.title || row.name || row.id}
                    </div>
                    {facetCol ? (
                      <div style={{ fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>
                        {facetCol.label}：{formatVal(row[facetCol.key])}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      biu.openSplit(row)
                    }}
                    style={{
                      flex: 'none',
                      border: '1px solid var(--biu-color-border)',
                      borderRadius: 6,
                      padding: '3px 8px',
                      background: 'transparent',
                      color: 'var(--biu-color-text-muted)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    速览
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'var(--biu-color-text-subtle)' }}>
              没有匹配的工作项
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
`
}

export function normalizeTableSandboxViews(raw: unknown): TableSandboxItem[] | undefined {
  let list: unknown = raw
  if (typeof list === 'string') {
    const trimmed = list.trim()
    if (!trimmed) return undefined
    try {
      list = JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }
  if (!Array.isArray(list)) return undefined
  const out: TableSandboxItem[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const rec = entry as Record<string, unknown>
    const id = String(rec.id ?? '').trim()
    if (!id || !id.startsWith('sandbox-') || seen.has(id)) continue
    seen.add(id)
    const name = String(rec.name ?? '').trim() || `沙箱视图 ${out.length + 1}`
    const code = typeof rec.code === 'string' ? rec.code : ''
    const data =
      rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data)
        ? (rec.data as Record<string, unknown>)
        : undefined
    out.push(data ? { id, name, code, data } : { id, name, code })
  }
  return out.length ? out : undefined
}

export function createTableSandboxItem(existing: TableSandboxItem[], title = ''): TableSandboxItem {
  const taken = new Set(existing.map((item) => item.name))
  let n = existing.length + 1
  let name = `沙箱视图 ${n}`
  while (taken.has(name)) {
    n += 1
    name = `沙箱视图 ${n}`
  }
  const id = `sandbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  return {
    id,
    name,
    code: defaultTableSandboxCode(title),
  }
}
