import type { IncomingMessage } from 'node:http'
import type { Context } from 'cordis'
import {
  EditorContentConflictError,
  currentAccountId,
  currentRequestWorkspaceId,
  runWithAccount,
  runWithRequestWorkspace,
} from '@biu/host-plugin-loader/data-dir'
import { getAccountService, type AccountService } from '@biu/host-account'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { asPublicProfile, writeWorkspaceProfile } from '@biu/host-workspace'
import { DATABASE_CHANNEL, databaseChannelPayload, normalizeSchemaPack } from '@biu/type-file-system'
import { buildAccessExplanation, type BuildAccessExplanationInput } from '../access-explanation.ts'
import { normalizeAuthzRole } from '../shared/authz-labels.ts'
import {
  PAGES_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  isPersonalOnlyCollection,
  normalizeCollectionPath,
  savedViewRecordPath,
} from '../paths.ts'
import { matchListFilterRecord } from '../query-logic.ts'
import { isSharePluginId } from '../share-resources.ts'
import { resolveScopeTarget } from './access-policy.ts'
import {
  AssetConflictError,
  assetContentDisposition,
  isHashedAssetName,
  mimeOfAsset,
  parseIfMatch,
  type FileSystemAssets,
} from './assets-store.ts'
import { type SavedViewsStore, type StoredView } from './saved-views.ts'
import { buildShareSnapshot, computeViewPublicStats, parseViewShareRecordId } from './share-payload.ts'
import { publicShareUrl } from './share-origin.ts'
import { readSharePluginWebJs, zipSharePluginSource } from './share-plugin-pack.ts'
import { type SharesStore } from './shares-store.ts'
import { type TagStore } from './tags-store.ts'
import { asDeleteQuery, parseListColumnsParam, parseSortsParam } from './schema-coerce.ts'
import { DATABASE_TOOL_NAMES } from './agent-tools.ts'
import type { DatabaseService } from './index.ts'

export function databaseHttpFailure(error: unknown) {
  if (error instanceof Error && typeof (error as Error & { status?: unknown }).status === 'number') {
    const status = (error as Error & { status: number }).status
    const code = status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST'
    return { status, body: { error: error.message || String(error), code } } as const
  }
  const message = String(error)
  if (/\bunknown (?:record|collection)\b/.test(message)) {
    return { status: 404, body: { error: 'not found', code: 'NOT_FOUND' } } as const
  }
  if (/\bpermission denied\b/.test(message)) {
    return { status: 403, body: { error: 'permission denied', code: 'FORBIDDEN' } } as const
  }
  return { status: 400, body: { error: message, code: 'BAD_REQUEST' } } as const
}

function splitPath(path: string): string[] {
  return String(path ?? '').split('/').filter(Boolean)
}

function linkUploadedAsset(
  db: { tags: { linkContentRef: (collection: string, recordId: string, name: string, source?: string) => void } },
  path: string,
  name: string,
) {
  const parts = splitPath(path)
  if (parts.length < 2 || !name) return
  db.tags.linkContentRef(`/${parts[0]}`, parts.slice(1).join('/'), name, 'asset')
}

export function registerDatabaseHttpRoutes(
  ctx: Context,
  db: DatabaseService,
  deps: {
    savedViews: SavedViewsStore
    shares: SharesStore
    tags: TagStore
    assets: FileSystemAssets
    activeDataLocation: () => 'device' | 'cloud'
  },
) {
  const { savedViews, shares, tags, assets, activeDataLocation } = deps
  const send = async (route: { query: URLSearchParams; send: (status: number, body: unknown) => void }, op: () => unknown) => {
    try {
      route.send(200, await op())
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  }
  ctx.http.route('GET', '/api/profile', (route) => {
    let dataLocation: 'device' | 'cloud' = getRuntimePolicy().hostMode === 'cloud' ? 'cloud' : 'device'
    let accountPrefs: Record<string, unknown> | null = null
    try {
      const account = getAccountService(ctx)
      const policy = getRuntimePolicy()
      const workspaceId =
        currentRequestWorkspaceId() || (policy.allowImplicitActiveWorkspace ? account?.store?.activeWorkspaceId() : '') || ''
      if (workspaceId && account?.workspaceLocation) dataLocation = account.workspaceLocation(workspaceId)
      const actorId = currentAccountId()
      if (actorId && workspaceId && account?.store?.workspacePrefs) {
        const prefs = account.store.workspacePrefs(actorId, workspaceId)
        accountPrefs = {
          starredViews: prefs.starredViews,
          starredRecords: prefs.starredRecords,
          pinnedAgents: prefs.pinnedAgents,
          ...(prefs.viewOrder ? { viewOrder: prefs.viewOrder } : {}),
          ...(prefs.theme ? { theme: prefs.theme } : {}),
          ...(prefs.accent ? { accent: prefs.accent } : {}),
          ...(prefs.pagePrefs ? { pagePrefs: prefs.pagePrefs } : {}),
        }
      }
    } catch {
      /* 没有账号服务时沿用宿主位置 */
    }
    const base = asPublicProfile()
    route.send(200, {
      ...base,
      ...(accountPrefs ?? {}),
      ...(accountPrefs?.pagePrefs
        ? { pagePrefs: { ...(base.pagePrefs ?? {}), ...(accountPrefs.pagePrefs as Record<string, unknown>) } }
        : {}),
      localData: dataLocation === 'device',
      dataLocation,
    })
  })
  ctx.http.route('POST', '/api/profile', async (route) => {
    try {
      const body = (await route.json()) as {
        name?: unknown
        avatar?: unknown
        theme?: unknown
        accent?: unknown
        pagePrefs?: unknown
        starredViews?: unknown
        starredRecords?: unknown
        pinnedAgents?: unknown
        viewOrder?: unknown
      }
      const policy = getRuntimePolicy()
      const actorId = currentAccountId()
      let resolvedWorkspaceId = currentRequestWorkspaceId()
      let savedAccountPrefs: Record<string, unknown> | null = null
      if (actorId) {
        try {
          const account = getAccountService(ctx)
          const workspaceId =
            resolvedWorkspaceId || (policy.allowImplicitActiveWorkspace ? account?.store?.activeWorkspaceId() : '') || ''
          resolvedWorkspaceId = workspaceId
          if (workspaceId && account?.store?.saveWorkspacePrefs) {
            const saved = account.store.saveWorkspacePrefs(
              actorId,
              {
                ...(body.theme === 'dark' || body.theme === 'light' ? { theme: body.theme } : {}),
                ...(typeof body.accent === 'string' ? { accent: body.accent } : {}),
                ...(body.pagePrefs !== undefined ? { pagePrefs: body.pagePrefs } : {}),
                ...(body.starredViews !== undefined ? { starredViews: body.starredViews } : {}),
                ...(body.starredRecords !== undefined ? { starredRecords: body.starredRecords } : {}),
                ...(body.pinnedAgents !== undefined ? { pinnedAgents: body.pinnedAgents } : {}),
                ...(body.viewOrder !== undefined ? { viewOrder: body.viewOrder } : {}),
              },
              workspaceId,
            )
            savedAccountPrefs = {
              starredViews: saved.starredViews,
              starredRecords: saved.starredRecords,
              pinnedAgents: saved.pinnedAgents,
              ...(saved.viewOrder ? { viewOrder: saved.viewOrder } : {}),
              ...(saved.theme ? { theme: saved.theme } : {}),
              ...(saved.accent ? { accent: saved.accent } : {}),
              ...(saved.pagePrefs ? { pagePrefs: saved.pagePrefs } : {}),
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (policy.hostMode === 'cloud' && (!actorId || !resolvedWorkspaceId)) {
        route.send(403, { error: '云端模式缺少账号或工作区上下文，拒绝写入个人配置' })
        return
      }
      const base =
        policy.hostMode !== 'cloud'
          ? asPublicProfile(
              writeWorkspaceProfile({
                name: typeof body.name === 'string' ? body.name : undefined,
                avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
                theme: body.theme === 'dark' || body.theme === 'light' ? body.theme : undefined,
                accent: typeof body.accent === 'string' ? (body.accent as never) : undefined,
                pagePrefs: body.pagePrefs,
                starredViews: body.starredViews as never,
                starredRecords: body.starredRecords as never,
              }),
            )
          : asPublicProfile()
      route.send(200, {
        ...base,
        ...(savedAccountPrefs ?? {}),
        ...(savedAccountPrefs?.pagePrefs
          ? { pagePrefs: { ...(base.pagePrefs ?? {}), ...(savedAccountPrefs.pagePrefs as Record<string, unknown>) } }
          : {}),
      })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/db/list', async (route) => {
    await send(route, () => {
      let filter: Record<string, unknown> | undefined
      const raw = route.query.get('filter')
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) filter = parsed as Record<string, unknown>
        } catch {
          filter = undefined
        }
      }
      return db.list(route.query.get('path') || '/', filter, {
        q: route.query.get('q') || '',
        sortField: route.query.get('sort') || '',
        sortDir: route.query.get('dir') === 'desc' ? 'desc' : 'asc',
        sorts: parseSortsParam(route.query.get('sorts')),
        limit: route.query.get('limit') ? Number(route.query.get('limit')) : undefined,
        offset: route.query.get('offset') ? Number(route.query.get('offset')) : undefined,
        columns: parseListColumnsParam(route.query.get('columns')),
      })
    })
  })
  ctx.http.route('GET', '/api/db/groups', async (route) => {
    await send(route, () => {
      const raw = route.query.get('filter')
      const filter = raw ? JSON.parse(raw) as Record<string, unknown> : undefined
      return db.attributeGroups(route.query.get('path') || '/', route.query.get('field') || '', filter, route.query.get('q') || '')
    })
  })
  ctx.http.route('GET', '/api/db/read', async (route) => {
    await send(route, () => db.read(route.query.get('path') || '/'))
  })
  ctx.http.route('GET', '/api/db/banner-gallery', (route) =>
    send(route, async () => {
      await db.requirePath(PAGES_COLLECTION_PATH, 'resource:read')
      return { items: db.tags.listBannerGallery() }
    }),
  )
  ctx.http.route('POST', '/api/db/banner-gallery', async (route) => {
    try {
      await db.requirePath(PAGES_COLLECTION_PATH, 'resource:update')
      const body = (await route.json()) as { id?: string }
      const id = String(body?.id ?? '').trim()
      if (!id) {
        route.send(400, { error: 'id required' })
        return
      }
      route.send(200, { ok: db.tags.forgetBannerGallery(id) })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/db/stat', async (route) => {
    await send(route, () => db.stat(route.query.get('path') || '/'))
  })
  ctx.http.route('GET', '/api/db/content', async (route) => {
    await send(route, () => db.content(route.query.get('path') || '/'))
  })
  ctx.http.route('POST', '/api/db/content', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; value?: unknown; version?: unknown }
      const path = String(body?.path ?? '')
      const version = typeof body?.version === 'number' && Number.isInteger(body.version) ? body.version : undefined
      route.send(200, await db.writeContent(path, body?.value, version))
    } catch (error) {
      if (error instanceof EditorContentConflictError) {
        route.send(409, {
          error: error.message,
          code: error.code,
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        })
        return
      }
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/update', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; content?: unknown }
      route.send(200, await db.update(String(body?.path ?? ''), body?.content))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/batch-update', async (route) => {
    try {
      const body = (await route.json()) as {
        path?: string
        ids?: string[]
        viewId?: string
        view_id?: string
        filter?: Record<string, unknown>
        q?: string
        fields?: Record<string, unknown>
        updates?: Array<{ id: string; fields: Record<string, unknown> }>
        dryRun?: boolean
        dry_run?: boolean
        maxRecords?: number
        max_records?: number
      }
      route.send(
        200,
        await db.batchUpdate(String(body?.path ?? ''), {
          ids: body?.ids,
          viewId: body?.viewId ?? body?.view_id,
          filter: body?.filter,
          q: body?.q,
          fields: body?.fields,
          updates: body?.updates,
          dryRun: body?.dryRun ?? body?.dry_run,
          maxRecords: body?.maxRecords ?? body?.max_records,
        }),
      )
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/create', async (route) => {
    try {
      const body = (await route.json()) as {
        path?: string
        records?: unknown
        content?: unknown
        scope?: 'personal' | 'workspace' | 'shared' | 'local'
      }
      const scope =
        body?.scope === 'workspace' ? 'workspace' : body?.scope === 'shared' ? 'shared' : body?.scope === 'local' ? 'local' : 'personal'
      const created = await db.create(String(body?.path ?? ''), body?.records ?? body?.content, {
        scope: activeDataLocation() === 'device' && scope !== 'shared' ? 'local' : scope,
      })
      route.send(200, created)
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/duplicate', async (route) => {
    try {
      const body = (await route.json()) as {
        path?: string
        scope?: 'personal' | 'workspace' | 'local'
        title?: string
      }
      const requestedScope =
        body?.scope === 'workspace' ? 'workspace' : body?.scope === 'local' ? 'local' : 'personal'
      const effectiveScope = activeDataLocation() === 'device' ? 'local' : requestedScope
      const duplicated = await db.duplicate(String(body?.path ?? ''), {
        scope: effectiveScope,
        ...(typeof body?.title === 'string' && body.title.trim() ? { title: body.title.trim() } : {}),
      })
      route.send(200, duplicated)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      route.send(message.includes('permission denied') ? 403 : 400, { error: message })
    }
  })
  ctx.http.route('POST', '/api/db/delete', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; ids?: unknown; q?: unknown; filter?: unknown; purge?: unknown }
      route.send(200, await db.remove(String(body?.path ?? ''), asDeleteQuery((body ?? {}) as Record<string, unknown>)))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/restore', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; ids?: unknown; q?: unknown; filter?: unknown }
      route.send(200, await db.restore(String(body?.path ?? ''), asDeleteQuery((body ?? {}) as Record<string, unknown>)))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/db/trash', async (route) => {
    await send(route, () => db.listTrash())
  })
  const ensureSeedsForPath = (rawPath: string) => {
    const normalized = normalizeCollectionPath(rawPath)
    if (!normalized || normalized === '/' || normalized === VIEWS_COLLECTION_PATH) return
    const spec = db.collection(normalized)
    savedViews.ensureSeedViews(
      normalized,
      spec
        ? { path: normalized, label: spec.label, view: spec.view }
        : { path: normalized, label: normalized.replace(/^\//, '') },
    )
  }

  ctx.http.route('GET', '/api/db/saved-views', async (route) => {
    try {
      const accountId = currentAccountId()
      const singlePath = String(route.query.get('path') ?? '').trim()
      if (singlePath) {
        const normalized = normalizeCollectionPath(singlePath)
        await db.requirePath(normalized, 'resource:read')
        ensureSeedsForPath(normalized)
        route.send(200, { views: savedViews.clientViewsFor(normalized, accountId) })
        return
      }
      const rawPaths = String(route.query.get('paths') ?? '').trim()
      const requestedPaths = rawPaths
        ? rawPaths.split(',').map((p) => normalizeCollectionPath(p)).filter((p) => p && p !== '/' && p !== VIEWS_COLLECTION_PATH)
        : db.collectionsList().map((spec) => normalizeCollectionPath(spec.path)).filter((p) => p && p !== '/' && p !== VIEWS_COLLECTION_PATH)
      const viewsByPath: Record<string, StoredView[]> = {}
      for (const path of new Set(requestedPaths)) {
        try {
          await db.requirePath(path, 'resource:read')
        } catch {
          continue
        }
        ensureSeedsForPath(path)
        viewsByPath[path] = savedViews.clientViewsFor(path, accountId)
      }
      route.send(200, { viewsByPath })
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })

  ctx.http.route('POST', '/api/db/saved-views', async (route) => {
    try {
      /**
       * 默认是字段级增量写：upsert 只合并传入字段并由服务端单调递增 revision，remove 只删指定 id。
       * 需要整份同步的老调用方显式传 replace: true。
       */
      const body = (await route.json()) as {
        path?: string
        views?: StoredView[]
        upsert?: StoredView[]
        remove?: string[]
        replace?: boolean
      }
      const path = normalizeCollectionPath(String(body?.path ?? ''))
      const accountId = currentAccountId()
      await db.requirePath(path, 'resource:read')
      ensureSeedsForPath(path)
      const removals = (body.remove ?? []).map(String).filter(Boolean)
      let views: StoredView[] = []
      if (body.replace === true || (body.upsert === undefined && body.remove === undefined)) {
        const next = Array.isArray(body.views) ? body.views : []
        savedViews.replace(path, next, accountId)
        views = savedViews.clientViewsFor(path, accountId)
      } else {
        const result = savedViews.applyPatch(path, { upsert: body.upsert ?? [], remove: removals }, accountId)
        views = result.views
      }
      db.notifyViewCatalog(path)
      route.send(200, { ok: true, views })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const status = msg.includes('MEMBER_VIEW_REFERENCED')
        ? 409
        : msg.includes('permission denied')
          ? 403
          : 400
      route.send(status, { error: msg })
    }
  })
  const resolveShareCollabStore = () => getAccountService(ctx)?.store
  const shareSnapshotOpts = (query: URLSearchParams, share?: { workspaceId?: string }) => {
    const collabStore = resolveShareCollabStore()
    const workspaceId = share?.workspaceId || currentRequestWorkspaceId() || collabStore?.activeWorkspaceId?.() || ''
    if (query.get('contents') === 'all') return { contentIds: 'all' as const, shares, collabStore, workspaceId }
    const record = query.get('record') || ''
    return { contentIds: record ? [record] : [], shares, collabStore, workspaceId }
  }
  const sharePasswordOf = (route: { req: { headers: IncomingMessage['headers'] }; query: URLSearchParams }, body?: { password?: unknown }) => {
    const header = String(route.req.headers['x-share-password'] ?? '')
    if (header) return header
    const query = route.query.get('password')
    if (query) return query
    return String(body?.password ?? '')
  }
  const rememberShareLan = (route: { req: { headers: IncomingMessage['headers'] } }) => {
    if (getRuntimePolicy().hostMode === 'cloud') return
    const code = String(route.req.headers['x-lan-member'] ?? '').trim()
    if (!code) return
    try {
      const account = getAccountService(ctx)
      const workspaceId = account?.store?.activeWorkspaceId?.() ?? ''
      account?.store?.rememberLanMember?.(workspaceId, code)
    } catch {
      /* 没有账号库时分享页仍可打开 */
    }
  }
  ctx.http.route('GET', '/api/db/access-explain', async (route) => {
    try {
      const collection = String(route.query.get('collection') ?? '').trim()
      const recordId = String(route.query.get('recordId') ?? '').trim()
      const tableLabel = String(route.query.get('tableLabel') ?? '').trim()
      const builtin = route.query.get('builtin') === '1'
      const fallbackRoleParam = String(route.query.get('role') ?? '').trim()
      if (!collection || !recordId) {
        route.send(400, { error: 'collection and recordId are required' })
        return
      }
      const location = activeDataLocation()
      const localOnly = location !== 'cloud'
      if (builtin) {
        route.send(200, buildAccessExplanation({ collection, recordId, tableLabel, builtin: true, localOnly }))
        return
      }
      await db.requirePath(`${collection}/${recordId}`, 'resource:read')
      const rawRecord = (await db.read(`${collection}/${recordId}`)) as {
        value?: { id?: unknown; title?: unknown; name?: unknown; [key: string]: unknown }
      }
      const record = rawRecord.value ? { id: recordId, ...rawRecord.value } : { id: recordId }
      const target = resolveScopeTarget(collection, recordId, record)
      const recordTitle = String(record.title ?? record.name ?? '').trim() || target.id
      const publicShares: NonNullable<BuildAccessExplanationInput['publicShares']> = shares
        .listRecords(target.collection)
        .map((share) => ({
          kind: 'record' as const,
          collection: share.collection,
          recordId: share.recordId,
        }))
      let access: BuildAccessExplanationInput['access']
      const recordTitles: Record<string, string> = {
        [`${target.collection}\t${target.id}`]: recordTitle,
      }
      if (!localOnly) {
        const account = getAccountService(ctx)
        const actorId = currentAccountId()
        if (actorId && account?.store?.recordAccess) {
          access = account.store.recordAccess(actorId, target.collection, target.id, record) as NonNullable<BuildAccessExplanationInput['access']>
          const refs = new Map<string, { collection: string; recordId: string }>()
          for (const anc of access.inheritance?.ancestors ?? []) {
            refs.set(`${anc.collection}\t${anc.recordId}`, { collection: anc.collection, recordId: anc.recordId })
          }
          const seenShareCollections = new Set<string>([target.collection])
          for (const anc of access.inheritance?.ancestors ?? []) {
            if (!anc.collection || seenShareCollections.has(anc.collection)) continue
            seenShareCollections.add(anc.collection)
            for (const share of shares.listRecords(anc.collection)) {
              publicShares.push({
                kind: 'record',
                collection: share.collection,
                recordId: share.recordId,
              })
            }
          }
          for (const step of access.roleChain ?? []) {
            if (step.collection && step.recordId) {
              refs.set(`${step.collection}\t${step.recordId}`, { collection: step.collection, recordId: step.recordId })
            }
          }
          for (const [key, ref] of refs) {
            if (recordTitles[key]) continue
            try {
              const got = (await db.read(`${ref.collection}/${ref.recordId}`)) as {
                value?: { title?: unknown; name?: unknown }
              }
              const title = String(got.value?.title ?? got.value?.name ?? '').trim()
              if (title) recordTitles[key] = title
            } catch {
              /* 祖先记录当前用户不可读时，保留 ID 兜底 */
            }
          }
        }
      }
      const fallbackRole = normalizeAuthzRole(fallbackRoleParam) ?? (localOnly ? 'owner' : 'viewer')
      const spec = db.collection(target.collection) ?? db.collection(collection)
      const explanation = buildAccessExplanation({
        collection: target.collection,
        recordId: target.id,
        recordTitle,
        tableLabel: tableLabel || spec?.label || '',
        localOnly,
        fallbackRole,
        publicShares,
        recordTitles,
        access,
      })
      route.send(200, explanation)
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })
  ctx.http.route('GET', '/api/db/shares', async (route) => {
    const collection = route.query.get('collection') || ''
    if (!collection) {
      const items = []
      const listedRecords = new Set<string>()
      for (const share of shares.list()) {
        try {
          await db.requirePath(
            share.kind === 'record' ? `${share.collection}/${share.recordId}` : share.collection,
            'resource:share',
          )
        } catch {
          continue
        }
        let title = share.collection.replace(/^\//, '')
        if (share.kind === 'record' && share.recordId) {
          try {
            const got = (await db.read(`${share.collection}/${share.recordId}`)) as { value?: { title?: unknown; name?: unknown } }
            title = String(got.value?.title ?? got.value?.name ?? share.recordId)
          } catch {
            shares.revoke(share.token)
            continue
          }
        } else {
          continue
        }
        items.push({ ...share, title, url: publicShareUrl(route.req, share.token) })
        if (share.kind === 'record' && share.recordId) {
          listedRecords.add(`${share.collection}\t${share.recordId}`)
        }
      }
      const accountId = currentAccountId()
      const workspaceId = currentRequestWorkspaceId()
      const account = (ctx as Context & {
        account?: {
          store?: {
            externallySharedRecords?: (
              accountId: string,
              workspaceId: string,
            ) => Array<{ collection: string; record_id: string }>
          }
        }
      }).account
      if (activeDataLocation() === 'cloud' && accountId && workspaceId && account?.store?.externallySharedRecords) {
        for (const record of account.store.externallySharedRecords(accountId, workspaceId)) {
          const key = `${record.collection}\t${record.record_id}`
          if (listedRecords.has(key)) continue
          try {
            const got = (await db.read(`${record.collection}/${record.record_id}`)) as {
              value?: { title?: unknown; name?: unknown }
            }
            items.push({
              token: `collab:${encodeURIComponent(record.collection)}:${encodeURIComponent(record.record_id)}`,
              kind: 'record',
              collection: record.collection,
              viewId: '',
              recordId: record.record_id,
              title: String(got.value?.title ?? got.value?.name ?? record.record_id),
              url: '',
            })
            listedRecords.add(key)
          } catch {
            /* The record was removed or this account no longer has access. */
          }
        }
      }
      route.send(200, { shares: items })
      return
    }
    const rawKind = route.query.get('kind')
    const kind = rawKind === 'record' ? 'record' as const : null
    if (!kind) {
      route.send(200, { share: null })
      return
    }
    const recordId = route.query.get('recordId') || ''
    try {
      await db.requirePath(`${collection}/${recordId}`, 'resource:read')
    } catch {
      route.send(404, { error: 'not found' })
      return
    }
    const share = shares.findRecord(collection, recordId)
    const collabStore = resolveShareCollabStore()
    const workspaceId = currentRequestWorkspaceId() || collabStore?.activeWorkspaceId?.() || ''
    let viewPublicStats: { matchedCount: number; publicCount: number } | undefined
    if (normalizeCollectionPath(collection) === VIEWS_COLLECTION_PATH && recordId) {
      viewPublicStats =
        (await computeViewPublicStats(
          db,
          savedViews,
          shares,
          recordId,
          currentAccountId(),
          workspaceId,
          collabStore,
        )) ?? undefined
    }
    let inheritance: { mode: 'inherit' | 'custom'; hasParent: boolean; parentTitle?: string } | undefined
    let inheritedShare:
      | (ReturnType<typeof shares.findRecord> & {
          url: string
          rootUrl: string
          sourceCollection: string
          sourceRecordId: string
          sourceTitle: string
        })
      | null = null
    if (activeDataLocation() === 'cloud' && workspaceId && collabStore?.recordInheritance && recordId) {
      const info = collabStore.recordInheritance(workspaceId, collection, recordId)
      let parentTitle = ''
      if (info.parent) {
        try {
          const parentGot = (await db.read(`${info.parent.collection}/${info.parent.recordId}`)) as {
            value?: { title?: unknown; name?: unknown }
          }
          parentTitle = String(parentGot.value?.title ?? parentGot.value?.name ?? '').trim()
        } catch {
          /* 上级不可读时回退默认名称 */
        }
      }
      inheritance = {
        mode: info.mode,
        hasParent: info.hasParent,
        ...(parentTitle ? { parentTitle } : {}),
      }
      if (info.mode === 'inherit' && info.ancestors.length > 0) {
        const normalizedSelfCollection = normalizeCollectionPath(collection)
        for (let i = info.ancestors.length - 1; i >= 0; i -= 1) {
          const anc = info.ancestors[i]!
          const ancShare = shares.findRecord(anc.collection, anc.recordId)
          if (!ancShare) continue
          if (workspaceId && ancShare.workspaceId && ancShare.workspaceId !== workspaceId) continue
          let sourceTitle = ''
          try {
            const ancGot = (await db.read(`${anc.collection}/${anc.recordId}`)) as {
              value?: { title?: unknown; name?: unknown }
            }
            sourceTitle = String(ancGot.value?.title ?? ancGot.value?.name ?? '').trim()
          } catch {
            /* 祖先不可读时使用 ID 兜底 */
          }
          const rootUrl = publicShareUrl(route.req, ancShare.token)
          const sameCollection = normalizeCollectionPath(anc.collection) === normalizedSelfCollection
          const url = sameCollection ? `${rootUrl}/r/${encodeURIComponent(recordId)}` : rootUrl
          inheritedShare = {
            ...ancShare,
            url,
            rootUrl,
            sourceCollection: anc.collection,
            sourceRecordId: anc.recordId,
            sourceTitle: sourceTitle || anc.recordId,
          }
          break
        }
      }
    }
    route.send(200, {
      share: share ? { ...share, url: publicShareUrl(route.req, share.token) } : null,
      ...(inheritedShare ? { inheritedShare } : { inheritedShare: null }),
      ...(inheritance ? { inheritance } : {}),
      ...(viewPublicStats ? { viewPublicStats } : {}),
    })
  })
  ctx.http.route('POST', '/api/db/shares', async (route) => {
    try {
      const body = (await route.json()) as {
        kind?: string
        collection?: string
        recordId?: string
        password?: string | null
        enabled?: boolean
        sharePlugins?: boolean
        allowCopy?: boolean
      }
      if (body.kind !== 'record') {
        route.send(400, { error: '不支持的分享类型' })
        return
      }
      const collection = String(body.collection ?? '')
      const recordId = String(body.recordId ?? '')
      if (isPersonalOnlyCollection(collection)) {
        route.send(400, { error: '该数据类型仅自己可见，不支持分享' })
        return
      }
      await db.requirePath(`${collection}/${recordId}`, 'resource:share')
      const notifyViewShare = () => {
        if (normalizeCollectionPath(collection) !== VIEWS_COLLECTION_PATH) return
        const parsed = parseViewShareRecordId(recordId)
        db.notifyViewCatalog(parsed?.targetCollection || VIEWS_COLLECTION_PATH)
      }
      if (body.enabled === false) {
        shares.revokeRecord(collection, recordId)
        db.notifyShareChange()
        notifyViewShare()
        route.send(200, { share: null })
        return
      }
      const share = shares.upsert({
        kind: 'record',
        collection,
        recordId: body.recordId,
        password: body.password,
        sharePlugins: body.sharePlugins,
        allowCopy: body.allowCopy,
        workspaceId: currentRequestWorkspaceId(),
        createdBy: currentAccountId(),
      })
      db.notifyShareChange()
      notifyViewShare()
      route.send(200, { share: { ...share, url: publicShareUrl(route.req, share.token) } })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  const runInShareContext = <T>(share: { workspaceId?: string; createdBy?: string }, fn: () => T): T => {
    const withWs = () => (share.workspaceId ? runWithRequestWorkspace(share.workspaceId, fn) : fn())
    return share.createdBy ? runWithAccount(share.createdBy, withWs) : withWs()
  }
  ctx.http.route('GET', '/api/share/:token', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    rememberShareLan(route)
    try {
      const snapshot = await runInShareContext(share, () =>
        buildShareSnapshot(db, savedViews, share, shareSnapshotOpts(route.query, share)),
      )
      route.send(200, snapshot)
    } catch (error) {
      const msg = String(error)
      if (share.kind === 'record' && /unknown record/.test(msg)) {
        shares.revoke(token)
        route.send(404, { error: 'not found' })
        return
      }
      route.send(400, { error: msg })
    }
  })
  ctx.http.route('POST', '/api/share/:token', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    const body = (await route.json()) as { password?: string }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route, body))) {
      route.send(401, { needsPassword: true })
      return
    }
    rememberShareLan(route)
    try {
      const snapshot = await runInShareContext(share, () =>
        buildShareSnapshot(db, savedViews, share, shareSnapshotOpts(route.query, share)),
      )
      route.send(200, snapshot)
    } catch (error) {
      const msg = String(error)
      if (share.kind === 'record' && /unknown record/.test(msg)) {
        shares.revoke(token)
        route.send(404, { error: 'not found' })
        return
      }
      route.send(400, { error: msg })
    }
  })
  ctx.http.route('GET', '/api/share/:token/content/:recordId', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    const recordId = route.params.recordId ?? ''
    try {
      const collabStore = resolveShareCollabStore()
      const workspaceId = share.workspaceId || currentRequestWorkspaceId() || collabStore?.activeWorkspaceId?.() || ''
      const snapshot = await runInShareContext(share, () =>
        buildShareSnapshot(db, savedViews, share, { contentIds: [recordId], shares, collabStore, workspaceId }),
      )
      if (!snapshot.records.some((row) => String(row.id) === recordId)) {
        route.send(404, { error: 'not found' })
        return
      }
      route.send(200, {
        id: recordId,
        content: snapshot.contents[recordId] ?? null,
        pluginIds: snapshot.pluginIds,
        assets: snapshot.assets,
      })
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('GET', '/api/share/:token/file/:name', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    try {
      const record = route.query.get('record') || ''
      const collabStore = resolveShareCollabStore()
      const workspaceId = share.workspaceId || currentRequestWorkspaceId() || collabStore?.activeWorkspaceId?.() || ''
      const snapshot = await runInShareContext(share, () =>
        buildShareSnapshot(
          db,
          savedViews,
          share,
          record
            ? { contentIds: [record], shares, collabStore, workspaceId }
            : { contentIds: [], shares, collabStore, workspaceId },
        ),
      )
      const name = route.params.name ?? ''
      if (!snapshot.assets.includes(name)) {
        route.send(404, { error: 'not found' })
        return
      }
      const { bytes, type, etag } = await assets.read(name)
      route.res.writeHead(200, {
        'content-type': type,
        'cache-control': 'no-store',
        etag: `"${etag}"`,
      })
      route.res.end(bytes)
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('GET', '/api/share/:token/plugin/:id/web.js', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    const id = String(route.params.id ?? '')
    try {
      if (!share.sharePlugins || !isSharePluginId(id)) {
        route.send(404, { error: 'not found' })
        return
      }
      const body = readSharePluginWebJs(process.cwd(), id)
      if (!body) {
        route.send(404, { error: 'not found' })
        return
      }
      route.res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      route.res.end(body)
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('GET', '/api/share/:token/plugin/:id', async (route) => {
    const token = route.params.token ?? ''
    const share = shares.get(token)
    if (!share) {
      route.send(404, { error: 'not found' })
      return
    }
    if (share.hasPassword && !shares.verifyPassword(token, sharePasswordOf(route))) {
      route.send(401, { needsPassword: true })
      return
    }
    if (!share.sharePlugins) {
      route.send(403, { error: 'plugins are not shared' })
      return
    }
    const id = String(route.params.id ?? '').replace(/\.zip$/i, '')
    try {
      if (!isSharePluginId(id)) {
        route.send(404, { error: 'not found' })
        return
      }
      const zip = zipSharePluginSource(process.cwd(), id)
      if (!zip) {
        route.send(404, { error: 'not found' })
        return
      }
      route.res.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${id}.zip"`,
        'cache-control': 'no-store',
      })
      route.res.end(Buffer.from(zip))
    } catch {
      route.send(404, { error: 'not found' })
    }
  })
  ctx.http.route('POST', '/api/page/sandbox/patch', async (route) => {
    try {
      const body = (await route.json()) as { path?: string; tagId?: string; values?: unknown }
      route.send(200, await db.patchTagSandbox(String(body?.path ?? ''), String(body?.tagId ?? ''), body?.values))
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('GET', '/api/db/tags', async (route) => {
    try {
      await db.requirePath(TAGS_COLLECTION_PATH, 'resource:read')
      const collect = route.query.get('collect') || ''
      if (collect) {
        route.send(200, await db.collectTag(collect))
        return
      }
      const q = route.query.get('q') || ''
      const allTags = tags.list(q)
      const allowedIds = db.visibleTagIds(
        allTags.map((item) => item.id),
        'resource:read',
      )
      const visibleTags = allTags.filter((item) => allowedIds.has(item.id))
      const payload: { tags: ReturnType<typeof tags.list>; filled?: ReturnType<typeof tags.filledFieldCounts> } = {
        tags: visibleTags,
      }
      if (route.query.get('filled')) {
        const allFilled = tags.filledFieldCounts()
        const filteredFilled: Record<string, Record<string, number>> = {}
        for (const [tagId, counts] of Object.entries(allFilled)) {
          if (allowedIds.has(tagId)) filteredFilled[tagId] = counts
        }
        payload.filled = filteredFilled
      }
      route.send(200, payload)
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/tags', async (route) => {
    try {
      const body = (await route.json()) as { tags?: unknown[] }
      await db.requirePath(TAGS_COLLECTION_PATH, 'resource:update')
      const listed = Array.isArray(body.tags) ? body.tags : []
      const rbac = getRuntimePolicy().authzMode === 'rbac'
      for (const item of listed) {
        const pack = normalizeSchemaPack(item)
        if (!pack) continue
        if (rbac && tags.get(pack.id) && !db.visibleTagIds([pack.id], 'resource:update').has(pack.id)) {
          route.send(403, { error: `无权修改标签定义: ${pack.id}` })
          return
        }
        tags.upsert(pack)
        db.recordTagOwnership(pack.id)
      }
      db.notifyTagCatalog()
      const allTags = tags.list()
      const allowedIds = db.visibleTagIds(
        allTags.map((item) => item.id),
        'resource:read',
      )
      route.send(200, { ok: true, tags: allTags.filter((item) => allowedIds.has(item.id)) })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  const serveDbFile: Parameters<typeof ctx.http.route>[2] = async (route) => {
    try {
      const name = route.params.name ?? ''
      const path = route.query.get('path') || String(route.req.headers['x-biu-resource-path'] ?? '')
      if (path) await db.requireAssetForPath(name, path, 'resource:read')
      else db.requireAsset(name, 'resource:read')
      const { bytes, type, etag } = await assets.readAny(name)
      const suggested = route.query.get('download')
      const inline = !suggested && (type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/'))
      route.res.writeHead(200, {
        'content-type': type,
        'content-disposition': assetContentDisposition(name, suggested, inline),
        'cache-control': isHashedAssetName(name) ? 'public, max-age=31536000, immutable' : 'no-store',
        etag: `"${etag}"`,
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      })
      route.res.end(bytes)
    } catch {
      route.send(404, { error: 'not found' })
    }
  }
  const putDbFile = async (route: Parameters<Parameters<typeof ctx.http.route>[2]>[0], legacyAssetOnly = false) => {
    try {
      const name = route.params.name ?? ''
      const path = route.query.get('path') || String(route.req.headers['x-biu-resource-path'] ?? '')
      if (path) await db.requireAssetForPath(name, path, 'resource:update')
      else if (legacyAssetOnly) db.requireAsset(name, 'resource:update')
      else {
        route.send(400, { error: 'resource path required' })
        return
      }
      const bytes = await route.bytes()
      const written = isHashedAssetName(name)
        ? await assets.write(name, bytes)
        : await assets.writeDoc(name, bytes, { etag: parseIfMatch(route.req.headers['if-match']) })
      db.tags.putAttachment({
        name: written.name,
        etag: written.etag,
        mime: mimeOfAsset(written.name),
        bytes: written.bytes,
        kind: 'asset',
        storage: written.storage,
      })
      if (path) linkUploadedAsset(db, path, written.name)
      ctx.http.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('asset', { asset: { name: written.name, etag: written.etag } }))
      route.send(200, { ok: true, ...written })
    } catch (error) {
      if (error instanceof AssetConflictError) {
        route.send(409, { error: 'etag conflict', etag: error.etag })
        return
      }
      route.send(400, { error: String(error) })
    }
  }
  const putHashFile: Parameters<typeof ctx.http.route>[2] = async (route) => {
    try {
      const name = route.params.name ?? ''
      const path = route.query.get('path') || String(route.req.headers['x-biu-resource-path'] ?? '')
      if (!path) {
        route.send(400, { error: 'resource path required' })
        return
      }
      await db.requireAssetForPath(name, path, 'resource:update')
      const bytes = await route.bytes()
      const written = await assets.write(name, bytes)
      db.tags.putAttachment({
        name: written.name,
        etag: written.etag,
        mime: mimeOfAsset(written.name),
        bytes: written.bytes,
        kind: 'asset',
        storage: written.storage,
      })
      linkUploadedAsset(db, path, written.name)
      ctx.http.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('asset', { asset: { name: written.name, etag: written.etag } }))
      route.send(200, { ok: true, ...written })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  }
  ctx.http.route('PUT', '/api/db/file/hash/:name', putHashFile)
  ctx.http.route('GET', '/api/db/file/:name', serveDbFile)
  ctx.http.route('PUT', '/api/db/file/:name', putDbFile)
  // Compatibility aliases share authorization, ETag handling and attachment tracking.
  ctx.http.route('GET', '/api/page/file/:name', serveDbFile)
  ctx.http.route('PUT', '/api/page/file/:name', (route) => putDbFile(route, true))
  ctx.http.route('GET', '/api/doc/file/:name', serveDbFile)
  ctx.http.route('PUT', '/api/doc/file/:name', putDbFile)
  ctx.http.route('POST', '/api/db/action', async (route) => {
    let path = ''
    let action = ''
    try {
      const body = (await route.json()) as { path?: string; action?: string; args?: unknown }
      path = String(body?.path ?? '')
      action = String(body?.action ?? '')
      const extra =
        body?.args && typeof body.args === 'object' && !Array.isArray(body.args)
          ? (body.args as Record<string, unknown>)
          : undefined
      route.send(200, await db.action(path, action, extra))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger('database').warn(`action ${action || '(none)'} ${path || '(none)'}: ${message}`)
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/tool', async (route) => {
    try {
      const body = (await route.json()) as { name?: string; args?: Record<string, unknown> }
      const name = String(body?.name ?? '').trim()
      if (!DATABASE_TOOL_NAMES.has(name)) {
        route.send(400, { error: `unsupported db tool: ${name}` })
        return
      }
      const tools = ctx.get('tools') as { invoke?: (toolName: string, args: Record<string, unknown>) => Promise<unknown> } | undefined
      if (!tools?.invoke) {
        route.send(503, { error: 'tools service unavailable' })
        return
      }
      const result = await tools.invoke(name, body?.args && typeof body.args === 'object' ? body.args : {})
      route.send(200, { result })
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })

  const resolveWorkspaceContext = (account: AccountService | undefined) => {
    const policy = getRuntimePolicy()
    const actorId = currentAccountId()
    const workspaceId =
      currentRequestWorkspaceId() ||
      (policy.allowImplicitActiveWorkspace ? account?.store?.activeWorkspaceId?.() : '') ||
      ''
    return { actorId, workspaceId }
  }

  const resolveMemberViewMatches = (
    account: AccountService | undefined,
    actorId: string,
    workspaceId: string,
    view: StoredView,
  ) => {
    const rawMembers = account?.store?.members?.(actorId, workspaceId) ?? []
    const memberSpec = db.collection(WORKSPACE_MEMBERS_COLLECTION_PATH)
    const filter: Record<string, unknown> = { ...(view.filters ?? {}) }
    if (view.filterTree) filter.$tree = view.filterTree
    const allTags = db.tags.list()
    const q = String(view.query ?? '').trim().toLowerCase()
    const matched: Array<{ id: string; name: string; email: string; avatar?: string; memberKind: string }> = []
    for (const member of rawMembers) {
      const baseRow = {
        id: member.id,
        title: member.name || member.email,
        name: member.name,
        email: member.email,
        role: member.role,
        membershipKind: member.member_kind,
        joinedAt: member.created_at,
      }
      const taggedRow = memberSpec ? db.applyTagOverlay(memberSpec, baseRow) : baseRow
      if (!matchListFilterRecord(taggedRow, filter, memberSpec?.schema as never, allTags)) continue
      if (q) {
        const hay = `${member.name} ${member.email} ${member.role}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      matched.push({
        id: member.id,
        name: member.name || member.email,
        email: member.email,
        ...(member.avatar ? { avatar: member.avatar } : {}),
        memberKind: member.member_kind,
      })
    }
    return matched
  }

  // 成员视图列表：区分「管理员锁定动态成员组」与「个人/公开快捷名单」
  ctx.http.route('GET', '/api/db/member-views', async (route) => {
    try {
      const account = getAccountService(ctx)
      const { actorId, workspaceId } = resolveWorkspaceContext(account)
      if (!workspaceId) {
        route.send(200, { views: [] })
        return
      }
      const visibleViews = savedViews.listMemberViews(workspaceId, actorId)
      const items = visibleViews.map((view) => {
        const isLocked = Boolean(view.locked)
        const matched = resolveMemberViewMatches(account, actorId, workspaceId, view)
        return {
          id: String(view.id),
          name: String(view.name || view.id),
          locked: isLocked,
          isLocked,
          createdBy: view.createdBy ?? '',
          memberCount: matched.length,
          grantCount: isLocked ? (account?.store?.memberViewGrantCount?.(workspaceId, String(view.id)) ?? 0) : 0,
        }
      })
      route.send(200, { views: items })
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })

  // 成员视图瞬时展开：返回当前命中的成员名单（用于个人/公开视图的一次性快照授权，或动态组预览）
  ctx.http.route('GET', '/api/db/member-views/:viewId/resolve', async (route) => {
    try {
      const viewId = String(route.params.viewId ?? '').trim()
      if (!viewId) {
        route.send(400, { error: 'viewId required' })
        return
      }
      const account = getAccountService(ctx)
      const { actorId, workspaceId } = resolveWorkspaceContext(account)
      const visible = savedViews.listMemberViews(workspaceId, actorId)
      const view = visible.find((item) => String(item.id) === viewId)
      if (!view) {
        route.send(404, { error: 'member view not found' })
        return
      }
      const members = resolveMemberViewMatches(account, actorId, workspaceId, view)
      route.send(200, {
        viewId: String(view.id),
        name: String(view.name || view.id),
        locked: Boolean(view.locked),
        isLocked: Boolean(view.locked),
        members,
      })
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })

  // 解除或删除被引用的管理员锁定成员视图：显式选择「固化为当前名单 (freeze)」或「取消关联授权 (revoke)」
  ctx.http.route('POST', '/api/db/member-views/:viewId/release', async (route) => {
    try {
      const viewId = String(route.params.viewId ?? '').trim()
      if (!viewId) {
        route.send(400, { error: 'viewId required' })
        return
      }
      const body = (await route.json()) as {
        action?: 'unlock' | 'delete'
        mode?: 'freeze' | 'revoke'
      }
      const action = body?.action === 'delete' ? 'delete' : 'unlock'
      const mode = body?.mode === 'revoke' ? 'revoke' : body?.mode === 'freeze' ? 'freeze' : null
      if (!mode) {
        route.send(400, { error: 'mode must be freeze or revoke' })
        return
      }
      const account = getAccountService(ctx)
      const { actorId, workspaceId } = resolveWorkspaceContext(account)
      if (!actorId || !workspaceId || !account?.store) {
        route.send(403, { error: 'permission denied' })
        return
      }
      const role = account.store.memberRole?.(actorId, workspaceId)
      if (role !== 'owner' && role !== 'admin') {
        route.send(403, { error: 'permission denied: MEMBER_LOCKED_VIEW_ADMIN_ONLY' })
        return
      }
      const view = savedViews.getMemberView(workspaceId, viewId)
      if (!view) {
        route.send(404, { error: 'member view not found' })
        return
      }
      let transition: Record<string, unknown> = {}
      if (mode === 'freeze') {
        const matched = resolveMemberViewMatches(account, actorId, workspaceId, view)
        transition = account.store.freezeMemberViewGrants?.(
          actorId,
          workspaceId,
          viewId,
          matched.map((m) => m.id),
        ) ?? {}
      } else {
        transition = account.store.revokeAllMemberViewGrants?.(actorId, workspaceId, viewId) ?? {}
      }
      savedViews.applyPatch(
        WORKSPACE_MEMBERS_COLLECTION_PATH,
        {
          upsert: [{ id: viewId, locked: false }],
        },
        actorId,
        workspaceId,
      )
      if (action === 'delete') {
        savedViews.remove(`${WORKSPACE_MEMBERS_COLLECTION_PATH}::${viewId}`, actorId, [], workspaceId)
      }
      db.notifyViewCatalog(WORKSPACE_MEMBERS_COLLECTION_PATH)
      db.notifyShareChange()
      route.send(200, { ok: true, action, mode, ...transition })
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })

  const resolveBatchTargetIds = async (body: {
    collection?: string
    recordIds?: unknown
    viewId?: string
    filter?: Record<string, unknown>
    q?: string
  }) => {
    const collection = normalizeCollectionPath(String(body?.collection ?? ''))
    if (!collection || collection === '/') throw new Error('collection required')
    if (Array.isArray(body?.recordIds) && body.recordIds.length > 0) {
      return {
        collection,
        recordIds: [...new Set(body.recordIds.map((id) => String(id ?? '').trim()).filter(Boolean))],
      }
    }
    let resolvedFilter: Record<string, unknown> | undefined =
      body?.filter && typeof body.filter === 'object' && !Array.isArray(body.filter) ? { ...body.filter } : undefined
    let q = typeof body?.q === 'string' ? body.q : ''
    if (body?.viewId) {
      const actorId = currentAccountId()
      const view = savedViews.viewsFor(collection, actorId).find((item) => String(item.id) === String(body.viewId))
      if (view) {
        if (!resolvedFilter) {
          const next: Record<string, unknown> = { ...(view.filters ?? {}) }
          if (view.filterTree) next.$tree = view.filterTree
          if (Object.keys(next).length) resolvedFilter = next
        }
        if (!q && view.query) q = String(view.query)
      }
    }
    const listed = await db.list(collection, resolvedFilter, { q, limit: 10000, columns: ['id'] })
    const items = listed.kind === 'collection' ? listed.items : []
    return {
      collection,
      recordIds: [...new Set(items.map((row) => String(row.id ?? '').trim()).filter(Boolean))],
    }
  }

  // 批量静态权限预览：统计命中总数、可管理数与将跳过的无权记录数
  ctx.http.route('POST', '/api/db/batch-permissions/preview', async (route) => {
    try {
      const body = (await route.json()) as {
        collection?: string
        recordIds?: unknown
        viewId?: string
        filter?: Record<string, unknown>
        q?: string
      }
      const { collection, recordIds } = await resolveBatchTargetIds(body)
      if (isPersonalOnlyCollection(collection)) {
        route.send(400, { error: '该数据类型仅自己可见，不支持分享' })
        return
      }
      const account = getAccountService(ctx)
      const { actorId } = resolveWorkspaceContext(account)
      if (!actorId || !account?.store?.previewBatchRecordPermissions) {
        route.send(200, {
          totalCount: recordIds.length,
          manageableCount: recordIds.length,
          skippedCount: 0,
          manageableIds: recordIds,
        })
        return
      }
      const preview = account.store.previewBatchRecordPermissions(actorId, collection, recordIds)
      route.send(200, preview)
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })

  // 批量静态权限落库：单事务执行增量授权 / 回收 / 通用访问切换，自动跳过无管理权限记录
  ctx.http.route('POST', '/api/db/batch-permissions/apply', async (route) => {
    try {
      const body = (await route.json()) as {
        collection?: string
        recordIds?: unknown
        viewId?: string
        filter?: Record<string, unknown>
        q?: string
        mode?: 'grant' | 'revoke' | 'access_mode'
        subjects?: Array<{ type?: string; id?: string; subjectType?: string; subjectId?: string }>
        role?: 'viewer' | 'commenter' | 'editor' | 'manager'
        accessMode?: 'private' | 'members'
        memberDefaultRole?: 'viewer' | 'editor'
      }
      const mode = body?.mode === 'grant' || body?.mode === 'revoke' || body?.mode === 'access_mode' ? body.mode : null
      if (!mode) {
        route.send(400, { error: 'mode must be grant, revoke, or access_mode' })
        return
      }
      const { collection, recordIds } = await resolveBatchTargetIds(body)
      if (isPersonalOnlyCollection(collection)) {
        route.send(400, { error: '该数据类型仅自己可见，不支持分享' })
        return
      }
      const account = getAccountService(ctx)
      const { actorId } = resolveWorkspaceContext(account)
      if (!actorId || !account?.store?.batchUpdateRecordPermissions) {
        route.send(403, { error: 'permission denied' })
        return
      }
      const subjects = Array.isArray(body.subjects)
        ? body.subjects
            .map((s) => {
              const subjectType = s?.subjectType ?? s?.type
              const subjectId = String(s?.subjectId ?? s?.id ?? '').trim()
              return subjectType === 'account' || subjectType === 'member_view'
                ? { subjectType, subjectId }
                : null
            })
            .filter((s): s is { subjectType: 'account' | 'member_view'; subjectId: string } => Boolean(s && s.subjectId))
        : undefined
      const result = account.store.batchUpdateRecordPermissions(actorId, {
        collection,
        recordIds,
        mode,
        ...(subjects ? { subjects } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.accessMode ? { accessMode: body.accessMode } : {}),
        ...(body.memberDefaultRole ? { memberDefaultRole: body.memberDefaultRole } : {}),
      })
      if (result.updatedCount > 0) db.notifyShareChange()
      route.send(200, result)
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })
}
