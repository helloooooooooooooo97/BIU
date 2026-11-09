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
  const record = biu.record()
  const fields = biu.fields()
  const values = biu.values()
  return (
    <div data-testid="page-prop-host-root" style={{ padding: '20px 8px 32px', display: 'grid', gap: 14, maxWidth: 720 }}>
      <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)' }}>属性沙盒</div>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.25 }}>{record.title || ${JSON.stringify(heading)}}</h1>
      <p style={{ margin: 0, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
        这是绑定本页属性的特制视图。和文档 / 大纲 / 表格 / 源码互不影响。值用 biu.patch / Field 写回这条记录。
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {fields.map((field) => (
          <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--biu-color-text-muted)' }}>{field.label || field.key}</span>
            <Field name={field.key} />
          </div>
        ))}
      </div>
      {fields.length ? null : <p style={{ margin: 0, color: 'var(--biu-color-text-subtle)' }}>这一页还没有可展示的属性。</p>}
      <pre style={{ margin: 0, fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>{JSON.stringify(values, null, 2)}</pre>
    </div>
  )
}
`
}
