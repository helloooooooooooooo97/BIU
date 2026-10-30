import { createElement, lazy, Suspense, type ComponentType } from 'react'
import type { Context } from 'cordis'
import { SignalIcon, MapIcon } from '@heroicons/react/16/solid'
import { bindSessionView, type SessionViewService } from '@biu/web-session-view'
import type { SlotProps } from '@biu/web-slots'
import { ChatSelectBubble } from './chat-select-bubble.tsx'
import { bindProjectView, type ProjectViewService } from '@biu/web-project-view'
import type { PickService } from '@biu/core-pick/web'
import type { DatabaseUi } from '@biu/type-file-system/ui'

export const name = 'chat-ui'
export const inject = ['slots', 'sessionView', 'projectView']

function lazySlot<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  const Comp = lazy(load)
  return function LazySlot(props: P) {
    return createElement(Suspense, { fallback: null }, createElement(Comp, props))
  }
}

const ChatThread = lazySlot(() => import('./thread.tsx').then((m) => ({ default: m.ChatThread })))
const ChatMessageOutline = lazySlot(() =>
  import('./message-outline.tsx').then((m) => ({ default: m.ChatMessageOutline })),
)
const TrajectoryView = lazySlot(() => import('./trajectory.tsx').then((m) => ({ default: m.TrajectoryView })))
const UsagePanel = lazySlot(() => import('./usage-panel.tsx').then((m) => ({ default: m.UsagePanel })))
const ChatComposer = lazySlot(() => import('./composer.tsx').then((m) => ({ default: m.ChatComposer })))
const ChatConfigBanner = lazySlot(() => import('./config-banner.tsx').then((m) => ({ default: m.ChatConfigBanner })))
const ApprovalsRail = lazySlot(() => import('./approvals.tsx').then((m) => ({ default: m.ApprovalsRail })))
const ChatLiveHud = lazySlot(() => import('./live-hud.tsx').then((m) => ({ default: m.ChatLiveHud })))

function InspectorTrajectory(props: SlotProps) {
  return createElement(
    'div',
    { className: 'flex min-h-0 flex-1 flex-col overflow-hidden', 'data-testid': 'inspector-trajectory' },
    createElement(TrajectoryView, props),
  )
}

function InspectorUsage(props: SlotProps) {
  return createElement(
    'div',
    { className: 'min-h-0 flex-1 overflow-y-auto p-2.5', 'data-testid': 'inspector-usage' },
    createElement(UsagePanel, {
      useSessionView: props.useSessionView as ReturnType<typeof bindSessionView>,
      sessionView: props.sessionView as SessionViewService,
    }),
  )
}

export function apply(ctx: Context) {
  const view = ctx.sessionView as SessionViewService
  const project = ctx.projectView as ProjectViewService
  const slotProps = {
    useSessionView: bindSessionView(view),
    sessionView: view,
    useProjectView: bindProjectView(project),
    projectView: project,
  }
  const props = () => slotProps
  ctx.slots.place('root-overlays', ChatSelectBubble, { key: 'chat-select-bubble', order: 12 })
  ctx.slots.place('stage', ChatThread, { key: 'chat-thread', order: 1, props })
  ctx.slots.place('stage-aside', ChatMessageOutline, { key: 'chat-outline', order: 1, props })
  ctx.slots.place('trajectory', TrajectoryView, { key: 'trajectory', order: 1, props })
  ctx.slots.place('composer', ChatComposer, {
    key: 'chat',
    order: 10,
    props: () => ({ ...slotProps, pick: ctx.get('pick') as PickService | undefined }),
  })
  ctx.slots.place('dock', ChatConfigBanner, { key: 'chat-config-banner', order: 1 })
  ctx.slots.place('dock', ApprovalsRail, { key: 'approvals', order: 5, props })
  ctx.slots.place('dock', ChatLiveHud, { key: 'chat-live-hud', order: 0, props })
  ctx.slots.place('inspector-panels', InspectorTrajectory, {
    key: 'chat-traj',
    order: 1,
    props: () => ({
      ...slotProps,
      tabId: 'traj',
      tabLabel: '轨迹',
      tabIcon: MapIcon,
      ensureTrajectory: true,
      focusOnCall: true,
      requiresSession: true,
      centerKinds: ['session'],
    }),
  })
  ctx.slots.place('inspector-panels', InspectorUsage, {
    key: 'chat-usage',
    order: 2,
    props: () => ({
      ...slotProps,
      tabId: 'usage',
      tabLabel: '用量',
      tabIcon: SignalIcon,
      requiresSession: true,
      centerKinds: ['session'],
    }),
  })
  ctx.inject(['databaseUi'], (inner) => {
    const ui = inner.get('databaseUi') as DatabaseUi
    let sessions: { dispose: () => void } | undefined
    void import('./sessions-chrome.tsx').then((mod) => {
      sessions = ui.decorate('/agents', mod.sessionsChrome())
    })
    return () => {
      sessions?.dispose()
    }
  })
}
