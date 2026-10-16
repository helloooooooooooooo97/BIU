#!/usr/bin/env node
/** 给本机空间灌页面和任务，供各页刷新压测用。已有「压测页 / 压测任务」前缀的记录会跳过。 */
import { readPerfEnv } from './cdp.mjs'

const { token, workspaceId } = readPerfEnv()
const api = String(process.env.BIU_PERF_API ?? 'http://127.0.0.1:3151').replace(/\/$/, '')
const pageTarget = Math.max(0, Number(process.env.BIU_PERF_PAGES || 80))
const taskTarget = Math.max(0, Number(process.env.BIU_PERF_TASKS || 80))
const pagePrefix = '压测页 '
const taskPrefix = '压测任务 '

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

async function listAll(path, columns = 'id,title') {
  const items = []
  let offset = 0
  const limit = 100
  for (;;) {
    const params = new URLSearchParams({ path, limit: String(limit), offset: String(offset), columns, sort: 'id', dir: 'asc' })
    const page = await apiJson(`/api/db/list?${params}`)
    const rows = Array.isArray(page.items) ? page.items : []
    items.push(...rows)
    const total = typeof page.total === 'number' ? page.total : items.length
    offset += rows.length
    if (!rows.length || offset >= total) return { items, total }
  }
}

function pageBody(index) {
  const lines = [
    `# ${pagePrefix}${index}`,
    '',
    '本机空间前端压测用正文。侧栏、列表、记录页都会读到这一页。',
    '',
    '## 段落',
    '',
    `第 ${index} 页。`.repeat(12),
    '',
    '## 列表',
    '',
    '- 刷新时间',
    '- 主线程 long task',
    '- `/api/db/list` 瀑布',
    '- 商店 `web.js` 串行加载',
    '',
    '## 表格',
    '',
    '| 项 | 值 |',
    '| --- | --- |',
    `| 编号 | ${index} |`,
    `| 空间 | ${workspaceId} |`,
  ]
  return lines.join('\n')
}

async function ensureCollection(path, prefix, target, makeRecord) {
  const listed = await listAll(path)
  const existing = listed.items.filter((row) => String(row.title || '').startsWith(prefix))
  const missing = Math.max(0, target - existing.length)
  const created = []
  const batch = 20
  let nextIndex = existing.length
  while (created.length < missing) {
    const size = Math.min(batch, missing - created.length)
    const records = Array.from({ length: size }, () => {
      nextIndex += 1
      return makeRecord(nextIndex)
    })
    const body = await apiJson('/api/db/create', {
      method: 'POST',
      body: JSON.stringify({ path, records, scope: 'private' }),
    })
    const rows = Array.isArray(body.items) ? body.items.map((item) => item.value).filter(Boolean) : []
    created.push(...rows)
  }
  return { path, total: listed.total + created.length, seeded: existing.length + created.length, created: created.length }
}

const pages = await ensureCollection('/pages', pagePrefix, pageTarget, (index) => ({ title: `${pagePrefix}${index}` }))
const seededPages = (await listAll('/pages')).items.filter((row) => String(row.title || '').startsWith(pagePrefix))
let contentWrote = 0
for (const row of seededPages) {
  const id = String(row.id || '')
  if (!id) continue
  await apiJson('/api/db/content', {
    method: 'POST',
    body: JSON.stringify({ path: `/pages/${id}`, value: pageBody(Number(String(row.title).slice(pagePrefix.length)) || 0) }),
  })
  contentWrote += 1
}
const tasks = await ensureCollection('/tasks', taskPrefix, taskTarget, (index) => ({ title: `${taskPrefix}${index}` }))
const sessions = await listAll('/sessions')
const plugins = await listAll('/plugins', 'id,title,running,installed')
const stat = await apiJson('/api/db/stat?path=/')
const collections = (stat.collections || []).map((row) => row.path)

console.log(
  JSON.stringify(
    {
      workspaceId,
      pages,
      tasks,
      contentWrote,
      sessions: sessions.items.map((row) => ({ id: row.id, title: row.title })),
      plugins: plugins.total,
      collections,
    },
    null,
    2,
  ),
)
