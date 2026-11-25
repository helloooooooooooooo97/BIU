import type { Context } from 'cordis'
import { currentAccountId, currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'
import { getAccountPort } from '@biu/host-plugin-loader/ports'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'

export const INLINE_EDIT_SYSTEM_PROMPT = [
  '你是文档原地编辑助手。用户会提供一段文档选区（或光标上下文）以及一条修改指令。',
  '请严格按照用户的指令直接输出替换后的最终文本：',
  '1. 只输出替换后的文本本身，不要包含任何解释、前后缀、寒暄、引号或多余的 Markdown 代码围栏（除非用户明确要求输出代码块）。',
  '2. 保持原文的语言、语境和 Markdown 行内格式风格，除非指令要求改变。',
  '3. 若原文选区为空，则根据指令与上下文直接输出要插入光标处的文本。',
].join('\n')

export type InlineEditInput = {
  instruction: string
  selection?: string
  before?: string
  after?: string
  title?: string
  sessionId?: string
}

export function buildInlineEditUserMessage(input: InlineEditInput) {
  const parts: string[] = []
  const title = String(input.title ?? '').trim()
  const before = String(input.before ?? '').slice(-400)
  const after = String(input.after ?? '').slice(0, 400)
  const selection = String(input.selection ?? '')
  const instruction = String(input.instruction ?? '').trim()

  if (title) parts.push(`文档标题：${title}`)
  if (before.trim()) parts.push(`前文上下文：\n${before}`)
  if (selection) {
    parts.push(`需要原地修改的选区：\n${selection}`)
  } else {
    parts.push('当前选区为空（请在光标处生成要插入的文本）。')
  }
  if (after.trim()) parts.push(`后文上下文：\n${after}`)
  parts.push(`修改指令：${instruction}`)
  return parts.join('\n\n')
}

export function sanitizeInlineEditOutput(raw: string, selection = '', instruction = '') {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const wantsFence = /```|代码块|code\s*block/i.test(instruction) || selection.trim().startsWith('```')
  if (!wantsFence) {
    const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/)
    if (fenced) return fenced[1]!.trim()
  }
  return trimmed
}

export function formatInlineEditSessionUserText(input: InlineEditInput) {
  const title = String(input.title ?? '').trim()
  const instruction = String(input.instruction ?? '').trim()
  const selection = String(input.selection ?? '').trim()
  const header = title ? `[原地修改 · ${title}] ${instruction}` : `[原地修改] ${instruction}`
  if (!selection) return header
  const preview = selection.length > 240 ? `${selection.slice(0, 240)}…` : selection
  const quoted = preview
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n')
  return `${header}\n\n${quoted}`
}

export async function runInlineEdit(ctx: Context, input: InlineEditInput) {
  const instruction = String(input.instruction ?? '').trim()
  if (!instruction) throw new Error('请输入修改指令')

  const chat = ctx.get('chat') as
    | {
        resolveLlm?: (sessionId?: string | null) => {
          apiKey?: string
          model?: string
          provider?: string
          baseUrl?: string
          thinking?: string
        }
      }
    | undefined
  const llm = ctx.get('llm') as
    | {
        forConfig: (config: {
          provider: string
          apiKey: string
          model: string
          baseUrl?: string
          thinking?: 'enabled' | 'disabled'
        }) => {
          chat: (
            messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
            tools?: unknown[],
          ) => Promise<{ content?: string | null; usage?: Record<string, unknown> }>
        }
      }
    | undefined

  if (!chat?.resolveLlm || !llm?.forConfig) throw new Error('模型未就绪')
  const sessionId = String(input.sessionId ?? '').trim() || undefined
  if (getRuntimePolicy().authzMode === 'rbac') {
    const accountId = currentAccountId().trim()
    if (!accountId) throw new Error('需要登录后才能使用原地编辑')
    if (sessionId) {
      const store = getAccountPort(ctx)?.store
      const readable = Boolean(store?.canReadRecord?.('/agents', sessionId))
      const tenant = store?.tenantForRecord?.('/agents', sessionId)
      const requestWs = currentRequestWorkspaceId().trim()
      const workspaceMismatch = Boolean(tenant?.workspaceId && requestWs && tenant.workspaceId !== requestWs)
      if (!readable || workspaceMismatch) {
        throw new Error('无权访问目标会话')
      }
    }
  }
  const config = chat.resolveLlm(sessionId ?? null)
  if (!String(config.apiKey ?? '').trim()) throw new Error('未配置模型 API Key')

  const reply = await llm
    .forConfig({
      provider: String(config.provider ?? 'openai'),
      apiKey: String(config.apiKey ?? ''),
      model: String(config.model ?? ''),
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      thinking: 'disabled',
    })
    .chat(
      [
        { role: 'system', content: INLINE_EDIT_SYSTEM_PROMPT },
        { role: 'user', content: buildInlineEditUserMessage(input) },
      ],
      [],
    )

  const text = sanitizeInlineEditOutput(String(reply.content ?? ''), input.selection, instruction)
  if (!text) throw new Error('模型没有返回修改结果')

  if (sessionId) {
    const sessions = ctx.get('sessions') as
      | { append?: (id: string, body: Record<string, unknown>) => Promise<unknown> }
      | undefined
    if (sessions?.append) {
      try {
        await sessions.append(sessionId, {
          type: 'user/message',
          text: formatInlineEditSessionUserText(input),
        })
        await sessions.append(sessionId, {
          type: 'assistant/message',
          text,
          ...(reply.usage ? { usage: reply.usage } : {}),
        })
      } catch {
        /* 会话不存在或归档时不阻塞原地修改 */
      }
    }
  }

  return text
}
