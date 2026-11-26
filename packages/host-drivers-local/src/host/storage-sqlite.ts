import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { Service, type Context } from 'cordis'
import {
  closeAllSharedBiuConnections,
  dataHome,
  openAndMigrateBiu,
  openAndMigrateEvents,
} from '@biu/host-plugin-loader'
import { biuSqlitePath, eventsSqlitePath } from '@biu/host-plugin-loader/data-dir'
import type { SqlExecutor, SqlRunResult, StorageDialect, StoragePort } from '@biu/host-plugin-loader/ports'

function asSqliteParams(params: unknown[] = []): SQLInputValue[] {
  return params.map((value) => (value === undefined ? null : (value as SQLInputValue)))
}

export class SqliteExecutor implements SqlExecutor {
  readonly dialect: StorageDialect = 'sqlite'
  private txDepth = 0

  constructor(
    private readonly db: DatabaseSync,
    private readonly ownsConnection = false,
  ) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...asSqliteParams(params)) as Record<string, unknown>[]
    return rows.map((row) => ({ ...row }) as T)
  }

  async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql)
    const row = stmt.get(...asSqliteParams(params)) as Record<string, unknown> | undefined
    return row ? ({ ...row } as T) : null
  }

  async exec(sql: string, params: unknown[] = []): Promise<SqlRunResult> {
    const stmt = this.db.prepare(sql)
    const result = stmt.run(...asSqliteParams(params))
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid: result.lastInsertRowid,
    }
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const depth = this.txDepth++
    const savepoint = `biu_sp_${depth}`
    this.db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`)
    try {
      const result = await fn(this)
      this.db.exec(depth === 0 ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`)
      return result
    } catch (error) {
      try {
        this.db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${savepoint}`)
        if (depth > 0) this.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
      } catch {
        /* ignore rollback errors */
      }
      throw error
    } finally {
      this.txDepth--
    }
  }

  async close(): Promise<void> {
    if (!this.ownsConnection) return
    try {
      this.db.close()
    } catch {
      /* ignore already-closed handle */
    }
  }
}

export function wrapSqliteDatabase(db: DatabaseSync, ownsConnection = false): SqlExecutor {
  return new SqliteExecutor(db, ownsConnection)
}

export class SqliteStorageDriver extends Service implements StoragePort {
  readonly driver = 'sqlite'
  readonly dialect: StorageDialect = 'sqlite'
  private readonly opened = new Set<SqliteExecutor>()

  constructor(ctx: Context) {
    super(ctx, 'storage')
    ctx.effect(() => () => {
      void this.closeAll()
    })
  }

  async openMain(workspaceRoot?: string): Promise<SqlExecutor> {
    const root = workspaceRoot || dataHome()
    const db = openAndMigrateBiu(biuSqlitePath(root))
    const executor = new SqliteExecutor(db, false)
    this.opened.add(executor)
    return executor
  }

  async openEvents(workspaceRoot?: string): Promise<SqlExecutor> {
    const root = workspaceRoot || dataHome()
    const db = openAndMigrateEvents(eventsSqlitePath(root))
    const executor = new SqliteExecutor(db, true)
    this.opened.add(executor)
    return executor
  }

  async closeAll(): Promise<void> {
    for (const executor of [...this.opened]) {
      this.opened.delete(executor)
      await executor.close()
    }
    closeAllSharedBiuConnections()
  }
}

export const name = 'driver-storage-sqlite'
export const inject = [] as const

export function apply(ctx: Context) {
  new SqliteStorageDriver(ctx)
}
