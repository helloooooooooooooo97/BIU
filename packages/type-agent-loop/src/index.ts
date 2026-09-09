import type { InboxKind, MessageSender, LiveUiContext } from '@biu/type-session'

export interface AgentTurn {
  text: string
  steps: Array<{ name: string; ok: boolean; detail: string }>
}

export interface ClaimedInput {
  kind: InboxKind
  text: string
  id?: string
  extraTools?: string[]
  sender?: MessageSender
  images?: Array<{ name: string; mime: string; url: string }>
  /** 发送时的界面快照，写入本回合 system/prompt。 */
  liveContext?: LiveUiContext
}

export interface PreStepReq {
  sessionId: string
  messages: ClaimedInput[]
  reject?: string
}

export interface AgentRunner {
  run(claimed: ClaimedInput[]): Promise<AgentTurn>
}
