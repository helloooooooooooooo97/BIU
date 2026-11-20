import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPosition, type FloatingPlacement } from './floating-position.ts'
import { HeadlessDismiss } from './headless-dismiss.tsx'
import { claimOverlayOpen, overlayPortalRoot, overlayZ, releaseOverlayOpen } from './overlay-portal.ts'

export function AnchorMenu({
  anchor,
  onClose,
  children,
  className = 'fsdb-cellselect-menu',
  role = 'listbox',
  zIndex = 340,
  minWidth = 220,
  placement = 'bottom',
  inside,
  exclusiveGroup = 'popover',
  style,
  ...rest
}: {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  className?: string
  role?: string
  zIndex?: number
  minWidth?: number
  placement?: 'bottom' | 'right' | 'left'
  inside?: (node: Node) => boolean
  exclusiveGroup?: string | false
} & Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'className' | 'children'>) {
  const menuRef = useRef<HTMLDivElement>(null)
  const idRef = useRef<symbol | null>(null)
  if (!idRef.current) idRef.current = Symbol('anchor-menu')
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const id = idRef.current!
    if (!anchor || exclusiveGroup === false) {
      releaseOverlayOpen(id)
      return
    }
    claimOverlayOpen(
      {
        id,
        group: exclusiveGroup,
        close: () => onCloseRef.current(),
        contentEl: () => menuRef.current,
      },
      anchor,
    )
    return () => releaseOverlayOpen(id)
  }, [anchor, exclusiveGroup])
  const resolvedPlacement: FloatingPlacement =
    placement === 'right' ? 'right-start' : placement === 'left' ? 'left-start' : 'bottom-start'

  const pos = useFloatingPosition(anchor, menuRef, {
    placement: resolvedPlacement,
    offset: placement === 'bottom' ? 4 : 8,
    padding: 8,
    fallbackWidth: minWidth,
    fallbackHeight: 240,
    enabled: Boolean(anchor),
  })

  if (!anchor) return null
  const width = Math.min(Math.max(minWidth, pos.anchorWidth), pos.maxWidth)

  return createPortal(
    <HeadlessDismiss onDismiss={onClose} inside={(node) => Boolean(anchor.contains(node) || inside?.(node))}>
      <div
        ref={menuRef}
        className={className}
        role={role}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width,
          maxHeight: pos.maxHeight,
          overflowY: 'auto',
          zIndex: overlayZ(zIndex, anchor),
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    </HeadlessDismiss>,
    overlayPortalRoot(anchor) ?? document.body,
  )
}
