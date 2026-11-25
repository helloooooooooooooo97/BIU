import { useState, type ReactNode, type RefObject } from 'react'
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
import { CSS } from '@dnd-kit/utilities'
import { CheckIcon, ChevronRightIcon, EyeIcon, EyeSlashIcon, PlusIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import type { FieldSpec, FieldType } from '@biu/type-file-system'
import { CellSelect } from '@biu/biu-ui/db-ui'
import { HEADLESS_DISMISS_IGNORE } from '@biu/biu-ui/headless-dismiss'
import { HeadlessPopover } from '@biu/biu-ui/headless-popover'
import { overlayZ } from '@biu/biu-ui/overlay-portal'
import { DndGrip } from './dnd-grip.tsx'
import { FieldGlyph } from './fsdb-cells.tsx'
import { parseGroupByKey, type GroupGrain } from './group-strategies.ts'
import { normalizeGroupConfig, type GroupConfig, type GroupSortMode } from './saved-view.ts'

import {
  countFilterRules,
  defaultOpForKind,
  emptyFilterGroup,
  emptyFilterRule,
  emptySortRule,
  moveList,
  opsForKind,
  sortDirLabel,
  type FilterGroup,
  type FilterNode,
  type FilterOp,
  type FilterRule,
  type SortRule,
} from '../query-logic.ts'

const QUERY_FLYOUT_IGNORE = `${HEADLESS_DISMISS_IGNORE}, .db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]`
const QUERY_FLYOUT_NEST = '.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]'

export type QueryField = { key: string; kind: FieldType; field: FieldSpec }

const WITHIN = [
  { value: '1h', label: '最近 1 小时' },
  { value: '24h', label: '最近 1 天' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
]

type SortFieldOption = { value: string; label: string; icon?: ReactNode }

function SortRuleFields({
  rule,
  kind,
  options,
  sorts,
  onChange,
}: {
  rule: SortRule
  kind: FieldType
  options: SortFieldOption[]
  sorts: SortRule[]
  onChange: (next: SortRule[]) => void
}) {
  return (
    <>
      <CellSelect
        value={rule.field}
        options={options}
        variant="field"
        onSelect={(next) => onChange(sorts.map((item) => (item.id === rule.id ? { ...item, field: next } : item)))}
      />
      <CellSelect
        value={rule.dir}
        options={[
          { value: 'asc', label: sortDirLabel(kind, 'asc') },
          { value: 'desc', label: sortDirLabel(kind, 'desc') },
        ]}
        variant="field"
        onSelect={(next) =>
          onChange(sorts.map((item) => (item.id === rule.id ? { ...item, dir: next === 'desc' ? 'desc' : 'asc' } : item)))
        }
      />
      <button
        type="button"
        className="fsdb-query-x"
        aria-label="删除这条排序"
        onClick={() => onChange(sorts.filter((item) => item.id !== rule.id))}
      >
        <XMarkIcon aria-hidden className="size-[14px]" />
      </button>
    </>
  )
}

function SortableSortRow({
  rule,
  kind,
  options,
  sorts,
  onChange,
}: {
  rule: SortRule
  kind: FieldType
  options: SortFieldOption[]
  sorts: SortRule[]
  onChange: (next: SortRule[]) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id })
  return (
    <div
      ref={setNodeRef}
      className={`fsdb-query-row${isDragging ? ' is-drag' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="fsdb-query-grip" aria-label="拖动调整排序顺序" {...attributes} {...listeners}>
        <DndGrip />
      </button>
      <SortRuleFields rule={rule} kind={kind} options={options} sorts={sorts} onChange={onChange} />
    </div>
  )
}

/** 挂到 overlay 根：主栏 overflow 和左侧合成层都裁不到。 */
export function QueryFlyout({
  anchorRef,
  onClose,
  ignoreSelector,
  inside,
  align = 'end',
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  ignoreSelector?: string
  inside?: (node: Node) => boolean
  align?: 'start' | 'end'
  children: ReactNode
}) {
  const ignore = ignoreSelector ? `${QUERY_FLYOUT_IGNORE}, ${ignoreSelector}` : QUERY_FLYOUT_IGNORE
  const start = align === 'start'
  return (
    <HeadlessPopover
      open
      anchorRef={anchorRef}
      onOpenChange={(open) => { if (!open) onClose() }}
      align={align}
      sideOffset={6}
      zIndex={200}
      ignoreSelector={ignore}
      inside={(node) =>
        Boolean(
          (node instanceof Element && node.closest(QUERY_FLYOUT_NEST)) ||
            (node instanceof Node && anchorRef.current?.contains(node)) ||
            inside?.(node),
        )
      }
    >
      <div
        className={`fsdb-page fsdb-query-flyout${start ? ' is-start' : ''}`}
        data-testid="fsdb-query-flyout"
      >
        {children}
      </div>
    </HeadlessPopover>
  )
}

export function SortQueryMenu({
  sorts,
  fields,
  onChange,
}: {
  sorts: SortRule[]
  fields: QueryField[]
  onChange: (next: SortRule[]) => void
}) {
  const [savedSorts, setSavedSorts] = useState<SortRule[]>([])
  const enabled = sorts.length > 0
  const displaySorts = enabled ? sorts : savedSorts
  const options = fields.map((item) => ({
    value: item.key,
    label: item.field.label ?? item.key,
    icon: <FieldGlyph kind={item.kind} />,
  }))
  const used = new Set(displaySorts.map((item) => item.field))
  const leftover = fields.find((item) => !used.has(item.key))
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const active = displaySorts.find((item) => item.id === activeId)
  const activeKind = fields.find((item) => item.key === active?.field)?.kind ?? 'string'

  const commitSorts = (next: SortRule[]) => {
    setSavedSorts(next)
    onChange(next)
  }

  const toggleEnabled = () => {
    if (enabled) {
      setSavedSorts(sorts)
      onChange([])
      return
    }
    if (savedSorts.length) {
      onChange(savedSorts)
      return
    }
    const first = fields[0]
    if (first) {
      const next = [emptySortRule(first.key)]
      setSavedSorts(next)
      onChange(next)
    }
  }

  return (
    <div className="fsdb-tool-flyout fsdb-query-menu is-sort" role="menu">
      <div className="fsdb-query-head">
        <span className="fsdb-query-head-title">排序设置</span>
        <span className="fsdb-query-head-toggle">
          <span className="fsdb-query-toggle-label">{enabled ? '已生效' : '未生效'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="启用排序"
            className={`fsdb-group-switch${enabled ? ' is-on' : ''}`}
            onClick={toggleEnabled}
          >
            <span className="fsdb-group-switch-thumb" />
          </button>
        </span>
      </div>
      <div className={`fsdb-query-rules-body${!enabled && displaySorts.length ? ' is-paused' : ''}`}>
        {displaySorts.length ? (
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
              const from = displaySorts.findIndex((item) => item.id === event.active.id)
              const to = displaySorts.findIndex((item) => item.id === overId)
              if (from < 0 || to < 0) return
              commitSorts(moveList(displaySorts, from, to))
            }}
          >
            <SortableContext items={displaySorts.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              {displaySorts.map((rule) => {
                const kind = fields.find((item) => item.key === rule.field)?.kind ?? 'string'
                return (
                  <SortableSortRow
                    key={rule.id}
                    rule={rule}
                    kind={kind}
                    options={options}
                    sorts={displaySorts}
                    onChange={commitSorts}
                  />
                )
              })}
            </SortableContext>
            <DragOverlay zIndex={overlayZ(340)}>
              {active ? (
                <div className="fsdb-query-drag-overlay" data-fsdb-sort-overlay>
                  <div className="fsdb-query-row">
                    <button type="button" className="fsdb-query-grip" tabIndex={-1}>
                      <DndGrip />
                    </button>
                    <SortRuleFields rule={active} kind={activeKind} options={options} sorts={displaySorts} onChange={() => {}} />
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="tasks-viewdd-empty">还没有排序</div>
        )}
      </div>
      {leftover ? (
        <div className="fsdb-query-foot">
          <button type="button" className="fsdb-query-add" onClick={() => commitSorts([...displaySorts, emptySortRule(leftover.key)])}>
            <PlusIcon aria-hidden className="size-[14px]" />
            添加排序
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function FilterQueryMenu({
  tree,
  fields,
  valueOptions,
  onChange,
}: {
  tree: FilterGroup
  fields: QueryField[]
  valueOptions: (field: QueryField) => Array<{ value: string; label: string }>
  onChange: (next: FilterGroup) => void
}) {
  const [savedTree, setSavedTree] = useState<FilterGroup | null>(null)
  const enabled = countFilterRules(tree) > 0
  const displayTree = enabled ? tree : (savedTree && countFilterRules(savedTree) > 0 ? savedTree : tree)

  const commitTree = (next: FilterGroup) => {
    setSavedTree(countFilterRules(next) > 0 ? next : null)
    onChange(next)
  }

  const toggleEnabled = () => {
    if (enabled) {
      setSavedTree(tree)
      onChange(emptyFilterGroup())
      return
    }
    if (savedTree && countFilterRules(savedTree) > 0) {
      onChange(savedTree)
      return
    }
    const first = fields[0]
    if (first) {
      const next: FilterGroup = { ...tree, children: [emptyFilterRule(first.key)] }
      setSavedTree(next)
      onChange(next)
    }
  }

  return (
    <div className="fsdb-tool-flyout fsdb-query-menu is-filter" role="menu">
      <div className="fsdb-query-head">
        <span className="fsdb-query-head-title">筛选设置</span>
        <span className="fsdb-query-head-toggle">
          <span className="fsdb-query-toggle-label">{enabled ? '已生效' : '未生效'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="启用筛选"
            className={`fsdb-group-switch${enabled ? ' is-on' : ''}`}
            onClick={toggleEnabled}
          >
            <span className="fsdb-group-switch-thumb" />
          </button>
        </span>
      </div>
      <FilterGroupEditor
        group={displayTree}
        fields={fields}
        valueOptions={valueOptions}
        root
        paused={!enabled && countFilterRules(displayTree) > 0}
        onChange={commitTree}
      />
    </div>
  )
}

function FilterGroupEditor({
  group,
  fields,
  valueOptions,
  root,
  paused,
  onChange,
}: {
  group: FilterGroup
  fields: QueryField[]
  valueOptions: (field: QueryField) => Array<{ value: string; label: string }>
  root?: boolean
  paused?: boolean
  onChange: (next: FilterGroup) => void
}) {
  function patchChild(id: string, next: FilterNode) {
    onChange({ ...group, children: group.children.map((item) => (item.id === id ? next : item)) })
  }
  function dropChild(id: string) {
    onChange({ ...group, children: group.children.filter((item) => item.id !== id) })
  }
  const addButtons = (
    <>
      <button
        type="button"
        className="fsdb-query-add"
        onClick={() => onChange({ ...group, children: [...group.children, emptyFilterRule(fields[0]?.key ?? 'title')] })}
      >
        <PlusIcon aria-hidden className="size-[14px]" />
        添加筛选条件
      </button>
      <button
        type="button"
        className="fsdb-query-add"
        onClick={() => onChange({ ...group, children: [...group.children, emptyFilterGroup()] })}
      >
        <PlusIcon aria-hidden className="size-[14px]" />
        添加筛选分组
      </button>
    </>
  )
  return (
    <div className={root ? 'fsdb-query-stack' : 'fsdb-query-group'}>
      <div className={`fsdb-query-rules-body${paused ? ' is-paused' : ''}`}>
        {group.children.map((child, index) => (
          <div key={child.id} className="fsdb-query-line">
            {index === 0 ? (
              <span className="fsdb-query-join">{root ? '其中' : '其中'}</span>
            ) : (
              <button
                type="button"
                className="fsdb-query-join is-btn"
                onClick={() => onChange({ ...group, combinator: group.combinator === 'and' ? 'or' : 'and' })}
              >
                {group.combinator === 'and' ? '且' : '或'}
              </button>
            )}
            {child.kind === 'rule' ? (
              <FilterRuleRow
                rule={child}
                fields={fields}
                valueOptions={valueOptions}
                onChange={(next) => patchChild(child.id, next)}
                onRemove={() => dropChild(child.id)}
              />
            ) : (
              <div className="fsdb-query-nested">
                <FilterGroupEditor
                  group={child}
                  fields={fields}
                  valueOptions={valueOptions}
                  onChange={(next) => patchChild(child.id, next)}
                />
                <button type="button" className="fsdb-query-x is-group" aria-label="删除分组" onClick={() => dropChild(child.id)}>
                  <XMarkIcon aria-hidden className="size-[14px]" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {root ? <div className="fsdb-query-foot">{addButtons}</div> : addButtons}
    </div>
  )
}

function FilterRuleRow({
  rule,
  fields,
  valueOptions,
  onChange,
  onRemove,
}: {
  rule: FilterRule
  fields: QueryField[]
  valueOptions: (field: QueryField) => Array<{ value: string; label: string }>
  onChange: (next: FilterRule) => void
  onRemove: () => void
}) {
  const field = fields.find((item) => item.key === rule.field) ?? fields[0]
  const kind = field?.kind ?? 'string'
  const ops = opsForKind(kind)
  const needsValue = rule.op !== 'is_empty' && rule.op !== 'not_empty'
  const options = field ? valueOptions(field) : []

  function setField(next: string) {
    const hit = fields.find((item) => item.key === next)
    const nextKind = hit?.kind ?? 'string'
    onChange({ ...rule, field: next, op: defaultOpForKind(nextKind), value: '' })
  }

  return (
    <div className="fsdb-query-rule">
      <CellSelect
        value={rule.field}
        options={fields.map((item) => ({
          value: item.key,
          label: item.field.label ?? item.key,
          icon: <FieldGlyph kind={item.kind} />,
        }))}
        variant="field"
        onSelect={setField}
      />
      <CellSelect
        value={rule.op}
        options={ops.map((item) => ({ value: item.value, label: item.label }))}
        variant="field"
        onSelect={(next) => onChange({ ...rule, op: (next as FilterOp) || rule.op, value: next === 'within' ? '7d' : '' })}
      />
      {needsValue ? (
        rule.op === 'within' ? (
          <CellSelect value={rule.value} options={WITHIN} variant="field" placeholder="时间" onSelect={(next) => onChange({ ...rule, value: next })} />
        ) : kind === 'tag' || Boolean(field?.field.enum?.length) || options.length ? (
          <CellSelect
            value={rule.value}
            options={options}
            variant="field"
            allowCreate={(kind === 'select' || kind === 'multi-select') && !field?.field.enum?.length}
            placeholder={kind === 'tag' && !options.length ? '还没有标签' : '值'}
            chips={kind === 'select' || kind === 'multi-select' || kind === 'tag'}
            empty={kind === 'tag' && !options.length ? <div className="db-search-empty">还没有标签</div> : undefined}
            onSelect={(next) => onChange({ ...rule, value: next })}
          />
        ) : (
          <input
            className="fsdb-query-input"
            value={rule.value}
            placeholder="值"
            onChange={(event) => onChange({ ...rule, value: event.target.value })}
          />
        )
      ) : (
        <span className="fsdb-query-spacer" />
      )}
      <button type="button" className="fsdb-query-x" aria-label="删除这条筛选" onClick={onRemove}>
        <XMarkIcon aria-hidden className="size-[14px]" />
      </button>
    </div>
  )
}

export const GROUP_GRAIN_OPTIONS: ReadonlyArray<{ value: GroupGrain; label: string }> = [
  { value: 'day', label: '按天' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
  { value: 'quarter', label: '按季度' },
  { value: 'year', label: '按年' },
  { value: 'relative', label: '相对时间' },
]
export type GroupMenuBucket = { key: string; label: string; count: number }

const GROUP_SORT_OPTIONS: Array<{ value: GroupSortMode; label: string }> = [
  { value: 'manual', label: '手动排序' },
  { value: 'asc', label: '升序' },
  { value: 'desc', label: '降序' },
]

function SortableGroupRow({
  item,
  onHide,
}: {
  item: GroupMenuBucket
  onHide: (key: string) => void
}) {
  const dragId = `g:${item.key}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`fsdb-group-panel-item${isDragging ? ' is-dragging' : ''}`}
      data-testid="fsdb-group-visible-item"
      data-group-key={item.key}
    >
      <button
        type="button"
        className="fsdb-group-panel-grip"
        aria-label={`拖动排序 ${item.label}`}
        {...attributes}
        {...listeners}
      >
        <DndGrip />
      </button>
      <span className="fsdb-group-panel-item-label" title={item.label}>
        {item.label}
      </span>
      <button
        type="button"
        className="fsdb-group-panel-eye"
        aria-label={`隐藏分组 ${item.label}`}
        title="隐藏分组"
        onClick={() => onHide(item.key)}
      >
        <EyeSlashIcon aria-hidden className="size-[14px]" />
      </button>
    </div>
  )
}

export function GroupAccordionSelect({
  label,
  value,
  options,
  open,
  testId,
  onToggle,
  onSelect,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string; icon?: ReactNode }>
  open: boolean
  testId?: string
  onToggle: () => void
  onSelect: (next: string) => void
}) {
  const current = options.find((item) => item.value === value)
  return (
    <div className="fsdb-group-acc-row" data-testid={testId}>
      <button
        type="button"
        className={`fsdb-group-acc-btn${open ? ' is-open' : ''}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="fsdb-group-panel-label">{label}</span>
        <span className="fsdb-group-acc-val">
          <span className="fsdb-group-acc-val-text">{current?.label ?? value}</span>
          <ChevronRightIcon
            aria-hidden
            className={`size-3.5 fsdb-col-menu-chev sidebar-chevron${open ? ' is-open' : ''}`}
          />
        </span>
      </button>
      <div className={`fsdb-inline-fold${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <div className="fsdb-inline-fold-inner">
          <div className="fsdb-inline-sub" role="menu">
            {options.map((opt) => {
              const active = opt.value === value
              return (
                <button
                  key={opt.value || '__none__'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`fsdb-group-acc-opt${active ? ' is-on' : ''}`}
                  onClick={() => onSelect(opt.value)}
                >
                  {opt.icon ? <span className="fsdb-col-menu-ico">{opt.icon}</span> : null}
                  <span className="fsdb-group-acc-opt-label">{opt.label}</span>
                  {active ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export function GroupQueryMenu({
  groupBy,
  groupConfig,
  groups = [],
  fields,
  onChange,
  onChangeConfig,
  onClose,
}: {
  groupBy: string
  groupConfig?: GroupConfig
  groups?: GroupMenuBucket[]
  fields: QueryField[]
  onChange: (next: string) => void
  onChangeConfig?: (next: GroupConfig | undefined) => void
  onClose?: () => void
}) {
  const [openAcc, setOpenAcc] = useState<'field' | 'grain' | 'sort' | null>(null)
  const [savedGroupBy, setSavedGroupBy] = useState('')
  const [savedGroupConfig, setSavedGroupConfig] = useState<GroupConfig | undefined>(undefined)
  const [savedGroups, setSavedGroups] = useState<GroupMenuBucket[]>([])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const enabled = Boolean(groupBy)
  const displayGroupBy = enabled ? groupBy : savedGroupBy
  const displayGroupConfig = enabled ? groupConfig : savedGroupConfig
  const displayGroups = enabled ? groups : savedGroups
  const paused = !enabled && Boolean(displayGroupBy)
  const parsed = parseGroupByKey(displayGroupBy)
  const activeField = fields.find((item) => item.key === parsed.fieldKey) ?? null
  const activeGrain: GroupGrain = parsed.grain ?? 'month'

  const toggleEnabled = () => {
    if (enabled) {
      setSavedGroupBy(groupBy)
      setSavedGroupConfig(groupConfig)
      setSavedGroups(groups)
      onChange('')
      return
    }
    if (savedGroupBy) {
      onChange(savedGroupBy)
      if (savedGroupConfig && onChangeConfig) onChangeConfig(savedGroupConfig)
      return
    }
    const first = fields[0]
    if (first) {
      const next = first.kind === 'datetime' ? `${first.key}::day` : first.key
      setSavedGroupBy(next)
      onChange(next)
    }
  }

  const selectField = (fieldKey: string) => {
    if (!fieldKey) {
      setSavedGroupBy('')
      setSavedGroupConfig(undefined)
      setSavedGroups([])
      onChange('')
      return
    }
    const target = fields.find((item) => item.key === fieldKey)
    const next =
      target?.kind === 'datetime'
        ? `${fieldKey}::${activeField?.kind === 'datetime' ? activeGrain : 'day'}`
        : fieldKey
    setSavedGroupBy(next)
    onChange(next)
  }

  const fieldOptions = [
    { value: '', label: '不分组' },
    ...fields.map((item) => ({
      value: item.key,
      label: item.field.label ?? item.key,
      icon: <FieldGlyph kind={item.kind} />,
    })),
  ]
  const sortMode: GroupSortMode = displayGroupConfig?.sort ?? 'manual'
  const hideEmpty = displayGroupConfig?.hideEmpty !== false
  const hiddenSet = new Set(displayGroupConfig?.hidden ?? [])
  const visibleGroups = displayGroups.filter((item) => !hiddenSet.has(item.key))
  const hiddenGroups = displayGroups.filter((item) => hiddenSet.has(item.key))

  const patchConfig = (patch: Partial<GroupConfig>) => {
    if (!onChangeConfig) return
    const next = normalizeGroupConfig({
      sort: sortMode,
      hideEmpty,
      hidden: [...hiddenSet],
      order: displayGroupConfig?.order,
      ...patch,
    })
    setSavedGroupConfig(next)
    if (!enabled && displayGroupBy) onChange(displayGroupBy)
    onChangeConfig(next)
  }

  const hideOne = (key: string) => {
    const next = new Set(hiddenSet)
    next.add(key)
    patchConfig({ hidden: [...next] })
  }

  const showOne = (key: string) => {
    const next = new Set(hiddenSet)
    next.delete(key)
    patchConfig({ hidden: [...next] })
  }

  const hideAll = () => {
    patchConfig({ hidden: displayGroups.map((item) => item.key) })
  }

  const showAll = () => {
    patchConfig({ hidden: [] })
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeKey = String(active.id).slice(2)
    const overKey = String(over.id).slice(2)
    const from = visibleGroups.findIndex((item) => item.key === activeKey)
    const to = visibleGroups.findIndex((item) => item.key === overKey)
    if (from < 0 || to < 0) return
    const movedVisible = moveList(visibleGroups, from, to).map((item) => item.key)
    const restHidden = hiddenGroups.map((item) => item.key)
    patchConfig({ sort: 'manual', order: [...movedVisible, ...restHidden] })
  }

  return (
    <div className="fsdb-tool-flyout fsdb-query-menu is-group" role="menu" data-testid="fsdb-group-panel">
      <div className="fsdb-query-head">
        <span className="fsdb-query-head-title">分组设置</span>
        <span className="fsdb-query-head-toggle">
          <span className="fsdb-query-toggle-label">{enabled ? '已生效' : '未生效'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="启用分组"
            className={`fsdb-group-switch${enabled ? ' is-on' : ''}`}
            onClick={toggleEnabled}
          >
            <span className="fsdb-group-switch-thumb" />
          </button>
        </span>
      </div>
      <div className={`fsdb-query-rules-body${paused ? ' is-paused' : ''}`}>
      <div className="fsdb-group-panel-row" data-testid="fsdb-group-field-row">
        <span className="fsdb-group-panel-label">分组条件</span>
        <CellSelect
          value={activeField?.key ?? ''}
          options={fieldOptions}
          variant="field"
          placeholder="不分组"
          onSelect={(next) => {
            setOpenAcc(null)
            selectField(next)
          }}
        />
      </div>
      {activeField ? (
        <>
          {activeField.kind === 'datetime' ? (
            <GroupAccordionSelect
              testId="fsdb-group-grain-row"
              label="分组方式"
              value={activeGrain}
              options={GROUP_GRAIN_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              open={openAcc === 'grain'}
              onToggle={() => setOpenAcc((prev) => (prev === 'grain' ? null : 'grain'))}
              onSelect={(next) => {
                setOpenAcc(null)
                if (!next) return
                const full = `${activeField.key}::${next}`
                setSavedGroupBy(full)
                onChange(full)
              }}
            />
          ) : null}
          {onChangeConfig ? (
            <>
              <GroupAccordionSelect
                testId="fsdb-group-sort-row"
                label="排序"
                value={sortMode}
                options={GROUP_SORT_OPTIONS}
                open={openAcc === 'sort'}
                onToggle={() => setOpenAcc((prev) => (prev === 'sort' ? null : 'sort'))}
                onSelect={(next) => {
                  setOpenAcc(null)
                  if (next === 'manual' || next === 'asc' || next === 'desc') {
                    patchConfig({ sort: next })
                  }
                }}
              />
              <div className="fsdb-group-panel-row" data-testid="fsdb-group-hide-empty-row">
                <span className="fsdb-group-panel-label">隐藏无记录分组</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hideEmpty}
                  aria-label="隐藏无记录分组"
                  className={`fsdb-group-switch${hideEmpty ? ' is-on' : ''}`}
                  onClick={() => patchConfig({ hideEmpty: !hideEmpty })}
                >
                  <span className="fsdb-group-switch-thumb" />
                </button>
              </div>
              {displayGroups.length > 0 ? (
                <div className="fsdb-group-panel-section">
                  <div className="fsdb-group-panel-sec-head">
                    <span>可见分组</span>
                    {visibleGroups.length > 0 ? (
                      <button type="button" className="fsdb-group-panel-link" onClick={hideAll}>
                        全部隐藏
                      </button>
                    ) : hiddenGroups.length > 0 ? (
                      <button type="button" className="fsdb-group-panel-link" onClick={showAll}>
                        全部显示
                      </button>
                    ) : null}
                  </div>
                  {visibleGroups.length > 0 ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis]}
                      onDragEnd={onDragEnd}
                    >
                      <SortableContext
                        items={visibleGroups.map((item) => `g:${item.key}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="fsdb-group-panel-list">
                          {visibleGroups.map((item) => (
                            <SortableGroupRow key={item.key} item={item} onHide={hideOne} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="fsdb-group-panel-empty">已全部隐藏</div>
                  )}
                </div>
              ) : null}
              {hiddenGroups.length > 0 ? (
                <div className="fsdb-group-panel-section" data-testid="fsdb-group-hidden-section">
                  <div className="fsdb-group-panel-sec-head">
                    <span>已隐藏分组</span>
                    <button type="button" className="fsdb-group-panel-link" onClick={showAll}>
                      全部显示
                    </button>
                  </div>
                  <div className="fsdb-group-panel-list">
                    {hiddenGroups.map((item) => (
                      <div
                        key={item.key}
                        className="fsdb-group-panel-item is-hidden"
                        data-testid="fsdb-group-hidden-item"
                        data-group-key={item.key}
                      >
                        <span className="fsdb-group-panel-item-label" title={item.label}>
                          {item.label}
                        </span>
                        <button
                          type="button"
                          className="fsdb-group-panel-eye"
                          aria-label={`显示分组 ${item.label}`}
                          title="显示分组"
                          onClick={() => showOne(item.key)}
                        >
                          <EyeIcon aria-hidden className="size-[14px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="fsdb-group-panel-clear"
            onClick={() => {
              setSavedGroupBy('')
              setSavedGroupConfig(undefined)
              setSavedGroups([])
              onChange('')
              onClose?.()
            }}
          >
            <TrashGlyph aria-hidden className="size-[14px]" />
            取消分组
          </button>
        </>
      ) : null}
      </div>
    </div>
  )
}
