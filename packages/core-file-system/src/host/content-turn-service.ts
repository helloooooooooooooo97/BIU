import { Service, type Context } from 'cordis'
import { currentSessionId } from '@biu/host-sessions/scope'
import type { ContentEditSummary } from './content-turn-store.ts'
import { ContentTurnStore } from './content-turn-store.ts'
import { asContentText } from './content-edit.ts'

type ContentDb = {
  content: (path: string) => Promise<{ value: unknown }>
  writeContent: (path: string, value: unknown) => Promise<unknown>
}

export class ContentTurnService extends Service {
  store = new ContentTurnStore()
  private reverting = false
  private publishChain: Promise<void> = Promise.resolve()

  constructor(
    ctx: Context,
    private db: ContentDb,
  ) {
    super(ctx, 'contentTurns')
  }

  open(path: string) {
    this.store.open(path)
    return this
  }

  async recordEdit(path: string, before: string, after: string, title: string) {
    if (this.reverting || before === after) return
    const sessionId = String(currentSessionId() ?? '').trim()
    if (!sessionId) return
    const turn = this.openTurn(sessionId)
    if (turn == null) return
    this.store.record({ sessionId, turn, path, title, before, after })
    await this.publishLatest(sessionId, turn)
  }

  async revert(sessionId: string, turn: number, path?: string) {
    const sid = sessionId.trim()
    const files = path ? [this.store.getFile(sid, turn, path)].filter(Boolean) : this.store.listFiles(sid, turn)
    const results: Array<{ path: string; ok: boolean; error?: string }> = []
    this.reverting = true
    try {
      for (const file of files) {
        if (!file || file.reverted) {
          if (file) results.push({ path: file.path, ok: true })
          continue
        }
        try {
          const current = asContentText((await this.db.content(file.path)).value)
          if (current !== file.after && current !== file.before) {
            results.push({ path: file.path, ok: false, error: 'diverged' })
            continue
          }
          if (current !== file.before) await this.db.writeContent(file.path, file.before)
          this.store.markReverted(sid, turn, file.path)
          results.push({ path: file.path, ok: true })
        } catch (error) {
          results.push({ path: file.path, ok: false, error: String(error) })
        }
      }
    } finally {
      this.reverting = false
    }
    await this.publishLatest(sid, turn)
    return { ok: results.every((row) => row.ok), results }
  }

  summaries(sessionId: string, turn: number): ContentEditSummary[] {
    return this.store.summaries(sessionId, turn)
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
