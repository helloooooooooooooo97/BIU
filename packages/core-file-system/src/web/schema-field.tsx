import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ATOMIC_FIELD_TYPES,
  normalizeSchemaValue,
  retagSchemaValue,
  type AtomicFieldType,
  type CollectionSchemaPack,
  type DbRecord,
  type FieldType,
  type SchemaFieldValue,
  type SchemaPackField,
} from '@biu/type-file-system'
import { ArrowUturnLeftIcon, ChevronDownIcon, PlusIcon, TagIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { TagChip, TagChips, tagTone, HeadlessPopover } from '@biu/biu-ui'
import { CellMulti } from '@biu/database-ui'
import { DefaultCell, FieldGlyph } from './fsdb-cells.tsx'
import { FieldValuePop } from './field-value-pop.tsx'
import { inferPackFieldType, orphanPackEntries } from './fields.ts'
import { facetFieldLabelOk, loadFacets, persistFacets, registerFacetFieldKey, slugFacetId, subscribeFacets } from './facet-catalog.ts'
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
  file: '正文',
  action: '动作',
  facet: '标签',
  person: '人物',
  ref: '引用',
  'multi-ref': '多引用',
}

export const schemaTagTone = tagTone

export function facetChipIcon(id: string) {
  const emoji = peekRecord('/facets', id)?.emoji?.trim()
  if (emoji) return <span className="fsdb-record-emoji">{emoji}</span>
  return <TagIcon aria-hidden className="size-3.5" />
}

export function SchemaChip({
  id,
  label,
  onRemove,
  onClick,
  active,
}: {
  id: string
  label: string
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
}) {
  return <TagChip id={id} label={label} icon={facetChipIcon(id)} onRemove={onRemove} onClick={onClick} active={active} />
}

export function SchemaChips({ value, tags }: { value: unknown; tags: CollectionSchemaPack[] }) {
  const parsed = normalizeSchemaValue(value)
  if (!parsed.tags.length) return null
  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  return (
    <TagChips>
      {parsed.tags.map((id) => (
        <SchemaChip key={id} id={id} label={byId.get(id)?.label ?? id} />
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
          {ATOMIC_FIELD_TYPES.map((type) => (
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
  onRename,
}: {
  name: string
  kind: FieldType
  onRename?: (next: string) => boolean | void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(name)
  }, [name])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function finish(next = name) {
    setEditing(false)
    setDraft(next)
    setError('')
  }

  function commit() {
    const next = draft.trim()
    if (!next || next === name) {
      finish()
      return
    }
    if (onRename?.(next) === false) {
      setError('不能与系统字段或已有属性重名')
      return
    }
    finish(next)
  }

  if (!onRename) {
    return (
      <span className="fsdb-schema-prop-k" title={name}>
        <FieldGlyph kind={kind} />
        {name}
      </span>
    )
  }

  if (!editing) {
    return (
      <button type="button" className="fsdb-schema-prop-k is-rename" title={`重命名 ${name}`} onClick={() => setEditing(true)}>
        <FieldGlyph kind={kind} />
        {name}
      </button>
    )
  }

  return (
    <span className="fsdb-schema-prop-k is-editing">
      <FieldGlyph kind={kind} />
      <input
        ref={inputRef}
        className="fsdb-schema-prop-rename"
        value={draft}
        aria-label={`重命名 ${name}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            finish()
          }
        }}
        onBlur={() => commit()}
      />
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

export function FacetPackEditor({ facetId }: { facetId: string }) {
  const [catalog, setCatalog] = useState(() => loadFacets())
  useEffect(() => subscribeFacets(undefined, () => setCatalog(loadFacets())), [])
  const tag = catalog.find((item) => item.id === facetId)

  function saveCatalog(next: CollectionSchemaPack[]) {
    void persistFacets(next)
  }

  if (!tag) return <p className="fsdb-muted">这条标签已不在目录里。</p>
  const pack = tag
  const live = pack.fields.filter((field) => !field.deleted)
  const retired = pack.fields.filter((field) => field.deleted)

  function addField(name: string, type: AtomicFieldType) {
    const key = registerFacetFieldKey(name, {
      keys: pack.fields.map((item) => item.key),
      labels: pack.fields.map((item) => item.label ?? item.key),
    })
    if (!key) return false
    const field: SchemaPackField = { key, type, label: name.trim(), writable: true }
    saveCatalog(catalog.map((item) => (item.id === pack.id ? { ...item, fields: [...item.fields, field] } : item)))
    return true
  }

  function renameField(from: string, name: string) {
    const others = pack.fields.filter((item) => item.key !== from)
    if (!facetFieldLabelOk(name, others.map((item) => item.label ?? item.key))) return false
    const label = name.trim()
    saveCatalog(
      catalog.map((item) =>
        item.id === pack.id
          ? {
              ...item,
              fields: item.fields.map((row) => {
                if (row.key !== from) return row
                const next = { ...row, label }
                if (label === row.key) delete next.label
                return next
              }),
            }
          : item,
      ),
    )
    return true
  }

  function removeField(key: string) {
    saveCatalog(
      catalog.map((item) =>
        item.id === pack.id
          ? { ...item, fields: item.fields.map((row) => (row.key === key ? { ...row, deleted: true } : row)) }
          : item,
      ),
    )
  }

  function restoreField(key: string) {
    saveCatalog(
      catalog.map((item) =>
        item.id === pack.id
          ? {
              ...item,
              fields: item.fields.map((row) => {
                if (row.key !== key) return row
                const next = { ...row }
                delete next.deleted
                return next
              }),
            }
          : item,
      ),
    )
  }

  return (
    <div className="fsdb-schema" data-testid="fsdb-facet-fields">
      {live.length ? (
        <TagChips>
          {live.map((field) => (
            <SchemaChip key={field.key} id={field.key} label={field.label ?? field.key} />
          ))}
        </TagChips>
      ) : (
        <span className="fsdb-muted">添加属性</span>
      )}
      <div className="fsdb-schema-pack">
      {live.map((field) => (
        <div key={field.key} className="fsdb-schema-prop">
          <SchemaPropName name={field.label ?? field.key} kind={field.type} onRename={(next) => renameField(field.key, next)} />
          <div className="fsdb-schema-prop-v">
            <span className="fsdb-muted">{TYPE_LABEL[field.type]}</span>
            <button type="button" className="fsdb-schema-prop-del" aria-label={`删除 ${field.label ?? field.key}`} onClick={() => removeField(field.key)}>
              <XMarkIcon aria-hidden className="size-3" />
            </button>
          </div>
        </div>
      ))}
      {retired.map((field) => (
        <div key={`retired:${field.key}`} className="fsdb-schema-prop is-orphan">
          <span className="fsdb-schema-prop-k" title={field.label ?? field.key}>
            <FieldGlyph kind={field.type} />
            {field.label ?? field.key}
          </span>
          <div className="fsdb-schema-prop-v">
            <span className="fsdb-muted">{TYPE_LABEL[field.type]}</span>
            <button
              type="button"
              className="fsdb-schema-prop-restore"
              aria-label={`恢复 ${field.label ?? field.key}`}
              data-dock-tip="恢复"
              onClick={() => restoreField(field.key)}
            >
              <ArrowUturnLeftIcon aria-hidden className="size-3" />
            </button>
          </div>
        </div>
      ))}
      <AddProperty onAdd={addField} />
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
  autoOpen = false,
}: {
  collectionPath: string
  record: DbRecord
  value: unknown
  writable?: boolean
  onChange: (next: SchemaFieldValue) => void
  /** Table cells: chips only — pack fields flatten as their own columns. */
  compact?: boolean
  autoOpen?: boolean
}) {
  const parsed = normalizeSchemaValue(value)
  const liveRef = useRef(parsed)
  useEffect(() => {
    liveRef.current = normalizeSchemaValue(value)
  }, [record.id])
  const [catalog, setCatalog] = useState(() => loadFacets())
  const [, setFacetMarks] = useState(0)

  useEffect(() => subscribeFacets(undefined, () => setCatalog(loadFacets())), [])
  useEffect(() => subscribeCrumbs(() => setFacetMarks((n) => n + 1)), [])

  const selected = useMemo(
    () =>
      parsed.tags.map((id) => catalog.find((tag) => tag.id === id) ?? { id, label: id, fields: [] }),
    [catalog, parsed.tags],
  )

  function saveCatalog(next: CollectionSchemaPack[]) {
    void persistFacets(next)
  }

  function patchValue(next: SchemaFieldValue) {
    onChange(next)
  }

  function applyTags(nextIds: string[]) {
    let packs = catalog
    const used = new Set(packs.map((tag) => tag.id))
    const resolved: string[] = []
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
      const id = slugFacetId(item, used)
      packs = [...packs, { id, label: item, fields: [] }]
      used.add(id)
      resolved.push(id)
    }
    const finish = () => {
      const next = retagSchemaValue(liveRef.current, resolved)
      liveRef.current = next
      patchValue(next)
    }
    if (packs !== catalog) {
      void persistFacets(packs).then(finish)
      return
    }
    finish()
  }

  function addField(tag: CollectionSchemaPack, name: string, type: AtomicFieldType) {
    const key = registerFacetFieldKey(name, {
      keys: tag.fields.map((item) => item.key),
      labels: tag.fields.map((item) => item.label ?? item.key),
    })
    if (!key) return false
    const field: SchemaPackField = { key, type, label: name.trim(), writable: true }
    saveCatalog(catalog.map((item) => (item.id === tag.id ? { ...item, fields: [...item.fields, field] } : item)))
    return true
  }

  function renameField(tag: CollectionSchemaPack, from: string, name: string) {
    const others = tag.fields.filter((item) => item.key !== from)
    if (!facetFieldLabelOk(name, others.map((item) => item.label ?? item.key))) return false
    const label = name.trim()
    saveCatalog(
      catalog.map((item) =>
        item.id === tag.id
          ? {
              ...item,
              fields: item.fields.map((row) => {
                if (row.key !== from) return row
                const next = { ...row, label }
                if (label === row.key) delete next.label
                return next
              }),
            }
          : item,
      ),
    )
    return true
  }

  function removeField(tagId: string, key: string) {
    saveCatalog(
      catalog.map((tag) =>
        tag.id === tagId
          ? { ...tag, fields: tag.fields.map((item) => (item.key === key ? { ...item, deleted: true } : item)) }
          : tag,
      ),
    )
  }

  function restoreField(tag: CollectionSchemaPack, key: string, value: unknown) {
    const hit = catalog.find((item) => item.id === tag.id)
    const kept = hit?.fields.find((item) => item.key === key)
    if (kept && !kept.deleted) return
    if (kept?.deleted) {
      saveCatalog(
        catalog.map((item) =>
          item.id === tag.id
            ? {
                ...item,
                fields: item.fields.map((row) => {
                  if (row.key !== key) return row
                  const next = { ...row }
                  delete next.deleted
                  return next
                }),
              }
            : item,
        ),
      )
      return
    }
    const type = inferPackFieldType(value)
    const field: SchemaPackField = { key, type, writable: true }
    if (hit) {
      saveCatalog(catalog.map((item) => (item.id === tag.id ? { ...item, fields: [...item.fields, field] } : item)))
      return
    }
    saveCatalog([...catalog, { id: tag.id, label: tag.label, fields: [field] }])
  }

  if (!writable) return <SchemaChips value={value} tags={catalog} />
  if (!parsed.tags.length) {
    return (
      <FieldValuePop
        record={record}
        fieldKey="facet"
        field={{ type: 'facet', writable: true }}
        value={value}
        collectionPath={_collectionPath}
        onSubmit={(next) => onChange(normalizeSchemaValue(next))}
      />
    )
  }

  return (
    <div className="fsdb-schema" data-testid="fsdb-schema">
      <CellMulti
        values={parsed.tags}
        options={catalog.map((tag) => ({ value: tag.id, label: tag.label, icon: facetChipIcon(tag.id) }))}
        onChange={applyTags}
        multiple
        autoOpen={autoOpen}
        removable={compact === true}
        placeholder="添加标签"
      />
      {compact
        ? null
        : selected.map((tag) => {
        const bag = parsed.values[tag.id] ?? {}
        const orphans = orphanPackEntries(tag.fields, bag)
        return (
          <div key={tag.id} className="fsdb-schema-pack">
            <div className="fsdb-schema-pack-head">
              <SchemaChip
                id={tag.id}
                label={tag.label}
                onRemove={() => applyTags(parsed.tags.filter((id) => id !== tag.id))}
              />
            </div>
            {tag.fields.filter((field) => !field.deleted).map((field) => (
              <div key={field.key} className="fsdb-schema-prop">
                <SchemaPropName name={field.label ?? field.key} kind={field.type} onRename={(next) => renameField(tag, field.key, next)} />
                <div className="fsdb-schema-prop-v">
                  <FieldValuePop
                    record={record}
                    fieldKey={field.key}
                    field={field}
                    value={bag[field.key]}
                    collectionPath={_collectionPath}
                    onSubmit={(next) => {
                      const bagNext = { ...(parsed.values[tag.id] ?? {}) }
                      bagNext[field.key] = next
                      patchValue({ tags: parsed.tags, values: { ...parsed.values, [tag.id]: bagNext } })
                    }}
                  />
                  <button
                    type="button"
                    className="fsdb-schema-prop-del"
                    aria-label={`删除 ${field.label ?? field.key}`}
                    onClick={() => removeField(tag.id, field.key)}
                  >
                    <XMarkIcon aria-hidden className="size-3" />
                  </button>
                </div>
              </div>
            ))}
            {orphans.map((orphan) => (
              <div key={`orphan:${orphan.key}`} className="fsdb-schema-prop is-orphan">
                <span className="fsdb-schema-prop-k" title={orphan.label}>
                  <FieldGlyph kind={orphan.type} />
                  {orphan.label}
                </span>
                <div className="fsdb-schema-prop-v">
                  <DefaultCell field={{ type: orphan.type, label: orphan.label, writable: false }} value={orphan.value} />
                  <button
                    type="button"
                    className="fsdb-schema-prop-restore"
                    aria-label={`恢复 ${orphan.label}`}
                    data-dock-tip="恢复"
                    onClick={() => restoreField(tag, orphan.key, orphan.value)}
                  >
                    <ArrowUturnLeftIcon aria-hidden className="size-3" />
                  </button>
                </div>
              </div>
            ))}
            <AddProperty onAdd={(name, type) => addField(tag, name, type)} />
          </div>
        )
      })}
    </div>
  )
}
