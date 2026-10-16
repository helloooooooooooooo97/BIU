import type { ChatNode, ChatReplyPart } from '@biu/web-session-view'

/**
 * Agent loop：最后一条有正文的 assistant 是最终 Message；
 * 之前的 step / 工具 / 中间草稿都算 Details。
 */
export function splitReplyForDisplay(node: Extract<ChatNode, { kind: 'reply' }>): {
  detailParts: ChatReplyPart[]
  finalParts: ChatReplyPart[]
  hasDetails: boolean
} {
  const parts = node.parts
  let finalIndex = -1
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]!
    if (part.kind === 'assistant' && part.text.trim()) {
      finalIndex = i
      break
    }
  }
  if (finalIndex < 0) {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (parts[i]!.kind === 'assistant') {
        finalIndex = i
        break
      }
    }
  }
  if (finalIndex <= 0) {
    return { detailParts: [], finalParts: parts, hasDetails: false }
  }
  return {
    detailParts: parts.slice(0, finalIndex),
    finalParts: parts.slice(finalIndex),
    hasDetails: true,
  }
}
