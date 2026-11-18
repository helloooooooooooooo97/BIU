/** 数据库广播和前端 fsdb:change 共用一份 scope，避免空包被当成整库刷新。 */

export const DATABASE_CHANNEL = 'database' as const
export const FSDB_CHANGE_EVENT = 'fsdb:change' as const
export const BIU_ASSET_CHANGED_EVENT = 'biu:asset-changed' as const

export type DatabaseChannelScope = 'records' | 'views' | 'tags' | 'content' | 'asset' | 'notices'

export type DatabaseChannelAsset = { name?: string; etag?: string; path?: string }

export type DatabaseChannelPayload = {
  ts: number
  scope: DatabaseChannelScope
  path?: string
  asset?: DatabaseChannelAsset
  tags?: boolean
  views?: boolean
  notices?: boolean
  content?: boolean
  savedView?: unknown
  reveal?: unknown
  sessionId?: string
  phase?: string
  contentJump?: unknown
}

export type ParsedDatabaseChannel = {
  scope: DatabaseChannelScope
  path?: string
  asset?: { name: string; etag?: string; path?: string }
}

export type FsdbChangeDetail =
  | { scope: 'records' }
  | { scope: 'views'; path?: string }
  | { scope: 'tags' }
  | { scope: 'content'; path?: string }

const SCOPES = new Set<DatabaseChannelScope>(['records', 'views', 'tags', 'content', 'asset', 'notices'])

export function databaseChannelPayload(
  scope: DatabaseChannelScope,
  extra: Omit<DatabaseChannelPayload, 'ts' | 'scope'> = {},
): DatabaseChannelPayload {
  const ts = Date.now()
  if (scope === 'tags') return { ts, scope, tags: true, ...extra }
  if (scope === 'views') return { ts, scope, views: true, ...extra }
  if (scope === 'notices') return { ts, scope, notices: true, ...extra }
  if (scope === 'content') return { ts, scope, content: true, ...extra }
  return { ts, scope, ...extra }
}

export function parseDatabaseChannel(payload: unknown): ParsedDatabaseChannel | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const rec = payload as Record<string, unknown>
  const assetRaw = rec.asset
  const assetObj =
    assetRaw && typeof assetRaw === 'object' && !Array.isArray(assetRaw)
      ? (assetRaw as { name?: unknown; etag?: unknown; path?: unknown })
      : null
  const assetName = String(assetObj?.name ?? '').trim()
  const asset = assetName
    ? { name: assetName, etag: String(assetObj?.etag ?? ''), path: String(assetObj?.path ?? '') }
    : undefined
  const reveal =
    rec.reveal && typeof rec.reveal === 'object' && !Array.isArray(rec.reveal)
      ? (rec.reveal as { collection?: unknown; viewId?: unknown })
      : null
  const viewsFromReveal = Boolean(reveal?.viewId) || String(reveal?.collection ?? '') === '/views'
  const named = rec.scope
  const scope: DatabaseChannelScope = SCOPES.has(named as DatabaseChannelScope)
    ? (named as DatabaseChannelScope)
    : rec.notices
      ? 'notices'
      : rec.content
        ? 'content'
        : rec.tags
          ? 'tags'
          : rec.views || rec.savedView || viewsFromReveal
            ? 'views'
            : asset
              ? 'asset'
              : 'records'
  const path = String(rec.path ?? '').trim()
  return { scope, ...(path ? { path } : {}), ...(asset ? { asset } : {}) }
}

export function fsdbChangeDetail(parsed: ParsedDatabaseChannel): FsdbChangeDetail | null {
  if (parsed.scope === 'asset' || parsed.scope === 'notices') return null
  if (parsed.scope === 'content') return { scope: 'content', path: parsed.path }
  if (parsed.scope === 'views') return { scope: 'views', ...(parsed.path ? { path: parsed.path } : {}) }
  if (parsed.scope === 'tags') return { scope: 'tags' }
  return { scope: 'records' }
}

export function channelNeedsCollectionSync(parsed: ParsedDatabaseChannel) {
  return parsed.scope === 'records'
}

export function emitFsdbChange(detail: FsdbChangeDetail = { scope: 'records' }) {
  if (typeof window === 'undefined') return
  const payload =
    detail.scope === 'content'
      ? { scope: 'content' as const, content: true, path: detail.path }
      : detail.scope === 'views'
        ? { scope: 'views' as const, views: true, ...(detail.path ? { path: detail.path } : {}) }
        : detail.scope === 'tags'
          ? { scope: 'tags' as const, tags: true }
          : { scope: 'records' as const }
  window.dispatchEvent(new CustomEvent(FSDB_CHANGE_EVENT, { detail: payload }))
}

export function parseFsdbChange(event: Event): FsdbChangeDetail {
  const d = (event as CustomEvent<Record<string, unknown> | undefined>).detail
  if (!d || typeof d !== 'object') return { scope: 'records' }
  if (d.scope === 'views' || d.views) {
    const path = String(d.path ?? '').trim()
    return { scope: 'views', ...(path ? { path } : {}) }
  }
  if (d.scope === 'tags' || d.tags) return { scope: 'tags' }
  if (d.scope === 'content' || d.content) return { scope: 'content', path: String(d.path ?? '').trim() || undefined }
  return { scope: 'records' }
}

export function emitAssetChanged(asset: { name?: string; etag?: string; path?: string }) {
  if (typeof window === 'undefined' || !asset.name) return
  window.dispatchEvent(new CustomEvent(BIU_ASSET_CHANGED_EVENT, { detail: asset }))
}
