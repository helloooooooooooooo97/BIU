import { parsePageViews, type PageSandboxView } from './page-views.ts'

export type { PageSandboxView as PagePropSandboxView }

export function propViewsAssetName(pageId: string) {
  return `page-prop-views-${String(pageId ?? '').trim()}.json`
}

export function parsePagePropViews(raw: unknown): PageSandboxView[] {
  return parsePageViews(raw).map((item) => ({
    ...item,
    name: item.name === '沙盒' ? '属性沙盒' : item.name,
  }))
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
          {record.title || '未命名记录'}
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
