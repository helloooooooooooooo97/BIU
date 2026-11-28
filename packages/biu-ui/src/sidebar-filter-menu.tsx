import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { readStorageString, writeStorageString } from './client-storage.ts'
import { computeFloatingPosition } from './floating-position.ts'
import { overlayPortalRoot, overlayZ } from './overlay-portal.ts'

export type SidebarFilterOption = {
  value: string
  label: string
}

export type SidebarFilterSelectRow = {
  id: string
  label: string
  value: string
  defaultValue: string
  options: readonly SidebarFilterOption[]
  onChange: (value: string) => void
}

export type SidebarFilterToggleRow = {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export type SidebarFilterAction = {
  id: string
  label: string
  disabled?: boolean
  onSelect: () => void
}

export type SidebarFilterMenuProps = {
  testId?: string
  title?: string
  grouping?: SidebarFilterSelectRow
  ordering?: SidebarFilterSelectRow
  shows?: readonly SidebarFilterToggleRow[]
  filters?: readonly SidebarFilterSelectRow[]
  hasActiveFilters?: boolean
  onResetFilters?: () => void
  action?: SidebarFilterAction
}

export type TimeBucketKey = 'today' | 'week' | 'month' | 'older'

export const TIME_BUCKET_ORDER: ReadonlyArray<{ key: TimeBucketKey; label: string }> = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '近 7 天' },
  { key: 'month', label: '近 30 天' },
  { key: 'older', label: '更早' },
]

const DAY_MS = 24 * 60 * 60 * 1000

export function timeBucketForTimestamp(ts?: number, now = Date.now()): TimeBucketKey {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return 'older'
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (ts >= startOfToday.getTime()) return 'today'
  if (ts >= startOfToday.getTime() - 6 * DAY_MS) return 'week'
  if (ts >= startOfToday.getTime() - 29 * DAY_MS) return 'month'
  return 'older'
}

type WidenPref<V> = V extends boolean ? boolean : V extends string ? string : V
type WidenedPrefs<T extends Record<string, string | boolean>> = { [K in keyof T]: WidenPref<T[K]> }

export function useSidebarViewPrefs<T extends Record<string, string | boolean>>(
  storageKey: string,
  defaults: T,
): [WidenedPrefs<T>, (patch: Partial<WidenedPrefs<T>>) => void, () => void] {
  const defaultsRef = useRef<WidenedPrefs<T>>(defaults as WidenedPrefs<T>)
  defaultsRef.current = defaults as WidenedPrefs<T>

  const [prefs, setPrefs] = useState<WidenedPrefs<T>>(() => {
    try {
      const raw = readStorageString(storageKey)
      if (!raw) return defaults as WidenedPrefs<T>
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object') return defaults as WidenedPrefs<T>
      const merged = { ...(defaults as WidenedPrefs<T>) }
      for (const key of Object.keys(defaults) as Array<keyof T>) {
        const val = parsed[key as string]
        if (typeof val === typeof defaults[key]) {
          merged[key] = val as WidenedPrefs<T>[keyof T]
        }
      }
      return merged
    } catch {
      return defaults as WidenedPrefs<T>
    }
  })

  const patchPrefs = useCallback(
    (patch: Partial<WidenedPrefs<T>>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch }
        try {
          writeStorageString(storageKey, JSON.stringify(next))
        } catch {
          /* ignore storage quota errors */
        }
        return next
      })
    },
    [storageKey],
  )

  const resetPrefs = useCallback(() => {
    const next = { ...defaultsRef.current }
    setPrefs(next)
    try {
      writeStorageString(storageKey, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [storageKey])

  return [prefs, patchPrefs, resetPrefs]
}

function FilterLinesGlyph({ className = 'size-3.5 shrink-0' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M2.5 4h11M4.5 8h7M6.5 12h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChevronRightGlyph({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`size-3.5 shrink-0 text-(--biu-color-text-subtle) transition-transform duration-150 ${
        open ? 'rotate-90' : ''
      }`}
    >
      <path
        d="M6.25 4.25 10 8l-3.75 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5 shrink-0 text-(--biu-color-emphasis)">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Cursor 风格的侧边栏视图控制浮窗（分组 / 排序 / 显示 / 筛选 + 一键重置）。
 * 复用于左侧边栏的「聊天 / 代理 / 文档」三个分区，所有偏好存放在本地 localStorage。
 */
export function SidebarFilterMenu({
  testId = 'sidebar-filter',
  title = '分组、排序与筛选',
  grouping,
  ordering,
  shows,
  filters,
  hasActiveFilters,
  onResetFilters,
  action,
}: SidebarFilterMenuProps) {
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const computedFilterActive =
    hasActiveFilters ??
    Boolean(filters?.some((f) => f.value !== f.defaultValue))
  const hasNonDefaultView =
    computedFilterActive ||
    Boolean(grouping && grouping.value !== grouping.defaultValue) ||
    Boolean(ordering && ordering.value !== ordering.defaultValue)

  useEffect(() => {
    if (!open) {
      setExpandedId(null)
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null)
      return
    }
    const update = () => {
      if (!btnRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      const menuRect = menuRef.current?.getBoundingClientRect()
      const placed = computeFloatingPosition({
        anchor: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
        floating: {
          width: menuRect?.width || 236,
          height: menuRect?.height || 260,
        },
        placement: 'right-start',
        offset: 8,
        padding: 8,
      })
      setPos({ left: placed.left, top: placed.top })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, expandedId])

  const renderSelectSection = (row: SidebarFilterSelectRow, showDot = false) => {
    const isExpanded = expandedId === row.id
    const currentLabel = row.options.find((opt) => opt.value === row.value)?.label ?? row.value
    const isActive = row.value !== row.defaultValue
    return (
      <div key={row.id} className="min-w-0">
        <button
          type="button"
          data-testid={`${testId}-row-${row.id}`}
          aria-expanded={isExpanded}
          className="flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-[8px] border-0 bg-transparent px-2.5 text-[12.5px] text-(--biu-color-text) transition-colors hover:bg-(--biu-color-bg-popover-hover)"
          onClick={() => setExpandedId((prev) => (prev === row.id ? null : row.id))}
        >
          <span className="truncate font-normal">{row.label}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {showDot && isActive ? (
              <span className="size-1.5 rounded-full bg-(--biu-color-emphasis)" aria-hidden="true" />
            ) : !showDot ? (
              <span className="text-[12px] text-(--biu-color-text-muted)">{currentLabel}</span>
            ) : null}
            <ChevronRightGlyph open={isExpanded} />
          </span>
        </button>
        {isExpanded ? (
          <div className="my-0.5 space-y-0.5 rounded-[8px] bg-(--biu-color-bg-muted)/55 p-1">
            {row.options.map((opt) => {
              const selected = opt.value === row.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`${testId}-opt-${row.id}-${opt.value}`}
                  className={`flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-[6px] border-0 px-2 text-left text-[12px] transition-colors ${
                    selected
                      ? 'bg-(--biu-color-bg-elevated) font-medium text-(--biu-color-text)'
                      : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                  }`}
                  onClick={() => row.onChange(opt.value)}
                >
                  <span className="truncate">{opt.label}</span>
                  {selected ? <CheckGlyph /> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  const hasShows = Boolean(shows?.length)
  const hasFilters = Boolean(filters?.length)
  const showsExpanded = expandedId === '__shows__'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-testid={`${testId}-trigger`}
        data-active={hasNonDefaultView ? 'true' : 'false'}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border-0 p-0 transition-colors ${
          open || hasNonDefaultView
            ? 'bg-(--biu-color-emphasis-muted) text-(--biu-color-emphasis)'
            : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)'
        }`}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((prev) => !prev)
        }}
      >
        <FilterLinesGlyph />
        {hasNonDefaultView ? (
          <span
            className="pointer-events-none absolute top-0.5 right-0.5 size-1.5 rounded-full bg-(--biu-color-emphasis)"
            aria-hidden="true"
          />
        ) : null}
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-testid={`${testId}-popover`}
              data-sidebar-flyout-keep=""
              className="w-[236px] rounded-[12px] border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover)/98 p-1.5 text-(--biu-color-text) shadow-(--biu-shadow-popover) backdrop-blur-xl"
              style={{
                position: 'fixed',
                left: pos?.left ?? -9999,
                top: pos?.top ?? -9999,
                zIndex: overlayZ(240, btnRef.current),
                visibility: pos ? 'visible' : 'hidden',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="space-y-0.5">
                {grouping ? renderSelectSection(grouping, false) : null}
                {ordering ? renderSelectSection(ordering, false) : null}
                {hasShows ? (
                  <div className="min-w-0">
                    <button
                      type="button"
                      data-testid={`${testId}-row-shows`}
                      aria-expanded={showsExpanded}
                      className="flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-[8px] border-0 bg-transparent px-2.5 text-[12.5px] text-(--biu-color-text) transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                      onClick={() => setExpandedId((prev) => (prev === '__shows__' ? null : '__shows__'))}
                    >
                      <span className="truncate">显示</span>
                      <ChevronRightGlyph open={showsExpanded} />
                    </button>
                    {showsExpanded ? (
                      <div className="my-0.5 space-y-0.5 rounded-[8px] bg-(--biu-color-bg-muted)/55 p-1">
                        {shows!.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            data-testid={`${testId}-show-${item.id}`}
                            role="menuitemcheckbox"
                            aria-checked={item.checked}
                            className="flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-[6px] border-0 bg-transparent px-2 text-left text-[12px] text-(--biu-color-text) transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                            onClick={() => item.onChange(!item.checked)}
                          >
                            <span className="truncate">{item.label}</span>
                            {item.checked ? <CheckGlyph /> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {hasFilters ? (
                <>
                  <div className="my-1.5 h-px bg-(--biu-color-border)/60" />
                  <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-medium text-(--biu-color-text-subtle)">
                    <span>筛选</span>
                    {onResetFilters ? (
                      <button
                        type="button"
                        data-testid={`${testId}-reset`}
                        disabled={!hasNonDefaultView}
                        className={`border-0 bg-transparent p-0 text-[11px] transition-colors ${
                          hasNonDefaultView
                            ? 'cursor-pointer text-(--biu-color-text-muted) hover:text-(--biu-color-text)'
                            : 'cursor-default text-(--biu-color-text-subtle)/50'
                        }`}
                        onClick={() => {
                          onResetFilters()
                          setExpandedId(null)
                        }}
                      >
                        重置
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-0.5">
                    {filters!.map((filter) => renderSelectSection(filter, true))}
                  </div>
                </>
              ) : null}

              {action ? (
                <>
                  <div className="my-1.5 h-px bg-(--biu-color-border)/60" />
                  <button
                    type="button"
                    data-testid={`${testId}-action-${action.id}`}
                    disabled={action.disabled}
                    className={`flex h-8 w-full items-center rounded-[8px] border-0 bg-transparent px-2.5 text-left text-[12.5px] transition-colors ${
                      action.disabled
                        ? 'cursor-default text-(--biu-color-text-subtle)/50'
                        : 'cursor-pointer text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)'
                    }`}
                    onClick={() => {
                      if (action.disabled) return
                      action.onSelect()
                      setOpen(false)
                    }}
                  >
                    {action.label}
                  </button>
                </>
              ) : null}
            </div>,
            overlayPortalRoot(btnRef.current) ?? document.body,
          )
        : null}
    </>
  )
}
