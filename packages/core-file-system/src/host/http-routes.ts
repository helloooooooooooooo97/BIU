import type { IncomingMessage } from 'node:http'
import type { Context } from 'cordis'
import {
  EditorContentConflictError,
  currentAccountId,
  currentRequestWorkspaceId,
  runWithAccount,
  runWithRequestWorkspace,
} from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { asPublicProfile, writeWorkspaceProfile } from '@biu/host-workspace'
import { DATABASE_CHANNEL, databaseChannelPayload, normalizeSchemaPack } from '@biu/type-file-system'
import { buildAccessExplanation, type BuildAccessExplanationInput } from '../access-explanation.ts'
import { displayNameForView, isReadOnlyViewId } from '../catalog-views.ts'
import { PAGES_COLLECTION_PATH, TAGS_COLLECTION_PATH, VIEWS_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH, isIndexCollection, normalizeCollectionPath } from '../paths.ts'
import { previewViewFilterImpact } from '../view-impact.ts'
import { recordMatchesAccessRule } from '../view-access.ts'
import { isSharePluginId } from '../share-resources.ts'
import {
  AssetConflictError,
  assetContentDisposition,
  isHashedAssetName,
  mimeOfAsset,
  parseIfMatch,
  type FileSystemAssets,
} from './assets-store.ts'
import { type SavedViewsStore, type StoredView } from './saved-views.ts'
import { buildShareSnapshot } from './share-payload.ts'
import { publicShareUrl } from './share-origin.ts'
import { readSharePluginWebJs, zipSharePluginSource } from './share-plugin-pack.ts'
import { dropSharesForRemovedViews, type SharesStore } from './shares-store.ts'
import { type TagStore } from './tags-store.ts'
import { asDeleteQuery, parseListColumnsParam, parseSortsParam } from './schema-coerce.ts'
import { DATABASE_TOOL_NAMES } from './agent-tools.ts'
import type { DatabaseService } from './index.ts'

export function databaseHttpFailure(error: unknown) {
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
      const account = ctx.get('account') as {
        store?: {
          activeWorkspaceId(): string | null
          workspacePrefs?(actorId: string, workspaceId?: string): {
            starredViews: unknown[]
            starredRecords: unknown[]
            pinnedAgents: string[]
            theme?: 'light' | 'dark'
            accent?: string
            pagePrefs?: Record<string, unknown>
          }
        }
        workspaceLocation?: (workspaceId: string) => 'device' | 'cloud'
      }
      const workspaceId = currentRequestWorkspaceId() || account.store?.activeWorkspaceId() || ''
      if (workspaceId && account.workspaceLocation) dataLocation = account.workspaceLocation(workspaceId)
      const actorId = currentAccountId()
      if (actorId && workspaceId && account.store?.workspacePrefs) {
        const prefs = account.store.workspacePrefs(actorId, workspaceId)
        accountPrefs = {
          starredViews: prefs.starredViews,
          starredRecords: prefs.starredRecords,
          pinnedAgents: prefs.pinnedAgents,
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
      }
      const actorId = currentAccountId()
      let savedAccountPrefs: Record<string, unknown> | null = null
      if (actorId) {
        try {
          const account = ctx.get('account') as {
            store?: {
              activeWorkspaceId(): string | null
              saveWorkspacePrefs?(actorId: string, patch: Record<string, unknown>, workspaceId?: string): {
                starredViews: unknown[]
                starredRecords: unknown[]
                pinnedAgents: string[]
                theme?: 'light' | 'dark'
                accent?: string
                pagePrefs?: Record<string, unknown>
              }
            }
          }
          const workspaceId = currentRequestWorkspaceId() || account.store?.activeWorkspaceId() || ''
          if (workspaceId && account.store?.saveWorkspacePrefs) {
            const saved = account.store.saveWorkspacePrefs(
              actorId,
              {
                ...(body.theme === 'dark' || body.theme === 'light' ? { theme: body.theme } : {}),
                ...(typeof body.accent === 'string' ? { accent: body.accent } : {}),
                ...(body.pagePrefs !== undefined ? { pagePrefs: body.pagePrefs } : {}),
                ...(body.starredViews !== undefined ? { starredViews: body.starredViews } : {}),
                ...(body.starredRecords !== undefined ? { starredRecords: body.starredRecords } : {}),
                ...(body.pinnedAgents !== undefined ? { pinnedAgents: body.pinnedAgents } : {}),
              },
              workspaceId,
            )
            savedAccountPrefs = {
              starredViews: saved.starredViews,
              starredRecords: saved.starredRecords,
              pinnedAgents: saved.pinnedAgents,
              ...(saved.theme ? { theme: saved.theme } : {}),
              ...(saved.accent ? { accent: saved.accent } : {}),
              ...(saved.pagePrefs ? { pagePrefs: saved.pagePrefs } : {}),
            }
          }
        } catch {
          /* ignore */
        }
      }
      const base =
        getRuntimePolicy().hostMode !== 'cloud' || !savedAccountPrefs
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
  ctx.http.route('POST', '/api/db/saved-views', async (route) => {
    try {
      /**
       * 默认是差异写：upsert 只新增/更新这几条，remove 只删这几个 id。
       * 两个窗口各存一份快照时，后写的不会把另一个窗口刚建的视图冲掉。
       * 需要整份同步的老调用方显式传 replace: true。
       */
      const body = (await route.json()) as {
        path?: string
        views?: StoredView[]
        upsert?: StoredView[]
        remove?: string[]
        replace?: boolean
      }
      const path = String(body?.path ?? '')
      const accountId = currentAccountId()
      await db.requirePath(path, 'resource:update')
      const removals = (body.remove ?? []).map(String).filter(Boolean)
      if (body.replace === true || (body.upsert === undefined && body.remove === undefined)) {
        const next = Array.isArray(body.views) ? body.views : []
        if (!isIndexCollection(path)) dropSharesForRemovedViews(shares, path, savedViews.viewsFor(path), next)
        savedViews.replace(path, next, accountId)
      } else {
        savedViews.applyPatch(path, { upsert: body.upsert ?? [], remove: removals }, accountId)
        for (const viewId of removals) {
          const view = savedViews.viewsFor(path, accountId).find((item) => String(item.id) === viewId)
          if (!view) shares.revokeView(path, viewId)
        }
      }
      ctx.emit('database/change')
      route.send(200, { ok: true })
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  ctx.http.route('POST', '/api/db/saved-views/preview-impact', async (route) => {
    try {
      const body = (await route.json()) as {
        path?: string
        viewId?: string
        afterFilters?: Record<string, unknown>
        afterFilterTree?: unknown
      }
      const path = normalizeCollectionPath(String(body?.path ?? ''))
      const viewId = String(body?.viewId ?? '').trim()
      if (!path || !viewId) {
        route.send(400, { error: 'path and viewId required' })
        return
      }
      await db.requirePath(path, 'resource:read')
      const beforeView = savedViews.viewsFor(path, currentAccountId()).find((v) => String(v.id) === viewId)
      const listed = await db.list(path, {}, { limit: 1000, offset: 0 })
      const records = listed.kind === 'collection' ? listed.items : []
      const preview = previewViewFilterImpact({
        records,
        viewId,
        beforeView: {
          id: viewId,
          filters: (beforeView?.filters ?? {}) as Record<string, unknown>,
          filterTree: beforeView?.filterTree ?? null,
        },
        afterView: {
          id: viewId,
          filters: body?.afterFilters ?? {},
          filterTree: (body?.afterFilterTree as StoredView['filterTree']) ?? null,
        },
      })
      route.send(200, preview)
    } catch (error) {
      route.send(400, { error: String(error) })
    }
  })
  const shareSnapshotOpts = (query: URLSearchParams) => {
    if (query.get('contents') === 'all') return { contentIds: 'all' as const }
    const record = query.get('record') || ''
    return { contentIds: record ? [record] : [] }
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
      const account = ctx.get('account') as {
        store?: { activeWorkspaceId?: () => string | null; rememberLanMember?: (workspaceId: string, code: string) => unknown }
      }
      const workspaceId = account.store?.activeWorkspaceId?.() ?? ''
      account.store?.rememberLanMember?.(workspaceId, code)
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
      const recordTitle = String(record.title ?? record.name ?? '').trim() || recordId
      const dataViews = savedViews.viewsFor(collection).map((view) => ({
        id: String(view.id ?? ''),
        name: String(view.name ?? view.id ?? ''),
        filters: view.filters && typeof view.filters === 'object' ? view.filters as Record<string, unknown> : undefined,
        filterTree: view.filterTree ?? undefined,
      }))
      const memberViews = savedViews.viewsFor(WORKSPACE_MEMBERS_COLLECTION_PATH).map((view) => ({
        id: String(view.id ?? ''),
        name: String(view.name ?? view.id ?? ''),
        filters: view.filters && typeof view.filters === 'object' ? view.filters as Record<string, unknown> : undefined,
      }))
      const publicShares: NonNullable<BuildAccessExplanationInput['publicShares']> = [
        ...shares.listRecords(collection).map((share) => ({
          kind: 'record' as const,
          collection: share.collection,
          recordId: share.recordId,
        })),
        ...shares.listViews(collection).map((share) => {
          const named = dataViews.find((view) => view.id === share.viewId)
          return {
            kind: 'view' as const,
            collection: share.collection,
            viewId: share.viewId,
            title: named?.name || share.viewId,
          }
        }),
      ]
      let access: BuildAccessExplanationInput['access']
      const recordTitles: Record<string, string> = {
        [`${collection}\t${recordId}`]: recordTitle,
      }
      if (!localOnly) {
        let account: {
          store?: {
            recordAccess?: (actorId: string, collection: string, recordId: string) => NonNullable<BuildAccessExplanationInput['access']>
          }
        } | undefined
        try {
          account = ctx.get('account') as typeof account
        } catch {
          account = undefined
        }
        const actorId = currentAccountId()
        if (actorId && account?.store?.recordAccess) {
          access = account.store.recordAccess(actorId, collection, recordId)
          const refs = new Map<string, { collection: string; recordId: string }>()
          for (const anc of access.inheritance?.ancestors ?? []) {
            refs.set(`${anc.collection}\t${anc.recordId}`, { collection: anc.collection, recordId: anc.recordId })
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
      const fallbackRole = fallbackRoleParam === '查看' || fallbackRoleParam === '阅读' || fallbackRoleParam === 'viewer'
        ? 'viewer' as const
        : fallbackRoleParam === '编辑' || fallbackRoleParam === 'editor'
          ? 'editor' as const
          : fallbackRoleParam === '管理' || fallbackRoleParam === 'manager'
            ? 'manager' as const
            : localOnly
              ? 'owner' as const
              : 'viewer' as const
      const spec = db.collection(collection)
      const schema: BuildAccessExplanationInput['schema'] = spec
        ? (db.publishCollection(spec) as { schema?: BuildAccessExplanationInput['schema'] }).schema
        : undefined
      const explanation = buildAccessExplanation({
        collection,
        recordId,
        recordTitle,
        tableLabel: tableLabel || spec?.label || '',
        localOnly,
        fallbackRole,
        record: record as { id: string; [key: string]: unknown },
        schema,
        packs: tags.list(),
        dataViews,
        memberViews,
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
          const named = savedViews.viewsFor(share.collection).find((item) => item.id === share.viewId)
          if (!named && share.viewId && !isReadOnlyViewId(share.viewId)) {
            shares.revoke(share.token)
            continue
          }
          let collectionLabel = share.collection.replace(/^\//, '')
          try {
            const stat = (await db.stat(share.collection)) as { label?: string; view?: { title?: string } | null }
            collectionLabel = String(stat.view?.title ?? stat.label ?? collectionLabel)
          } catch {
            /* keep path slug */
          }
          title = displayNameForView(
            share.viewId,
            { path: share.collection, label: collectionLabel, view: { title: collectionLabel } },
            named?.name,
          )
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
    const kind = route.query.get('kind') === 'record' ? 'record' as const : 'view' as const
    const viewId = route.query.get('viewId') || ''
    const recordId = route.query.get('recordId') || ''
    try {
      await db.requirePath(kind === 'record' ? `${collection}/${recordId}` : collection, 'resource:read')
    } catch {
      route.send(404, { error: 'not found' })
      return
    }
    const share = kind === 'record' ? shares.findRecord(collection, recordId) : shares.find(kind, collection, viewId, recordId)
    route.send(200, {
      share: share ? { ...share, url: publicShareUrl(route.req, share.token) } : null,
    })
  })
  ctx.http.route('POST', '/api/db/shares', async (route) => {
    try {
      const body = (await route.json()) as {
        kind?: string
        collection?: string
        viewId?: string
        recordId?: string
        password?: string | null
        enabled?: boolean
        sharePlugins?: boolean
        allowCopy?: boolean
      }
      const kind = body.kind === 'record' ? 'record' as const : 'view' as const
      const collection = String(body.collection ?? '')
      const recordId = String(body.recordId ?? '')
      // 原则 2 + 3：单条记录走记录级 resource:share；视图公开外链允许内部成员（非 viewer/external/guest）创建，
      // 快照本身严格按 share.createdBy 的权限生成，不会放大暴露他人私密数据。
      await db.requirePath(
        kind === 'record' ? `${collection}/${recordId}` : VIEWS_COLLECTION_PATH,
        kind === 'record' ? 'resource:share' : 'resource:update',
      )
      if (body.enabled === false) {
        if (kind === 'record') shares.revokeRecord(collection, recordId)
        else shares.revokeTarget(kind, collection, body.viewId ?? '', body.recordId ?? '')
        db.notifyShareChange()
        route.send(200, { share: null })
        return
      }
      const share = shares.upsert({
        kind,
        collection,
        viewId: body.viewId,
        recordId: body.recordId,
        password: body.password,
        sharePlugins: body.sharePlugins,
        allowCopy: body.allowCopy,
        workspaceId: currentRequestWorkspaceId(),
        createdBy: currentAccountId(),
      })
      db.notifyShareChange()
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
        buildShareSnapshot(db, savedViews, share, shareSnapshotOpts(route.query)),
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
        buildShareSnapshot(db, savedViews, share, shareSnapshotOpts(route.query)),
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
      const snapshot = await buildShareSnapshot(db, savedViews, share, { contentIds: [recordId] })
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
      const snapshot = await buildShareSnapshot(db, savedViews, share, record ? { contentIds: [record] } : { contentIds: [] })
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
      const payload: { tags: ReturnType<typeof tags.list>; filled?: ReturnType<typeof tags.filledFieldCounts> } = {
        tags: tags.list(q),
      }
      if (route.query.get('filled')) payload.filled = tags.filledFieldCounts()
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
      for (const item of listed) {
        const pack = normalizeSchemaPack(item)
        if (pack) tags.upsert(pack)
      }
      db.notifyTagCatalog()
      route.send(200, { ok: true, tags: tags.list() })
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

  // 分享规则实时命中预览：严格限定在当前用户可管理（owner / manager）的数据子集内
  ctx.http.route('POST', '/api/db/access-rules/preview', async (route) => {
    try {
      const body = (await route.json()) as {
        collection?: string
        filterTree?: Record<string, unknown> | null
        limit?: number
      }
      const collection = normalizeCollectionPath(String(body?.collection ?? ''))
      if (!collection || collection === '/') {
        route.send(400, { error: 'collection required' })
        return
      }
      const account = ctx.get('account') as {
        authorization?: {
          currentActor?: () => { accountId: string; workspaceId: string } | null
          canGrantorShareRecord?: (grantorId: string, resource: { type: 'record'; workspaceId: string; collection: string; recordId: string }) => boolean
        }
      } | undefined
      const authz = account?.authorization
      const actor = authz?.currentActor?.()
      const limit = Math.max(1, Math.min(20, Number(body?.limit ?? 8) || 8))
      const listed = await db.list(collection)
      const matched: Array<{ id: string; title: string }> = []
      let matchCount = 0
      for (const record of listed.items) {
        const recordId = String(record.id ?? '').trim()
        if (!recordId) continue
        if (actor && authz?.canGrantorShareRecord) {
          const canManage = authz.canGrantorShareRecord(actor.accountId, {
            type: 'record',
            workspaceId: actor.workspaceId,
            collection,
            recordId,
          })
          if (!canManage) continue
        }
        if (!recordMatchesAccessRule(record, body?.filterTree ?? null)) continue
        matchCount += 1
        if (matched.length < limit) {
          matched.push({ id: recordId, title: String((record as Record<string, unknown>).title ?? recordId) })
        }
      }
      route.send(200, { matchCount, sampleRecords: matched })
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })

  // 单条记录命中的分享规则解释：仅对记录 owner / manager 可见（Fail-Closed）
  ctx.http.route('GET', '/api/db/access-rules/explain', async (route) => {
    try {
      const collection = normalizeCollectionPath(route.query.get('collection') || '')
      const recordId = (route.query.get('recordId') || '').trim()
      if (!collection || collection === '/' || !recordId) {
        route.send(400, { error: 'collection and recordId required' })
        return
      }
      const account = ctx.get('account') as {
        authorization?: {
          currentActor?: () => { accountId: string; workspaceId: string } | null
          canGrantorShareRecord?: (grantorId: string, resource: { type: 'record'; workspaceId: string; collection: string; recordId: string }) => boolean
        }
        store?: {
          listActiveAccessRulesForCollection?: (workspaceId: string, collection: string) => Array<{
            id: string
            name: string
            createdBy: string
            createdByName?: string
            filterTree: Record<string, unknown>
            columns: string[] | null
            enabled: boolean
            grants: Array<{
              id: string
              subjectType: 'account' | 'workspace' | 'member_view'
              subjectId: string
              role: 'viewer' | 'editor' | 'manager'
              subjectName?: string
            }>
          }>
        }
      } | undefined
      const authz = account?.authorization
      const actor = authz?.currentActor?.()
      if (!actor || !authz?.canGrantorShareRecord || !account?.store?.listActiveAccessRulesForCollection) {
        route.send(200, { matchedRules: [] })
        return
      }
      const targetRef = { type: 'record' as const, workspaceId: actor.workspaceId, collection, recordId }
      if (!authz.canGrantorShareRecord(actor.accountId, targetRef)) {
        route.send(200, { matchedRules: [] })
        return
      }
      const record = await db.read(`${collection}/${recordId}`)
      const activeRules = account.store.listActiveAccessRulesForCollection(actor.workspaceId, collection)
      const matchedRules = []
      for (const rule of activeRules) {
        if (!rule.enabled) continue
        if (!authz.canGrantorShareRecord(rule.createdBy, targetRef)) continue
        if (!recordMatchesAccessRule(record as never, rule.filterTree)) continue
        matchedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          createdBy: rule.createdBy,
          createdByName: rule.createdByName ?? '',
          isMine: rule.createdBy === actor.accountId,
          columns: rule.columns,
          grants: rule.grants.map((g) => ({
            subjectType: g.subjectType,
            subjectId: g.subjectId,
            subjectName: g.subjectName ?? '',
            role: g.role,
          })),
        })
      }
      route.send(200, { matchedRules })
    } catch (error) {
      const failure = databaseHttpFailure(error)
      route.send(failure.status, failure.body)
    }
  })
}
