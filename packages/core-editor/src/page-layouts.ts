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
  const page = biu.page()
  const record = biu.record()
  const fields = biu.fields()
  const blocks = biu.blocks()
  const [open, setOpen] = React.useState('')
  return (
    <div data-testid="page-layout-host-root" style={{ padding: '28px 8px 48px', display: 'grid', gap: 20, maxWidth: 880 }}>
      <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)' }}>全局沙盒</div>
      <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.2 }}>{(record && record.title) || page.title || ${JSON.stringify(heading)}}</h1>
      <p style={{ margin: 0, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
        这是绑定本页的全局视图。上面是属性，下面是页面里的组件。
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
      {open ? <Block id={open} /> : <p style={{ margin: 0, color: 'var(--biu-color-text-subtle)' }}>{blocks.length ? '先点上面的组件' : '这一页还没有组件。先回文档插入一块。'}</p>}
    </div>
  )
}
`
}
