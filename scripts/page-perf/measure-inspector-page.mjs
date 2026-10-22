#!/usr/bin/env node
/** 点「新建」或打开已有页面后，量检查器里标题+编辑器真正画出来的时间。 */
import { inspectLocalShellSource, openPageSession, readPerfEnv, resourceKind } from './cdp.mjs'
import { clickCreateRecordSource, inspectInspectorPageSource } from './inspector-open-ready.mjs'

const { token, workspaceId, chrome } = readPerfEnv()
const origin = String(process.env.BIU_PERF_ORIGIN ?? 'http://127.0.0.1:5174').replace(/\/$/, '')
const runs = Math.max(1, Number(process.env.BIU_PERF_RUNS || 3))
const deadlineMs = Math.max(3000, Number(process.env.BIU_PERF_DEADLINE_MS || 20_000))
const listUrl = `${origin}/database/pages`

const session = await openPageSession({ token, workspaceId, chrome })

function collectDb(events, rows, t0) {
  for (const ev of events) {
    if (ev.method !== 'Network.requestWillBeSent') continue
    const url = ev.params.request?.url || ''
    if (!url.includes('/api/db/')) continue
    rows.push({
      kind: resourceKind(url),
      start: Math.round((ev.params.wallTime ? ev.params.wallTime * 1000 : Date.now()) - t0),
      url: url.slice(0, 180),
    })
  }
}

async function waitListReady() {
  const t0 = Date.now()
  await session.send('Page.navigate', { url: listUrl }, session.sessionId)
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 120))
    const snap = await session.send('Runtime.evaluate', { expression: inspectLocalShellSource(), returnByValue: true }, session.sessionId)
    const value = snap.result?.value
    if (value?.listReady || (value?.shell && value?.tableRows > 0)) {
      return Date.now() - t0
    }
  }
  throw new Error('pages list did not become ready')
}

async function measureCreate() {
  await waitListReady()
  session.take()
  const clicked = await session.send(
    'Runtime.evaluate',
    { expression: clickCreateRecordSource(), returnByValue: true },
    session.sessionId,
  )
  if (!clicked.result?.value?.clicked) throw new Error('create button not found')
  const t0 = Date.now()
  const db = []
  let chromeAt = null
  let paintedAt = null
  let last = null
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    collectDb(session.take(), db, t0)
    const snap = await session.send(
      'Runtime.evaluate',
      { expression: inspectInspectorPageSource(), returnByValue: true },
      session.sessionId,
    )
    last = snap.result?.value
    if (!last) continue
    if (chromeAt == null && last.inspector && last.title) chromeAt = Date.now() - t0
    if (last.painted) {
      paintedAt = Date.now() - t0
      break
    }
  }
  return {
    chromeAt,
    paintedAt,
    snap: last,
    dbList: db.filter((row) => row.kind === 'db-list').length,
    dbRecord: db.filter((row) => row.kind === 'db-record').length,
    db: db.slice(0, 20),
  }
}

const samples = []
try {
  for (let i = 1; i <= runs; i += 1) samples.push(await measureCreate())
} finally {
  session.close()
}

const painted = samples.map((row) => row.paintedAt).filter((ms) => typeof ms === 'number')
painted.sort((a, b) => a - b)
const median = painted.length ? painted[Math.floor(painted.length / 2)] : null
const report = {
  origin,
  listUrl,
  runs,
  medianPaintedAt: median,
  samples,
}
console.log(JSON.stringify(report, null, 2))
if (median == null) {
  console.error('inspector page never painted')
  process.exit(1)
}
