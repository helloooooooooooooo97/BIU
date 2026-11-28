import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { computeFloatingPosition } from '@biu/biu-ui/floating-position'
import { overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'

export const SIDEBAR_ROW_MAIN_CLASS =
  'chat-session-row-main flex h-full min-w-0 flex-1 items-center gap-1.5 py-0 text-left text-[14px] leading-5'

export function SidebarRowMain({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className ? `${SIDEBAR_ROW_MAIN_CLASS} ${className}` : SIDEBAR_ROW_MAIN_CLASS} {...rest}>
      {children}
    </div>
  )
}

export type SidebarRowMenuItem = {
  id: string
  label: string
  icon?: ReactNode
  danger?: boolean
  onSelect: () => void
}

function MoreDotsGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <circle cx="3.5" cy="8" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="12.5" cy="8" r="1.35" />
    </svg>
  )
}

export function SidebarRow({
  active,
  pinned,
  main,
  trail,
  onClick,
  onDelete,
  deleteLabel,
  deleteIcon,
  onStar,
  starOn,
  starLabel,
  starIcon,
  menuItems,
  moreLabel,
  attrs,
}: {
  active?: boolean
  pinned?: boolean
  main: ReactNode
  trail?: ReactNode
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onDelete?: () => void
  deleteLabel?: string
  deleteIcon?: ReactNode
  onStar?: () => void
  starOn?: boolean
  starLabel?: string
  starIcon?: ReactNode
  menuItems?: SidebarRowMenuItem[]
  moreLabel?: string
  attrs?: Record<string, unknown>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const items: SidebarRowMenuItem[] = [
    ...(menuItems ?? []),
    ...(onDelete
      ? [
          {
            id: 'delete',
            label: '删除',
            icon: deleteIcon,
            danger: true,
            onSelect: onDelete,
          },
        ]
      : []),
  ]
  const hasMenu = items.length > 0

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const onScroll = () => setMenuOpen(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) {
      setPos(null)
      return
    }
    const rect = btnRef.current.getBoundingClientRect()
    const el = menuRef.current
    const placed = computeFloatingPosition({
      anchor: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      },
      floating: { width: el?.offsetWidth || 136, height: el?.offsetHeight || 40 },
      placement: 'bottom-end',
      offset: 6,
      padding: 8,
    })
    setPos({ left: placed.left, top: placed.top })
  }, [menuOpen])

  const portalRoot =
    menuOpen && btnRef.current && typeof document !== 'undefined'
      ? (overlayPortalRoot(btnRef.current) ?? document.body)
      : null

  return (
    <div
      className={`chat-session-row group${active ? ' is-active' : ''}${pinned ? ' is-pinned' : ''}${menuOpen ? ' is-menu-open' : ''}`}
      onClick={onClick}
      {...attrs}
    >
      {main}
      {trail}
      {onStar ? (
        <button
          type="button"
          className={`chat-session-row-star${starOn ? ' is-on' : ''}`}
          aria-pressed={Boolean(starOn)}
          aria-label={starLabel ?? (starOn ? '取消收藏' : '收藏')}
          title={starOn ? '取消收藏' : '收藏'}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onStar()
          }}
        >
          {starIcon}
        </button>
      ) : null}
      {hasMenu ? (
        <button
          ref={btnRef}
          type="button"
          className={`chat-session-row-delete chat-session-row-more${menuOpen ? ' is-open' : ''}`}
          title="更多操作"
          aria-label={moreLabel ?? '更多操作'}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-testid="sidebar-row-more"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setMenuOpen((prev) => !prev)
          }}
        >
          <MoreDotsGlyph />
        </button>
      ) : null}
      {menuOpen && portalRoot
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-testid="sidebar-row-menu"
              className="sidebar-row-menu"
              style={{
                left: pos?.left ?? -9999,
                top: pos?.top ?? -9999,
                zIndex: overlayZ(220, btnRef.current),
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  data-testid={`sidebar-row-menu-${item.id}`}
                  className={`sidebar-row-menu-item${item.danger ? ' is-danger' : ''}`}
                  aria-label={item.id === 'delete' ? (deleteLabel ?? item.label) : item.label}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setMenuOpen(false)
                    item.onSelect()
                  }}
                >
                  {item.icon ? <span className="sidebar-row-menu-ico" aria-hidden>{item.icon}</span> : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            portalRoot,
          )
        : null}
    </div>
  )
}
