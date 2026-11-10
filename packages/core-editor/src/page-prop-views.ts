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

export function defaultPropSandboxSource(title = '') {
  const heading = title.trim() || '这一页'
  return `export default function App() {
  // 属性视图沙盒。可用：React、Field、biu。没有 Block。不能 import / require。
  const record = biu.record()
  const fields = biu.fields()
  const values = biu.values()
  const [saved, setSaved] = React.useState(null)
  React.useEffect(() => {
    let gone = false
    biu.read().then((value) => { if (!gone) setSaved(value) })
    return () => { gone = true }
  }, [])
  function Api(props) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 220px) minmax(0, 1fr)', gap: 10, padding: '8px 0', borderBottom: 'var(--biu-stroke-width) solid var(--biu-color-border)', fontSize: 13, lineHeight: 1.55 }}>
        <code style={{ color: 'var(--biu-color-text)' }}>{props.name}</code>
        <div>
          <div>{props.use}</div>
          <div style={{ color: 'var(--biu-color-text-muted)' }}>{props.note}</div>
        </div>
      </div>
    )
  }
  return (
    <div data-testid="page-prop-host-root" style={{ padding: '20px 8px 32px', display: 'grid', gap: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)' }}>属性沙盒 · 属性视图</div>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.25 }}>{record.title || ${JSON.stringify(heading)}}</h1>
      <p style={{ margin: 0, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
        这个模板介绍属性视图能用的 API。只画记录字段，不画正文 Block。和文档 / 大纲 / 表格 / 源码互不影响。
      </p>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>组件 API</h2>
        <Api name="React" use="React.useState / useEffect / JSX" note="宿主注入，不要 import react。" />
        <Api name={'Field'} use={'<Field name={field.key} />'} note="按表格单元格同一套控件渲染；只读字段不能改。" />
      </section>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>数据 API</h2>
        <Api name="biu.record()" use={'返回 { id, title, path }'} note="当前记录。" />
        <Api name="biu.fields()" use={'返回 { key, type, label, writable }[]'} note="可展示的属性定义。" />
        <Api name="biu.values()" use="当前这些字段的值对象" note="只读快照；改值请用 set / patch。" />
        <Api name="biu.get(key)" use="biu.get('title')" note="读一个字段。" />
        <Api name="biu.set(key, value)" use="biu.set('title', '新标题')" note="只写 schema 里 writable 且非 computed 的字段；未知/只读会抛错。" />
        <Api name="biu.patch(bag)" use={"await biu.patch({ title: '新标题' })"} note="一次写多个字段。会按类型校验，bag 必须是对象。" />
        <Api name="biu.read() / biu.write(v)" use="本视图自己的 JSON 文件" note="和记录字段分开，适合记这个沙盒的 UI 状态。" />
      </section>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>用法</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {fields.map((field) => (
            <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--biu-color-text-muted)' }}>{field.label || field.key}</span>
              <Field name={field.key} />
            </div>
          ))}
        </div>
        {fields.length ? null : <p style={{ margin: 0, color: 'var(--biu-color-text-subtle)' }}>这一页还没有可展示的属性。</p>}
        <button
          type="button"
          onClick={() => { const next = { remembered: biu.get('title') }; void biu.write(next); setSaved(next) }}
          style={{ justifySelf: 'start', font: 'inherit', cursor: 'pointer' }}
        >
          把标题记进本视图文件
        </button>
        <pre style={{ margin: 0, fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>{JSON.stringify({ values, saved }, null, 2)}</pre>
      </section>
    </div>
  )
}
`
}
