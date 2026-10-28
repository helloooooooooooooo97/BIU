import * as Popover from '@radix-ui/react-popover'
import { cloneElement, useRef, useState, type ReactElement, type Ref } from 'react'
import { HEADLESS_DISMISS_IGNORE } from './headless-dismiss.tsx'
import { overlayPortalRoot } from './overlay-portal.ts'

function eventTargets(event: { target: EventTarget | null; detail?: { originalEvent?: Event } }): EventTarget[] {
  const orig = event.detail?.originalEvent
  const path = orig && typeof orig.composedPath === 'function' ? orig.composedPath() : []
  return [...path, event.target].filter((item): item is EventTarget => item != null)
}

function shouldIgnoreOutside(
  event: { target: EventTarget | null; detail?: { originalEvent?: Event } },
  ignoreSelector: string,
  trigger: HTMLElement | null,
) {
  return eventTargets(event).some((target) => {
    if (target instanceof Node && trigger?.contains(target)) return true
    return target instanceof Element && Boolean(ignoreSelector && target.closest(ignoreSelector))
  })
}

function mergeRef<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as { current: T | null }).current = node
    }
  }
}

/** 无头 Popover：自带定位、Portal、点外关闭、Esc。点触发器不算外面，开着时再点触发器也不关。 */
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
  const triggerRef = useRef<HTMLElement | null>(null)
  const [innerOpen, setInnerOpen] = useState(Boolean(defaultOpen))
  const resolvedOpen = open ?? innerOpen

  function setResolvedOpen(next: boolean) {
    if (open === undefined) setInnerOpen(next)
    onOpenChange?.(next)
  }

  const triggerProps = trigger.props as {
    ref?: Ref<HTMLElement>
    onPointerDown?: (event: { preventDefault: () => void }) => void
    onClick?: (event: { preventDefault: () => void }) => void
  }

  return (
    <Popover.Root open={resolvedOpen} onOpenChange={setResolvedOpen} modal={modal}>
      <Popover.Trigger asChild>
        {cloneElement(trigger, {
          ref: mergeRef(triggerRef, triggerProps.ref),
          onPointerDown: (event: { preventDefault: () => void }) => {
            triggerProps.onPointerDown?.(event)
            if (resolvedOpen) event.preventDefault()
          },
          onClick: (event: { preventDefault: () => void }) => {
            triggerProps.onClick?.(event)
            if (resolvedOpen) event.preventDefault()
          },
        } as Partial<typeof trigger.props>)}
      </Popover.Trigger>
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
            if (shouldIgnoreOutside(event, ignoreSelector, triggerRef.current)) event.preventDefault()
          }}
          onFocusOutside={(event) => {
            if (shouldIgnoreOutside(event, ignoreSelector, triggerRef.current)) event.preventDefault()
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
