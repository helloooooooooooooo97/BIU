import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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
import { CheckIcon, LockClosedIcon, PlusIcon, Square2StackIcon, UserIcon, UsersIcon } from '@heroicons/react/16/solid'
import { overlayZ } from '@biu/biu-ui/overlay-portal'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { isBuiltinAllViewId, isBuiltinCatalogViewId, isNonPersonalView, isReadOnlyViewId } from '../catalog-views.ts'
import { moveList } from '../query-logic.ts'
import { DndGrip } from './dnd-grip.tsx'
import { FlyoutEmpty, SearchableFlyout, flyoutQueryMatch } from './flyout-search.tsx'
import { ViewModeGlyph } from './nav-glyphs.tsx'
import { canDeleteSavedView, canEditSavedView, canRemoveCollectionView, type SavedView, type ViewProtection } from './saved-view.ts'
import { loadViewerIdentity } from './view-settings-menu.tsx'

export const PROTECTION_OPTIONS: Array<{
  value: ViewProtection
  label: string
  desc: string
  Icon: typeof UsersIcon
}> = [
  { value: 'public', label: '公共视图', desc: '所有成员可修改视图配置', Icon: UsersIcon },
  { value: 'locked', label: '锁定视图', desc: '所有成员都不可修改视图配置', Icon: LockClosedIcon },
  { value: 'personal', label: '个人视图', desc: '仅你自己可见', Icon: UserIcon },
]

export function isBuiltinAggregationView(view: Pick<SavedView, 'id'>): boolean {
  return isBuiltinAllViewId(view.id) || isBuiltinCatalogViewId(view.id)
}

export function isAggregationView(view: Pick<SavedView, 'id' | 'ownerTable'>): boolean {
  return view.ownerTable === 'all' || isBuiltinAggregationView(view)
}

export function resolveViewProtection(view: Pick<SavedView, 'id' | 'ownerTable' | 'protection' | 'scope'>): ViewProtection {
  if (isBuiltinAggregationView(view)) return 'personal'
  if (view.protection === 'public' || view.protection === 'locked' || view.protection === 'personal') {
    return view.protection
  }
  if (view.ownerTable === 'all') return 'personal'
  return view.scope === 'personal' ? 'personal' : 'public'
}

export function viewProtectionMeta(view: Pick<SavedView, 'id' | 'ownerTable' | 'protection' | 'scope'>) {
  const isBuiltinAgg = isBuiltinAggregationView(view)
  const isAggregation = isAggregationView(view)
  const protection = resolveViewProtection(view)
  const option = PROTECTION_OPTIONS.find((item) => item.value === protection) ?? PROTECTION_OPTIONS[0]!
  const title = isBuiltinAgg
    ? '个人视图（数据聚合视角仅自己可见）'
    : `${option.label}：${option.desc}`
  return { protection, isAggregation, isBuiltinAgg, option, title }
}

export function ViewProtectionBadge({
  view,
  className,
}: {
  view: Pick<SavedView, 'id' | 'ownerTable' | 'protection' | 'scope'>
  className?: string
}) {
  const { protection, option, title } = viewProtectionMeta(view)
  const ProtectionIcon = option.Icon
  return (
    <span
      className={['tasks-viewdd-protection', `is-${protection}`, className].filter(Boolean).join(' ')}
      data-testid="fsdb-view-tab-protection"
      data-protection={protection}
      title={title}
      aria-label={option.label}
    >
      <ProtectionIcon aria-hidden className="size-[14px]" />
    </span>
  )
}

function isLastPublicViewForTable(view: SavedView, views: SavedView[]): boolean {
  const ot = view.ownerTable?.trim()
  if (!ot || ot === 'all' || !isNonPersonalView(view)) return false
  return views.filter((item) => item.ownerTable?.trim() === ot && isNonPersonalView(item)).length <= 1
}

function ViewRowShell({
  view,
  active,
  onSelect,
  onCopy,
  onDelete,
  onChangeProtection,
  protectionMenuOpen,
  onToggleProtectionMenu,
  canRemove,
  isLastPublic,
  viewerIsAdmin,
  grip,
  rowRef,
  className,
  style,
}: {
  view: SavedView
  active: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onChangeProtection?: (view: SavedView, protection: ViewProtection) => void
  protectionMenuOpen?: boolean
  onToggleProtectionMenu?: () => void
  canRemove: boolean
  isLastPublic?: boolean
  viewerIsAdmin?: boolean
  grip: ReactNode
  rowRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) {
  const { protection, isBuiltinAgg, option: meta, title: protectionTitle } = viewProtectionMeta(view)
  const isReadOnlyStub = Boolean(view.builtin) || isReadOnlyViewId(view.id)
  const isAllTable = view.ownerTable === 'all'
  const ProtectionIcon = meta.Icon
  const canSwitchProtection = Boolean(
    !isReadOnlyStub &&
      !isBuiltinAgg &&
      (!isAllTable || viewerIsAdmin) &&
      onChangeProtection &&
      (canEditSavedView(view) || canDeleteSavedView(view)),
  )
  const canLock = !(view.ownerTable?.startsWith('account:') && view.viewRole && view.viewRole !== 'owner')
  return (
    <div ref={rowRef} style={style}>
      <div
        className={`tasks-viewdd-item${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      >
        {grip}
        <button
          type="button"
          className="tasks-viewdd-item-main fsdb-tool-row"
          onClick={() => onSelect(view)}
        >
          <ViewModeGlyph mode={view.mode} className="tasks-viewdd-item-ico" />
          <span className="tasks-viewdd-item-name font-medium">{view.name}</span>
        </button>
        <span className="tasks-viewdd-item-actions">
          <button
            type="button"
            className={`tasks-viewdd-act${protection === 'locked' ? ' is-locked' : ''}`}
            data-testid={`view-protection-btn-${view.id}`}
            data-protection={protection}
            title={protectionTitle}
            aria-label={meta.label}
            style={{
              color: protection === 'locked' ? 'var(--biu-color-emphasis)' : undefined,
              cursor: canSwitchProtection ? 'pointer' : 'default',
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (canSwitchProtection) onToggleProtectionMenu?.()
            }}
          >
            <ProtectionIcon aria-hidden className="size-[14px]" />
          </button>
          <button type="button" className="tasks-viewdd-act" title="拷贝视图" onClick={() => onCopy(view)}>
            <Square2StackIcon aria-hidden className="size-[14px]" />
          </button>
          {canRemove && !isReadOnlyStub && !isLastPublic ? (
            <button type="button" className="tasks-viewdd-act is-danger" title="删除" onClick={() => onDelete(view)}>
              <TrashGlyph aria-hidden className="size-[14px]" />
            </button>
          ) : null}
        </span>
      </div>
      {protectionMenuOpen && canSwitchProtection ? (
        <div
          data-testid={`view-protection-menu-${view.id}`}
          style={{
            margin: '4px 6px 6px 26px',
            padding: 4,
            borderRadius: 8,
            background: 'var(--biu-color-bg-input)',
            border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {PROTECTION_OPTIONS.map((opt) => {
            const Icon = opt.Icon
            const selected = protection === opt.value
            const disabled = (opt.value === 'personal' && Boolean(isLastPublic)) || (opt.value === 'locked' && !canLock)
            const disabledHint =
              opt.value === 'personal' && isLastPublic
                ? '每张表至少保留一个公共/锁定视图'
                : opt.value === 'locked' && !canLock
                  ? '仅个人表拥有者可设为锁定视图'
                  : opt.desc
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                data-testid={`view-protection-opt-${opt.value}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (disabled) return
                  onChangeProtection?.(view, opt.value)
                  onToggleProtectionMenu?.()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: 'none',
                  background: selected ? 'var(--biu-color-bg-hover)' : 'transparent',
                  color: 'var(--biu-color-text)',
                  textAlign: 'left',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                  width: '100%',
                }}
              >
                <Icon aria-hidden className="size-[15px] shrink-0" style={{ opacity: 0.85 }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.25 }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--biu-color-text-muted)', lineHeight: 1.25 }}>{disabledHint}</span>
                </span>
                {selected ? (
                  <CheckIcon aria-hidden className="size-[14px] shrink-0" style={{ color: 'var(--biu-color-emphasis)' }} />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function SortableViewRow({
  view,
  active,
  onSelect,
  onCopy,
  onDelete,
  onChangeProtection,
  protectionMenuOpen,
  onToggleProtectionMenu,
  canRemove,
  isLastPublic,
  viewerIsAdmin,
}: {
  view: SavedView
  active: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onChangeProtection?: (view: SavedView, protection: ViewProtection) => void
  protectionMenuOpen?: boolean
  onToggleProtectionMenu?: () => void
  canRemove: boolean
  isLastPublic?: boolean
  viewerIsAdmin?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: view.id })
  return (
    <ViewRowShell
      view={view}
      active={active}
      onSelect={onSelect}
      onCopy={onCopy}
      onDelete={onDelete}
      onChangeProtection={onChangeProtection}
      protectionMenuOpen={protectionMenuOpen}
      onToggleProtectionMenu={onToggleProtectionMenu}
      canRemove={canRemove}
      isLastPublic={isLastPublic}
      viewerIsAdmin={viewerIsAdmin}
      rowRef={setNodeRef}
      className={isDragging ? 'is-drag' : undefined}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      grip={
        <button type="button" className="fsdb-query-grip" aria-label="拖动调整视图顺序" {...attributes} {...listeners}>
          <DndGrip />
        </button>
      }
    />
  )
}

export function ViewOrderMenu({
  views,
  activeViewId,
  onSelect,
  onCopy,
  onDelete,
  onChangeProtection,
  onReorder,
  onAdd,
}: {
  views: SavedView[]
  activeViewId: string | null
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onChangeProtection?: (view: SavedView, protection: ViewProtection) => void
  onReorder: (ids: string[]) => void
  onAdd: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [protectionOpenId, setProtectionOpenId] = useState<string | null>(null)
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false)
  useEffect(() => {
    let alive = true
    void loadViewerIdentity().then((viewer) => {
      if (alive) setViewerIsAdmin(viewer.isAdmin)
    })
    return () => {
      alive = false
    }
  }, [])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const ids = views.map((view) => view.id)
  const canRemove = canRemoveCollectionView(views)
  const active = views.find((view) => view.id === activeId)
  const foot = (
    <div className="tasks-viewdd-foot">
      <button type="button" className="tasks-viewdd-saveas fsdb-tool-row font-medium" onClick={onAdd}>
        <PlusIcon aria-hidden className="size-[14px]" />
        添加视图
      </button>
    </div>
  )

  return (
    <SearchableFlyout className="tasks-viewdd-menu">
      {(q) => {
        const hits = views.filter((view) => flyoutQueryMatch(view.name, q))
        const searching = Boolean(q.trim())
        if (!views.length) {
          return (
            <>
              <div className="tasks-viewdd-empty">还没有已保存的视图</div>
              {foot}
            </>
          )
        }
        if (searching) {
          return (
            <>
              {hits.length ? (
                hits.map((view) => (
                  <ViewRowShell
                    key={view.id}
                    view={view}
                    active={view.id === activeViewId}
                    onSelect={onSelect}
                    onCopy={onCopy}
                    onDelete={onDelete}
                    onChangeProtection={onChangeProtection}
                    protectionMenuOpen={protectionOpenId === view.id}
                    onToggleProtectionMenu={() =>
                      setProtectionOpenId((prev) => (prev === view.id ? null : view.id))
                    }
                    canRemove={canRemove && canDeleteSavedView(view)}
                    isLastPublic={isLastPublicViewForTable(view, views)}
                    viewerIsAdmin={viewerIsAdmin}
                    grip={
                      <span className="fsdb-query-grip is-locked" aria-hidden>
                        <DndGrip />
                      </span>
                    }
                  />
                ))
              ) : (
                <FlyoutEmpty />
              )}
              {foot}
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
                const from = ids.indexOf(String(event.active.id))
                const to = ids.indexOf(String(overId))
                if (from < 0 || to < 0) return
                onReorder(moveList(ids, from, to))
              }}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {views.map((view) => (
                  <SortableViewRow
                    key={view.id}
                    view={view}
                    active={view.id === activeViewId}
                    onSelect={onSelect}
                    onCopy={onCopy}
                    onDelete={onDelete}
                    onChangeProtection={onChangeProtection}
                    protectionMenuOpen={protectionOpenId === view.id}
                    onToggleProtectionMenu={() =>
                      setProtectionOpenId((prev) => (prev === view.id ? null : view.id))
                    }
                    canRemove={canRemove && canDeleteSavedView(view)}
                    isLastPublic={isLastPublicViewForTable(view, views)}
                    viewerIsAdmin={viewerIsAdmin}
                  />
                ))}
              </SortableContext>
              <DragOverlay zIndex={overlayZ(280)}>
                {active ? (
                  <div className="fsdb-query-drag-overlay" data-fsdb-sort-overlay>
                    <ViewRowShell
                      view={active}
                      active={active.id === activeViewId}
                      onSelect={() => undefined}
                      onCopy={() => undefined}
                      onDelete={() => undefined}
                      canRemove={canRemove}
                      grip={
                        <button type="button" className="fsdb-query-grip" tabIndex={-1}>
                          <DndGrip />
                        </button>
                      }
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            {foot}
          </>
        )
      }}
    </SearchableFlyout>
  )
}
