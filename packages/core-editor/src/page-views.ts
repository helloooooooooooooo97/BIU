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
  // 内容视图沙盒。可用：React、Block、Field、biu。不能 import / require。
  const page = biu.page()
  const blocks = biu.blocks()
  const kinds = biu.kinds()
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
    <div data-testid="page-host-view-root" style={{ padding: '28px 8px 48px', display: 'grid', gap: 18, maxWidth: 880 }}>
      <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)' }}>本页沙盒 · 内容视图</div>
      <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.2 }}>{page.title || ${JSON.stringify(heading)}}</h1>
      <p style={{ margin: 0, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
        这个模板介绍本视图能用的 API。内容视图主要画页面内部的 Block；记录属性也可以用 Field / biu.patch 写回。
      </p>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>组件 API</h2>
        <Api name="React" use="React.useState / useEffect / JSX" note="宿主注入，不要 import react。" />
        <Api name={'Block'} use={'<Block id={blockId} writable />'} note="渲染真实块。id 用 biu.blocks()[].blockId；writable 默认跟随页面。" />
        <Api name={'Field'} use={'<Field name={field.key} />'} note="按表格单元格同一套控件渲染。" />
      </section>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>数据 API</h2>
        <Api name="biu.page()" use={'返回 { id, title }'} note="当前页面。" />
        <Api name="biu.blocks()" use={'返回 { id, pageId, blockId, kind, plugin, title, data }[]'} note="正文里的块；改 data 用 biu.update。" />
        <Api name="biu.kinds()" use={'返回 { kind, plugin, label }[]'} note="编辑器里已注册、可插入的块类型。" />
        <Api name="biu.update(id, patch)" use={"await biu.update(blockId, { title: '新标题' })"} note="把 patch 写进那一块的 data。" />
        <Api name="biu.read() / biu.write(v)" use="本视图自己的 JSON 文件" note="和页面正文分开，适合记这个沙盒的 UI 状态。" />
        <Api name="biu.record / fields / values" use="整条记录、字段定义、当前值" note={'get(key)、set(key, value)、patch({ key: value }) 只写可写字段，未知/只读/类型不对会抛错。'} />
      </section>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>用法</h2>
        <p style={{ margin: '0 0 8px', color: 'var(--biu-color-text-muted)' }}>已注册块类型 {kinds.length} 个。点芯片展开 Block；「记住」把当前块 id 写进本视图 dataFile。</p>
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
              onClick={() => { void biu.write({ open }); setSaved({ open }) }}
              style={{ justifySelf: 'start', font: 'inherit', cursor: 'pointer' }}
            >
              记住当前块
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--biu-color-text-subtle)' }}>{blocks.length ? '先点上面的组件' : '这一页还没有组件。先回文档插入一块。'}</p>
        )}
        <pre style={{ margin: 0, fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>{JSON.stringify({ saved, page }, null, 2)}</pre>
      </section>
    </div>
  )
}
`
}
