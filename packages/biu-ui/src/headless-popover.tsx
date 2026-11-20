import * as Popover from '@radix-ui/react-popover'
import { useCallback, useEffect, useRef, useState, type ReactElement, type RefObject } from 'react'
import { HEADLESS_DISMISS_IGNORE } from './headless-dismiss.tsx'
import { claimOverlayOpen, overlayPortalRoot, overlayZ, releaseOverlayOpen } from './overlay-portal.ts'

function shouldIgnoreOutside(event: { target: EventTarget | null; detail?: { originalEvent?: Event } }, ignoreSelector: string, inside?: (node: Node) => boolean) {
  const orig = event.detail?.originalEvent
  const path = orig && typeof orig.composedPath === 'function' ? orig.composedPath() : []
  return [...path, event.target].some((target) =>
    (target instanceof Node && inside?.(target)) ||
    (target instanceof Element && ignoreSelector && target.closest(ignoreSelector)),
  )
}

/** 无头 Popover：Radix 定位 / Portal / 点外关闭 / Esc / 同级互斥（保留嵌套父级）。不带视觉样式。 */
export function HeadlessPopover({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  anchorRef,
  children,
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  alignOffset = 0,
  avoidCollisions = true,
  modal = false,
  autoFocus = false,
  ignoreSelector = HEADLESS_DISMISS_IGNORE,
  inside,
  container,
  zIndex = 300,
  exclusiveGroup = 'popover',
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactElement
  anchorRef?: RefObject<HTMLElement | null>
  children: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  alignOffset?: number
  avoidCollisions?: boolean
  modal?: boolean
  autoFocus?: boolean
  ignoreSelector?: string
  inside?: (node: Node) => boolean
  container?: HTMLElement | null
  zIndex?: number
  exclusiveGroup?: string | false
}) {
  const [innerOpen, setInnerOpen] = useState(Boolean(defaultOpen))
  const isOpen = open ?? innerOpen
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const idRef = useRef<symbol | null>(null)
  if (!idRef.current) idRef.current = Symbol('headless-popover')

  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const setOpenState = useCallback(
    (next: boolean) => {
      if (open === undefined) setInnerOpen(next)
      onOpenChangeRef.current?.(next)
    },
    [open],
  )

  useEffect(() => {
    const id = idRef.current!
    if (!isOpen || exclusiveGroup === false) {
      releaseOverlayOpen(id)
      return
    }
    const triggerEl = anchorRef?.current ?? triggerRef.current
    claimOverlayOpen(
      {
        id,
        group: exclusiveGroup,
        close: () => setOpenState(false),
        contentEl: () => contentRef.current,
      },
      triggerEl,
    )
    return () => releaseOverlayOpen(id)
  }, [anchorRef, exclusiveGroup, isOpen, setOpenState])

  const resolvedZ = overlayZ(zIndex, anchorRef?.current ?? triggerRef.current)
  const liftTier = resolvedZ >= 500 ? '500' : resolvedZ >= 360 ? '360' : undefined

  return (
    <Popover.Root open={isOpen} onOpenChange={setOpenState} modal={modal}>
      {anchorRef ? <Popover.Anchor virtualRef={anchorRef as RefObject<HTMLElement>} /> : null}
      {trigger ? (
        <Popover.Trigger asChild ref={triggerRef}>
          {trigger}
        </Popover.Trigger>
      ) : null}
      <Popover.Portal container={container ?? overlayPortalRoot(anchorRef?.current ?? triggerRef.current) ?? undefined}>
        <Popover.Content
          ref={contentRef}
          className="biu-headless-pop"
          data-overlay-z={liftTier}
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          avoidCollisions={avoidCollisions}
          collisionPadding={8}
          style={{ zIndex: resolvedZ }}
          onOpenAutoFocus={(event) => {
            if (!autoFocus) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            if (shouldIgnoreOutside(event, ignoreSelector, inside)) event.preventDefault()
          }}
          onFocusOutside={(event) => {
            if (shouldIgnoreOutside(event, ignoreSelector, inside)) event.preventDefault()
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
