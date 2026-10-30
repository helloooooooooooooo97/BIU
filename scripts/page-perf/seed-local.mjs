#!/usr/bin/env node
/** 给本机空间灌足够多的页面、任务、会话，真正压列表 / 侧栏 / 分组视图。已有压测前缀的记录会跳过。 */
import { readPerfEnv } from './cdp.mjs'

const { token, workspaceId } = readPerfEnv()
const api = String(process.env.BIU_PERF_API ?? 'http://127.0.0.1:3151').replace(/\/$/, '')
const pageTarget = Math.max(0, Number(process.env.BIU_PERF_PAGES || 3000))
const taskTarget = Math.max(0, Number(process.env.BIU_PERF_TASKS || 3000))
const sessionTarget = Math.max(0, Number(process.env.BIU_PERF_SESSIONS || 200))
const folderTarget = Math.max(0, Number(process.env.BIU_PERF_FOLDERS || 50))
const contentTarget = Math.max(0, Number(process.env.BIU_PERF_CONTENT || 80))
const skillTarget = Math.max(0, Number(process.env.BIU_PERF_SKILLS || 40))
const facetTarget = Math.max(0, Number(process.env.BIU_PERF_FACETS || 40))
const pagePrefix = '压测页 '
const folderPrefix = '压测夹 '
const taskPrefix = '压测任务 '
const sessionPrefix = '压测会话 '
const skillPrefix = '压测技能 '
const facetPrefix = '压测合集 '
const blockPageTitle = '压测块页'
const viewTitle = '压测百行'
const statuses = ['todo', 'doing', 'done', 'failed']
const priorities = ['low', 'med', 'high']

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

async function listPage(path, { q = '', limit = 100, offset = 0, columns = 'id,title' } = {}) {
  const params = new URLSearchParams({
    path,
    limit: String(limit),
    offset: String(offset),
    columns,
    sort: 'id',
    dir: 'asc',
    q,
  })
  const page = await apiJson(`/api/db/list?${params}`)
  return {
    items: Array.isArray(page.items) ? page.items : [],
    total: typeof page.total === 'number' ? page.total : 0,
  }
}

async function countPrefix(path, prefix) {
  const page = await listPage(path, { q: prefix, limit: 1 })
  return page.total
}

async function listPrefix(path, prefix, columns = 'id,title') {
  const items = []
  let offset = 0
  const limit = 100
  for (;;) {
    const page = await listPage(path, { q: prefix, limit, offset, columns })
    items.push(...page.items)
    offset += page.items.length
    if (!page.items.length || offset >= page.total) return items
  }
}

function pageBody(index) {
  const block = [
    `## 段 ${index}`,
    '',
    `${'本机空间压测正文。'.repeat(24)}`,
    '',
    '| 列 | 值 |',
    '| --- | --- |',
    `| 编号 | ${index} |`,
    `| 空间 | ${workspaceId} |`,
    '',
  ].join('\n')
  return `# ${pagePrefix}${index}\n\n${block.repeat(8)}`
}

async function createBatch(path, records) {
  if (!records.length) return []
  const body = await apiJson('/api/db/create', {
    method: 'POST',
    body: JSON.stringify({ path, records, scope: 'private' }),
  })
  return Array.isArray(body.items) ? body.items.map((item) => item.value).filter(Boolean) : []
}

async function ensurePrefixed(path, prefix, target, makeRecord) {
  const existing = await countPrefix(path, prefix)
  const missing = Math.max(0, target - existing)
  const created = []
  const batch = 50
  let nextIndex = existing
  while (created.length < missing) {
    const size = Math.min(batch, missing - created.length)
    const records = Array.from({ length: size }, () => {
      nextIndex += 1
      return makeRecord(nextIndex)
    })
    created.push(...(await createBatch(path, records)))
  }
  return { path, prefix, existing, created: created.length, seeded: existing + created.length, rows: created }
}

const folders = await ensurePrefixed('/pages', folderPrefix, folderTarget, (index) => ({ title: `${folderPrefix}${index}` }))
const folderRows = await listPrefix('/pages', folderPrefix)
let nested = 0
const pages = await ensurePrefixed('/pages', pagePrefix, pageTarget, (index) => {
  const parent = folderRows.length ? folderRows[(index - 1) % folderRows.length] : null
  if (parent?.id) nested += 1
  return { title: `${pagePrefix}${index}`, ...(parent?.id ? { parentId: parent.id } : {}) }
})

let contentWrote = 0
for (const row of [...folders.rows, ...pages.rows].slice(0, contentTarget)) {
  const id = String(row.id || '')
  if (!id) continue
  const index = Number(String(row.title || '').replace(/[^\d]/g, '')) || contentWrote
  await apiJson('/api/db/content', {
    method: 'POST',
    body: JSON.stringify({ path: `/pages/${id}`, value: pageBody(index) }),
  })
  contentWrote += 1
}

const tasks = await ensurePrefixed('/tasks', taskPrefix, taskTarget, (index) => ({
  title: `${taskPrefix}${index}`,
  status: statuses[index % statuses.length],
  priority: priorities[index % priorities.length],
}))
const sessions = await ensurePrefixed('/sessions', sessionPrefix, sessionTarget, (index) => ({
  title: `${sessionPrefix}${index}`,
}))

async function writeDenseView(tablePath, viewId, { wrap = false, groupBy = '' } = {}) {
  await apiJson('/api/db/saved-views', {
    method: 'POST',
    body: JSON.stringify({
      path: tablePath,
      views: [
        {
          id: viewId,
          name: viewTitle,
          mode: 'table',
          sortField: 'title',
          sortDir: 'asc',
          filters: {},
          columns: [],
          pageSize: 100,
          wrap: Boolean(wrap),
          groupBy: groupBy || '',
        },
      ],
    }),
  })
}

async function ensureDenseView(tablePath) {
  const wrap = tablePath === '/pages'
  const groupBy = tablePath === '/tasks' ? 'status' : ''
  const listed = await listPage('/views', { q: viewTitle, limit: 20, columns: 'id,title,tablePath,viewId,pageSize,groupBy,wrap' })
  const hit = listed.items.find((row) => row.tablePath === tablePath && String(row.title || '') === viewTitle)
  if (hit) {
    const viewId = String(hit.viewId || '')
    const needsWrap = wrap && !hit.wrap
    const needsGroup = Boolean(groupBy) && String(hit.groupBy || '') !== groupBy
    const needsSize = Number(hit.pageSize) !== 100
    if (viewId && (needsWrap || needsGroup || needsSize)) await writeDenseView(tablePath, viewId, { wrap, groupBy })
    return { created: false, viewId, path: `/database/${tablePath.replace(/^\//, '')}/view/${encodeURIComponent(viewId)}` }
  }
  const created = await createBatch('/views', [
    {
      title: viewTitle,
      tablePath,
      pageSize: 100,
      ...(groupBy ? { groupBy } : {}),
    },
  ])
  const value = created[0] || {}
  const viewId = String(value.viewId || '')
  if (viewId && wrap) await writeDenseView(tablePath, viewId, { wrap, groupBy })
  return {
    created: true,
    viewId,
    path: `/database/${tablePath.replace(/^\//, '')}/view/${encodeURIComponent(viewId)}`,
  }
}

const taskView = await ensureDenseView('/tasks')
const pageView = await ensureDenseView('/pages')
const skills = await ensurePrefixed('/skills', skillPrefix, skillTarget, (index) => ({
  title: `${skillPrefix}${index}`,
  description: '本机空间压测技能，给技能表和记录页用。',
  enabled: true,
}))
const facets = await ensurePrefixed('/facets', facetPrefix, facetTarget, (index) => ({
  title: `${facetPrefix}${index}`,
}))
let blockPage = (await listPage('/pages', { q: blockPageTitle, limit: 5, columns: 'id,title' })).items.find(
  (row) => String(row.title || '') === blockPageTitle,
)
if (!blockPage) {
  const created = await createBatch('/pages', [{ title: blockPageTitle }])
  blockPage = created[0] || null
}
if (blockPage?.id) {
  const fences = Array.from({ length: 12 }, (_, index) => {
    const id = `stress${String(index + 1).padStart(2, '0')}`
    return `:::pageBlock {kind=html plugin=page-sandbox id=${id}}\n<p>压测块 ${index + 1}</p>\n:::`
  })
  await apiJson('/api/db/content', {
    method: 'POST',
    body: JSON.stringify({ path: `/pages/${blockPage.id}`, value: `# ${blockPageTitle}\n\n${fences.join('\n\n')}` }),
  })
}
const pageCount = await listPage('/pages', { limit: 1 })
const taskCount = await listPage('/tasks', { limit: 1 })
const sessionCount = await listPage('/sessions', { limit: 1 })
const skillCount = await listPage('/skills', { limit: 1 })
const facetCount = await listPage('/facets', { limit: 1 })
const blockCount = await listPage('/page-blocks', { limit: 1 })
const stat = await apiJson('/api/db/stat?path=/')

console.log(
  JSON.stringify(
    {
      workspaceId,
      pages: { path: pages.path, prefix: pages.prefix, existing: pages.existing, created: pages.created, seeded: pages.seeded, total: pageCount.total, folders: folders.seeded, nested, blockPage: blockPage?.id || null },
      tasks: { path: tasks.path, prefix: tasks.prefix, existing: tasks.existing, created: tasks.created, seeded: tasks.seeded, total: taskCount.total },
      sessions: { path: sessions.path, prefix: sessions.prefix, existing: sessions.existing, created: sessions.created, seeded: sessions.seeded, total: sessionCount.total },
      skills: { path: skills.path, prefix: skills.prefix, existing: skills.existing, created: skills.created, seeded: skills.seeded, total: skillCount.total },
      facets: { path: facets.path, prefix: facets.prefix, existing: facets.existing, created: facets.created, seeded: facets.seeded, total: facetCount.total },
      pageBlocks: blockCount.total,
      contentWrote,
      views: { tasks: taskView, pages: pageView },
      collections: (stat.collections || []).map((row) => row.path),
    },
    null,
    2,
  ),
)
