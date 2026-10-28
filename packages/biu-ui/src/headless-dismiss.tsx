import { DismissableLayer } from '@radix-ui/react-dismissable-layer'
import type { ReactElement, RefObject } from 'react'

/** 第三方 portal（日期面板、删除确认）不算点在外面。 */
export const HEADLESS_DISMISS_IGNORE =
  '.biu-calendar, .biu-image-preview, .pick-chip-data, [data-testid="pick-chip-data"], [data-testid="chat-session-delete-dialog"]'

function asNode(target: EventTarget | null): Node | null {
  return target instanceof Node ? target : null
}

function shouldIgnore(target: EventTarget | null, ignoreSelector: string, insideRef?: RefObject<HTMLElement | null>, inside?: (node: Node) => boolean) {
  const node = asNode(target)
  if (!node) return false
  if (insideRef?.current?.contains(node) || inside?.(node)) return true
  return Boolean(ignoreSelector && node instanceof Element && node.closest(ignoreSelector))
}

function eventTargets(event: { target: EventTarget | null; detail?: { originalEvent?: Event } }): EventTarget[] {
  const orig = event.detail?.originalEvent
  const path = orig && typeof orig.composedPath === 'function' ? orig.composedPath() : []
  return [...path, event.target].filter((item): item is EventTarget => item != null)
}

/** 无样式：点外面 / Esc 关闭。底层是 Radix DismissableLayer。 */
export function HeadlessDismiss({
  onDismiss,
  insideRef,
  inside,
  ignoreSelector = HEADLESS_DISMISS_IGNORE,
  enabled = true,
  onEscapeKeyDown,
  children,
}: {
  onDismiss: () => void
  insideRef?: RefObject<HTMLElement | null>
  inside?: (node: Node) => boolean
  ignoreSelector?: string
  enabled?: boolean
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  children: ReactElement
}) {
  if (!enabled) return children
  return (
    <DismissableLayer
      asChild
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={(event) => {
        if (eventTargets(event).some((target) => shouldIgnore(target, ignoreSelector, insideRef, inside))) {
          event.preventDefault()
        }
      }}
      onFocusOutside={(event) => {
        if (eventTargets(event).some((target) => shouldIgnore(target, ignoreSelector, insideRef, inside))) {
          event.preventDefault()
        }
      }}
      onDismiss={onDismiss}
    >
      {children}
    </DismissableLayer>
  )
}
