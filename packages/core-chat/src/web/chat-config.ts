import { apiFetch } from '@biu/biu-ui/api-client'
import { KeyedSingleflight, registerWorkspaceCache } from '@biu/biu-ui/cache'

const CHAT_CONFIG_GET_HOLD_MS = 400
const chatConfigSingleflight = new KeyedSingleflight<string, Record<string, unknown> | null>()

export function resetChatConfigGet() {
  chatConfigSingleflight.clear()
}

registerWorkspaceCache('chat-config', resetChatConfigGet)

/** Keep the payload from a GET or POST so Composer / banner / approvals can reuse it. */
export function seedChatConfig(data: Record<string, unknown>) {
  chatConfigSingleflight.clear()
  void chatConfigSingleflight.run('config', () => Promise.resolve(data), {
    holdMs: CHAT_CONFIG_GET_HOLD_MS,
  })
}

/** One in-flight GET /api/chat/config for composer, banner, and approvals. */
export async function getChatConfig<T = Record<string, unknown>>(opts?: {
  refresh?: boolean
}): Promise<T | null> {
  if (opts?.refresh) chatConfigSingleflight.delete('config')
  return chatConfigSingleflight.run(
    'config',
    async () => {
      const res = await apiFetch('/api/chat/config')
      if (!res.ok) return null
      const data = (await res.json()) as unknown
      return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null
    },
    {
      holdMs: CHAT_CONFIG_GET_HOLD_MS,
      shouldHold: (body) => body !== null,
    },
  ) as Promise<T | null>
}
