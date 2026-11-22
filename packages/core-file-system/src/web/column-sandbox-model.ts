import type { CollectionSchemaPack, DbRecord, FieldType } from '@biu/type-file-system'
import { parseTagFlatColumnKey } from './fields.ts'

export type ColumnSandboxItem = {
  id: string
  name: string
  code: string
}

export type ColumnViewConfig = {
  activeId: string
  /** 仅原生非标签列或历史视图兜底时内联保存；标签属性列的定义由标签字段 fields[*].views 持有。 */
  items?: ColumnSandboxItem[]
}

export type ColumnSandboxProps = {
  value: unknown
  row: DbRecord
  columnKey: string
  label: string
  kind: FieldType
}

export function normalizeColumnViews(raw: unknown): Record<string, ColumnViewConfig> | undefined {
  let obj: unknown = raw
  if (typeof obj === 'string') {
    const trimmed = obj.trim()
    if (!trimmed) return undefined
    try {
      obj = JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined
  const out: Record<string, ColumnViewConfig> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const colKey = String(key ?? '').trim()
    if (!colKey || !value || typeof value !== 'object' || Array.isArray(value)) continue
    const rec = value as Record<string, unknown>
    const rawItems = Array.isArray(rec.items) ? rec.items : []
    const items: ColumnSandboxItem[] = []
    const seen = new Set<string>()
    for (const entry of rawItems) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const item = entry as Record<string, unknown>
      const id = String(item.id ?? '').trim()
      if (!id || id === 'default' || seen.has(id)) continue
      seen.add(id)
      const name = String(item.name ?? '').trim() || `沙箱视图 ${items.length + 1}`
      const code = typeof item.code === 'string' ? item.code : ''
      items.push({ id, name, code })
    }
    const rawActive = String(rec.activeId ?? 'default').trim() || 'default'
    // 如果没有内联 items：仅当 activeId 指向外部（标签字段）沙箱视图时保留轻量指针
    if (!items.length) {
      if (rawActive !== 'default') out[colKey] = { activeId: rawActive }
      continue
    }
    // 有内联 items 时：标签列允许 activeId 指向标签侧视图，原生列则限制在自身 items 内
    const isTagCol = Boolean(parseTagFlatColumnKey(colKey))
    const activeId = rawActive !== 'default' && (isTagCol || seen.has(rawActive)) ? rawActive : 'default'
    out[colKey] = { activeId, items }
  }
  return Object.keys(out).length ? out : undefined
}

/** 合并该列可用的沙箱视图列表：标签列以标签字段的 views 为权威，兼容合并视图里遗留的旧 items。 */
export function resolveColumnSandboxItems(
  colKey: string,
  config: ColumnViewConfig | undefined,
  tags?: CollectionSchemaPack[],
): ColumnSandboxItem[] {
  const flat = parseTagFlatColumnKey(colKey)
  const tagViews = flat && tags
    ? (tags.find((pack) => pack.id === flat.packId)?.fields.find((field) => field.key === flat.fieldKey)?.views ?? [])
    : []
  const legacyItems = config?.items ?? []
  if (!tagViews.length) return legacyItems
  if (!legacyItems.length) return tagViews
  const seen = new Set(tagViews.map((item) => item.id))
  return [...tagViews, ...legacyItems.filter((item) => !seen.has(item.id))]
}

export function activeColumnSandboxItem(
  config: ColumnViewConfig | undefined,
  externalItems?: ColumnSandboxItem[],
): ColumnSandboxItem | null {
  if (!config || !config.activeId || config.activeId === 'default') return null
  if (externalItems?.length) {
    const hit = externalItems.find((item) => item.id === config.activeId)
    if (hit) return hit
  }
  return config.items?.find((item) => item.id === config.activeId) ?? null
}

export function defaultColumnSandboxCode(col: {
  key: string
  label: string
  kind: FieldType
}): string {
  const header = `// 「${col.label}」属性沙箱视图（默认模板，可直接修改或让 Agent 优化展示）\n// 入参: { value, row, columnKey, label, kind }\n`
  if (col.kind === 'boolean') {
    return `${header}export default function Cell({ value }) {
  const on = value === true || value === 'true' || value === 1
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 12,
      color: on ? 'var(--biu-color-ink-green, #22c55e)' : 'var(--biu-color-text-subtle)',
    }}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: on ? 'currentColor' : 'var(--biu-color-border)',
      }} />
      {on ? '是' : '否'}
    </span>
  )
}`
  }
  if (col.kind === 'number') {
    return `${header}export default function Cell({ value }) {
  if (value == null || value === '') return <span style={{ opacity: 0.35 }}>—</span>
  const num = Number(value)
  const text = Number.isFinite(num) ? num.toLocaleString('en-US') : String(value)
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
      {text}
    </span>
  )
}`
  }
  if (col.kind === 'select' || col.kind === 'multi-select') {
    return `${header}export default function Cell({ value }) {
  const list = Array.isArray(value) ? value.filter(Boolean) : value != null && value !== '' ? [value] : []
  if (!list.length) return <span style={{ opacity: 0.35 }}>—</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {list.map((item, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 7px',
            borderRadius: 5,
            fontSize: 12,
            background: 'var(--biu-color-bg-hover)',
            color: 'var(--biu-color-text)',
          }}
        >
          {String(item)}
        </span>
      ))}
    </span>
  )
}`
  }
  if (col.kind === 'url') {
    return `${header}export default function Cell({ value }) {
  const href = String(value ?? '').trim()
  if (!href) return <span style={{ opacity: 0.35 }}>—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{ color: 'var(--biu-color-text)', textDecoration: 'underline', textUnderlineOffset: 2 }}
    >
      {href.replace(/^https?:\\/\\//, '')}
    </a>
  )
}`
  }
  if (col.kind === 'datetime') {
    return `${header}export default function Cell({ value }) {
  if (value == null || value === '') return <span style={{ opacity: 0.35 }}>—</span>
  const raw = typeof value === 'number' ? value : /^\\d+$/.test(String(value)) ? Number(value) : Date.parse(String(value))
  const d = Number.isFinite(raw) ? new Date(raw) : null
  const text = d && !Number.isNaN(d.getTime())
    ? \`\${d.getFullYear()}/\${String(d.getMonth() + 1).padStart(2, '0')}/\${String(d.getDate()).padStart(2, '0')} \${String(d.getHours()).padStart(2, '0')}:\${String(d.getMinutes()).padStart(2, '0')}\`
    : String(value)
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</span>
}`
  }
  return `${header}export default function Cell({ value }) {
  if (value == null || value === '') return <span style={{ opacity: 0.35 }}>—</span>
  return <span>{String(value)}</span>
}`
}
