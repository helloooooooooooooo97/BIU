#!/usr/bin/env node
/** 对本机空间各页做刷新压测：壳就绪、API 瀑布、商店 web.js、long task、堆。 */
import { inspectLocalShellSource, inspectPageBlocksSource, openPageSession, readPerfEnv, resourceKind } from './cdp.mjs'
import { discoverLocalSpaceRoutes } from './discover-routes.mjs'
import { inspectInteractSource, stressInteractSource } from './interact.mjs'

const { token, workspaceId, chrome } = readPerfEnv()
const origin = String(process.env.BIU_PERF_ORIGIN ?? 'http://127.0.0.1:5174').replace(/\/$/, '')
const api = String(process.env.BIU_PERF_API ?? 'http://127.0.0.1:3151').replace(/\/$/, '')
const runs = Math.max(1, Number(process.env.BIU_PERF_RUNS || 2))
const only = String(process.env.BIU_PERF_ONLY ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const settleMs = Math.max(0, Number(process.env.BIU_PERF_SETTLE_MS || 400))
const deadlineMs = Math.max(3000, Number(process.env.BIU_PERF_DEADLINE_MS || 30_000))

const headers = {
  authorization: `Bearer ${token}`,
  'x-biu-workspace-id': workspaceId,
}

async function apiJson(path) {
  const res = await fetch(`${api}${path}`, { headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${res.status} ${path} ${body.error || ''}`.trim())
  return body
}

function appUrl(path) {
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

async function discoverRoutes() {
  const discovered = await discoverLocalSpaceRoutes(apiJson)
  const selected = only.length
    ? discovered.routes.filter((row) => only.includes(row.id) || only.includes(row.path) || only.includes(row.kind))
    : discovered.routes
  return { ...discovered, routes: selected }
}

function summarizeNetwork(requests) {
  const groups = {}
  const sequentialPlugin = []
  for (const req of requests) {
    const kind = resourceKind(req.url)
    const bucket = groups[kind] ?? { kind, count: 0, bytes: 0, waitMs: 0, urls: [] }
    bucket.count += 1
    bucket.bytes += req.bytes || 0
    bucket.waitMs += req.duration || 0
    bucket.maxMs = Math.max(bucket.maxMs || 0, req.duration || 0)
    if (bucket.urls.length < 8) bucket.urls.push(`${req.status || 0} ${Math.round(req.duration || 0)}ms ${req.url.slice(0, 160)}`)
    groups[kind] = bucket
    if (kind === 'plugin-web') sequentialPlugin.push(req)
  }
  sequentialPlugin.sort((a, b) => (a.start || 0) - (b.start || 0))
  let pluginOverlap = 0
  for (let i = 1; i < sequentialPlugin.length; i += 1) {
    const prev = sequentialPlugin[i - 1]
    const cur = sequentialPlugin[i]
    if ((cur.start || 0) < (prev.end || prev.start || 0)) pluginOverlap += 1
  }
  const slowest = [...requests].sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 8).map((req) => ({
    duration: Math.round(req.duration || 0),
    bytes: req.bytes || 0,
    status: req.status || 0,
    kind: resourceKind(req.url),
    url: req.url.slice(0, 180),
  }))
  return {
    total: requests.length,
    groups: Object.values(groups).sort((a, b) => b.waitMs - a.waitMs),
    pluginWeb: sequentialPlugin.length,
    pluginWebOverlap: pluginOverlap,
    pluginWebSerial:
      sequentialPlugin.length > 1 &&
      pluginOverlap === 0 &&
      sequentialPlugin.filter((req) => (req.duration || 0) >= 20).length >= 3,
    slowest,
  }
}

function median(values) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b)
  if (!nums.length) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2)
}

function collectRequests(events, requests, t0) {
  for (const ev of events) {
    if (ev.method === 'Network.requestWillBeSent') {
      const url = ev.params.request?.url || ''
      if (!url || url.startsWith('data:') || url.startsWith('blob:')) continue
      requests.set(ev.params.requestId, {
        url,
        start: Math.round((ev.params.wallTime ? ev.params.wallTime * 1000 : Date.now()) - t0),
        startAbs: ev.params.timestamp,
      })
    }
    if (ev.method === 'Network.responseReceived') {
      const row = requests.get(ev.params.requestId)
      if (row) {
        row.status = ev.params.response?.status
        row.mime = ev.params.response?.mimeType
      }
    }
    if (ev.method === 'Network.loadingFinished' || ev.method === 'Network.loadingFailed') {
      const row = requests.get(ev.params.requestId)
      if (row) {
        if (ev.method === 'Network.loadingFinished') row.bytes = ev.params.encodedDataLength || 0
        else {
          row.status = row.status || 0
          row.canceled = Boolean(ev.params.canceled)
          row.error = ev.params.errorText
        }
        if (typeof row.startAbs === 'number' && typeof ev.params.timestamp === 'number') {
          row.duration = Math.round((ev.params.timestamp - row.startAbs) * 1000)
        }
        row.end = (row.start || 0) + (row.duration || 0)
      }
    }
  }
}

function collectLogs(events, logs, fails, hub) {
  for (const ev of events) {
    if (ev.method === 'Runtime.consoleAPICalled') {
      const text = (ev.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ')
      const line = text.slice(0, 280)
      if (text.includes('[biu:ui-hub]')) hub.push({ t: Date.now(), line })
      if (ev.params.type === 'error' || ev.params.type === 'warning' || text.includes('[biu:')) logs.push(`${ev.params.type || 'log'}: ${line}`)
    }
    if (ev.method === 'Runtime.exceptionThrown') {
      logs.push(`exception: ${(ev.params.exceptionDetails.exception?.description || ev.params.exceptionDetails.text || '').slice(0, 400)}`)
    }
    if (ev.method === 'Network.responseReceived' && ev.params.response.status >= 400) {
      fails.push(`${ev.params.response.status} ${ev.params.response.url.slice(0, 220)}`)
    }
  }
}

function hubSpans(hub, t0) {
  const loads = []
  for (const row of hub) {
    const load = row.line.match(/加载 (\S+) 的 web\.js/)
    if (load) loads.push({ id: load[1], start: row.t - t0 })
    const done = row.line.match(/^info: \[biu:ui-hub\] (\S+) 的 web\.js 已挂上/) || row.line.match(/(\S+) 的 web\.js 已挂上/)
    if (done) {
      const id = done[1]
      const hit = [...loads].reverse().find((item) => item.id === id && item.end == null)
      if (hit) hit.end = row.t - t0
    }
  }
  return loads.map((item) => ({ id: item.id, start: Math.round(item.start), end: item.end == null ? null : Math.round(item.end) }))
}

async function measureRoute(session, route) {
  const url = appUrl(route.path)
  const t0 = Date.now()
  const logs = []
  const fails = []
  const hub = []
  const requests = new Map()
  session.take()
  try {
    await session.send('Performance.enable', {}, session.sessionId)
  } catch {
    /* headless 某些版本没有这个域 */
  }
  await session.send('Page.navigate', { url }, session.sessionId)
  let contentAt = null
  let readyAt = null
  let readyNetwork = null
  let shell = null
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 160))
    const events = session.take()
    collectRequests(events, requests, t0)
    collectLogs(events, logs, fails, hub)
    const snap = await session.send('Runtime.evaluate', { expression: inspectLocalShellSource(), returnByValue: true }, session.sessionId)
    const value = snap.result?.value
    if (!value) continue
    shell = value
    const visible = value.shell && value.workspace && !value.splash && !value.gate
    if (contentAt == null && visible && value.textLen > 20) contentAt = Date.now() - t0
    const inflightApi = [...requests.values()].filter((req) => {
      if (!/\/api\//.test(req.url) || req.end != null || req.canceled) return false
      const age = Date.now() - t0 - (req.start || 0)
      if (req.status == null && age >= 1_200) return false
      return age < 8_000
    }).length
    const painted =
      route.kind === 'home'
        ? Boolean(value.composer || value.textLen > 80)
        : route.kind === 'record' || String(route.id).startsWith('page-')
          ? Boolean(value.table || value.composer || value.textLen > 80)
          : Boolean(value.listReady || (value.table && value.tableRows > 0))
    if (contentAt != null && value.loadingBlocks === 0 && inflightApi === 0 && painted) {
      if (readyAt == null) {
        readyAt = Date.now() - t0
        readyNetwork = summarizeNetwork([...requests.values()].filter((row) => row.url).map((row) => ({ ...row })))
      }
      if (Date.now() - t0 >= readyAt + settleMs) break
    }
  }
  let interact = null
  if (route.interact) {
    const clicked = await session.send('Runtime.evaluate', { expression: stressInteractSource(), returnByValue: true, awaitPromise: true }, session.sessionId)
    await new Promise((resolve) => setTimeout(resolve, 900))
    const events = session.take()
    collectRequests(events, requests, t0)
    collectLogs(events, logs, fails, hub)
    const after = await session.send('Runtime.evaluate', { expression: inspectInteractSource(), returnByValue: true }, session.sessionId)
    const snap = await session.send('Runtime.evaluate', { expression: inspectLocalShellSource(), returnByValue: true }, session.sessionId)
    if (snap.result?.value) shell = { ...shell, ...snap.result.value }
    interact = { ...(clicked.result?.value || {}), ...(after.result?.value || {}) }
  }
  if (route.id.startsWith('page-') || route.path.includes('/pages/record/') || route.interact === 'page') {
    const blocks = await session.send('Runtime.evaluate', { expression: inspectPageBlocksSource(), returnByValue: true }, session.sessionId)
    shell = { ...shell, blocks: blocks.result?.value }
  }
  let heap = null
  try {
    heap = await session.send('Runtime.getHeapUsage', {}, session.sessionId)
  } catch {
    heap = null
  }
  let metrics = []
  try {
    const got = await session.send('Performance.getMetrics', {}, session.sessionId)
    metrics = (got.metrics || []).filter((row) =>
      /JSHeap|ScriptDuration|TaskDuration|LayoutCount|RecalcStyle|Documents|Nodes|JSEventListeners/.test(row.name),
    )
  } catch {
    metrics = []
  }
  const paints = await session.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const nav = performance.getEntriesByType('navigation')[0]
        const paint = Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)]))
        const longTasks = Array.isArray(window.__biuPerf?.longTasks) ? window.__biuPerf.longTasks : []
        return {
          paint,
          longTaskMs: longTasks.reduce((sum, row) => sum + (row.duration || 0), 0),
          longTasks: longTasks.slice(0, 12),
          transferSize: nav ? nav.transferSize : null,
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        }
      })()`,
      returnByValue: true,
    },
    session.sessionId,
  )
  const perf = paints.result?.value || {}
  const net = summarizeNetwork([...requests.values()].filter((row) => row.url))
  return {
    id: route.id,
    label: route.label,
    path: route.path,
    contentAt,
    readyAt,
    shell,
    heapUsed: heap?.usedSize ?? null,
    metrics,
    paint: perf.paint || {},
    longTaskMs: perf.longTaskMs || 0,
    longTasks: perf.longTasks || [],
    hub: hubSpans(hub, t0),
    network: net,
    networkReady: readyNetwork,
    logs: [...new Set(logs)].slice(0, 12),
    fails: [...new Set(fails)].slice(0, 12),
    interact,
  }
}

function bottleneckNotes(rows) {
  const notes = []
  const pluginSerial = rows.filter((row) => row.network?.pluginWebSerial && (row.network?.pluginWeb || 0) >= 3)
  if (pluginSerial.length) {
    notes.push({
      id: 'plugin-web-serial',
      title: '商店 web.js 在每次刷新里串行 import',
      detail: `有 ${pluginSerial.length} 条路线的 ${pluginSerial[0].network.pluginWeb} 个 web.js 几乎不重叠。页面块应只 import 当前页请求的商店包。`,
    })
  }
  const busted = rows.some((row) => (row.network?.groups || []).some((group) => group.kind === 'plugin-web' && group.bytes > 50_000))
  if (busted) {
    notes.push({
      id: 'plugin-web-cache-bust',
      title: 'web.js URL 被 Date.now() 二次打版本，刷新吃不到缓存',
      detail: 'snapshot 已经带 ?v=codeVersion。ui-hub 再拼 &v=时间戳，每次刷新都重新拉商店包。',
    })
  }
  const lists = rows
    .map((row) => ((row.networkReady || row.network)?.groups || []).find((group) => group.kind === 'db-list'))
    .filter(Boolean)
  const maxList = lists.reduce((max, row) => Math.max(max, row.count), 0)
  const maxListWait = lists.reduce((max, row) => Math.max(max, row.maxMs || 0), 0)
  if (maxList >= 8) {
    notes.push({
      id: 'sidebar-list-fanout',
      title: '侧栏/列表对多张表打 /api/db/list',
      detail: `单次刷新最多 ${maxList} 次 list。展开的集合视图会各打一遍总数和预览。`,
    })
  }
  if (maxListWait >= 800) {
    notes.push({
      id: 'list-full-scan',
      title: '列表接口按整表扫描再切片',
      detail: `最慢的 /api/db/list 等了 ${maxListWait}ms。limit=1 和 limit=200 一样慢，说明先读完全表再 decorate。`,
    })
  }
  const slow = rows
    .filter((row) => typeof row.readyAt === 'number')
    .sort((a, b) => b.readyAt - a.readyAt)
    .slice(0, 5)
    .map((row) => `${row.label} ${row.readyAt}ms`)
  if (slow.length) notes.push({ id: 'slowest-routes', title: '就绪最慢的页面', detail: slow.join('；') })
  const long = rows.filter((row) => (row.longTaskMs || 0) >= 120)
  if (long.length) {
    notes.push({
      id: 'long-tasks',
      title: '主线程 long task',
      detail: long.map((row) => `${row.label} ${row.longTaskMs}ms 行=${row.shell?.tableRows ?? '?'}`).join('；'),
    })
  }
  const dense = rows.filter((row) => (row.shell?.tableRows || 0) >= 80 && (row.longTaskMs || 0) >= 800)
  if (dense.length) {
    notes.push({
      id: 'unvirtualized-table',
      title: '大表没有虚拟滚动，行数上去主线程就炸',
      detail: dense.map((row) => `${row.label} ${row.shell.tableRows} 行 / longtask ${row.longTaskMs}ms`).join('；'),
    })
  }
  return notes
}

const discovered = await discoverRoutes()
const session = await openPageSession({ token, workspaceId, chrome })
const results = []
try {
  await measureRoute(session, { id: 'warmup', label: 'warmup', path: '/database' })
  for (const route of discovered.routes) {
    const samples = []
    for (let i = 1; i <= runs; i += 1) samples.push(await measureRoute(session, route))
    const ready = samples.map((row) => row.readyAt)
    const content = samples.map((row) => row.contentAt)
    results.push({
      id: route.id,
      label: route.label,
      path: route.path,
      runs: samples,
      contentAt: median(content),
      readyAt: median(ready),
      pluginWeb: samples[samples.length - 1]?.network?.pluginWeb ?? 0,
      pluginWebSerial: samples.some((row) => row.network?.pluginWebSerial),
      dbList: samples[samples.length - 1]?.network?.groups?.find((group) => group.kind === 'db-list')?.count ?? 0,
      dbListReady: samples[samples.length - 1]?.networkReady?.groups?.find((group) => group.kind === 'db-list')?.count ?? 0,
      longTaskMs: median(samples.map((row) => row.longTaskMs)),
      tableRows: samples[samples.length - 1]?.shell?.tableRows ?? 0,
      interact: samples[samples.length - 1]?.interact ?? null,
      heapUsed: samples[samples.length - 1]?.heapUsed ?? null,
      fails: [...new Set(samples.flatMap((row) => row.fails))],
      last: samples[samples.length - 1],
    })
  }
} finally {
  session.close()
}

const report = {
  workspaceId,
  origin,
  runs,
  coverage: discovered.coverage,
  routes: discovered.routes.map((row) => ({ id: row.id, kind: row.kind, path: row.path, label: row.label })),
  results,
  bottlenecks: bottleneckNotes(results.map((row) => row.last).filter(Boolean)),
}
console.log(JSON.stringify(report, null, 2))
