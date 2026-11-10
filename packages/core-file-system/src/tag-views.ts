export type TagSandboxView = {
  id: string
  name: string
  kind: 'sandbox'
  file: string
  dataFile: string
}

export function tagViewsAssetName(tagId: string) {
  return `tag-views-${String(tagId ?? '').trim()}.json`
}

export function parseTagViews(raw: unknown): TagSandboxView[] {
  let list: unknown = raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      list = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: TagSandboxView[] = []
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
      name: String(rec.name ?? '').trim() || '标签沙盒',
      kind: 'sandbox',
      file,
      dataFile: String(rec.dataFile ?? '').trim() || `tag-view-data-${id}.json`,
    })
  }
  return out
}

export function tagViewFileNames(record: { id?: unknown; views?: unknown }): string[] {
  const id = String(record.id ?? '').trim()
  const out: string[] = []
  if (id) out.push(tagViewsAssetName(id))
  for (const view of parseTagViews(record.views)) {
    for (const raw of [view.file, view.dataFile]) {
      const name = String(raw ?? '')
        .trim()
        .replace(/^assets\//, '')
        .replace(/^.*[/\\]/, '')
      if (name) out.push(name)
    }
  }
  return out
}

export function isTagViewDocName(name: string) {
  const file = String(name ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
  if (/^tag-views-.+\.json$/i.test(file)) return true
  if (/^tag-view-data-.+\.json$/i.test(file)) return true
  return /^tag-view-.+\.jsx$/i.test(file)
}

export function tagIdFromViewDocName(name: string) {
  const file = String(name ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
  const catalog = /^tag-views-(.+)\.json$/i.exec(file)
  if (catalog) return catalog[1] ?? ''
  const data = /^tag-view-data-(.+)-([a-z0-9]{6,32})\.json$/i.exec(file)
  if (data) return data[1] ?? ''
  const jsx = /^tag-view-(.+)-([a-z0-9]{6,32})\.jsx$/i.exec(file)
  return jsx?.[1] ?? ''
}

export function createTagViewId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

export function defaultTagSandboxSource(title = '') {
  const heading = title.trim() || '这个标签'
  return `export default function App() {
  // 标签内容视图沙盒。可用：React、Field、biu。没有 Block。不能 import / require。
  const tag = biu.tag()
  const fields = biu.fields()
  const values = biu.values()
  const host = biu.record()
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
    <div data-testid="tag-host-view-root" style={{ padding: '20px 8px 32px', display: 'grid', gap: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)' }}>标签沙盒 · 内容视图</div>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.25 }}>{tag.title || ${JSON.stringify(heading)}}</h1>
      <p style={{ margin: 0, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
        这个模板介绍标签内容视图能用的 API。属性定义在标签上，值写回当前打开的那条记录。
      </p>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>组件 API</h2>
        <Api name="React" use="React.useState / useEffect / JSX" note="宿主注入，不要 import react。" />
        <Api name={'Field'} use={'<Field name={field.key} />'} note="编辑当前记录上这个标签字段的值。" />
      </section>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>数据 API</h2>
        <Api name="biu.tag()" use={'返回 { id, title }'} note="当前标签定义。" />
        <Api name="biu.record()" use={'返回 { path, collection, id, tagId }'} note="值写回到这条宿主记录，不是标签本身。" />
        <Api name="biu.fields()" use={'返回 { key, type, label }[]'} note="标签上的属性定义。" />
        <Api name="biu.values()" use="当前记录上这些字段的值" note="只读快照。" />
        <Api name="biu.get / set / patch" use={'get(key)、set(key, value)、await biu.patch({ key: value })'} note="只写该标签上存在且可写的字段；未知/只读/类型不对会抛错。" />
        <Api name="biu.read() / biu.write(v)" use="本视图自己的 JSON 文件" note="和标签字段分开，适合记这个沙盒的 UI 状态。" />
      </section>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>用法</h2>
        <p style={{ margin: '0 0 8px', color: 'var(--biu-color-text-muted)' }}>宿主 {host.path || '（还没有打开记录）'}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {fields.map((field) => (
            <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--biu-color-text-muted)' }}>{field.label || field.key}</span>
              <Field name={field.key} />
            </div>
          ))}
        </div>
        {fields.length ? null : <p style={{ margin: 0, color: 'var(--biu-color-text-subtle)' }}>这个标签还没有属性。</p>}
        <button
          type="button"
          onClick={() => { const next = { host: host.path, values: biu.values() }; void biu.write(next); setSaved(next) }}
          style={{ justifySelf: 'start', font: 'inherit', cursor: 'pointer' }}
        >
          把当前值记进本视图文件
        </button>
        <pre style={{ margin: 0, fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>{JSON.stringify({ values, saved }, null, 2)}</pre>
      </section>
    </div>
  )
}
`
}
