import {
  DEFAULT_RECORD_LAYOUT_ID,
  defaultRecordLayout,
  listedRecordLayouts,
  parseRecordLayouts,
  type RecordLayoutView,
} from '@biu/type-file-system/record-views'

export const PAGE_DEFAULT_LAYOUT_ID = DEFAULT_RECORD_LAYOUT_ID
export type PageLayoutView = RecordLayoutView
export type PageLayoutSort = RecordLayoutView['sort']

export function layoutsAssetName(pageId: string) {
  return `page-layouts-${String(pageId ?? '').trim()}.json`
}

export function defaultPageLayout(): PageLayoutView {
  return defaultRecordLayout('doc')
}

export function parsePageLayouts(raw: unknown): PageLayoutView[] {
  return parseRecordLayouts(raw, 'doc')
}

export function listedPageLayouts(raw: unknown): PageLayoutView[] {
  return listedRecordLayouts(raw, 'doc')
}

export function defaultLayoutSandboxSource(title = '') {
  const heading = title.trim() || '这一页'
  return `export default function App() {
  // 全局视图沙盒。可用：React、Field、Block、biu。不能 import / require。
  const page = biu.page()
  const record = biu.record()
  const fields = biu.fields()
  const blocks = biu.blocks()
  const [open, setOpen] = React.useState('')
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
    <div data-testid="page-layout-host-root" style={{ padding: '28px 8px 48px', display: 'grid', gap: 18, maxWidth: 880 }}>
      <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)' }}>全局沙盒 · 全局视图</div>
      <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.2 }}>{(record && record.title) || page.title || ${JSON.stringify(heading)}}</h1>
      <p style={{ margin: 0, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
        这个模板介绍全局视图能用的 API：同时画属性（Field）和正文内部的 Block。
      </p>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>组件 API</h2>
        <Api name="React" use="React.useState / useEffect / JSX" note="宿主注入，不要 import react。" />
        <Api name={'Field'} use={'<Field name={field.key} />'} note="编辑记录属性；失焦写回。" />
        <Api name={'Block'} use={'<Block id={block.blockId} />'} note="渲染真实块。writable 默认跟随页面。" />
      </section>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>数据 API</h2>
        <Api name="biu.page()" use={'返回 { id, title }'} note="当前页面。" />
        <Api name="biu.record / fields / values" use="整条记录、字段定义、当前值" note={'get(key)、set(key, value)、patch({ key: value }) 写回记录。'} />
        <Api name="biu.blocks()" use={'返回 { id, pageId, blockId, kind, plugin, title, data }[]'} note="正文里的块。" />
        <Api name="biu.kinds()" use={'返回 { kind, plugin, label }[]'} note="可插入的块类型。" />
        <Api name="biu.update(id, patch)" use={"await biu.update(blockId, { title: '新标题' })"} note="写回那一块的 data。" />
        <Api name="biu.read() / biu.write(v)" use="本视图自己的 JSON 文件" note="和记录 / 正文分开，适合记这个沙盒的 UI 状态。" />
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {blocks.map((block) => (
            <button
              key={block.blockId}
              type="button"
              data-testid={'page-host-chip-' + block.blockId}
              onClick={() => setOpen((cur) => (cur === block.blockId ? '' : block.blockId))}
              style={{
                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                borderRadius: 999,
                padding: '6px 12px',
                background: open === block.blockId ? 'var(--biu-color-bg-hover)' : 'transparent',
                color: 'var(--biu-color-text)',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              {block.title || block.kind}
            </button>
          ))}
        </div>
        {open ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <Block id={open} />
            <button
              type="button"
              onClick={() => { const next = { open, title: biu.get('title') }; void biu.write(next); setSaved(next) }}
              style={{ justifySelf: 'start', font: 'inherit', cursor: 'pointer' }}
            >
              记住当前块和标题
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--biu-color-text-subtle)' }}>{blocks.length ? '先点上面的组件' : '这一页还没有组件。先回文档插入一块。'}</p>
        )}
        <pre style={{ margin: 0, fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>{JSON.stringify({ saved, values: biu.values() }, null, 2)}</pre>
      </section>
    </div>
  )
}
`
}
