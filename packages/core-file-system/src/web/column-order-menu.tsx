import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { ChevronRightIcon } from '@heroicons/react/16/solid'
import type { CollectionSchemaPack, FieldSpec, FieldType } from '@biu/type-file-system'
import { tagTone as schemaTagTone } from '@biu/biu-ui/tag-chip'
import { moveList } from '../query-logic.ts'
import { CheckRow } from './controls.tsx'
import { DndGrip } from './dnd-grip.tsx'
import { FlyoutEmpty, SearchableFlyout, flyoutQueryMatch } from './flyout-search.tsx'
import { tagFlatColumnKey, parseTagFlatColumnKey, resolveFieldType, tagColumnTitle } from './fields.ts'
import { FieldGlyph } from './fsdb-cells.tsx'
import { tagChipIcon } from './schema-field.tsx'
import { pullTags, subscribeTagChrome, tagCatalogRevision } from './tag-catalog.ts'

function TagColumnPackRow({
  pack,
  visibleKeys,
  onToggle,
  onToggleMany,
  grip,
  defaultOpen = false,
  filterQuery = '',
}: {
  pack: CollectionSchemaPack
  visibleKeys: Set<string>
  onToggle: (key: string) => void
  onToggleMany?: (keys: string[], show: boolean) => void
  grip?: ReactNode
  defaultOpen?: boolean
  filterQuery?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  useSyncExternalStore(subscribeTagChrome, tagCatalogRevision)
  const tone = schemaTagTone(pack.id)
  const allLive = pack.fields.filter((field) => !field.deleted)
  const allKeys = allLive.map((field) => tagFlatColumnKey(pack.id, field.key))
  const q = filterQuery.trim()
  const fields = q && !flyoutQueryMatch(pack.label, q)
    ? allLive.filter((field) => flyoutQueryMatch(field.label ?? field.key, q))
    : allLive
  const expanded = Boolean(q) || open
  const anyOn = allKeys.some((key) => visibleKeys.has(key))
  const allOn = allKeys.length > 0 && allKeys.every((key) => visibleKeys.has(key))

  const toggleAllPackFields = () => {
    if (!allKeys.length) return
    const nextShow = !allOn
    if (onToggleMany) {
      onToggleMany(allKeys, nextShow)
      return
    }
    for (const key of allKeys) {
      if (visibleKeys.has(key) !== nextShow) onToggle(key)
    }
  }

  const trigger = (
    <div className="fsdb-col-pack-head" style={{ ['--biu-tag' as string]: tone }}>
      <button
        type="button"
        className={`fsdb-checkrow fsdb-tool-row fsdb-col-pack-trigger${anyOn || expanded ? ' is-on' : ''}`}
        style={{ ['--biu-tag' as string]: tone }}
        data-fsdb-col-tag-trigger
        aria-expanded={expanded}
        aria-label={`${pack.label}属性`}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) void pullTags(undefined, { filled: true })
        }}
      >
        <span className="fsdb-checkrow-label">
          <span className="fsdb-checkrow-icon fsdb-col-tag-ico" style={{ color: tone }}>
            {tagChipIcon(pack.id)}
          </span>
          <span className="fsdb-col-tag-name">
            {pack.label}
          </span>
        </span>
        <span className="fsdb-col-tag-right">
          <ChevronRightIcon
            aria-hidden
            className={`size-3.5 fsdb-col-menu-chev sidebar-chevron${expanded ? ' is-open' : ''}`}
          />
        </span>
      </button>
      {allKeys.length > 0 ? (
        <button
          type="button"
          role="switch"
          aria-checked={allOn}
          aria-label={allOn ? `隐藏${pack.label}全部属性` : `显示${pack.label}全部属性`}
          title={allOn ? '隐藏全部属性' : '显示全部属性'}
          className={`fsdb-group-switch fsdb-col-pack-switch${allOn ? ' is-on' : ''}`}
          onClick={toggleAllPackFields}
        >
          <span className="fsdb-group-switch-thumb" />
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="fsdb-col-pack-group" style={{ ['--biu-tag' as string]: tone }}>
      {grip ? (
        <ColumnRowShell className="is-tag" style={{ ['--biu-tag' as string]: tone }} grip={grip}>
          {trigger}
        </ColumnRowShell>
      ) : (
        trigger
      )}
      <div className={`fsdb-inline-fold${expanded ? ' is-open' : ''}`} aria-hidden={!expanded}>
        <div className="fsdb-inline-fold-inner">
          <div className="fsdb-inline-sub" data-fsdb-col-flyout role="group" aria-label={`${pack.label}属性列表`}>
            {fields.length ? (
              fields.map((field) => {
                const key = tagFlatColumnKey(pack.id, field.key)
                return (
                  <CheckRow
                    key={field.key}
                    icon={<FieldGlyph kind={resolveFieldType(field)} />}
                    label={field.label ?? field.key}
                    on={visibleKeys.has(key)}
                    switchControl
                    onToggle={() => onToggle(key)}
                  />
                )
              })
            ) : (
              <div className="tasks-viewdd-empty">还没有属性</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function columnMenuLabel(
  col: { key: string; packLabel?: string; field: FieldSpec },
  tagCatalog: CollectionSchemaPack[],
) {
  const flat = parseTagFlatColumnKey(col.key)
  const packLabel = col.packLabel ?? (flat ? tagCatalog.find((entry) => entry.id === flat.packId)?.label : undefined)
  return tagColumnTitle({ key: col.key, packLabel, field: col.field })
}

function ColumnMenuCheck({
  col,
  label,
  on,
  locked,
  onToggle,
}: {
  col: { key: string; kind: FieldType; field: FieldSpec; packLabel?: string }
  label?: string
  on: boolean
  locked?: boolean
  onToggle: () => void
}) {
  return (
    <CheckRow
      icon={<FieldGlyph kind={col.kind} />}
      label={label ?? col.field.label ?? col.key}
      on={on}
      locked={locked}
      switchControl
      onToggle={onToggle}
    />
  )
}

function ColumnRowShell({
  grip,
  children,
  className,
  rowRef,
  style,
}: {
  grip: ReactNode
  children: ReactNode
  className?: string
  rowRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
}) {
  return (
    <div ref={rowRef} className={`fsdb-col-drag-row${className ? ` ${className}` : ''}`} style={style}>
      {grip}
      {children}
    </div>
  )
}

function ColumnDragRow({
  col,
  label,
  on,
  locked,
  onToggle,
}: {
  col: { key: string; kind: FieldType; field: FieldSpec; packLabel?: string }
  label: string
  on: boolean
  locked?: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key })
  return (
    <ColumnRowShell
      rowRef={setNodeRef}
      className={isDragging ? 'is-drag' : undefined}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      grip={
        <button type="button" className="fsdb-query-grip" aria-label="拖动调整列顺序" {...attributes} {...listeners}>
          <DndGrip />
        </button>
      }
    >
      <ColumnMenuCheck col={col} label={label} on={on} locked={locked} onToggle={onToggle} />
    </ColumnRowShell>
  )
}

export function ColumnOrderMenu({
  columns,
  allColumns,
  labelField,
  tagCatalog,
  query = '',
  onToggle,
  onToggleMany,
  onReorder,
}: {
  columns: Array<{ key: string; kind: FieldType; field: FieldSpec; packLabel?: string }>
  allColumns: Array<{ key: string; kind: FieldType; field: FieldSpec; packLabel?: string }>
  labelField?: string
  tagCatalog: CollectionSchemaPack[]
  query?: string
  onToggle: (key: string) => void
  onToggleMany?: (keys: string[], show: boolean) => void
  onReorder: (next: string[]) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const visibleKeys = new Set(columns.map((item) => item.key))
  const hidden = allColumns.filter((item) => !parseTagFlatColumnKey(item.key) && !visibleKeys.has(item.key))
  const queryText = query ?? ''
  const menuCols = [...columns, ...hidden].filter((item) => {
    if (!flyoutQueryMatch(columnMenuLabel(item, tagCatalog), queryText)) return false
    const flat = parseTagFlatColumnKey(item.key)
    if (!flat || !queryText.trim()) return true
    const pack = tagCatalog.find((entry) => entry.id === flat.packId)
    const field = pack?.fields.find((entry) => entry.key === flat.fieldKey)
    return Boolean(field && !field.deleted)
  })
  const packs = tagCatalog.filter((pack) => {
    const liveFields = pack.fields.filter((field) => !field.deleted)
    if (queryText.trim() && pack.fields.length > 0 && !liveFields.length) return false
    return (
      flyoutQueryMatch(pack.label, queryText) ||
      liveFields.some((field) => flyoutQueryMatch(field.label ?? field.key, queryText))
    )
  })
  const locked = new Set([labelField, 'actions'].filter(Boolean))
  const sortableIds = menuCols.map((item) => item.key)
  const active = menuCols.find((item) => item.key === activeId)
  const searching = Boolean(query.trim())

  if (searching) {
    if (!menuCols.length && !packs.length) return <FlyoutEmpty />
    return (
      <>
        {menuCols.map((item) => (
          <ColumnMenuCheck
            key={item.key}
            col={item}
            label={columnMenuLabel(item, tagCatalog)}
            on={visibleKeys.has(item.key) || locked.has(item.key)}
            locked={locked.has(item.key)}
            onToggle={() => onToggle(item.key)}
          />
        ))}
        {packs.map((pack) => (
          <TagColumnPackRow
            key={pack.id}
            pack={pack}
            visibleKeys={visibleKeys}
            filterQuery={queryText}
            onToggle={onToggle}
            onToggleMany={onToggleMany}
          />
        ))}
      </>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={(event: DragEndEvent) => {
          const overId = event.over?.id
          setActiveId(null)
          if (overId == null || event.active.id === overId) return
          const from = sortableIds.indexOf(String(event.active.id))
          const to = sortableIds.indexOf(String(overId))
          if (from < 0 || to < 0) return
          const next = moveList(sortableIds, from, to)
          const visible = next.filter((key) => visibleKeys.has(key))
          onReorder(visible)
        }}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {menuCols.map((item) => (
            <ColumnDragRow
              key={item.key}
              col={item}
              label={columnMenuLabel(item, tagCatalog)}
              on={visibleKeys.has(item.key) || locked.has(item.key)}
              locked={locked.has(item.key)}
              onToggle={() => onToggle(item.key)}
            />
          ))}
        </SortableContext>
        {typeof document !== 'undefined'
          ? createPortal(
              <DragOverlay zIndex={280}>
                {active ? (
                  <div className="fsdb-query-drag-overlay" data-fsdb-sort-overlay>
                    <div className="fsdb-col-drag-row">
                      <button type="button" className="fsdb-query-grip" tabIndex={-1}>
                        <DndGrip />
                      </button>
                      <ColumnMenuCheck
                        col={active}
                        label={columnMenuLabel(active, tagCatalog)}
                        on={visibleKeys.has(active.key) || locked.has(active.key)}
                        locked={locked.has(active.key)}
                        onToggle={() => {}}
                      />
                    </div>
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )
          : null}
      </DndContext>
      {packs.map((pack) => (
        <TagColumnPackRow
          key={pack.id}
          pack={pack}
          visibleKeys={visibleKeys}
          onToggle={onToggle}
          onToggleMany={onToggleMany}
          grip={
            <span className="fsdb-query-grip is-locked" aria-hidden>
              <DndGrip />
            </span>
          }
        />
      ))}
    </>
  )
}

export function VisibleColumnsFlyout({
  columns,
  allColumns,
  labelField,
  tagCatalog,
  onToggle,
  onToggleMany,
  onReorder,
}: Omit<Parameters<typeof ColumnOrderMenu>[0], 'query'>) {
  return (
    <SearchableFlyout className="tasks-sort-menu fsdb-col-menu">
      {(q) => (
        <div className="fsdb-col-menu-list">
          <ColumnOrderMenu
            columns={columns}
            allColumns={allColumns}
            labelField={labelField}
            tagCatalog={tagCatalog}
            query={q}
            onToggle={onToggle}
            onToggleMany={onToggleMany}
            onReorder={onReorder}
          />
        </div>
      )}
    </SearchableFlyout>
  )
}
