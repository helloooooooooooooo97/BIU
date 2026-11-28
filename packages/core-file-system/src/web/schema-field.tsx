import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  TAG_PROPERTY_TYPES,
  normalizeSchemaValue,
  retagSchemaValue,
  type AtomicFieldType,
  type CollectionSchemaPack,
  type DbRecord,
  type FieldType,
  type SchemaFieldValue,
  type SchemaPackField,
} from '@biu/type-file-system'
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  InformationCircleIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { TagChip, TagChips, tagTone, HeadlessPopover } from '@biu/biu-ui'
import { TAGS_COLLECTION_PATH } from './database-path.ts'
import { DefaultCell, FieldGlyph } from './fsdb-cells.tsx'
import { FieldValuePop } from './field-value-pop.tsx'
import { PropertyDescriptionPop } from './property-row.tsx'
import {
  adaptTagFieldValue,
  formatRawValuePreview,
  inferPackFieldType,
  isLossyFieldTypeChange,
  orphanPackEntries,
  retainArchivedSchemaValue,
} from './fields.ts'
import { createTag, tagFieldLabelOk, tagLabel, jumpTag, loadTags, persistTags, registerTagFieldKey, subscribeTags } from './tag-catalog.ts'
import { peekRecord, subscribeCrumbs } from './view-storage.ts'

const TYPE_LABEL: Partial<Record<FieldType, string>> = {
  string: '文本',
  number: '数字',
  boolean: '是/否',
  select: '单选',
  'multi-select': '多选',
  datetime: '时间',
  url: '链接',
  image: '图片',
  attachment: '附件',
  document: '文档',
  file: '正文',
  action: '动作',
  tag: '标签',
  person: '人物',
  ref: '引用',
  'multi-ref': '多引用',
}

export const schemaTagTone = tagTone

export function tagChipIcon(id: string) {
  const emoji = peekRecord(TAGS_COLLECTION_PATH, id)?.emoji?.trim()
  if (emoji) return <span className="fsdb-record-emoji">{emoji}</span>
  return <TagIcon aria-hidden className="size-3.5" />
}

export function tagPropertyCount(tag: { fields?: Array<{ deleted?: boolean }> } | undefined) {
  return (tag?.fields ?? []).filter((field) => !field.deleted).length
}

export function tagChipLabel(tag: { id?: string; label?: string; fields?: Array<{ deleted?: boolean }> } | undefined, fallback = '') {
  const name = String(tag?.label || tagLabel(fallback || tag?.id || '') || fallback || tag?.id || '').trim()
  if (!name) return fallback
  return `${name} ${tagPropertyCount(tag)}`
}

export function SchemaChip({
  id,
  label,
  onRemove,
  onClick,
  active,
  icon,
}: {
  id: string
  label: string
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
  icon?: ReactNode
}) {
  return <TagChip id={id} label={label} icon={icon ?? tagChipIcon(id)} onRemove={onRemove} onClick={onClick} active={active} />
}

/** 标签「属性」列：和详情里一样，一个字段一枚带类型图标的标签。 */
export function TagFieldChips({ value }: { value: unknown }) {
  let listed: unknown = value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    try {
      listed = JSON.parse(text)
    } catch {
      return null
    }
  }
  if (!Array.isArray(listed)) return null
  const fields = listed.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    if (row.deleted === true) return []
    const label = String(row.label ?? row.key ?? '').trim()
    if (!label) return []
    const type = String(row.type ?? 'string') as FieldType
    return [{ key: String(row.key ?? label), type, label }]
  })
  if (!fields.length) return null
  return (
    <TagChips>
      {fields.map((field) => (
        <SchemaChip key={field.key} id={field.key} label={field.label} icon={<FieldGlyph kind={field.type} />} />
      ))}
    </TagChips>
  )
}

export function SchemaChips({
  value,
  tags,
  onOpen,
}: {
  value: unknown
  tags: CollectionSchemaPack[]
  onOpen?: (id: string) => void
}) {
  const parsed = normalizeSchemaValue(value)
  if (!parsed.tags.length) return null
  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  return (
    <TagChips>
      {parsed.tags.map((id) => (
        <SchemaChip key={id} id={id} label={tagChipLabel(byId.get(id), id)} onClick={() => jumpTag(id, onOpen)} />
      ))}
    </TagChips>
  )
}

function TypeMenu({ value, onChange }: { value: AtomicFieldType; onChange: (next: AtomicFieldType) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fsdb-schema-type">
      <HeadlessPopover
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button type="button" className="fsdb-schema-type-btn">
            <FieldGlyph kind={value} />
            <span>{TYPE_LABEL[value]}</span>
            <ChevronDownIcon aria-hidden className="size-3 fsdb-schema-type-caret" />
          </button>
        }
      >
        <div className="fsdb-schema-type-menu" role="listbox">
          {TAG_PROPERTY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`fsdb-schema-type-option${type === value ? ' is-on' : ''}`}
              onClick={() => {
                onChange(type)
                setOpen(false)
              }}
            >
              <FieldGlyph kind={type} />
              {TYPE_LABEL[type]}
            </button>
          ))}
        </div>
      </HeadlessPopover>
    </div>
  )
}

function SchemaPropName({
  name,
  kind,
  description,
  onRename,
  onDescribe,
}: {
  name: string
  kind: FieldType
  description?: string
  onRename?: (next: string) => boolean | void
  onDescribe?: (next: string) => void
}) {
  const desc = String(description ?? '').trim()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [descDraft, setDescDraft] = useState(desc)
  const [showDesc, setShowDesc] = useState(Boolean(desc))
  const [error, setError] = useState('')
  const wrapRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const descInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(name)
  }, [name])

  useEffect(() => {
    setDescDraft(desc)
    if (desc) setShowDesc(true)
  }, [desc])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function finish(next = name, nextDesc = desc) {
    setEditing(false)
    setDraft(next)
    setDescDraft(nextDesc)
    setShowDesc(Boolean(nextDesc))
    setError('')
  }

  function commit() {
    const next = draft.trim()
    const nextDesc = descDraft.trim()
    let finalName = name
    if (next && next !== name) {
      if (onRename?.(next) === false) {
        setError('不能与系统字段或已有属性重名')
        return
      }
      finalName = next
    }
    if (onDescribe && nextDesc !== desc) {
      onDescribe(nextDesc)
    }
    finish(finalName, nextDesc)
  }

  if (!onRename) {
    return (
      <span className="fsdb-schema-prop-k">
        <FieldGlyph kind={kind} />
        <span className="fsdb-schema-prop-name" title={name}>{name}</span>
        {desc ? <PropertyDescriptionPop label={name} description={desc} /> : null}
      </span>
    )
  }

  if (!editing) {
    return (
      <span className="fsdb-schema-prop-k-row">
        <button
          type="button"
          className="fsdb-schema-prop-k is-rename"
          title={`编辑 ${name}`}
          onClick={() => {
            setShowDesc(Boolean(desc))
            setEditing(true)
          }}
        >
          <FieldGlyph kind={kind} />
          <span className="fsdb-schema-prop-name">{name}</span>
        </button>
        {desc ? <PropertyDescriptionPop label={name} description={desc} /> : null}
      </span>
    )
  }

  return (
    <span
      ref={wrapRef}
      className="fsdb-schema-prop-k is-editing"
      onBlur={(event) => {
        if (event.relatedTarget && wrapRef.current?.contains(event.relatedTarget as Node)) return
        commit()
      }}
    >
      <span className="fsdb-schema-prop-edit-row">
        <FieldGlyph kind={kind} />
        <input
          ref={inputRef}
          className="fsdb-schema-prop-rename"
          value={draft}
          aria-label={`重命名 ${name}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              finish()
            }
          }}
        />
        {onDescribe ? (
          <button
            type="button"
            className={`fsdb-schema-prop-info-btn${showDesc ? ' is-on' : ''}`}
            aria-label={showDesc ? '收起属性说明' : '编辑属性说明'}
            aria-pressed={showDesc}
            data-dock-tip="属性说明"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const nextOpen = !showDesc
              setShowDesc(nextOpen)
              if (nextOpen) requestAnimationFrame(() => descInputRef.current?.focus())
            }}
          >
            <InformationCircleIcon aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </span>
      {onDescribe && showDesc ? (
        <input
          ref={descInputRef}
          className="fsdb-schema-prop-desc"
          value={descDraft}
          placeholder="添加属性说明..."
          aria-label={`${name} 属性说明`}
          onChange={(event) => setDescDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              finish()
            }
          }}
        />
      ) : null}
      {error ? <span className="fsdb-schema-addprop-err">{error}</span> : null}
    </span>
  )
}

export function AddProperty({ onAdd }: { onAdd: (label: string, type: AtomicFieldType) => boolean | void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<AtomicFieldType>('string')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function commit() {
    const name = label.trim()
    if (!name) {
      setOpen(false)
      setError('')
      return
    }
    if (onAdd(name, type) === false) {
      setError('不能与系统字段或已有属性重名')
      return
    }
    setLabel('')
    setType('string')
    setError('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button type="button" className="fsdb-schema-addprop" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden className="size-3.5" />
        添加属性
      </button>
    )
  }

  return (
    <div className="fsdb-schema-addprop-form">
      <input
        ref={inputRef}
        className="fsdb-schema-addprop-input"
        value={label}
        placeholder=""
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
          if (event.key === 'Escape') {
            setOpen(false)
            setLabel('')
            setError('')
          }
        }}
        onBlur={(event) => {
          if (event.relatedTarget && event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) return
          if (!label.trim()) setOpen(false)
        }}
      />
      <TypeMenu value={type} onChange={setType} />
      <button type="button" className="fsdb-schema-addprop-ok" disabled={!label.trim()} onClick={commit}>
        添加
      </button>
      {error ? <span className="fsdb-schema-addprop-err">{error}</span> : null}
    </div>
  )
}

function persistPack(pack: CollectionSchemaPack) {
  void persistTags([pack])
}

function copyValueToClipboard(value: unknown) {
  const text = formatRawValuePreview(value, 4000)
  if (!text) return
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => undefined)
  }
}

function updateFieldType(fields: SchemaPackField[], key: string, nextType: AtomicFieldType): SchemaPackField[] {
  return fields.map((row) => {
    if (row.key !== key) return row
    const keepEnum =
      (row.type === 'select' || row.type === 'multi-select') &&
      (nextType === 'select' || nextType === 'multi-select')
    const updated: SchemaPackField = { ...row, type: nextType }
    if (!keepEnum) {
      delete updated.enum
      delete updated.enumLabels
    }
    return updated
  })
}

function softDeleteField(fields: SchemaPackField[], key: string): SchemaPackField[] {
  return fields.map((row) => (row.key === key ? { ...row, deleted: true } : row))
}

function restoreArchivedField(fields: SchemaPackField[], key: string): SchemaPackField[] {
  return fields.map((row) => {
    if (row.key !== key) return row
    const next = { ...row }
    delete next.deleted
    return next
  })
}

export function TagPackEditor({ tagId }: { tagId: string }) {
  const [catalog, setCatalog] = useState(() => loadTags())
  const [typeNotice, setTypeNotice] = useState('')
  const [archivedOpen, setArchivedOpen] = useState(false)
  useEffect(() => subscribeTags(undefined, () => setCatalog(loadTags())), [])
  const tag = catalog.find((item) => item.id === tagId)

  if (!tag) return <p className="fsdb-muted">这条标签已不在目录里。</p>
  const pack = tag
  const live = pack.fields.filter((field) => !field.deleted)
  const archived = pack.fields.filter((field) => field.deleted)

  function addField(name: string, type: AtomicFieldType) {
    const clean = name.trim()
    const deletedMatch = pack.fields.find(
      (item) => item.deleted && (item.label ?? item.key).trim().toLowerCase() === clean.toLowerCase(),
    )
    if (deletedMatch) {
      persistPack({
        ...pack,
        fields: pack.fields.map((row) => {
          if (row.key !== deletedMatch.key) return row
          const restored: SchemaPackField = { ...row, type, label: clean }
          delete restored.deleted
          return restored
        }),
      })
      setTypeNotice(`已恢复同名归档字段「${clean}」，关联的历史数据将自动回显。`)
      return true
    }
    const key = registerTagFieldKey(name, {
      keys: pack.fields.map((item) => item.key),
      labels: live.map((item) => item.label ?? item.key),
    })
    if (!key) return false
    const field: SchemaPackField = { key, type, label: clean, writable: true }
    persistPack({ ...pack, fields: [...pack.fields, field] })
    return true
  }

  function renameField(from: string, name: string) {
    const others = live.filter((item) => item.key !== from)
    if (!tagFieldLabelOk(name, others.map((item) => item.label ?? item.key))) return false
    const label = name.trim()
    persistPack({
      ...pack,
      fields: pack.fields.map((row) => {
        if (row.key !== from) return row
        return { ...row, label }
      }),
    })
    return true
  }

  function describeField(key: string, next: string) {
    const desc = next.trim()
    persistPack({
      ...pack,
      fields: pack.fields.map((row) => {
        if (row.key !== key) return row
        const updated = { ...row }
        if (desc) updated.description = desc
        else delete updated.description
        return updated
      }),
    })
  }

  function changeFieldType(key: string, nextType: AtomicFieldType) {
    const current = pack.fields.find((row) => row.key === key)
    if (!current || current.type === nextType) return
    persistPack({ ...pack, fields: updateFieldType(pack.fields, key, nextType) })
    const label = current.label ?? current.key
    if (isLossyFieldTypeChange(current.type, nextType)) {
      setTypeNotice(
        `已将「${label}」切换为${TYPE_LABEL[nextType] ?? nextType}：历史旧值已原样保留，不兼容值会在对应记录标出，切回「${TYPE_LABEL[current.type] ?? current.type}」可无损还原。`,
      )
    } else {
      setTypeNotice('')
    }
  }

  function removeField(key: string) {
    const target = pack.fields.find((row) => row.key === key)
    persistPack({ ...pack, fields: softDeleteField(pack.fields, key) })
    if (target) {
      setTypeNotice(`已归档字段「${target.label ?? target.key}」：历史数据未删除，可在下方「已归档字段」或记录属性区随时恢复。`)
    }
  }

  function restoreFieldByKey(key: string) {
    persistPack({ ...pack, fields: restoreArchivedField(pack.fields, key) })
    setTypeNotice('')
  }

  return (
    <div className="fsdb-schema" data-testid="fsdb-tag-fields">
      {live.length ? (
        <TagChips>
          {live.map((field) => (
            <SchemaChip
              key={field.key}
              id={field.key}
              label={field.label ?? field.key}
              icon={<FieldGlyph kind={field.type} />}
            />
          ))}
        </TagChips>
      ) : (
        <span className="fsdb-muted">添加属性</span>
      )}
      {typeNotice ? (
        <div className="fsdb-schema-compat-notice" data-testid="fsdb-type-change-hint" role="status">
          <span>{typeNotice}</span>
          <button type="button" className="fsdb-schema-compat-close" aria-label="关闭提示" onClick={() => setTypeNotice('')}>
            <XMarkIcon aria-hidden className="size-3" />
          </button>
        </div>
      ) : null}
      <div className="fsdb-schema-pack">
        <div className="fsdb-schema-pack-inner">
          {live.map((field) => (
            <div key={field.key} className="fsdb-schema-prop">
              <SchemaPropName
                name={field.label ?? field.key}
                kind={field.type}
                description={field.description}
                onRename={(next) => renameField(field.key, next)}
                onDescribe={(next) => describeField(field.key, next)}
              />
              <div className="fsdb-schema-prop-v">
                <span className="fsdb-schema-prop-type">
                  <TypeMenu value={field.type} onChange={(next) => changeFieldType(field.key, next)} />
                </span>
                <button type="button" className="fsdb-schema-prop-del" aria-label={`删除 ${field.label ?? field.key}`} onClick={() => removeField(field.key)}>
                  <XMarkIcon aria-hidden className="size-3" />
                </button>
              </div>
            </div>
          ))}
          <AddProperty onAdd={addField} />
          {archived.length ? (
            <div className="fsdb-schema-archived" data-testid="fsdb-tag-archived-fields">
              <button
                type="button"
                className="fsdb-schema-archived-head"
                aria-expanded={archivedOpen}
                onClick={() => setArchivedOpen((open) => !open)}
              >
                <ArchiveBoxIcon aria-hidden className="size-3.5" />
                <span>已归档字段（{archived.length}）</span>
                <ChevronDownIcon aria-hidden className={`size-3 fsdb-schema-archived-caret${archivedOpen ? ' is-open' : ''}`} />
              </button>
              {archivedOpen
                ? archived.map((field) => (
                    <div key={`archived:${field.key}`} className="fsdb-schema-prop is-orphan">
                      <span className="fsdb-schema-prop-k" title={field.label ?? field.key}>
                        <FieldGlyph kind={field.type} />
                        <span className="fsdb-schema-prop-name">{field.label ?? field.key}</span>
                      </span>
                      <div className="fsdb-schema-prop-v">
                        <span className="fsdb-muted">{TYPE_LABEL[field.type] ?? field.type}</span>
                        <button
                          type="button"
                          className="fsdb-schema-prop-restore"
                          aria-label={`恢复 ${field.label ?? field.key}`}
                          data-dock-tip="恢复"
                          onClick={() => restoreFieldByKey(field.key)}
                        >
                          <ArrowUturnLeftIcon aria-hidden className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function SchemaFieldEditor({
  collectionPath: _collectionPath,
  record,
  value,
  writable,
  onChange,
  compact,
}: {
  collectionPath: string
  record: DbRecord
  value: unknown
  writable?: boolean
  onChange: (next: SchemaFieldValue) => void
  /** Table cells: chips only — pack fields flatten as their own columns. */
  compact?: boolean
}) {
  const parsed = normalizeSchemaValue(value)
  const liveRef = useRef(parsed)
  liveRef.current = parsed
  const [catalog, setCatalog] = useState(() => loadTags())
  const [, setTagMarks] = useState(0)
  const [collectorOpen, setCollectorOpen] = useState(true)
  const [typeNotice, setTypeNotice] = useState('')

  useEffect(() => subscribeTags(undefined, () => setCatalog(loadTags())), [])
  useEffect(() => subscribeCrumbs(() => setTagMarks((n) => n + 1)), [])

  const shown = retainArchivedSchemaValue(value, catalog)
  const catalogById = useMemo(() => new Map(catalog.map((tag) => [tag.id, tag])), [catalog])
  const selected = useMemo(
    () =>
      parsed.tags
        .filter((id) => catalogById.has(id))
        .map((id) => catalogById.get(id)!),
    [catalogById, parsed.tags],
  )
  const detachedOrphans = useMemo(() => {
    const entries: Array<{
      tagId: string
      tagLabel: string
      key: string
      label: string
      type: AtomicFieldType
      value: unknown
    }> = []
    for (const [tagId, bag] of Object.entries(shown.values)) {
      if (catalogById.has(tagId)) continue
      for (const orphan of orphanPackEntries([], bag)) {
        entries.push({
          tagId,
          tagLabel: tagLabel(tagId),
          ...orphan,
        })
      }
    }
    return entries
  }, [catalogById, shown.values])

  function patchValue(next: SchemaFieldValue, packs = catalog) {
    const cleaned = retainArchivedSchemaValue(next, packs)
    liveRef.current = cleaned
    onChange(cleaned)
  }

  function dismissOrphan(tagId: string, key: string) {
    const currentBag = { ...(parsed.values[tagId] ?? {}) }
    currentBag[key] = null
    const nextValues = { ...parsed.values, [tagId]: currentBag }
    // 本地预览移除该项，同时把 null 传给服务端让 applyTagBagPatch 显式清理该归档 key
    const localBag = { ...currentBag }
    delete localBag[key]
    liveRef.current = { tags: parsed.tags, values: { ...parsed.values, [tagId]: localBag } }
    onChange({ tags: parsed.tags, values: nextValues })
  }

  function finishTags(resolved: string[]) {
    const next = retagSchemaValue(liveRef.current, resolved)
    liveRef.current = next
    patchValue(next)
  }

  function applyTags(nextIds: string[]) {
    let packs = catalog
    const used = new Set(packs.map((tag) => tag.id))
    const resolved: string[] = []
    const pending: string[] = []
    for (const item of nextIds) {
      if (used.has(item)) {
        resolved.push(item)
        continue
      }
      const hit = packs.find((tag) => tag.label === item)
      if (hit) {
        resolved.push(hit.id)
        continue
      }
      pending.push(item)
    }
    if (!pending.length) {
      finishTags(resolved)
      return
    }
    void (async () => {
      for (const item of pending) {
        const created = await createTag(item)
        packs = [...packs, created]
        used.add(created.id)
        resolved.push(created.id)
      }
      finishTags(resolved)
    })()
  }

  function addField(tag: CollectionSchemaPack, name: string, type: AtomicFieldType) {
    const clean = name.trim()
    const deletedMatch = tag.fields.find(
      (item) => item.deleted && (item.label ?? item.key).trim().toLowerCase() === clean.toLowerCase(),
    )
    if (deletedMatch) {
      persistPack({
        ...tag,
        fields: tag.fields.map((row) => {
          if (row.key !== deletedMatch.key) return row
          const restored: SchemaPackField = { ...row, type, label: clean }
          delete restored.deleted
          return restored
        }),
      })
      return true
    }
    const liveFields = tag.fields.filter((item) => !item.deleted)
    const key = registerTagFieldKey(name, {
      keys: tag.fields.map((item) => item.key),
      labels: liveFields.map((item) => item.label ?? item.key),
    })
    if (!key) return false
    const field: SchemaPackField = { key, type, label: clean, writable: true }
    persistPack({ ...tag, fields: [...tag.fields, field] })
    return true
  }

  function renameField(tag: CollectionSchemaPack, from: string, name: string) {
    const others = tag.fields.filter((item) => !item.deleted && item.key !== from)
    if (!tagFieldLabelOk(name, others.map((item) => item.label ?? item.key))) return false
    const label = name.trim()
    persistPack({
      ...tag,
      fields: tag.fields.map((row) => {
        if (row.key !== from) return row
        return { ...row, label }
      }),
    })
    return true
  }

  function describeField(tag: CollectionSchemaPack, key: string, next: string) {
    const desc = next.trim()
    persistPack({
      ...tag,
      fields: tag.fields.map((row) => {
        if (row.key !== key) return row
        const updated = { ...row }
        if (desc) updated.description = desc
        else delete updated.description
        return updated
      }),
    })
  }

  function changeFieldType(tag: CollectionSchemaPack, key: string, nextType: AtomicFieldType) {
    const current = tag.fields.find((item) => item.key === key)
    if (!current || current.type === nextType) return
    persistPack({ ...tag, fields: updateFieldType(tag.fields, key, nextType) })
    const label = current.label ?? current.key
    if (isLossyFieldTypeChange(current.type, nextType)) {
      setTypeNotice(
        `已将「${label}」切换为${TYPE_LABEL[nextType] ?? nextType}：旧值已原样保留，切回「${TYPE_LABEL[current.type] ?? current.type}」可无损恢复。`,
      )
    } else {
      setTypeNotice('')
    }
  }

  function removeField(tag: CollectionSchemaPack, key: string) {
    persistPack({ ...tag, fields: softDeleteField(tag.fields, key) })
  }

  function restoreField(tag: CollectionSchemaPack, key: string, value: unknown) {
    const hit = catalog.find((item) => item.id === tag.id)
    const kept = hit?.fields.find((item) => item.key === key)
    if (kept && !kept.deleted) return
    if (kept?.deleted && hit) {
      persistPack({
        ...hit,
        fields: restoreArchivedField(hit.fields, key),
      })
      return
    }
    const type = inferPackFieldType(value)
    const field: SchemaPackField = { key, type, writable: true }
    if (hit) {
      persistPack({ ...hit, fields: [...hit.fields, field] })
      return
    }
    persistPack({ id: tag.id, label: tag.label, fields: [field] })
  }

  const tagPop = (
    <FieldValuePop
      record={record}
      fieldKey="tag"
      field={{ type: 'tag', writable: true }}
      value={value}
      collectionPath={_collectionPath}
      onSubmit={(next) => onChange(normalizeSchemaValue(next))}
    />
  )
  if (!writable) return <SchemaChips value={value} tags={catalog} />
  if (!parsed.tags.length && !detachedOrphans.length) return tagPop

  return (
    <div className="fsdb-schema" data-testid="fsdb-schema">
      {tagPop}
      {typeNotice && !compact ? (
        <div className="fsdb-schema-compat-notice" data-testid="fsdb-type-change-hint" role="status">
          <span>{typeNotice}</span>
          <button type="button" className="fsdb-schema-compat-close" aria-label="关闭提示" onClick={() => setTypeNotice('')}>
            <XMarkIcon aria-hidden className="size-3" />
          </button>
        </div>
      ) : null}
      {compact
        ? null
        : selected.map((tag) => {
        const bag = shown.values[tag.id] ?? {}
        const orphans = orphanPackEntries(tag.fields, bag)
        return (
          <div key={tag.id} className="fsdb-schema-pack">
            <div className="fsdb-schema-pack-inner">
            <div className="fsdb-schema-pack-head">
              <SchemaChip
                id={tag.id}
                label={tagChipLabel(tag)}
                onClick={() => jumpTag(tag.id)}
                onRemove={() => applyTags(parsed.tags.filter((id) => id !== tag.id))}
              />
            </div>
            {tag.fields.filter((field) => !field.deleted).map((field) => {
              const rawVal = bag[field.key]
              const adapted = adaptTagFieldValue(field, rawVal)
              return (
                <div key={field.key} className={`fsdb-schema-prop${adapted.incompatible ? ' is-mismatch' : ''}`}>
                  <SchemaPropName
                    name={field.label ?? field.key}
                    kind={field.type}
                    description={field.description}
                    onRename={(next) => renameField(tag, field.key, next)}
                    onDescribe={(next) => describeField(tag, field.key, next)}
                  />
                  <div className="fsdb-schema-prop-v">
                    <FieldValuePop
                      record={record}
                      fieldKey={field.key}
                      field={field}
                      value={rawVal}
                      collectionPath={_collectionPath}
                      onSubmit={(next) => {
                        const bagNext = { ...(parsed.values[tag.id] ?? {}) }
                        bagNext[field.key] = next
                        patchValue({ tags: parsed.tags, values: { ...parsed.values, [tag.id]: bagNext } })
                      }}
                    />
                    {adapted.incompatible ? (
                      <>
                        <button
                          type="button"
                          className="fsdb-schema-prop-restore"
                          aria-label={`复制 ${field.label ?? field.key} 原值`}
                          data-dock-tip="复制原值"
                          onClick={() => copyValueToClipboard(rawVal)}
                        >
                          <ClipboardDocumentIcon aria-hidden className="size-3" />
                        </button>
                        <button
                          type="button"
                          className="fsdb-schema-prop-restore"
                          aria-label={`清空 ${field.label ?? field.key} 不兼容值`}
                          data-dock-tip="清空"
                          onClick={() => {
                            const bagNext = { ...(parsed.values[tag.id] ?? {}) }
                            bagNext[field.key] = ''
                            patchValue({ tags: parsed.tags, values: { ...parsed.values, [tag.id]: bagNext } })
                          }}
                        >
                          <TrashIcon aria-hidden className="size-3" />
                        </button>
                      </>
                    ) : null}
                    <span className="fsdb-schema-prop-type-mini">
                      <TypeMenu value={field.type} onChange={(next) => changeFieldType(tag, field.key, next)} />
                    </span>
                    <button
                      type="button"
                      className="fsdb-schema-prop-del"
                      aria-label={`删除 ${field.label ?? field.key}`}
                      onClick={() => removeField(tag, field.key)}
                    >
                      <XMarkIcon aria-hidden className="size-3" />
                    </button>
                  </div>
                </div>
              )
            })}
            {orphans.length ? (
              <div className="fsdb-schema-archived" data-testid={`fsdb-pack-orphans-${tag.id}`}>
                <div className="fsdb-schema-archived-label">
                  <ArchiveBoxIcon aria-hidden className="size-3" />
                  <span>已归档属性（{orphans.length}）</span>
                </div>
                {orphans.map((orphan) => (
                  <div key={`orphan:${orphan.key}`} className="fsdb-schema-prop is-orphan">
                    <span className="fsdb-schema-prop-k" title={orphan.label}>
                      <FieldGlyph kind={orphan.type} />
                      <span className="fsdb-schema-prop-name">{orphan.label}</span>
                    </span>
                    <div className="fsdb-schema-prop-v">
                      <DefaultCell field={{ type: orphan.type, label: orphan.label, writable: false }} value={orphan.value} />
                      <button
                        type="button"
                        className="fsdb-schema-prop-restore"
                        aria-label={`复制 ${orphan.label}`}
                        data-dock-tip="复制值"
                        onClick={() => copyValueToClipboard(orphan.value)}
                      >
                        <ClipboardDocumentIcon aria-hidden className="size-3" />
                      </button>
                      <button
                        type="button"
                        className="fsdb-schema-prop-restore"
                        aria-label={`恢复 ${orphan.label}`}
                        data-dock-tip="恢复"
                        onClick={() => restoreField(tag, orphan.key, orphan.value)}
                      >
                        <ArrowUturnLeftIcon aria-hidden className="size-3" />
                      </button>
                      <button
                        type="button"
                        className="fsdb-schema-prop-restore"
                        aria-label={`清理 ${orphan.label}`}
                        data-dock-tip="清理"
                        onClick={() => dismissOrphan(tag.id, orphan.key)}
                      >
                        <TrashIcon aria-hidden className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <AddProperty onAdd={(name, type) => addField(tag, name, type)} />
            </div>
          </div>
        )
      })}
      {!compact && detachedOrphans.length ? (
        <div className="fsdb-schema-pack is-collector" data-testid="fsdb-orphan-collector">
          <div className="fsdb-schema-pack-inner">
            <button
              type="button"
              className="fsdb-schema-archived-head"
              aria-expanded={collectorOpen}
              onClick={() => setCollectorOpen((open) => !open)}
            >
              <ArchiveBoxIcon aria-hidden className="size-3.5" />
              <span>未归属属性（{detachedOrphans.length}）</span>
              <ChevronDownIcon aria-hidden className={`size-3 fsdb-schema-archived-caret${collectorOpen ? ' is-open' : ''}`} />
            </button>
            {collectorOpen
              ? detachedOrphans.map((orphan) => (
                  <div key={`detached:${orphan.tagId}:${orphan.key}`} className="fsdb-schema-prop is-orphan">
                    <span className="fsdb-schema-prop-k" title={`原属 ${orphan.tagLabel} · ${orphan.label}`}>
                      <FieldGlyph kind={orphan.type} />
                      <span className="fsdb-schema-prop-name">{orphan.label}</span>
                    </span>
                    <div className="fsdb-schema-prop-v">
                      <DefaultCell field={{ type: orphan.type, label: orphan.label, writable: false }} value={orphan.value} />
                      <button
                        type="button"
                        className="fsdb-schema-prop-restore"
                        aria-label={`复制 ${orphan.label}`}
                        data-dock-tip="复制值"
                        onClick={() => copyValueToClipboard(orphan.value)}
                      >
                        <ClipboardDocumentIcon aria-hidden className="size-3" />
                      </button>
                      <button
                        type="button"
                        className="fsdb-schema-prop-restore"
                        aria-label={`清理 ${orphan.label}`}
                        data-dock-tip="清理"
                        onClick={() => dismissOrphan(orphan.tagId, orphan.key)}
                      >
                        <TrashIcon aria-hidden className="size-3" />
                      </button>
                    </div>
                  </div>
                ))
              : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
