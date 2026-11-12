/** Builtin sandbox starters for every collection record: content view and property view. */

export function defaultContentSandboxSource(_title = '') {
  return `export default function App() {
  const page = biu.page()
  const blocks = biu.blocks()
  const kinds = biu.kinds()
  const record = biu.record()
  const values = biu.values()
  const [saved, setSaved] = React.useState(null)
  const [open, setOpen] = React.useState('')
  const [tab, setTab] = React.useState('overview')

  React.useEffect(() => {
    let gone = false
    biu.read().then((value) => { if (!gone) setSaved(value) })
    return () => { gone = true }
  }, [])

  const formatValue = (value) => {
    if (value == null || value === '') return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join('、')
    if (typeof value === 'object') {
      const row = value
      const name = row.name ?? row.title ?? row.label ?? row.href ?? row.url ?? ''
      if (name) return String(name)
      try {
        return JSON.stringify(row)
      } catch {
        return ''
      }
    }
    return String(value)
  }

  const ACCENT = '#0071e3'
  const GREEN = '#30d158'
  const font = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "PingFang SC", system-ui, sans-serif'

  const glass = (extra) => ({
    position: 'relative',
    borderRadius: 20,
    background: 'linear-gradient(180deg, color-mix(in srgb, var(--biu-color-bg) 82%, transparent), color-mix(in srgb, var(--biu-color-bg) 62%, transparent))',
    border: '0.5px solid color-mix(in srgb, var(--biu-color-border) 85%, transparent)',
    boxShadow: '0 1px 1px rgba(0,0,0,.03), 0 12px 32px -16px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.06)',
    backdropFilter: 'saturate(180%) blur(24px)',
    WebkitBackdropFilter: 'saturate(180%) blur(24px)',
    ...extra,
  })

  const tags = record && record.tag && Array.isArray(record.tag.tags) ? record.tag.tags : []
  const fieldList = biu.fields().filter((f) => f.type !== 'file')
  const filledFields = fieldList.filter((f) => {
    const raw = values[f.key]
    return raw != null && raw !== '' && (!Array.isArray(raw) || raw.length > 0)
  })
  const kindCount = new Set(blocks.map((b) => b.kind)).size
  const progress = fieldList.length ? Math.round((filledFields.length / fieldList.length) * 100) : 0

  const stats = [
    { label: '正文块', value: blocks.length, hint: 'BLOCKS' },
    { label: '块类型', value: kindCount, hint: 'USED' },
    { label: '可用类型', value: kinds.length, hint: 'REGISTERED' },
    { label: '已填属性', value: filledFields.length, hint: progress + '% 完成' },
    { label: '标签', value: tags.length, hint: 'TAGS' },
    { label: '视图数据', value: saved ? '有' : '空', hint: 'SANDBOX' },
  ]

  const TABS = [
    { id: 'overview', label: '概览' },
    { id: 'fields', label: '属性' },
    { id: 'blocks', label: '正文块' },
    { id: 'api', label: 'API' },
  ]

  const Section = (props) => (
    <section style={glass({ padding: '22px 24px' })}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: props.sub ? 4 : 16 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-.015em' }}>{props.title}</h2>
        {props.trailing ? <span style={{ fontSize: 12, color: 'var(--biu-color-text-muted)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.01em' }}>{props.trailing}</span> : null}
      </div>
      {props.sub ? <p style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--biu-color-text-muted)' }}>{props.sub}</p> : null}
      {props.children}
    </section>
  )

  const Api = (props) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 240px) minmax(0, 1fr)', gap: 16, padding: '12px 0', borderTop: '0.5px solid color-mix(in srgb, var(--biu-color-border) 50%, transparent)' }}>
      <code style={{ fontSize: 12.5, fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace', color: ACCENT, letterSpacing: '-.01em' }}>{props.name}</code>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{props.use}</div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--biu-color-text-muted)' }}>{props.note}</div>
      </div>
    </div>
  )

  const Ring = (props) => {
    const size = props.size || 54
    const stroke = 4
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    return (
      <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} style={{ flex: 'none' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="color-mix(in srgb, var(--biu-color-border) 70%, transparent)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={props.color || GREEN}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * props.percent) / 100}
          transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'}
          style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
    )
  }

  return (
    <div
      data-testid="page-host-view-root"
      style={{
        fontFamily: font,
        WebkitFontSmoothing: 'antialiased',
        color: 'var(--biu-color-text)',
        padding: '44px 24px 80px',
        maxWidth: 960,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        display: 'grid',
        gap: 18,
      }}
    >
      <header style={{ display: 'grid', gap: 14, padding: '0 4px' }}>
        <span style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)', background: 'color-mix(in srgb, var(--biu-color-bg) 65%, transparent)', border: '0.5px solid color-mix(in srgb, var(--biu-color-border) 80%, transparent)', borderRadius: 999, padding: '5px 12px' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: GREEN, boxShadow: '0 0 0 3px color-mix(in srgb, ' + GREEN + ' 22%, transparent)' }} />
          内容视图 · 页面概览
        </span>
        <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.06, fontWeight: 700, letterSpacing: '-.032em' }}>内容视图介绍</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--biu-color-text-muted)', maxWidth: 600 }}>
          体量、属性填写进度与可用能力，一屏看完。
        </p>
      </header>

      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'color-mix(in srgb, var(--biu-color-bg-hover) 55%, transparent)', border: '0.5px solid color-mix(in srgb, var(--biu-color-border) 60%, transparent)', justifySelf: 'start' }}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            style={{
              font: 'inherit',
              fontSize: 13,
              fontWeight: tab === item.id ? 600 : 500,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 999,
              padding: '7px 16px',
              color: tab === item.id ? 'var(--biu-color-text)' : 'var(--biu-color-text-muted)',
              background: tab === item.id ? 'color-mix(in srgb, var(--biu-color-bg) 92%, transparent)' : 'transparent',
              boxShadow: tab === item.id ? '0 1px 3px rgba(0,0,0,.10)' : 'none',
              transition: 'background .2s ease, color .2s ease',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))', gap: 14 }}>
            <div style={glass({ padding: 22, display: 'grid', gap: 16 })}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Ring percent={progress} />
                <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--biu-color-text-muted)' }}>属性填写</div>
                  <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{filledFields.length} / {fieldList.length}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--biu-color-text-subtle)', lineHeight: 1.6 }}>
                还有 {fieldList.length - filledFields.length} 个字段待填。
              </div>
            </div>
            <div style={glass({ padding: 22, display: 'grid', gap: 14 })}>
              <div style={{ fontSize: 13, color: 'var(--biu-color-text-muted)' }}>正文结构</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56 }}>
                {['paragraph', 'heading', 'list', 'other'].map((key) => {
                  const count = key === 'other'
                    ? blocks.filter((b) => !['paragraph', 'heading', 'bulletList', 'orderedList'].includes(b.kind)).length
                    : key === 'list'
                      ? blocks.filter((b) => b.kind === 'bulletList' || b.kind === 'orderedList').length
                      : blocks.filter((b) => b.kind === key).length
                  const max = Math.max(1, blocks.length)
                  const h = Math.max(4, Math.round((count / max) * 56))
                  return (
                    <div key={key} style={{ flex: 1, display: 'grid', gap: 6, justifyItems: 'center' }}>
                      <div style={{ width: '100%', height: h, borderRadius: 6, background: 'linear-gradient(180deg, ' + ACCENT + ', color-mix(in srgb, ' + ACCENT + ' 55%, transparent))', transition: 'height .4s ease' }} />
                      <span style={{ fontSize: 10.5, color: 'var(--biu-color-text-subtle)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--biu-color-text-subtle)', lineHeight: 1.6 }}>共 {blocks.length} 块 · {kindCount} 种类型</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {stats.map((item) => (
              <div key={item.label} style={glass({ padding: '18px 18px 16px', display: 'grid', gap: 7, minWidth: 0 })}>
                <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 600, letterSpacing: '-.028em', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                <div style={{ fontSize: 12.5, color: 'var(--biu-color-text-muted)' }}>{item.label}</div>
                <div style={{ fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--biu-color-text-subtle)' }}>{item.hint}</div>
              </div>
            ))}
          </div>

          <Section title="正文块构成" trailing={blocks.length + ' blocks'}>
            {blocks.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(
                  blocks.reduce((acc, b) => {
                    acc[b.kind] = (acc[b.kind] || 0) + 1
                    return acc
                  }, {}),
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([kind, count]) => (
                    <span key={kind} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, borderRadius: 999, padding: '6px 13px', background: 'color-mix(in srgb, var(--biu-color-bg-hover) 70%, transparent)', border: '0.5px solid color-mix(in srgb, var(--biu-color-border) 75%, transparent)' }}>
                      <span style={{ color: 'var(--biu-color-text-muted)' }}>{kind}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{count}</span>
                    </span>
                  ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--biu-color-text-subtle)' }}>这一页还没有正文块。</p>
            )}
          </Section>
        </>
      ) : null}

      {tab === 'fields' ? (
        <Section title="属性填写" trailing={filledFields.length + ' / ' + fieldList.length}>
          <div style={{ display: 'grid' }}>
            {fieldList.map((field, index) => {
              const raw = values[field.key]
              const filled = raw != null && raw !== '' && (!Array.isArray(raw) || raw.length > 0)
              return (
                <div key={field.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 150px) minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: '12px 0', borderTop: index === 0 ? 'none' : '0.5px solid color-mix(in srgb, var(--biu-color-border) 50%, transparent)', fontSize: 13 }}>
                  <span style={{ color: 'var(--biu-color-text-muted)' }}>{field.label || field.key}</span>
                  <span style={{ color: filled ? 'var(--biu-color-text)' : 'var(--biu-color-text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {filled ? formatValue(raw) : '未填写'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: filled ? GREEN : 'var(--biu-color-text-subtle)', background: filled ? 'color-mix(in srgb, ' + GREEN + ' 12%, transparent)' : 'transparent', border: filled ? '0.5px solid color-mix(in srgb, ' + GREEN + ' 32%, transparent)' : '0.5px solid color-mix(in srgb, var(--biu-color-border) 60%, transparent)', borderRadius: 999, padding: '3px 9px' }}>
                    {filled ? '已填' : '待填'}
                  </span>
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {tab === 'blocks' ? (
        <Section title="正文块" sub="点一下展开对应的真实 Block；「记住」会把当前块 id 写进本视图自己的 dataFile。" trailing={blocks.length ? blocks.length + ' 个' : ''}>
          {blocks.length ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {blocks.map((block) => (
                <button
                  key={block.blockId}
                  type="button"
                  data-testid={'page-host-chip-' + block.blockId}
                  onClick={() => setOpen((cur) => (cur === block.blockId ? '' : block.blockId))}
                  style={{
                    font: 'inherit',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    border: open === block.blockId ? '0.5px solid transparent' : '0.5px solid color-mix(in srgb, var(--biu-color-border) 80%, transparent)',
                    background: open === block.blockId ? ACCENT : 'color-mix(in srgb, var(--biu-color-bg) 80%, transparent)',
                    color: open === block.blockId ? '#fff' : 'var(--biu-color-text)',
                    borderRadius: 999,
                    padding: '7px 14px',
                    boxShadow: open === block.blockId ? '0 6px 16px -6px color-mix(in srgb, ' + ACCENT + ' 70%, transparent)' : 'none',
                    transition: 'background .2s ease, color .2s ease, box-shadow .2s ease',
                  }}
                >
                  {block.title || block.kind}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--biu-color-text-subtle)' }}>这一页还没有组件，回到文档插入一块。</p>
          )}
          {open ? (
            <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
              <div style={glass({ padding: 18, borderRadius: 16 })}>
                <Block id={open} />
              </div>
              <button
                type="button"
                onClick={() => {
                  void biu.write({ open })
                  setSaved({ open })
                }}
                style={{ justifySelf: 'start', font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#fff', background: ACCENT, border: 'none', borderRadius: 999, padding: '9px 20px', boxShadow: '0 6px 18px -8px color-mix(in srgb, ' + ACCENT + ' 80%, transparent)' }}
              >
                记住当前块
              </button>
            </div>
          ) : null}
        </Section>
      ) : null}

      {tab === 'api' ? (
        <>
          <Section title="组件 API">
            <Api name="React" use="React.useState / useEffect / JSX" note="宿主注入，不要 import react。" />
            <Api name="<Block id={…} />" use="<Block id={blockId} writable />" note="渲染真实块。id 用 biu.blocks()[].blockId；writable 默认跟随页面。" />
            <Api name="<Field name={…} />" use="<Field name={field.key} />" note="按表格单元格同一套控件渲染。" />
          </Section>
          <Section title="数据 API">
            <Api name="biu.page()" use="返回 { id, title }" note="当前页面。" />
            <Api name="biu.record() / fields() / values()" use="整条记录、字段定义、当前值" note="values 是 { 字段 key: 当前值 }。" />
            <Api name="biu.get / set / patch" use="await biu.patch({ 状态: '进行中' })" note="只写可写字段，未知 / 只读 / 类型不对会抛错。" />
            <Api name="biu.blocks()" use="返回 { id, pageId, blockId, kind, plugin, title, data }[]" note="正文里的块；改 data 用 biu.update。" />
            <Api name="biu.update(id, patch)" use="await biu.update(blockId, { title: '新标题' })" note="把 patch 写进那一块的 data。" />
            <Api name="biu.kinds()" use="返回 { kind, plugin, label }[]" note="编辑器里已注册、可插入的块类型。" />
            <Api name="biu.read() / biu.write(v)" use="本视图自己的 JSON 文件" note="和页面正文分开，适合记这个沙盒的 UI 状态。" />
          </Section>
        </>
      ) : null}

      <footer style={{ padding: '6px 8px', fontSize: 11.5, color: 'var(--biu-color-text-subtle)', textAlign: 'center', letterSpacing: '.02em' }}>
        {saved ? '本视图已保存状态' : '本视图暂无状态数据'} · {kinds.length} 种可用块类型
      </footer>
    </div>
  )
}
`
}

export function defaultPropSandboxSource(_title = '') {
  return `export default function App() {
  const record = biu.record()
  const fields = biu.fields()
  const values = biu.values()
  const [tab, setTab] = React.useState('fields')

  const ACCENT = '#0071e3'
  const GREEN = '#30d158'
  const font =
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "PingFang SC", system-ui, sans-serif'

  const glass = (extra) => ({
    position: 'relative',
    borderRadius: 20,
    background:
      'linear-gradient(180deg, color-mix(in srgb, var(--biu-color-bg) 82%, transparent), color-mix(in srgb, var(--biu-color-bg) 62%, transparent))',
    border: '0.5px solid color-mix(in srgb, var(--biu-color-border) 85%, transparent)',
    boxShadow:
      '0 1px 1px rgba(0,0,0,.03), 0 12px 32px -16px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.06)',
    backdropFilter: 'saturate(180%) blur(24px)',
    WebkitBackdropFilter: 'saturate(180%) blur(24px)',
    ...extra,
  })

  const formatValue = (value) => {
    if (value == null || value === '') return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join('、')
    if (typeof value === 'object') {
      const row = value
      const name = row.name ?? row.title ?? row.label ?? row.href ?? row.url ?? ''
      if (name) return String(name)
      try {
        return JSON.stringify(row)
      } catch {
        return ''
      }
    }
    return String(value)
  }

  const isFilled = (raw) =>
    raw != null && raw !== '' && (!Array.isArray(raw) || raw.length > 0)

  const visibleFields = fields.filter((f) => f.type !== 'file')
  const filled = visibleFields.filter((f) => isFilled(values[f.key]))
  const missing = visibleFields.filter((f) => !isFilled(values[f.key]))
  const writable = visibleFields.filter((f) => f.writable !== false)
  const progress = visibleFields.length
    ? Math.round((filled.length / visibleFields.length) * 100)
    : 0

  const stats = [
    { label: '属性总数', value: visibleFields.length, hint: 'FIELDS' },
    { label: '已填写', value: filled.length, hint: progress + '% 完成' },
    { label: '可编辑', value: writable.length, hint: 'WRITABLE' },
    { label: '待填写', value: missing.length, hint: missing.length ? '待补' : '齐全' },
  ]

  const TABS = [
    { id: 'fields', label: '属性' },
    { id: 'editable', label: '编辑' },
    { id: 'api', label: 'API' },
  ]

  const Section = (props) => (
    <section style={glass({ padding: '22px 24px' })}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: props.sub ? 4 : 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-.015em' }}>
          {props.title}
        </h2>
        {props.trailing ? (
          <span
            style={{
              fontSize: 12,
              color: 'var(--biu-color-text-muted)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '.01em',
            }}
          >
            {props.trailing}
          </span>
        ) : null}
      </div>
      {props.sub ? (
        <p
          style={{
            margin: '0 0 16px',
            fontSize: 12.5,
            lineHeight: 1.6,
            color: 'var(--biu-color-text-muted)',
          }}
        >
          {props.sub}
        </p>
      ) : null}
      {props.children}
    </section>
  )

  const Api = (props) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(150px, 240px) minmax(0, 1fr)',
        gap: 16,
        padding: '12px 0',
        borderTop: '0.5px solid color-mix(in srgb, var(--biu-color-border) 50%, transparent)',
      }}
    >
      <code
        style={{
          fontSize: 12.5,
          fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
          color: ACCENT,
          letterSpacing: '-.01em',
          overflowWrap: 'anywhere',
        }}
      >
        {props.name}
      </code>
      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{props.use}</div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--biu-color-text-muted)' }}>
          {props.note}
        </div>
      </div>
    </div>
  )

  const Ring = (props) => {
    const size = props.size || 54
    const stroke = 4
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    return (
      <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} style={{ flex: 'none' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="color-mix(in srgb, var(--biu-color-border) 70%, transparent)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={props.color || GREEN}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * props.percent) / 100}
          transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'}
          style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
    )
  }

  return (
    <div
      data-testid="page-prop-host-root"
      style={{
        fontFamily: font,
        WebkitFontSmoothing: 'antialiased',
        color: 'var(--biu-color-text)',
        padding: '44px 24px 80px',
        maxWidth: 900,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        display: 'grid',
        gap: 18,
      }}
    >
      <header style={{ display: 'grid', gap: 14, padding: '0 4px' }}>
        <span
          style={{
            justifySelf: 'start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--biu-color-text-muted)',
            background: 'color-mix(in srgb, var(--biu-color-bg) 65%, transparent)',
            border: '0.5px solid color-mix(in srgb, var(--biu-color-border) 80%, transparent)',
            borderRadius: 999,
            padding: '5px 12px',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: ACCENT,
              boxShadow: '0 0 0 3px color-mix(in srgb, ' + ACCENT + ' 22%, transparent)',
            }}
          />
          属性视图 · 填写进度
        </span>
        <h1
          style={{
            margin: 0,
            fontSize: 40,
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: '-.032em',
            maxWidth: '22ch',
          }}
        >
          属性视图介绍
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--biu-color-text-muted)',
            maxWidth: 600,
          }}
        >
          只画这条记录的属性，不动正文。填写进度、可编辑字段与写回方式，一屏看完。
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--biu-color-bg-hover) 55%, transparent)',
          border: '0.5px solid color-mix(in srgb, var(--biu-color-border) 60%, transparent)',
          justifySelf: 'start',
        }}
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            style={{
              font: 'inherit',
              fontSize: 13,
              fontWeight: tab === item.id ? 600 : 500,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 999,
              padding: '7px 16px',
              color: tab === item.id ? 'var(--biu-color-text)' : 'var(--biu-color-text-muted)',
              background:
                tab === item.id
                  ? 'color-mix(in srgb, var(--biu-color-bg) 92%, transparent)'
                  : 'transparent',
              boxShadow: tab === item.id ? '0 1px 3px rgba(0,0,0,.10)' : 'none',
              transition: 'background .2s ease, color .2s ease',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'fields' ? (
        <>
          <section style={glass({ padding: '22px 24px', display: 'grid', gap: 18 })}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                flexWrap: 'wrap',
              }}
            >
              <Ring percent={progress} />
              <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.015em' }}>
                  属性填写 {filled.length} / {visibleFields.length}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
                  {missing.length
                    ? '还有 ' + missing.length + ' 个字段待填。'
                    : '所有字段都已填写。'}
                </div>
              </div>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--biu-color-border) 70%, transparent)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: progress + '%',
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, ' + GREEN + ', ' + ACCENT + ')',
                  transition: 'width .5s cubic-bezier(.4,0,.2,1)',
                }}
              />
            </div>
          </section>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}
          >
            {stats.map((item) => (
              <div
                key={item.label}
                style={glass({ padding: '18px 18px 16px', display: 'grid', gap: 7, minWidth: 0 })}
              >
                <div
                  style={{
                    fontSize: 28,
                    lineHeight: 1,
                    fontWeight: 600,
                    letterSpacing: '-.028em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {item.value}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--biu-color-text-muted)' }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: '.09em',
                    textTransform: 'uppercase',
                    color: 'var(--biu-color-text-subtle)',
                  }}
                >
                  {item.hint}
                </div>
              </div>
            ))}
          </div>

          <Section title="属性清单" trailing={visibleFields.length + ' fields'}>
            {visibleFields.length ? (
              <div style={{ display: 'grid' }}>
                {visibleFields.map((field, index) => {
                  const raw = values[field.key]
                  const ok = isFilled(raw)
                  return (
                    <div
                      key={field.key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(96px, 150px) minmax(0, 1fr) auto',
                        gap: 14,
                        alignItems: 'center',
                        padding: '12px 0',
                        borderTop:
                          index === 0
                            ? 'none'
                            : '0.5px solid color-mix(in srgb, var(--biu-color-border) 50%, transparent)',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: 'var(--biu-color-text-muted)' }}>
                        {field.label || field.key}
                      </span>
                      <span
                        style={{
                          color: ok ? 'var(--biu-color-text)' : 'var(--biu-color-text-subtle)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ok ? formatValue(raw) : '未填写'}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: ok ? GREEN : 'var(--biu-color-text-subtle)',
                          background: ok
                            ? 'color-mix(in srgb, ' + GREEN + ' 12%, transparent)'
                            : 'transparent',
                          border: ok
                            ? '0.5px solid color-mix(in srgb, ' + GREEN + ' 32%, transparent)'
                            : '0.5px solid color-mix(in srgb, var(--biu-color-border) 60%, transparent)',
                          borderRadius: 999,
                          padding: '3px 9px',
                        }}
                      >
                        {ok ? '已填' : '待填'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--biu-color-text-subtle)' }}>
                这条记录还没有可展示的属性。
              </p>
            )}
          </Section>
        </>
      ) : null}

      {tab === 'editable' ? (
        <Section
          title="直接编辑"
          sub="用 Field 渲染与表格完全一致的控件，改完即时写回记录；只读字段不可编辑。"
          trailing={writable.length + ' 可写'}
        >
          {visibleFields.length ? (
            <div style={{ display: 'grid', gap: 2 }}>
              {visibleFields.map((field, index) => (
                <div
                  key={field.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(96px, 150px) minmax(0, 1fr)',
                    gap: 14,
                    alignItems: 'center',
                    padding: '10px 0',
                    borderTop:
                      index === 0
                        ? 'none'
                        : '0.5px solid color-mix(in srgb, var(--biu-color-border) 50%, transparent)',
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      color: 'var(--biu-color-text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {field.label || field.key}
                    {field.writable === false ? (
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: '.06em',
                          color: 'var(--biu-color-text-subtle)',
                          border: '0.5px solid color-mix(in srgb, var(--biu-color-border) 70%, transparent)',
                          borderRadius: 999,
                          padding: '1px 6px',
                        }}
                      >
                        只读
                      </span>
                    ) : null}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <Field name={field.key} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--biu-color-text-subtle)' }}>
              这条记录还没有可展示的属性。
            </p>
          )}
        </Section>
      ) : null}

      {tab === 'api' ? (
        <>
          <Section title="组件 API">
            <Api
              name="React"
              use="React.useState / useEffect / JSX"
              note="宿主注入，不要 import react。"
            />
            <Api
              name="<Field name={…} />"
              use="<Field name={field.key} />"
              note="按表格单元格同一套控件渲染；只读字段不能改。"
            />
          </Section>
          <Section title="数据 API">
            <Api name="biu.record()" use="返回 { id, title, path }" note="当前这条记录。" />
            <Api
              name="biu.fields()"
              use="返回 { key, type, label, writable }[]"
              note="可展示的属性定义；writable 为 false 的字段只能读。"
            />
            <Api
              name="biu.values()"
              use="返回 { 字段 key: 当前值 }"
              note="只读快照；改值请用 set / patch 或 Field。"
            />
            <Api name="biu.get(key)" use="biu.get('title')" note="读一个字段。" />
            <Api
              name="biu.set(key, value)"
              use="biu.set('title', '新标题')"
              note="写一个字段并保存；未知 / 只读 / 类型不对会抛错。"
            />
            <Api
              name="biu.patch(bag)"
              use="await biu.patch({ 状态: '进行中' })"
              note="一次写多个字段，bag 必须是对象。"
            />
            <Api
              name="biu.read() / biu.write(v)"
              use="本视图自己的 JSON 文件"
              note="和记录字段分开，适合记这个沙盒的 UI 状态。"
            />
          </Section>
        </>
      ) : null}

      <footer
        style={{
          padding: '6px 8px',
          fontSize: 11.5,
          color: 'var(--biu-color-text-subtle)',
          textAlign: 'center',
          letterSpacing: '.02em',
        }}
      >
        {visibleFields.length} 个属性 · {writable.length} 个可写 · 进度 {progress}%
      </footer>
    </div>
  )
}
`
}
