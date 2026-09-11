import { Service, type Context } from 'cordis'
import { DATABASE_CHANNEL } from '@biu/type-file-system'
import { NoticesStore, type NoticeInput } from './notices-store.ts'

export class NoticesService extends Service {
  store = new NoticesStore()

  constructor(ctx: Context) {
    super(ctx, 'notices')
    ctx.on('session/event', (payload: { sessionId?: string; event?: { type?: string; turn?: number; reason?: string } }) => {
      try {
        const event = payload?.event
        if (event?.type !== 'turn/end') return
        if (event.reason && event.reason !== 'complete') return
        const sessionId = String(payload.sessionId ?? '').trim()
        if (!sessionId) return
        const turn = typeof event.turn === 'number' ? event.turn : undefined
        const peek = (
          ctx.get('sessions') as { peek?: (id: string) => { config?: { title?: string } } | undefined } | undefined
        )?.peek?.(sessionId)
        const name = peek?.config?.title?.trim() || sessionId.slice(0, 8)
        this.push({
          kind: 'session',
          title: `${name} 回合结束`,
          body: turn != null ? `第 ${turn} 回合` : '',
          href: `/s/${encodeURIComponent(sessionId)}`,
          sourceKey: `session:${sessionId}:turn:${turn ?? 'end'}`,
        })
      } catch {
        /* ignore */
      }
    })
  }

  open(path: string) {
    this.store.open(path)
    return this
  }

  push(input: NoticeInput) {
    const row = this.store.push(input)
    if (row) this.bump()
    return row
  }

  markSourceRead(sourceKey: string) {
    const n = this.store.markSourceRead(sourceKey)
    if (n) this.bump()
    return n
  }

  private bump() {
    const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
    http?.broadcast?.(DATABASE_CHANNEL, { ts: Date.now() })
  }
}

declare module 'cordis' {
  interface Context {
    notices: NoticesService
  }
}
