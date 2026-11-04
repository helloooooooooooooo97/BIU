import { type CSSProperties, type ReactNode, type Ref } from 'react'

export const CHAT_STAGE_CENTER =
  'chat-stage flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-[var(--biu-pad-page)] py-3 pb-72'
export const CHAT_STAGE_PANE =
  'chat-stage flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-1 py-1'
export const CHAT_DOCK_STACK = 'pointer-events-auto w-full space-y-2 bg-transparent'

export function ChatStage({
  variant = 'pane',
  children,
  className,
  stageRef,
}: {
  variant?: 'center' | 'pane'
  children?: ReactNode
  className?: string
  stageRef?: Ref<HTMLDivElement>
}) {
  const base = variant === 'center' ? CHAT_STAGE_CENTER : CHAT_STAGE_PANE
  return (
    <div ref={stageRef} className={className ? `${base} ${className}` : base}>
      {children}
    </div>
  )
}

export function ChatDockStack({ children }: { children?: ReactNode }) {
  return <div className={CHAT_DOCK_STACK}>{children}</div>
}

export function ChatPane({
  thread,
  aside,
  embed,
  paneRef,
  style,
}: {
  thread: ReactNode
  aside?: ReactNode
  embed?: boolean
  paneRef?: Ref<HTMLDivElement>
  style?: CSSProperties
}) {
  return (
    <div
      ref={paneRef}
      className={`chat-pane${embed ? ' chat-pane-embed' : ''}`}
      data-testid={embed ? 'session-record-chat' : 'chat-pane'}
      style={style}
    >
      {aside}
      <div className="chat-overlay-thread">{thread}</div>
    </div>
  )
}
