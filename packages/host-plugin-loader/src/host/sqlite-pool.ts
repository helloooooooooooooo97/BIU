import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { openSqlite } from './sqlite-open.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

interface SharedPoolEntry {
  key: string
  resolvedPath: string
  inode: number
  raw: DatabaseSync
  refCount: number
  stmtCache: Map<string, ReturnType<DatabaseSync['prepare']>>
}

const MAX_SHARED_STMTS = 256
const sharedPool = new Map<string, SharedPoolEntry>()
const migratedInodes = new Map<string, number>()

function fileInode(filePath: string): number {
  try {
    return statSync(filePath).ino
  } catch {
    return 0
  }
}

function wrapSharedHandle(entry: SharedPoolEntry): DatabaseSync {
  let closed = false
  return new Proxy(entry.raw, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => {
          let cached = entry.stmtCache.get(sql)
          if (!cached) {
            cached = target.prepare(sql)
            if (entry.stmtCache.size < MAX_SHARED_STMTS) entry.stmtCache.set(sql, cached)
          }
          return cached
        }
      }
      if (prop === 'close') {
        return () => {
          if (closed) return
          closed = true
          entry.refCount = Math.max(0, entry.refCount - 1)
          if (entry.refCount === 0) {
            if (sharedPool.get(entry.key) === entry) sharedPool.delete(entry.key)
            entry.stmtCache.clear()
            try {
              target.close()
            } catch {
              /* already closed */
            }
            const stillOpen = [...sharedPool.values()].some((item) => item.resolvedPath === entry.resolvedPath)
            if (!stillOpen) migratedInodes.delete(entry.resolvedPath)
          }
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

export function sharedSqlitePoolStats() {
  let totalRefs = 0
  for (const entry of sharedPool.values()) totalRefs += entry.refCount
  return { connections: sharedPool.size, totalRefs }
}

export function closeAllSharedSqliteConnections() {
  for (const entry of sharedPool.values()) {
    entry.stmtCache.clear()
    try {
      entry.raw.close()
    } catch {
      /* ignore */
    }
  }
  sharedPool.clear()
  migratedInodes.clear()
}

export function openPooledSqlite(
  path: string,
  opts: { foreignKeys?: boolean; checkpointOnOpen?: boolean } | undefined,
  migrate: (db: DatabaseSync) => void,
): DatabaseSync {
  if (!path || path === ':memory:') {
    const db = openSqlite(path, { ...opts, checkpointOnOpen: opts?.checkpointOnOpen !== false })
    migrate(db)
    return db
  }

  const resolvedPath = resolve(path)
  const fk = opts?.foreignKeys !== false
  const poolKey = `${resolvedPath}\0fk:${fk ? 1 : 0}`
  const existing = sharedPool.get(poolKey)
  const currentIno = fileInode(resolvedPath)

  if (existing && currentIno !== 0 && existing.inode === currentIno) {
    existing.refCount += 1
    return wrapSharedHandle(existing)
  }

  if (existing) {
    sharedPool.delete(poolKey)
    existing.stmtCache.clear()
    try {
      existing.raw.close()
    } catch {
      /* ignore */
    }
  }

  const alreadyMigrated = currentIno !== 0 && migratedInodes.get(resolvedPath) === currentIno
  const raw = openSqlite(path, {
    ...opts,
    checkpointOnOpen: !alreadyMigrated && opts?.checkpointOnOpen !== false,
  })
  if (!alreadyMigrated) {
    migrate(raw)
  }
  const finalIno = fileInode(resolvedPath)
  if (finalIno !== 0) migratedInodes.set(resolvedPath, finalIno)

  const entry: SharedPoolEntry = {
    key: poolKey,
    resolvedPath,
    inode: finalIno,
    raw,
    refCount: 1,
    stmtCache: new Map(),
  }
  sharedPool.set(poolKey, entry)
  return wrapSharedHandle(entry)
}
