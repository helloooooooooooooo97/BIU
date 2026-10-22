#!/usr/bin/env node
/** 一页里每种已安装页面插件插一块，量打开到全部块视图就绪。 */
import { inspectPageBlocksSource, openPageSession, readPerfEnv, resourceKind } from './cdp.mjs'
import {
  ALL_PLUGINS_PAGE_TITLE,
  allPluginsPageReady,
  installedPagePluginsFromRows,
  markdownForAllPlugins,
} from './all-page-plugins.mjs'

const { token, workspaceId, chrome } = readPerfEnv()
const origin = String(process.env.BIU_PERF_ORIGIN ?? 'http://127.0.0.1:5174').replace(/\/$/, '')
const api = String(process.env.BIU_PERF_API ?? 'http://127.0.0.1:3151').replace(/\/$/, '')
const runs = Math.max(1, Number(process.env.BIU_PERF_RUNS || 3))
const deadlineMs = Math.max(5000, Number(process.env.BIU_PERF_DEADLINE_MS || 40_000))

const headers = {
  authorization: `Bearer ${token}`,
  'x-biu-workspace-id': workspaceId,
  'content-type': 'application/json',
}

async function apiJson(path, init) {
  const res = await fetch(`${api}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${res.status} ${path} ${body.error || JSON.stringify(body).slice(0, 200)}`)
  return body
}

async function listAll(path, columns) {
  const rows = []
  let offset = 0
  const limit = 200
  for (;;) {
    const params = new URLSearchParams({ path, limit: String(limit), offset: String(offset), columns, sort: 'id', dir: 'asc' })
    const page = await apiJson(`/api/db/list?${params}`)
    const items = Array.isArray(page.items) ? page.items : []
    rows.push(...items)
    offset += items.length
    const total = typeof page.total === 'number' ? page.total : rows.length
    if (!items.length || offset >= total) return rows
  }
}

async function ensureAllPluginsPage() {
  const plugins = installedPagePluginsFromRows(
    await listAll('/plugins', 'id,title,blurb,tags,installed,hasWeb,headless'),
  )
  if (!plugins.length) throw new Error('没有已安装的页面插件（installed + hasWeb + headless + tags=page）')
  const listed = await apiJson(
    `/api/db/list?${new URLSearchParams({ path: '/pages', limit: '5', q: ALL_PLUGINS_PAGE_TITLE, columns: 'id,title' })}`,
  )
  let page = (Array.isArray(listed.items) ? listed.items : []).find((row) => String(row.title || '') === ALL_PLUGINS_PAGE_TITLE)
  if (!page?.id) {
    const created = await apiJson('/api/db/create', {
      method: 'POST',
      body: JSON.stringify({ path: '/pages', records: [{ title: ALL_PLUGINS_PAGE_TITLE }] }),
    })
    page = created.items?.[0]?.value || null
  }
  if (!page?.id) throw new Error('无法创建全插件页')
  await apiJson('/api/db/content', {
    method: 'POST',
    body: JSON.stringify({ path: `/pages/${page.id}`, value: markdownForAllPlugins(plugins) }),
  })
  return { plugins, page }
}

const session = await openPageSession({ token, workspaceId, chrome })
const seeded = await ensureAllPluginsPage()
const pagePath = `${origin}/database/pages/record/${encodeURIComponent(seeded.page.id)}`

function collectDb(events, rows, t0) {
  for (const ev of events) {
    if (ev.method !== 'Network.requestWillBeSent') continue
    const url = ev.params.request?.url || ''
    if (!/\/api\/(db|plugin-store)\//.test(url)) continue
    rows.push({
      kind: resourceKind(url),
      start: Math.round((ev.params.wallTime ? ev.params.wallTime * 1000 : Date.now()) - t0),
      url: url.slice(0, 180),
    })
  }
}

async function measure(label) {
  const t0 = Date.now()
  const db = []
  session.take()
  await session.send('Page.navigate', { url: pagePath }, session.sessionId)
  let contentAt = null
  let readyAt = null
  let last = null
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 120))
    collectDb(session.take(), db, t0)
    const snap = await session.send('Runtime.evaluate', { expression: inspectPageBlocksSource(), returnByValue: true }, session.sessionId)
    last = snap.result?.value
    if (!last) continue
    if (contentAt == null && (last.blocks > 0 || String(last.title || '').includes(ALL_PLUGINS_PAGE_TITLE))) {
      contentAt = Date.now() - t0
    }
    if (allPluginsPageReady(last, seeded.plugins.length)) {
      readyAt = Date.now() - t0
      break
    }
  }
  return {
    label,
    pluginCount: seeded.plugins.length,
    contentAt,
    readyAt,
    views: last,
    pluginWeb: db.filter((row) => row.kind === 'plugin-web').length,
    dbList: db.filter((row) => row.kind === 'db-list').length,
  }
}

const samples = []
try {
  for (let i = 1; i <= runs; i += 1) samples.push(await measure(`load${i}`))
} finally {
  session.close()
}

const ready = samples.map((row) => row.readyAt).filter((ms) => typeof ms === 'number').sort((a, b) => a - b)
const medianReadyAt = ready.length ? ready[Math.floor(ready.length / 2)] : null
const report = {
  title: ALL_PLUGINS_PAGE_TITLE,
  pageId: seeded.page.id,
  path: pagePath,
  plugins: seeded.plugins.map((row) => row.id),
  pluginCount: seeded.plugins.length,
  runs,
  medianReadyAt,
  samples,
}
console.log(JSON.stringify(report, null, 2))
if (medianReadyAt == null) {
  console.error('all-plugins page never became ready')
  process.exit(1)
}
