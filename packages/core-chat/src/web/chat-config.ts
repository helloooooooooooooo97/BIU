const CHAT_CONFIG_GET_HOLD_MS = 400
let chatConfigInflight: Promise<Record<string, unknown> | null> | null = null

export function resetChatConfigGet() {
  chatConfigInflight = null
}

/** Keep the payload from a GET or POST so Composer / banner / approvals can reuse it. */
export function seedChatConfig(data: Record<string, unknown>) {
  const request = Promise.resolve(data)
  chatConfigInflight = request
  setTimeout(() => {
    if (chatConfigInflight === request) chatConfigInflight = null
  }, CHAT_CONFIG_GET_HOLD_MS)
}

/** One in-flight GET /api/chat/config for composer, banner, and approvals. */
export async function getChatConfig<T = Record<string, unknown>>(opts?: {
  refresh?: boolean
}): Promise<T | null> {
  if (opts?.refresh) chatConfigInflight = null
  if (chatConfigInflight) return chatConfigInflight as Promise<T | null>
  let request: Promise<Record<string, unknown> | null>
  request = (async () => {
    const res = await fetch('/api/chat/config')
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null
  })().then(
    (body) => {
      setTimeout(() => {
        if (chatConfigInflight === request) chatConfigInflight = null
      }, CHAT_CONFIG_GET_HOLD_MS)
      return body
    },
    (error) => {
      if (chatConfigInflight === request) chatConfigInflight = null
      throw error
    },
  )
  chatConfigInflight = request
  return request as Promise<T | null>
}
