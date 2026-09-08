import {
  withBuiltinFields,
  type CollectionActionInfo,
  type CollectionSchema,
  type FieldSpec,
} from '@biu/type-file-system'

const LIST_META_KEYS = new Set(['createdAt', 'updatedAt', 'createdBy', 'updatedBy'])

/** 把 File System 工具回包压成 Agent 用的短 JSON；网页 API 不走这里。 */
export class AgentDbCompact {
  readonly statBlurb =
    '查看路径元数据。根目录列出表。表路径返回相对默认的 schema：每张表都有 id、title（标题）、createdAt、updatedAt、emoji、tags、facet、parentId（父级）、dependsOn、createdBy（唯一创建人，系统自记不可写）、updatedBy（编辑人列表，系统自记不可写，多人先后编辑会追加）；正文默认字段 content（file，用 db_content）。fields 只含本表多出来的列，或覆盖了这些默认的列。caps 表示能否 list/read/update/create/delete/action/content。'

  schema(schema: CollectionSchema) {
    const defaults = this.defaultFields(schema)
    const fields: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(schema.fields)) {
      const builtin = defaults[key]
      if (key !== 'facet' && builtin && this.specsMatch(field, builtin)) continue
      fields[key] = this.field(key, field)
    }
    const actions = (schema.actions ?? []).map((item) => this.action(item)).filter(Boolean)
    const out: Record<string, unknown> = {}
    if (schema.labelField && schema.labelField !== 'title') out.labelField = schema.labelField
    if (schema.contentField && schema.contentField !== 'content') out.contentField = schema.contentField
    if (schema.parentField) out.parentField = schema.parentField
    if (Object.keys(fields).length) out.fields = fields
    if (actions.length) out.actions = actions
    return out
  }

  /** list / read / stat / content */
  query(result: unknown) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return result
    const rec = result as Record<string, unknown>
    const kind = rec.kind
    if (kind === 'root') return { kind: 'root', items: this.rootTables(rec.items ?? rec.collections) }
    if (kind === 'collection') return this.collection(rec)
    if (kind === 'record') {
      const next: Record<string, unknown> = { kind: 'record', path: rec.path, value: this.recordValue(rec.value) }
      if (rec.result !== undefined) next.result = rec.result
      return next
    }
    if (kind === 'content') return this.content(rec)
    if (kind === 'asset') return this.asset(rec)
    return result
  }

  /** update / create / delete / action */
  write(result: unknown) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return result
    const rec = result as Record<string, unknown>
    if (rec.kind === 'record') {
      const next: Record<string, unknown> = { ok: true, path: rec.path }
      if (rec.result !== undefined) next.result = rec.result
      return next
    }
    if (rec.kind === 'created') return { ok: true, path: rec.path, ids: this.createdIds(rec.items) }
    if (rec.kind === 'deleted') return { ok: true, path: rec.path, ids: rec.ids ?? [] }
    return result
  }

  private collection(rec: Record<string, unknown>) {
    const path = String(rec.path ?? '')
    const next: Record<string, unknown> = { kind: 'collection', path }
    const id = this.omitRedundantId(path, rec.id)
    if (id) next.id = id
    if (typeof rec.label === 'string' && rec.label && rec.label !== path.slice(1)) next.label = rec.label
    const blurb = this.viewBlurb(rec)
    if (blurb) next.blurb = blurb
    if (Array.isArray(rec.caps)) next.caps = rec.caps
    if (Array.isArray(rec.items)) {
      if (typeof rec.total === 'number') next.total = rec.total
      if (typeof rec.offset === 'number' && rec.offset) next.offset = rec.offset
      if (typeof rec.limit === 'number') next.limit = rec.limit
      const table = this.columnar(rec.items)
      next.columns = table.columns
      next.rows = table.rows
      return next
    }
    if (rec.schema && typeof rec.schema === 'object') {
      const schema = this.schema(rec.schema as CollectionSchema)
      if (Object.keys(schema).length) next.schema = schema
    }
    return next
  }

  private content(rec: Record<string, unknown>) {
    if (rec.ok === true || (typeof rec.command === 'string' && rec.command !== 'view')) {
      const next: Record<string, unknown> = { ok: true, path: rec.path }
      if (typeof rec.command === 'string' && rec.command !== 'write') next.command = rec.command
      if (typeof rec.start_line === 'number') next.start_line = rec.start_line
      if (typeof rec.end_line === 'number') next.end_line = rec.end_line
      if (typeof rec.text === 'string' && rec.text.trim()) next.text = rec.text.trim()
      return next
    }
    const next: Record<string, unknown> = { path: rec.path, text: rec.text }
    if (typeof rec.start === 'number') next.start = rec.start
    if (typeof rec.end === 'number') next.end = rec.end
    if (typeof rec.total === 'number') next.total = rec.total
    if (rec.truncated) next.truncated = true
    return next
  }

  private asset(rec: Record<string, unknown>) {
    if (rec.ok === true || rec.command === 'write') {
      return { ok: true, path: rec.path, name: rec.name, etag: rec.etag }
    }
    if (Array.isArray(rec.assets)) return { path: rec.path, assets: rec.assets }
    const next: Record<string, unknown> = { path: rec.path, name: rec.name, etag: rec.etag }
    if (typeof rec.text === 'string') next.text = rec.text
    if (typeof rec.type === 'string') next.type = rec.type
    return next
  }

  private columnar(items: unknown[]) {
    const rowsIn = items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    const keepMeta = !this.hasNonMetaFields(rowsIn)
    const order: string[] = []
    const seen = new Set<string>()
    for (const row of rowsIn) {
      for (const key of Object.keys(row)) {
        if (this.skipListKey(key, keepMeta) || seen.has(key)) continue
        seen.add(key)
        order.push(key)
      }
    }
    const columns = order.filter((key) => key === 'id' || rowsIn.some((row) => !this.empty(row[key])))
    const rows = rowsIn.map((row) => columns.map((key) => (this.empty(row[key]) ? null : row[key])))
    return { columns, rows }
  }

  private rootTables(entries: unknown) {
    if (!Array.isArray(entries)) return []
    return entries.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const rec = item as { path?: unknown; label?: unknown; id?: unknown; view?: unknown }
      const path = typeof rec.path === 'string' ? rec.path : typeof rec.id === 'string' ? `/${rec.id}` : ''
      if (!path) return []
      const label = typeof rec.label === 'string' ? rec.label : ''
      const next: Record<string, unknown> = { path }
      if (label && label !== path.slice(1)) next.label = label
      const blurb = this.viewBlurb(rec)
      if (blurb) next.view = { blurb }
      return [next]
    })
  }

  /** 表说明书必须留给 Agent：这张表是什么、用哪条 db_*。UI chrome（route/icon）仍可丢掉。 */
  private viewBlurb(rec: { view?: unknown; blurb?: unknown }) {
    if (typeof rec.blurb === 'string' && rec.blurb.trim()) return rec.blurb.trim()
    const view = rec.view
    if (!view || typeof view !== 'object' || Array.isArray(view)) return ''
    const blurb = String((view as { blurb?: unknown }).blurb ?? '').trim()
    return blurb
  }

  private recordValue(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const next: Record<string, unknown> = {}
    for (const [key, cell] of Object.entries(value as Record<string, unknown>)) {
      if (this.empty(cell)) continue
      next[key] = cell
    }
    return next
  }

  private createdIds(items: unknown) {
    if (!Array.isArray(items)) return [] as string[]
    const ids: string[] = []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const row = item as { path?: unknown; value?: { id?: unknown } }
      const id = typeof row.value?.id === 'string'
        ? row.value.id
        : typeof row.path === 'string'
          ? row.path.slice(row.path.lastIndexOf('/') + 1)
          : ''
      if (id) ids.push(id)
    }
    return ids
  }

  private field(key: string, field: FieldSpec) {
    const out: Record<string, unknown> = { type: field.type }
    if (field.label && field.label !== key) out.label = field.label
    if (field.writable === false) out.writable = false
    if (field.sortable) out.sortable = true
    if (field.format) out.format = field.format
    if (field.enum?.length) out.enum = field.enum
    if (field.description) out.description = field.description
    if (field.action) out.action = field.action
    if (field.computed) out.computed = true
    return out
  }

  private action(action: CollectionActionInfo) {
    if ((action.for ?? 'both') === 'user') return null
    const out: Record<string, unknown> = { id: action.id }
    if (action.description) out.description = action.description
    else if (action.label && action.label !== action.id) out.label = action.label
    if (action.when) out.when = action.when
    if (action.parameters) out.parameters = action.parameters
    if (action.allowMissing) out.allowMissing = true
    return out
  }

  private defaultFields(schema: CollectionSchema) {
    const labelField = schema.labelField ?? 'title'
    const contentField = schema.contentField ?? 'content'
    const raw = withBuiltinFields({}, contentField, labelField)
    const fields = { ...raw }
    for (const [key, field] of Object.entries(raw)) {
      fields[key] = field.computed ? { ...field, writable: false } : field
    }
    return fields
  }

  private specsMatch(field: FieldSpec, builtin: FieldSpec) {
    const label = field.label ?? builtin.label
    if (field.type !== builtin.type) return false
    if (label !== (builtin.label ?? field.label)) return false
    if (field.writable !== builtin.writable) return false
    if (Boolean(field.sortable) !== Boolean(builtin.sortable)) return false
    if ((field.format ?? '') !== (builtin.format ?? '')) return false
    if (JSON.stringify(field.enum ?? null) !== JSON.stringify(builtin.enum ?? null)) return false
    if ((field.action ?? '') !== (builtin.action ?? '')) return false
    if (Boolean(field.computed) !== Boolean(builtin.computed)) return false
    if (Boolean(field.multiple) !== Boolean(builtin.multiple)) return false
    return true
  }

  private omitRedundantId(path: string, id: unknown) {
    if (typeof id !== 'string' || !id) return undefined
    return `/${id}` === path ? undefined : id
  }

  private empty(value: unknown) {
    if (value == null || value === '') return true
    if (Array.isArray(value) && value.length === 0) return true
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return true
    return false
  }

  private skipListKey(key: string, keepMeta: boolean) {
    if (key === 'path' || key === 'kind') return true
    if (!keepMeta && LIST_META_KEYS.has(key)) return true
    return false
  }

  private hasNonMetaFields(rows: Record<string, unknown>[]) {
    return rows.some((row) =>
      Object.keys(row).some((key) => key !== 'id' && !this.skipListKey(key, true) && !LIST_META_KEYS.has(key)),
    )
  }
}
