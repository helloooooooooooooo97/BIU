import { Service, type Context } from 'cordis'
import { currentSessionId } from '@biu/host-sessions/scope'
import type { ContentEditSummary } from './content-turn-store.ts'
import { ContentTurnStore } from './content-turn-store.ts'

function sameText(left: string, right: string) {
  return left.replace(/\r\n/g, '\n') === right.replace(/\r\n/g, '\n')
}

export class ContentTurnService extends Service {
  store = new ContentTurnStore()
  private publishChain: Promise<void> = Promise.resolve()

  constructor(ctx: Context) {
    super(ctx, 'contentTurns')
  }

  open(path: string) {
    this.store.open(path)
    return this
  }

  private scope() {
    const sessionId = String(currentSessionId() ?? '').trim()
    if (!sessionId) return null
    const turn = this.openTurn(sessionId)
    if (turn == null) return null
    return { sessionId, turn }
  }

  async recordEdit(path: string, before: string, after: string, title: string) {
    if (sameText(before, after)) return
    const scope = this.scope()
    if (!scope) return
    this.store.record({ ...scope, path, title, before, after })
    await this.publishLatest(scope.sessionId, scope.turn)
  }

  async recordCreate(path: string, title: string, _record?: Record<string, unknown>) {
    const scope = this.scope()
    if (!scope) return
    this.store.recordOp(scope.sessionId, scope.turn, { op: 'create', path, title })
    await this.publishLatest(scope.sessionId, scope.turn)
  }

  async recordUpdate(path: string, title: string, _before?: Record<string, unknown>, _after?: Record<string, unknown>) {
    const scope = this.scope()
    if (!scope) return
    this.store.recordOp(scope.sessionId, scope.turn, { op: 'update', path, title })
    await this.publishLatest(scope.sessionId, scope.turn)
  }

  async recordDelete(path: string, title: string, _record?: Record<string, unknown>) {
    const scope = this.scope()
    if (!scope) return
    this.store.recordOp(scope.sessionId, scope.turn, { op: 'delete', path, title })
    await this.publishLatest(scope.sessionId, scope.turn)
  }

  summaries(sessionId: string, turn: number): ContentEditSummary[] {
    return this.store.summaries(sessionId, turn)
  }

  snapshot(sessionId: string, turn: number, path: string) {
    return this.store.snapshot(sessionId, turn, path)
  }

  private openTurn(sessionId: string) {
    const peek = this.ctx.get('sessions') as { peek?: (id: string) => { events?: Array<{ type?: string; turn?: number }> } | undefined } | undefined
    const events = peek?.peek?.(sessionId)?.events ?? []
    let turn: number | null = null
    for (const event of events) {
      if (event.type === 'turn/start' && typeof event.turn === 'number') turn = event.turn
      else if (event.type === 'turn/end') turn = null
    }
    return turn
  }

  private publishLatest(sessionId: string, turn: number) {
    this.publishChain = this.publishChain.then(
      () => this.publish(sessionId, turn),
      () => this.publish(sessionId, turn),
    )
    return this.publishChain
  }

  private async publish(sessionId: string, turn: number) {
    const files = this.store.summaries(sessionId, turn)
    const sessions = this.ctx.get('sessions') as { append?: (id: string, body: unknown) => Promise<unknown> } | undefined
    if (!sessions?.append || !files.length) return
    try {
      await sessions.append(sessionId, { type: 'content/edits', turn, files })
    } catch {
      /* session 可能尚未登记 */
    }
  }
}

declare module 'cordis' {
  interface Context {
    contentTurns: ContentTurnService
  }
}
