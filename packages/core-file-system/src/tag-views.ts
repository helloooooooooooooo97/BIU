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
  const tag = biu.tag()
  const fields = biu.fields()
  const values = biu.values()
  return (
    <div data-testid="tag-host-view-root" style={{ padding: '20px 8px 32px', display: 'grid', gap: 14, maxWidth: 720 }}>
      <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--biu-color-text-muted)' }}>标签沙盒</div>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.25 }}>{tag.title || ${JSON.stringify(heading)}}</h1>
      <p style={{ margin: 0, color: 'var(--biu-color-text-muted)', lineHeight: 1.6 }}>
        这是绑定本标签的特制视图。属性定义在标签上，当前块里的值用 biu.get / biu.set。
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {fields.map((field) => (
          <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--biu-color-text-muted)' }}>{field.label || field.key}</span>
            <Field name={field.key} />
          </div>
        ))}
      </div>
      {fields.length ? null : <p style={{ margin: 0, color: 'var(--biu-color-text-subtle)' }}>这个标签还没有属性。</p>}
      <pre style={{ margin: 0, fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>{JSON.stringify(values, null, 2)}</pre>
    </div>
  )
}
`
}
