import { Fragment } from 'react'
import type { CollectionSchema, CollectionSchemaPack, DbRecord, FieldSpec } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { ensureTagChipStyle, tagTone as schemaTagTone } from '@biu/biu-ui/tag-chip'
import { readTagFieldValue } from '../query-logic.ts'
import {
  formatField,
  pinLabelColumn,
  contentFieldKey,
  resolveFieldType,
  defaultColumnKeys,
  flattenTagColumns,
  groupRecords,
  parseTagFlatColumnKey,
  tagColumnHeadLabel,
  tagColumnTagTip,
} from './fields.ts'
import { DefaultCell, FieldGlyph } from './fsdb-cells.tsx'
import { SchemaChips } from './schema-field.tsx'
import { loadTags } from './tag-catalog.ts'
import { RecordMark } from './record-mark.tsx'
import { TitleMetaIcons } from './browser-row-title.tsx'
import { crumbRecordLabel } from './sidebar-preview.ts'
import type { SavedView } from './saved-view.ts'

export function shareTableColumns(
  schema: CollectionSchema,
  view?: Partial<SavedView>,
  visibleKeys?: string[],
  tags: CollectionSchemaPack[] = [],
) {
  const body = contentFieldKey(schema)
  const tagCols = flattenTagColumns(tags)
  const tagByKey = new Map(tagCols.map((col) => [col.key, col]))
  const requested = visibleKeys?.length
    ? visibleKeys
    : view?.columns?.length
      ? view.columns
      : defaultColumnKeys(schema, Object.keys(schema.fields))
  const keys = pinLabelColumn(
    schema,
    requested.filter((key) => {
      if (key === body) return false
      const field = schema.fields[key] ?? tagByKey.get(key)?.field
      if (!field) return false
      const kind = resolveFieldType(field)
      return kind !== 'file' && kind !== 'action'
    }),
  )
  return keys
    .map((key) => {
      const tagCol = tagByKey.get(key)
      const field = schema.fields[key] ?? tagCol?.field
      if (!field) return null
      return {
        key,
        field,
        kind: resolveFieldType(field),
        packId: tagCol?.packId,
        packLabel: tagCol?.packLabel,
      }
    })
    .filter(Boolean) as Array<{
    key: string
    field: FieldSpec
    kind: ReturnType<typeof resolveFieldType>
    packId?: string
    packLabel?: string
  }>
}

export function ShareCell({
  row,
  fieldKey,
  field,
  records,
  collection,
  schema,
  chrome,
  onOpenLink,
  tags = [],
}: {
  row: DbRecord
  fieldKey: string
  field: FieldSpec
  records: DbRecord[]
  collection: string
  schema: CollectionSchema
  chrome?: CollectionChrome
  onOpenLink?: (id: string) => void
  tags?: CollectionSchemaPack[]
}) {
  const kind = resolveFieldType(field)
  const value = readTagFieldValue(row, fieldKey)
  const Custom = chrome?.cells?.[fieldKey]
  if (Custom) {
    return <Custom field={fieldKey} spec={field} value={value} record={row} fallback={formatField(field, value)} />
  }
  if (kind === 'tag') {
    return <SchemaChips value={value} tags={tags.length ? tags : loadTags()} onOpen={onOpenLink} />
  }
  return (
    <DefaultCell
      field={field}
      fieldKey={fieldKey}
      record={row}
      records={records}
      collectionPath={collection}
      labelField={schema.labelField}
      value={value}
      onOpenLink={onOpenLink}
    />
  )
}

export function ShareListTable({
  schema,
  view,
  records,
  collection,
  chrome,
  onOpen,
  columns,
  wrap,
  truncate,
  queryFields,
  onOpenLink,
  tags = [],
}: {
  schema: CollectionSchema
  view?: Partial<SavedView>
  records: DbRecord[]
  collection: string
  chrome?: CollectionChrome
  onOpen: (recordId: string) => void
  columns?: string[]
  wrap?: boolean
  truncate?: boolean
  queryFields?: Set<string>
  onOpenLink?: (id: string) => void
  tags?: CollectionSchemaPack[]
}) {
  ensureTagChipStyle()
  const listed = shareTableColumns(schema, view, columns, tags)
  const labelKey = schema.labelField
  const wrapCells = wrap ?? Boolean(view?.wrap)
  const truncateCells = truncate ?? view?.truncate !== false
  const groupBy = String(view?.groupBy ?? '').trim()
  const buckets = groupBy ? groupRecords(records, schema, groupBy, tags) : [{ key: '', label: '', rows: records }]

  return (
    <div className="tasks-table-wrap">
      <div className="tasks-table-stage">
        <div className="fsdb-check-rail" aria-hidden />
      <table
        className={`tasks-table${wrapCells ? ' is-wrap' : ''}${truncateCells ? ' is-truncate' : ''}`}
      >
        <thead>
          <tr>
            {listed.map((col) => {
              const flat = parseTagFlatColumnKey(col.key)
              const tone = flat ? schemaTagTone(flat.packId) : undefined
              const tagTip = tagColumnTagTip(col)
              return (
                <th
                  key={col.key}
                  className={tone ? 'is-tag-col' : undefined}
                  style={tone ? { ['--biu-tag' as string]: tone } : undefined}
                >
                  <span
                    className={`tasks-th${queryFields?.has(col.key) ? ' is-on' : ''}`}
                    title={tagTip || undefined}
                  >
                    <FieldGlyph kind={col.kind} />
                    {tagColumnHeadLabel(col)}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <Fragment key={bucket.key || 'all'}>
              {groupBy ? (
                <tr className="fsdb-group-row" data-testid="fsdb-share-group">
                  <td colSpan={listed.length}>
                    <header className="tasks-queue-ghead">
                      <span className="tasks-queue-glabel">{bucket.label}</span>
                      <span className="tasks-queue-count">{bucket.rows.length}</span>
                    </header>
                  </td>
                </tr>
              ) : null}
              {bucket.rows.map((row) => (
            <tr key={row.id} data-testid="fsdb-share-row" data-record-id={row.id} onClick={() => onOpen(row.id)}>
              {listed.map((col) => {
                const cell = (
                  <ShareCell
                    row={row}
                    fieldKey={col.key}
                    field={col.field}
                    records={records}
                    collection={collection}
                    schema={schema}
                    chrome={chrome}
                    onOpenLink={onOpenLink}
                    tags={tags}
                  />
                )
                return (
                  <td key={col.key}>
                    {col.key === labelKey ? (
                      <span className="fsdb-title-host">
                        <RecordMark record={row} Icon={chrome?.Icon} />
                        <span className="fsdb-title-text">
                          {chrome?.Title ? <chrome.Title record={row} label={crumbRecordLabel(row, labelKey)} /> : cell}
                        </span>
                        <TitleMetaIcons row={row} />
                      </span>
                    ) : (
                      <span className="fsdb-cell">{cell}</span>
                    )}
                  </td>
                )
              })}
            </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
