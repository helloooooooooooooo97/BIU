import { createElement, lazy, Suspense, type ComponentType } from 'react'
import type { Context } from 'cordis'
import { ChatBubbleLeftRightIcon, CpuChipIcon, SignalIcon, MapIcon } from '@heroicons/react/16/solid'
import { bindSessionView, type SessionViewService } from '@biu/web-session-view'
import type { SlotProps } from '@biu/web-slots'
import { ChatSelectBubble } from './chat-select-bubble.tsx'
import { bindProjectView, type ProjectViewService } from '@biu/web-slots/project-view'
import type { PickService } from '@biu/core-pick/web'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { bindChannelRealtime } from './channel-store.ts'

export const name = 'chat-ui'
export const inject = ['slots', 'sessionView', 'projectView']

function lazySlot<P extends object = SlotProps>(
  load: () => Promise<{ default: ComponentType<P> }>,
): ComponentType<P> {
  const Comp = lazy(load as () => Promise<{ default: ComponentType<Record<string, unknown>> }>)
  return function LazySlot(props: P) {
    return createElement(Suspense, { fallback: null }, createElement(Comp, props as Record<string, unknown>))
  }
}

const ChatThread = lazySlot(async () => ({ default: (await import('./thread.tsx')).ChatThread }))
const ChatMessageOutline = lazySlot(async () => ({
  default: (await import('./message-outline.tsx')).ChatMessageOutline,
}))
const TrajectoryView = lazySlot(async () => ({ default: (await import('./trajectory.tsx')).TrajectoryView }))
const UsagePanel = lazySlot(async () => ({ default: (await import('./usage-panel.tsx')).UsagePanel }))
const ChatComposer = lazySlot(async () => ({ default: (await import('./composer.tsx')).ChatComposer }))
const ChatConfigBanner = lazySlot(async () => ({ default: (await import('./config-banner.tsx')).ChatConfigBanner }))
const ApprovalsRail = lazySlot(async () => ({ default: (await import('./approvals.tsx')).ApprovalsRail }))
const ChatLiveHud = lazySlot(async () => ({ default: (await import('./live-hud.tsx')).ChatLiveHud }))
const ChannelSidebarSections = lazySlot<SlotProps>(async () => ({
  default: (await import('./channel-sidebar.tsx')).ChannelSidebarSections as unknown as ComponentType<SlotProps>,
}))
const ChannelStage = lazySlot<SlotProps>(async () => ({
  default: (await import('./channel-view.tsx')).ChannelStage as unknown as ComponentType<SlotProps>,
}))
const ChannelRunInspector = lazySlot<SlotProps>(async () => ({
  default: (await import('./channel-run-inspector.tsx')).ChannelRunInspector as unknown as ComponentType<SlotProps>,
}))

function StageChatMessageOutline(props: SlotProps) {
  return createElement(ChatMessageOutline, {
    useSessionView: props.useSessionView as ReturnType<typeof bindSessionView>,
    sessionView: props.sessionView as SessionViewService | undefined,
  })
}

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
  ctx.effect(() => {
    const snap = ctx.get('snapshot') as { onMessage?: (type: string, handler: (payload: unknown) => void) => () => void } | undefined
    return bindChannelRealtime(snap)
  }, 'chat-ui.channels-realtime')

  ctx.slots.place('chat-sidebar-channels', ChannelSidebarSections, { key: 'chat-channels-sidebar', order: 1, props })
  ctx.slots.place('channel-stage', ChannelStage, {
    key: 'chat-channel-stage',
    order: 1,
    props: () => ({ ...slotProps, pick: ctx.get('pick') as PickService | undefined }),
  })
  ctx.slots.place('inspector-panels', ChannelRunInspector, {
    key: 'chat-channel-run',
    order: 3,
    props: () => ({
      ...slotProps,
      tabId: 'channel-run',
      tabLabel: '执行详情',
      tabIcon: CpuChipIcon,
      requiresSession: false,
      centerKinds: ['session', 'channel'],
    }),
  })
  ctx.slots.place('root-overlays', ChatSelectBubble, { key: 'chat-select-bubble', order: 12 })
  ctx.slots.place('stage', ChatThread, { key: 'chat-thread', order: 1, props })
  ctx.slots.place('stage-aside', StageChatMessageOutline, { key: 'chat-outline', order: 1, props })
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
    let members: { dispose: () => void } | undefined
    let chatView: { dispose: () => void } | undefined
    let chatTools: { dispose: () => void } | undefined
    void import('./sessions-chrome.tsx').then((mod) => {
      sessions = ui.decorate('/agents', mod.sessionsChrome())
      chatView = ui.registerContentView('/agents', {
        id: 'chat',
        label: '聊天',
        plugin: 'core-chat',
        Icon: ChatBubbleLeftRightIcon,
        Body: (props) => createElement(mod.SessionRecordChat, { ...props, sessionView: view }),
      })
      chatTools = ui.registerDetailTools('/agents', mod.AGENTS_DETAIL_TOOLS)
    })
    void import('./members-chrome.tsx').then((mod) => {
      members = ui.decorate('/workspace-members', mod.membersChrome())
    })
    return () => {
      chatTools?.dispose()
      chatView?.dispose()
      members?.dispose()
      sessions?.dispose()
    }
  })
}
