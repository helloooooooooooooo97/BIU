import type { ChatNode } from '@biu/web-session-view'

/** 每个 user 与其后的回复合成一回合。 */
export function groupNodesIntoTurns(nodes: ChatNode[]): ChatNode[][] {
  const turns: ChatNode[][] = []
  let current: ChatNode[] = []
  for (const node of nodes) {
    if (node.kind === 'user') {
      if (current.length) turns.push(current)
      current = [node]
      continue
    }
    if (!current.length) {
      turns.push([node])
      continue
    }
    current.push(node)
  }
  if (current.length) turns.push(current)
  return turns
}

/** 首帧只挂最近几回合，先画出视口里能看见的尾巴。 */
export const CHAT_FIRST_PAINT_TURNS = 2
/** 视口填满后，每帧/idle 再往上补的回合数。 */
export const CHAT_REVEAL_BATCH = 4
const VIEWPORT_SLACK_PX = 64
const NEAR_TOP_PX = 720

export function firstPaintStartIndex(totalTurns: number): number {
  if (totalTurns <= 0) return 0
  return Math.max(0, totalTurns - CHAT_FIRST_PAINT_TURNS)
}

export function bumpRevealStart(startIndex: number, batch = CHAT_REVEAL_BATCH): number {
  return Math.max(0, startIndex - Math.max(1, batch))
}

/** 输入栏垫了 pb-72 / 18rem，离真正 scroll 底还有一大截也算在看最新（记忆用）。 */
export const CHAT_NEAR_BOTTOM_PX = 360
/** 只有贴着滚动条底边才跟着新内容钉住；宽阈值会把上滑拽回去、抖死。 */
export const CHAT_PIN_BOTTOM_PX = 48
export const PIN_TOP_SLACK_PX = 8

/** 贴底，或当时贴在视口顶的那条用户消息。回来滚到它重新贴顶。 */
export type ChatScrollMemory =
  | { kind: 'bottom' }
  | { kind: 'pin'; nodeId: string }

const chatScrollBySession = new Map<string, ChatScrollMemory>()

export function rememberChatScroll(sessionId: string, memory: ChatScrollMemory) {
  chatScrollBySession.set(sessionId, memory)
}

export function recalledChatScroll(sessionId: string | null | undefined): ChatScrollMemory | undefined {
  if (!sessionId) return undefined
  return chatScrollBySession.get(sessionId)
}

export function resetChatScrollMemoryForTests() {
  chatScrollBySession.clear()
}

export function turnIndexContaining(nodes: ChatNode[], nodeId: string): number {
  return groupNodesIntoTurns(nodes).findIndex((turn) => turn.some((node) => node.id === nodeId))
}

/** 回到中间阅读位置时，从贴顶那一回合挂到最新；贴底则仍只先挂尾巴。 */
export function revealStartForMemory(
  nodes: ChatNode[],
  memory: ChatScrollMemory | undefined,
  totalTurns: number,
): number {
  if (!memory || memory.kind === 'bottom') return firstPaintStartIndex(totalTurns)
  return 0
}

function nodeSelector(nodeId: string) {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(nodeId) : nodeId
  return `[data-node-id="${escaped}"]`
}

function turnSelector(nodeId: string) {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(nodeId) : nodeId
  return `[data-turn-anchor="${escaped}"]`
}

/** 相对滚动容器的文档坐标；走 offsetTop，不受 sticky 视觉位置干扰。 */
export function offsetInScroller(el: HTMLElement, scroller: HTMLElement): number {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
}

/** 当前贴顶的用户消息：已经顶到视口上沿的最后一条。 */
export function captureChatScroll(parent: HTMLElement): ChatScrollMemory {
  if (isChatStuckToLatest(parent)) return { kind: 'bottom' }
  const parentTop = parent.getBoundingClientRect().top
  const users = parent.querySelectorAll<HTMLElement>('[data-chat-kind="user"][data-node-id]')
  let pin: HTMLElement | null = null
  for (const el of Array.from(users)) {
    if (el.getBoundingClientRect().top <= parentTop + PIN_TOP_SLACK_PX) pin = el
  }
  const id = pin?.dataset.nodeId ?? users[0]?.dataset.nodeId
  if (!id) return { kind: 'bottom' }
  return { kind: 'pin', nodeId: id }
}

export function distanceFromChatBottom(parent: HTMLElement): number {
  return parent.scrollHeight - parent.scrollTop - parent.clientHeight
}

export function isChatStuckToLatest(parent: HTMLElement): boolean {
  if (distanceFromChatBottom(parent) > CHAT_NEAR_BOTTOM_PX) return false
  // 内容刚好比视口高一点时，顶和底会同时落入 360px 阈值；钉在顶上时不要当成贴底。
  if (parent.scrollTop <= PIN_TOP_SLACK_PX) return false
  return true
}

/** 实时跟随最新：要比「还在底部一带」严，否则滚轮上滑会被 pin 回去。 */
export function isChatPinnedToBottom(parent: HTMLElement): boolean {
  if (distanceFromChatBottom(parent) > CHAT_PIN_BOTTOM_PX) return false
  if (parent.scrollTop <= PIN_TOP_SLACK_PX) return false
  return true
}

/**
 * 跟随中：上滑立刻松开。没有上滑就保持，这样刚发出的消息可以停在视口顶，回复变长再往下走。
 * 松开之后，只有滚回真正底边才重新跟随。
 */
export function nextStickToLatest(opts: {
  stuck: boolean
  distanceFromBottom: number
  scrollTop: number
  scrollingUp: boolean
}): boolean {
  if (opts.scrollingUp) return false
  if (opts.distanceFromBottom <= CHAT_PIN_BOTTOM_PX && opts.scrollTop > PIN_TOP_SLACK_PX) return true
  return opts.stuck
}

/** 输入栏垫了 pb-72 / 18rem，可见一屏是 clientHeight 减去这块垫。 */
export function chatVisibleRoom(parent: HTMLElement): number {
  const pad = Number.parseFloat(getComputedStyle(parent).paddingBottom) || 0
  return Math.max(1, parent.clientHeight - pad)
}

/** 让最新一回合至少有一屏可见高度，短回复也能把用户消息顶到视口上沿。 */
export function reserveLiveTurnRoom(parent: HTMLElement, anchorId: string) {
  const height = parent.clientHeight > 0 ? `${chatVisibleRoom(parent)}px` : ''
  for (const turn of parent.querySelectorAll<HTMLElement>('.chat-turn')) {
    const next = turn.dataset.turnAnchor === anchorId ? height : ''
    if (turn.style.minHeight !== next) turn.style.minHeight = next
  }
}

/**
 * 发出去的那条钉在视口顶。回复仍按文档流排在气泡下面（默认 gap），不要用 sticky
 * 视觉坐标去跟，否则预留高度把回合撑高后会已经滚过气泡，第一行字被挡住。
 * 回复高出剩余可见高度后外层贴底，多出来的往上挤。
 */
export function followChatOutput(parent: HTMLElement, anchorId: string) {
  const maxScroll = Math.max(0, parent.scrollHeight - parent.clientHeight)
  const turn = parent.querySelector<HTMLElement>(turnSelector(anchorId))
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(anchorId) : anchorId
  const user = parent.querySelector<HTMLElement>(`[data-chat-kind="user"][data-node-id="${escaped}"]`)
  // 回合盒子本身不 sticky；用它的文档坐标钉顶，避免 sticky 用户消息的视觉 top 把滚动钉死在遮挡位置。
  const pin = turn instanceof HTMLElement ? turn : user
  if (!(pin instanceof HTMLElement)) {
    parent.scrollTop = maxScroll
    return
  }
  const reply = turn
    ? turn.querySelector<HTMLElement>(':scope > [data-chat-kind="reply"]')
    : parent.querySelector<HTMLElement>('[data-chat-kind="reply"]')
  if (reply) reply.style.maxHeight = ''
  const pinTop = Math.max(0, offsetInScroller(pin, parent))
  const endEl = reply ?? user ?? pin
  const contentEnd = offsetInScroller(endEl, parent) + endEl.offsetHeight
  const room = chatVisibleRoom(parent)
  const replyHeight = reply?.offsetHeight ?? 0
  // 第一行按文档流排在气泡下面。只要回复本身还没高过可见一屏，就钉在回合顶，
  // 不要用「用户气泡+回复 > 可见剩余」去贴底，否则第一行会被 sticky 挡住。
  if (replyHeight <= room) {
    parent.scrollTop = Math.min(pinTop, maxScroll)
    return
  }
  parent.scrollTop = Math.min(Math.max(0, contentEnd - room), maxScroll)
}

export function pinChatToLatest(parent: HTMLElement) {
  parent.scrollTop = parent.scrollHeight
}

/** 只有向上揭示了更早回合时才补偿高度；尾部流式增长绝不能推动阅读位置。 */
export function didRevealOlderTurns(previousStart: number, nextStart: number): boolean {
  return nextStart < previousStart
}

export function restoreChatScroll(parent: HTMLElement, memory: ChatScrollMemory): boolean {
  if (memory.kind === 'bottom') {
    pinChatToLatest(parent)
    return true
  }
  const turn = parent.querySelector(turnSelector(memory.nodeId))
  const el = turn instanceof HTMLElement ? turn : parent.querySelector(nodeSelector(memory.nodeId))
  if (!(el instanceof HTMLElement)) return false
  parent.scrollTop = offsetInScroller(el, parent)
  return true
}

/** 视口还没被尾巴填满，或用户已经滑到顶等更早内容：用 rAF 快补。 */
export function shouldRevealFast(opts: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): boolean {
  if (opts.scrollHeight <= opts.clientHeight + VIEWPORT_SLACK_PX) return true
  if (opts.scrollTop <= NEAR_TOP_PX) return true
  return false
}

export function sliceTurnsFrom(nodes: ChatNode[], startTurnIndex: number): ChatNode[] {
  const turns = groupNodesIntoTurns(nodes)
  if (turns.length === 0) return []
  const start = startTurnIndex >= turns.length ? firstPaintStartIndex(turns.length) : startTurnIndex
  if (start <= 0) return nodes
  return turns.slice(start).flat()
}
