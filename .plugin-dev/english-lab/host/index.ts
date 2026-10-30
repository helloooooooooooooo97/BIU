type ChatLike = {
  complete: (messages: Array<{ role: string; content: string }>) => Promise<{ text?: string }>
}

export const name = 'english-lab'
export const inject = ['http']

export function apply(ctx: {
  http: { route: (method: string, path: string, handler: (route: { json: () => Promise<unknown>; send: (status: number, body: unknown) => void }) => Promise<void>) => void }
  chat?: ChatLike
}) {
  ctx.http.route('POST', '/api/english-lab/ai', async (route) => {
    const payload = (await route.json()) as { text?: string }
    const text = String(payload?.text ?? '').trim()
    if (!text) {
      route.send(400, { error: 'empty' })
      return
    }
    const chat = ctx.chat
    if (!chat?.complete) {
      route.send(503, { error: 'host chat model is not available' })
      return
    }
    try {
      const result = await chat.complete([{ role: 'user', content: text }])
      route.send(200, { text: result.text ?? '' })
    } catch (error) {
      route.send(500, { error: String(error) })
    }
  })
}
