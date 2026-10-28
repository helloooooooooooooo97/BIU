import * as Popover from '@radix-ui/react-popover'
import type { ReactElement } from 'react'
import { HEADLESS_DISMISS_IGNORE } from './headless-dismiss.tsx'
import { overlayPortalRoot } from './overlay-portal.ts'

function eventTargets(event: { target: EventTarget | null; currentTarget?: EventTarget | null; detail?: { originalEvent?: Event } }) {
  const orig = event.detail?.originalEvent
  const path = orig && typeof orig.composedPath === 'function' ? orig.composedPath() : []
  return [...path, event.target].filter((item): item is EventTarget => item != null)
}

function shouldIgnoreOutside(event: { target: EventTarget | null; currentTarget?: EventTarget | null; detail?: { originalEvent?: Event } }, ignoreSelector: string) {
  const content = event.currentTarget
  return eventTargets(event).some((target) => {
    if (content instanceof Node && target instanceof Node && content.contains(target)) return true
    return Boolean(ignoreSelector && target instanceof Element && target.closest(ignoreSelector))
  })
}

/** 无头 Popover：自带定位、Portal、点外关闭、Esc。不带视觉样式。 */
export function HeadlessPopover({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  avoidCollisions = true,
  modal = false,
  autoFocus = false,
  ignoreSelector = HEADLESS_DISMISS_IGNORE,
  container,
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  trigger: ReactElement
  children: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  avoidCollisions?: boolean
  modal?: boolean
  autoFocus?: boolean
  ignoreSelector?: string
  container?: HTMLElement | null
}) {
  return (
    <Popover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal={modal}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal container={container ?? overlayPortalRoot() ?? undefined}>
        <Popover.Content
          asChild
          side={side}
          align={align}
          sideOffset={sideOffset}
          avoidCollisions={avoidCollisions}
          collisionPadding={8}
          onOpenAutoFocus={(event) => {
            if (!autoFocus) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            if (shouldIgnoreOutside(event, ignoreSelector)) event.preventDefault()
          }}
          onFocusOutside={(event) => {
            if (!autoFocus || shouldIgnoreOutside(event, ignoreSelector)) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (shouldIgnoreOutside(event, ignoreSelector)) event.preventDefault()
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
