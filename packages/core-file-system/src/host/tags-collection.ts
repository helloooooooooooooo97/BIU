import type { CollectionInfo, CollectionListQuery, CollectionSpec, DbRecord, SchemaPackField } from '@biu/type-file-system'
import { parseAtomicFields, recordBuiltinValues } from '@biu/type-file-system'
import { TagStore, slugTagId } from './tags-store.ts'
import { TAGS_COLLECTION_PATH, normalizeCollectionPath } from '../paths.ts'

const TAG_FIELDS_EXAMPLE = '[{"key":"类别","type":"string"}]'
const TAG_FIELD_EXAMPLE_DATETIME = 1795142384000
const TAG_FIELDS_DESCRIPTION =
  '属性定义。db_update / db_create 可传数组或 JSON 字符串，两种形状等价。例 [{"key":"类别","type":"string"}]。同一标签下属性名不能重复。type 必须是 string|number|boolean|select|multi-select|datetime|url|image|attachment|document|action|tag|person|ref|multi-ref（没有 text，也没有 file：file 是记录正文，用 db_content。document 是可覆盖的命名文档）。其它表读该属性的列 key 为 tag::<本标签id>::<字段key>，例如 tag::tag::类别。'

export function tagFieldDefaultExample(
  field: { type?: string; enum?: string[]; example?: unknown },
  observedOptions?: string[],
): unknown {
  if (field.example !== undefined) return field.example
  const options = field.enum?.length ? field.enum : observedOptions
  switch (field.type) {
    case 'datetime':
      return TAG_FIELD_EXAMPLE_DATETIME
    case 'number':
      return 1
    case 'boolean':
      return true
    case 'select':
      return options?.[0] ?? '选项A'
    case 'multi-select':
      return options?.length ? [options[0]!] : ['选项A']
    case 'url':
      return 'https://example.com'
    default:
      return undefined
  }
}

export function stampRecordId(collection: string, recordId: string) {
  const table = normalizeCollectionPath(collection).replace(/^\//, '')
  return `${table}::${recordId}`
}

export function parseStampRecordId(id: string) {
  const raw = String(id ?? '')
  const at = raw.indexOf('::')
  if (at <= 0) return null
  const table = raw.slice(0, at).trim()
  const recordId = raw.slice(at + 2).trim()
  if (!table || !recordId) return null
  return { collection: `/${table}`, recordId }
}

export function tagsCollection(
  store: TagStore,
  tables: () => Array<Pick<CollectionInfo, 'path' | 'label' | 'id'>> = () => [],
): CollectionSpec {
  const asTag = (
    id: string,
    label: string,
    fields: unknown[],
    stampCount: number,
    notes = '',
    createdAt = 0,
    updatedAt = 0,
  ): DbRecord => ({
    id,
    title: label,
    fieldCount: fields.length,
    stampCount,
    fields: JSON.stringify(fields),
    notes,
    ...recordBuiltinValues({ createdAt, updatedAt }),
  })

  const tableLabel = (path: string) => {
    const hit = tables().find((item) => item.path === path)
    return hit?.label ?? hit?.id ?? path
  }

  const enrichTagFields = (tagId: string, fields: SchemaPackField[]) => {
    const observed = store.observedFieldOptions(tagId)
    return fields.map((field) => {
      const opts = observed[field.key]
      const example = tagFieldDefaultExample(field, opts)
      return {
        ...field,
        ...(opts?.length ? { observedOptions: opts } : {}),
        ...(example !== undefined ? { example } : {}),
      }
    })
  }

  const fromEntry = (id: string, stampCount: number) => {
    const item = store.entry(id)
    if (!item) return asTag(id, id, [], stampCount)
    return asTag(
      item.pack.id,
      item.pack.label,
      enrichTagFields(item.pack.id, item.pack.fields),
      stampCount,
      item.notes,
      item.createdAt,
      item.updatedAt,
    )
  }

  const tagRows = () => {
    const counts = store.stampCounts()
    return store.entries().map((item) =>
      asTag(
        item.pack.id,
        item.pack.label,
        enrichTagFields(item.pack.id, item.pack.fields),
        counts[item.pack.id] ?? 0,
        item.notes,
        item.createdAt,
        item.updatedAt,
      ),
    )
  }

  const stampRows = (tagId: string) => {
    const found = store.collect(tagId)
    const id = found.tag?.id ?? tagId
    return found.items.map((item) => ({
      id: stampRecordId(item.collection, item.id),
      title: item.title || item.id,
      table: tableLabel(item.collection),
      tablePath: item.collection,
      sourceId: item.id,
      tagId: id,
      ...recordBuiltinValues({ tag: store.recordTag(item.collection, item.id) }),
    }))
  }

  return {
    id: 'tags',
    path: TAGS_COLLECTION_PATH,
    label: '标签',
    view: {
      moduleId: 'tags-db',
      route: '/db-tags',
      title: '标签',
      inspector: true,
      blurb: '工作区全局标签定义，可贴到任意表的记录。列表 db_list /tags；某标签已贴过哪些记录用 filter.tagId。新建 db_create /tags records=[{title}]（id 由标题 slug）。改名或属性 db_update /tags/<id>，fields 传数组或 JSON 字符串均可，例 [{"key":"类别","type":"string"}]；同一标签下属性名不能重复；type 必须是白名单（string 不是 text）。三视图走记录 catalog，源码 db_file path=/tags/<id> name=<file>。其它表 db_list 读属性列用 tag::<标签id>::<字段key>。正文 notes 用 db_content。把标签贴到记录并填属性：db_update 那条记录的 tag。删除 db_delete 或 db_action action=delete（进回收站）。',
      order: 31,
      icon: 'tag',
    },
    records: { update: true, create: true, delete: true, allocateId: false },
    schema: {
      contentField: 'notes',
      contentBackend: 'editorContent',
      columns: ['title', 'fieldCount', 'stampCount'],
      fields: {
        title: { type: 'string', label: '标签', writable: true },
        fieldCount: { type: 'number', label: '字段', computed: true },
        stampCount: { type: 'number', label: '收集', computed: true, sortable: true },
        fields: {
          type: 'string',
          label: '属性',
          writable: true,
          description: TAG_FIELDS_DESCRIPTION,
          example: TAG_FIELDS_EXAMPLE,
        },
        notes: { type: 'file', label: '正文', writable: true },
        table: { type: 'string', label: '来源表', computed: true },
        tablePath: { type: 'string', label: '表路径', computed: true },
        sourceId: { type: 'string', label: '记录', computed: true },
        tagId: { type: 'string', label: '标签', computed: true },
      },
    },
    list: (query?: CollectionListQuery) => {
      const tagFilter = String(query?.filter?.tagId ?? '').trim()
      let listed = tagFilter ? stampRows(tagFilter) : tagRows()
      if (query?.ids?.length) {
        const want = new Set(query.ids)
        listed = listed.filter((row) => want.has(row.id))
      }
      const q = query?.q?.trim().toLowerCase() ?? ''
      if (q) {
        listed = listed.filter((row) => `${row.id} ${row.title} ${row.table ?? ''} ${row.notes ?? ''}`.toLowerCase().includes(q))
      }
      return listed
    },
    get: (id) => {
      const stamp = parseStampRecordId(id)
      if (stamp) {
        for (const tag of store.list()) {
          const hit = stampRows(tag.id).find((row) => row.id === id)
          if (hit) return hit
        }
        return null
      }
      const pack = store.get(id)
      if (!pack || store.isDeleted(TAGS_COLLECTION_PATH, pack.id)) return null
      return fromEntry(pack.id, store.stampCounts()[pack.id] ?? 0)
    },
    create: (rows) =>
      rows.map((fields = {}) => {
        const title = String(fields.title ?? '').trim() || '未命名标签'
        const used = new Set([...store.list().map((tag) => tag.id), ...store.deletedIds(TAGS_COLLECTION_PATH)])
        const id = slugTagId(title, used)
        const pack = store.upsert({ id, label: title, fields: parseAtomicFields(fields.fields) }, fields.notes != null ? String(fields.notes) : '')
        return fromEntry(pack.id, 0)
      }),
    update: (id, patch) => {
      if (parseStampRecordId(id)) throw new Error(`cannot update collected row: ${id}`)
      const current = store.get(id)
      if (!current) throw new Error(`unknown 标签: ${id}`)
      const label = patch.title != null ? String(patch.title).trim() || current.label : current.label
      const fields = patch.fields != null ? parseAtomicFields(patch.fields, { existingFields: current.fields }) : current.fields
      const notes = patch.notes != null ? String(patch.notes) : store.notes(current.id)
      const pack = store.upsert({ id: current.id, label, fields }, notes)
      return fromEntry(pack.id, store.stampCounts()[pack.id] ?? 0)
    },
    remove: (query) => {
      const ids = query.ids ?? []
      for (const id of ids) {
        if (parseStampRecordId(id)) throw new Error(`cannot delete collected row: ${id}`)
        if (!store.removeTag(id)) throw new Error(`unknown 标签: ${id}`)
      }
      return ids
    },
    actions: [
      {
        id: 'delete',
        label: '删除',
        for: 'both',
        placement: ['row', 'detail'],
        tone: 'danger',
        when: { sourceId: '' },
        requiredAction: 'resource:delete',
        description: '软删除：把这条标签放进回收站，列表不再显示。恢复走 /trash。',
      },
    ],
  }
}
