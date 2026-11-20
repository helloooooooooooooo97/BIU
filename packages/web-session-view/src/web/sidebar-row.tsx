import type { HTMLAttributes, MouseEvent, ReactNode } from 'react'

export const SIDEBAR_ROW_MAIN_CLASS =
  'chat-session-row-main flex h-full min-w-0 flex-1 items-center gap-1.5 py-0 text-left text-[14px] leading-5'

export function SidebarRowMain({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className ? `${SIDEBAR_ROW_MAIN_CLASS} ${className}` : SIDEBAR_ROW_MAIN_CLASS} {...rest}>
      {children}
    </div>
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
  attrs?: Record<string, unknown>
}) {
  return (
    <div
      className={`chat-session-row group${active ? ' is-active' : ''}${pinned ? ' is-pinned' : ''}`}
      onClick={onClick}
      {...attrs}
    >
      {main}
      {trail}
      {onDelete ? (
        <button
          type="button"
          className="chat-session-row-delete"
          title="删除"
          aria-label={deleteLabel ?? '删除'}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete()
          }}
        >
          {deleteIcon}
        </button>
      ) : null}
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
    </div>
  )
}
