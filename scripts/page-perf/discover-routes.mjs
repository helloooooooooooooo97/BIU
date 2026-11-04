/** 枚举本机空间会进的全部路由：首页、会话、debug、数据库入口、每张表、内置全部视图、成员视图、记录、从视图打开的记录、压测大页。 */
export function builtinAllViewId(path) {
  const normalized = String(path || '').startsWith('/') ? String(path) : `/${path}`
  return `builtin-all:${normalized.replace(/\/+$/, '') || '/'}`
}

export function databaseCollectionPath(collection) {
  return `/database/${encodeURIComponent(String(collection).replace(/^\//, ''))}`
}

export function databaseViewPath(collection, viewId) {
  return `${databaseCollectionPath(collection)}/view/${encodeURIComponent(String(viewId))}`
}

export function databaseRecordPath(collection, recordId, viewId) {
  const rec = `${databaseCollectionPath(collection)}/record/${encodeURIComponent(String(recordId))}`
  if (!viewId) return rec
  return `${databaseViewPath(collection, viewId)}/record/${encodeURIComponent(String(recordId))}`
}

function push(routes, seen, route) {
  if (!route?.path || seen.has(route.path)) return
  seen.add(route.path)
  routes.push(route)
}

function retarget(routes, seen, route) {
  const hit = routes.find((row) => row.path === route.path)
  if (hit) {
    hit.id = route.id
    hit.kind = route.kind
    hit.label = route.label
    hit.interact = route.interact
    return
  }
  push(routes, seen, route)
}

async function listSome(apiJson, path, limit = 5, columns = 'id,title') {
  const params = new URLSearchParams({ path, limit: String(limit), columns, sort: 'id', dir: 'asc' })
  const page = await apiJson(`/api/db/list?${params}`)
  return {
    items: Array.isArray(page.items) ? page.items : [],
    total: typeof page.total === 'number' ? page.total : 0,
  }
}

export async function discoverLocalSpaceRoutes(apiJson) {
  const stat = await apiJson('/api/db/stat?path=/')
  const collections = (stat.collections || []).map((row) => ({
    id: row.id,
    path: row.path,
    label: row.view?.title || row.label || row.id,
  }))
  const sessions = await listSome(apiJson, '/sessions', 8)
  const seedPages = await listSome(apiJson, '/pages', 5)
  const seedListed = await apiJson(`/api/db/list?${new URLSearchParams({ path: '/pages', limit: '5', q: '压测页', columns: 'id,title' })}`)
  const blockListed = await apiJson(`/api/db/list?${new URLSearchParams({ path: '/pages', limit: '5', q: '压测块页', columns: 'id,title' })}`)
  const heavyListed = await apiJson(`/api/db/list?${new URLSearchParams({ path: '/pages', limit: '5', q: '十插件', columns: 'id,title' })}`)
  const allPluginsListed = await apiJson(`/api/db/list?${new URLSearchParams({ path: '/pages', limit: '5', q: '全插件页', columns: 'id,title' })}`)
  const denseViews = await apiJson(
    `/api/db/list?${new URLSearchParams({ path: '/views', limit: '20', q: '压测百行', columns: 'id,title,tablePath,viewId,pageSize,groupBy,wrap' })}`,
  )
  const heavyPage =
    (Array.isArray(heavyListed.items) ? heavyListed.items.find((row) => String(row.title || '').includes('十插件')) : null) ||
    seedPages.items[0]
  const seedPage =
    (Array.isArray(seedListed.items) ? seedListed.items.find((row) => String(row.title || '').startsWith('压测页 ')) : null) ||
    seedPages.items.find((row) => row.id !== heavyPage?.id)
  const blockPage = Array.isArray(blockListed.items) ? blockListed.items[0] : null
  const chatSession = sessions.items.find((row) => String(row.title || '').startsWith('压测会话 ')) || sessions.items[0]
  const otherSession = sessions.items.find((row) => row.id !== chatSession?.id) || chatSession
  const routes = []
  const seen = new Set()
  push(routes, seen, { id: 'home', kind: 'home', label: '工作台首页', path: '/', interact: 'chat' })
  if (chatSession) {
    push(routes, seen, {
      id: `session:${chatSession.id}`,
      kind: 'session',
      label: `会话 ${chatSession.title || chatSession.id}`,
      path: `/agents/${encodeURIComponent(chatSession.id)}`,
      interact: 'chat',
    })
    push(routes, seen, {
      id: `session-debug:${chatSession.id}`,
      kind: 'session-debug',
      label: `会话调试 ${chatSession.title || chatSession.id}`,
      path: `/agents/${encodeURIComponent(chatSession.id)}/debug`,
      interact: 'chat',
    })
  }
  if (otherSession && otherSession.id !== chatSession?.id) {
    push(routes, seen, {
      id: `session:${otherSession.id}`,
      kind: 'session',
      label: `会话 ${otherSession.title || otherSession.id}`,
      path: `/agents/${encodeURIComponent(otherSession.id)}`,
      interact: 'chat',
    })
  }
  push(routes, seen, { id: 'database', kind: 'database', label: '数据库入口', path: '/database', interact: 'table' })
  for (const table of collections) {
    push(routes, seen, {
      id: `collection:${table.id}`,
      kind: 'collection',
      label: `表 ${table.label}`,
      path: databaseCollectionPath(table.path),
      interact: 'table',
    })
    push(routes, seen, {
      id: `builtin-all:${table.id}`,
      kind: 'builtin-all',
      label: `全部 ${table.label}`,
      path: databaseViewPath(table.path, builtinAllViewId(table.path)),
      interact: 'table',
    })
    const listed = await listSome(apiJson, table.path, 3, table.path === '/page-blocks' ? 'id,title,pageId' : 'id,title')
    const record = listed.items[0]
    if (record?.id) {
      push(routes, seen, {
        id: `record:${table.path}:${record.id}`,
        kind: 'record',
        label: `记录 ${table.label} ${record.title || record.id}`,
        path: databaseRecordPath(table.path, record.id),
        interact: table.path === '/pages' ? 'page' : 'record',
      })
    }
    if (table.path === '/workspace-members') {
      for (const kind of ['member', 'external', 'guest']) {
        push(routes, seen, {
          id: `member-view:${kind}`,
          kind: 'builtin-member',
          label: `成员视图 ${kind}`,
          path: databaseViewPath('/workspace-members', `builtin-member:${kind}`),
          interact: 'table',
        })
      }
    }
  }
  const denseItems = Array.isArray(denseViews.items) ? denseViews.items : []
  for (const row of denseItems) {
    if (!row.tablePath || !row.viewId) continue
    push(routes, seen, {
      id: `view:${row.tablePath}:${row.viewId}`,
      kind: 'dense-view',
      label: `${row.title} ${row.tablePath} pageSize=${row.pageSize || ''} group=${row.groupBy || ''} wrap=${row.wrap ? 1 : 0}`,
      path: databaseViewPath(row.tablePath, row.viewId),
      interact: 'table',
    })
  }
  const nestedView = denseItems.find((row) => row.tablePath === '/pages' && row.viewId)
  const nestedRecord = seedPage || heavyPage
  if (nestedView?.viewId && nestedRecord?.id) {
    push(routes, seen, {
      id: `record-from-view:${nestedView.viewId}:${nestedRecord.id}`,
      kind: 'record-from-view',
      label: `从视图打开 ${nestedRecord.title || nestedRecord.id}`,
      path: databaseRecordPath('/pages', nestedRecord.id, nestedView.viewId),
      interact: 'page',
    })
  }
  if (heavyPage?.id) {
    retarget(routes, seen, {
      id: 'page-plugins',
      kind: 'record',
      label: `记录 ${heavyPage.title || heavyPage.id}`,
      path: databaseRecordPath('/pages', heavyPage.id),
      interact: 'page',
    })
  }
  if (blockPage?.id) {
    retarget(routes, seen, {
      id: 'page-blocks-seed',
      kind: 'record',
      label: `记录 ${blockPage.title || blockPage.id}`,
      path: databaseRecordPath('/pages', blockPage.id),
      interact: 'page',
    })
  }
  const allPluginsPage = Array.isArray(allPluginsListed.items)
    ? allPluginsListed.items.find((row) => String(row.title || '') === '全插件页')
    : null
  if (allPluginsPage?.id) {
    retarget(routes, seen, {
      id: 'page-all-plugins',
      kind: 'record',
      label: `记录 ${allPluginsPage.title || allPluginsPage.id}`,
      path: databaseRecordPath('/pages', allPluginsPage.id),
      interact: 'page',
    })
  }
  return {
    collections,
    session: chatSession,
    heavyPage,
    seedPage,
    routes,
    coverage: {
      collections: collections.map((row) => row.path),
      kinds: [...new Set(routes.map((row) => row.kind))],
      count: routes.length,
    },
  }
}
