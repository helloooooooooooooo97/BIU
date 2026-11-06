export type PageSandboxView = {
  id: string
  name: string
  kind: 'sandbox'
  file: string
  dataFile: string
}

export function viewsAssetName(pageId: string) {
  return `page-views-${String(pageId ?? '').trim()}.json`
}

export function parsePageViews(raw: unknown): PageSandboxView[] {
  let list: unknown = raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      list = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: PageSandboxView[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    const id = String(rec.id ?? '').trim()
    const file = String(rec.file ?? '').trim()
    if (!id || seen.has(id) || !file) continue
    seen.add(id)
    out.push({
      id,
      name: String(rec.name ?? '').trim() || '沙盒',
      kind: 'sandbox',
      file,
      dataFile: String(rec.dataFile ?? '').trim() || `view-data-${id}.json`,
    })
  }
  return out
}

export function defaultSandboxSource(title = '') {
  const heading = title.trim() || '这一页'
  return `export default function App() {
  const page = biu.page()
  const blocks = biu.blocks()
  const [open, setOpen] = React.useState('')
  return (
    <div data-testid="page-host-view-root" style={{ padding: '28px 8px 48px', display: 'grid', gap: 16, maxWidth: 880 }}>
      <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)' }}>本页沙盒</div>
      <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.2 }}>{page.title || ${JSON.stringify(heading)}}</h1>
      <p style={{ margin: 0, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
        这是绑定本页的特制视图。点下面的组件才会展开对应的真实 Block，数据仍在页面配置里。
      </p>
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
