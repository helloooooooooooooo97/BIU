import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react'
import { GlobeAltIcon } from '@heroicons/react/16/solid'
import { TagChip, TagChips } from '@biu/biu-ui/tag-chip'
import { normalizeSchemaValue, type CollectionActionInfo, type CollectionInfo, type CollectionSchema, type DbRecord, type FieldSpec, type PersonValue } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { CellPop } from './cell-pop.tsx'
import { PLUGINS_COLLECTION_PATH, TAGS_COLLECTION_PATH } from './database-path.ts'
import {
  formatField,
  isRecordLinkField,
  parseTagFlatColumnKey,
  readTagFlatValue,
  resolveFieldType,
  tagSourceKey,
  uniqueValues,
} from './fields.ts'
import { ActionCell, BoolCell, DefaultCell, fieldActionId } from './fsdb-cells.tsx'
import { PersonFace } from './person-cell.tsx'
import { tagChipIcon, tagChipLabel } from './schema-field.tsx'
import { ShareRoleLabel, ShareScopeLabel } from './share-scope-label.tsx'
import { SourceTableCell } from './source-table-cell.tsx'
import { loadTags } from './tag-catalog.ts'

const SchemaFieldEditor = lazy(() => import('./schema-field.tsx').then((m) => ({ default: m.SchemaFieldEditor })))
const FieldValuePop = lazy(() => import('./field-value-pop.tsx').then((m) => ({ default: m.FieldValuePop })))
const CellPopDraft = lazy(() => import('./cell-pop-draft.tsx').then((m) => ({ default: m.CellPopDraft })))
const LazyShareRoleDetail = lazy(() => import('./share-chain-detail.tsx').then((m) => ({ default: m.ShareRoleDetail })))
const LazyShareScopeDetail = lazy(() => import('./share-chain-detail.tsx').then((m) => ({ default: m.ShareScopeDetail })))

function ShareRoleDetail(props: ComponentProps<typeof LazyShareRoleDetail>) {
  return (
    <Suspense fallback={<ShareRoleLabel label={props.label} />}>
      <LazyShareRoleDetail {...props} />
    </Suspense>
  )
}

function ShareScopeDetail(props: ComponentProps<typeof LazyShareScopeDetail>) {
  return (
    <Suspense fallback={<ShareScopeLabel label={props.label} />}>
      <LazyShareScopeDetail {...props} />
    </Suspense>
  )
}

export type CellPopState = {
  id: string
  key: string
  rowKey?: string
  seed?: string
}

export type BrowserCellContext = {
  collectionPath: string
  currentTable?: CollectionInfo
  localData: boolean
  localKnown: boolean
  schema?: CollectionSchema
  items: DbRecord[]
  tables: CollectionInfo[]
  chrome?: CollectionChrome
  onOpenTable?: (path: string, viewId?: string) => void
  jumpTag: (id: string) => void
  runAction: (row: DbRecord, action: CollectionActionInfo) => Promise<void> | void
  writeCellValue: (row: DbRecord, key: string, field: FieldSpec, next: unknown) => void
  writePatch: (row: DbRecord, patch: Record<string, unknown>) => Promise<void> | void
}

export function renderBrowserCell(
  ctx: BrowserCellContext,
  row: DbRecord,
  key: string,
  field: FieldSpec,
  surface: 'table' | 'detail' = 'detail',
): ReactNode {
  const {
    collectionPath,
    currentTable,
    localData,
    localKnown,
    schema,
    items,
    tables,
    chrome,
    onOpenTable,
    jumpTag,
    runAction,
    writeCellValue,
    writePatch,
  } = ctx

  if (key === 'shareScope') {
    const raw = String(row[key] ?? (localData ? '私人' : ''))
    const label = localData && raw === '空间' ? '私人' : raw
    const hasExternal = Boolean((row as { hasExternal?: unknown }).hasExternal)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ShareScopeDetail
          collection={collectionPath}
          recordId={row.id}
          label={label}
          tableLabel={currentTable?.label}
          builtin={collectionPath === PLUGINS_COLLECTION_PATH && row.builtin === true}
          localOnly={localKnown ? localData : null}
        />
        {hasExternal ? (
          <span
            data-testid="fsdb-share-external-badge"
            title="已对外公开或邀请外部访客"
            aria-label="已对外公开或邀请外部访客"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--biu-color-accent, var(--biu-color-emphasis))',
            }}
          >
            <GlobeAltIcon aria-hidden className="size-[14px]" />
          </span>
        ) : null}
      </span>
    )
  }
  if (key === 'shareRole') {
    return (
      <ShareRoleDetail
        collection={collectionPath}
        recordId={row.id}
        label={String(row[key] ?? '')}
        tableLabel={currentTable?.label}
        builtin={collectionPath === PLUGINS_COLLECTION_PATH && row.builtin === true}
        localOnly={localKnown ? localData : null}
      />
    )
  }
  const kind = resolveFieldType(field)
  const flat = parseTagFlatColumnKey(key)
  if (surface === 'table') {
    if (kind === 'boolean') {
      const raw = flat ? readTagFlatValue(row, key, tagSourceKey(schema)) : row[key]
      const on = raw === true || raw === 'true'
      if (field.writable) {
        return <BoolCell on={on} writable onToggle={() => writeCellValue(row, key, field, !on)} />
      }
      return <BoolCell on={on} />
    }
    if (kind === 'action') {
      const actionId = fieldActionId(key, field)
      const action = (schema?.actions ?? []).find((item) => item.id === actionId)
      return <ActionCell field={field} fieldKey={key} onRun={action ? () => void runAction(row, action) : undefined} />
    }
    if (kind === 'tag') {
      const tags = loadTags()
      const parsed = normalizeSchemaValue(row[key])
      if (!parsed.tags.length) return null
      return (
        <TagChips>
          {parsed.tags.map((id) => (
            <TagChip
              key={id}
              id={id}
              label={tagChipLabel(tags.find((tag) => tag.id === id), id)}
              icon={tagChipIcon(id)}
              onClick={() => jumpTag(id)}
            />
          ))}
        </TagChips>
      )
    }
    if (flat) {
      return (
        <DefaultCell
          field={field}
          fieldKey={key}
          records={isRecordLinkField(field, key) ? items : undefined}
          collectionPath={collectionPath}
          labelField={schema?.labelField}
          value={readTagFlatValue(row, key, tagSourceKey(schema))}
          onChange={
            field.writable && (kind === 'attachment' || kind === 'document' || kind === 'datetime')
              ? (next) => writeCellValue(row, key, field, next)
              : undefined
          }
        />
      )
    }
    const Custom = chrome?.cells?.[key]
    if (Custom) return <Custom field={key} spec={field} value={row[key]} record={row} fallback={formatField(field, row[key])} />
    if (key === 'table') {
      return <SourceTableCell record={row} tables={tables} onOpenTable={onOpenTable} />
    }
    return (
      <DefaultCell
        field={field}
        fieldKey={key}
        record={row}
        records={isRecordLinkField(field, key) ? items : undefined}
        collectionPath={collectionPath}
        labelField={schema?.labelField}
        value={row[key]}
        onChange={
          field.writable && (kind === 'attachment' || kind === 'document' || kind === 'datetime')
            ? (next) => writeCellValue(row, key, field, next)
            : undefined
        }
      />
    )
  }
  if (flat) {
    const source = tagSourceKey(schema)
    const value = readTagFlatValue(row, key, source)
    if (field.writable && kind !== 'file') {
      return (
        <Suspense fallback={<DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={value} />}>
          <FieldValuePop
            record={row}
            fieldKey={key}
            field={field}
            value={value}
            collectionPath={collectionPath}
            getOptions={() =>
              uniqueValues(
                items.map((item) => ({ ...item, [key]: readTagFlatValue(item, key, source) })),
                key,
                field,
              )
            }
            records={items}
            labelField={schema?.labelField}
            onSubmit={(next) => writeCellValue(row, key, field, next)}
          />
        </Suspense>
      )
    }
    return <DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={value} />
  }
  if (kind === 'tag') {
    if (field.writable) {
      return (
        <Suspense fallback={<DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={row[key]} />}>
          <SchemaFieldEditor
            collectionPath={collectionPath}
            record={row}
            value={row[key]}
            writable
            onChange={(next) => void writePatch(row, { [key]: next })}
          />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={row[key]} />}>
        <FieldValuePop
          record={row}
          fieldKey={key}
          field={field}
          value={row[key]}
          collectionPath={collectionPath}
          onSubmit={() => {}}
        />
      </Suspense>
    )
  }
  if (kind === 'action') {
    const actionId = fieldActionId(key, field)
    const action = (schema?.actions ?? []).find((item) => item.id === actionId)
    return (
      <ActionCell
        field={field}
        fieldKey={key}
        onRun={action ? () => void runAction(row, action) : undefined}
      />
    )
  }
  const Custom = chrome?.cells?.[key]
  const fallback = formatField(field, row[key])
  if (Custom) return <Custom field={key} spec={field} value={row[key]} record={row} fallback={fallback} />
  if (key === 'table') {
    return <SourceTableCell record={row} tables={tables} onOpenTable={onOpenTable} />
  }
  if (kind !== 'file') {
    return (
      <Suspense fallback={<DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={row[key]} />}>
        <FieldValuePop
          record={row}
          fieldKey={key}
          field={field}
          value={row[key]}
          collectionPath={collectionPath}
          getOptions={() => uniqueValues(items, key, field)}
          records={items}
          labelField={schema?.labelField}
          onSubmit={field.writable ? (next) => writeCellValue(row, key, field, next) : () => {}}
        />
      </Suspense>
    )
  }
  return <DefaultCell field={field} fieldKey={key} records={items} collectionPath={collectionPath} labelField={schema?.labelField} value={row[key]} />
}

export function BrowserCellPopOverlay({
  cellPop,
  schema,
  columns,
  items,
  collectionPath,
  anchor,
  findPaintedRow,
  onClose,
  onSubmit,
}: {
  cellPop: CellPopState | null
  schema?: CollectionSchema
  columns: Array<{ key: string; field: FieldSpec }>
  items: DbRecord[]
  collectionPath: string
  anchor: HTMLElement | null
  findPaintedRow: (id: string) => DbRecord | undefined
  onClose: () => void
  onSubmit: (row: DbRecord, key: string, field: FieldSpec, raw: unknown) => void
}) {
  if (!cellPop || !schema) return null
  const row = findPaintedRow(cellPop.id)
  const col = columns.find((item) => item.key === cellPop.key)
  if (!row || !col) return null
  const key = col.key
  const field = col.field
  const flat = parseTagFlatColumnKey(key)
  const initial = flat ? readTagFlatValue(row, key, tagSourceKey(schema)) : row[key]
  const options = flat
    ? uniqueValues(
        items.map((item) => ({ ...item, [key]: readTagFlatValue(item, key, tagSourceKey(schema)) })),
        key,
        field,
      )
    : uniqueValues(items, key, field)
  return (
    <CellPop
      key={`${cellPop.id}:${cellPop.key}`}
      open
      className={`is-${resolveFieldType(field)}${key === 'fields' && collectionPath === TAGS_COLLECTION_PATH ? ' is-json' : ''}${isRecordLinkField(field, key) ? ' is-record-link' : ''}`}
      anchor={anchor}
      onClose={onClose}
    >
      <Suspense fallback={null}>
        <CellPopDraft
          record={row}
          fieldKey={key}
          field={field}
          initial={initial}
          typeChar={cellPop.seed}
          options={options}
          collectionPath={collectionPath}
          seed={items}
          labelField={schema?.labelField}
          onClose={onClose}
          onSubmit={(raw) => onSubmit(row, key, field, raw)}
        />
      </Suspense>
    </CellPop>
  )
}
