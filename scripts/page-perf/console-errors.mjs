#!/usr/bin/env node
/** 打开页面若干秒，收集控制台报错和 4xx。 */
import { inspectPageBlocksSource, openPageSession, readPerfEnv } from './cdp.mjs'

const { token, workspaceId, pageUrl, chrome } = readPerfEnv()
const waitMs = Math.max(1000, Number(process.env.BIU_PERF_WAIT_MS || 8000))
const session = await openPageSession({ token, workspaceId, chrome })
const logs = []
const nets = []
session.take()
await session.send('Page.navigate', { url: pageUrl }, session.sessionId)
await new Promise((resolve) => setTimeout(resolve, waitMs))
for (const ev of session.take()) {
  if (ev.method === 'Runtime.consoleAPICalled') {
    const text = (ev.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ')
    if (ev.params.type === 'error' || ev.params.type === 'warning' || text.includes('[biu:')) logs.push(text.slice(0, 280))
  }
  if (ev.method === 'Log.entryAdded' && ev.params.entry.level === 'error') {
    logs.push(`ERR ${(ev.params.entry.text || '').slice(0, 200)} ${ev.params.entry.url || ''}`)
  }
  if (ev.method === 'Network.responseReceived') {
    const url = ev.params.response.url
    const status = ev.params.response.status
    if (status >= 400 || /account\/access|plugin-store|web\.js/.test(url)) nets.push(`${status} ${url.slice(0, 180)}`)
  }
}
const snap = await session.send(
  'Runtime.evaluate',
  { expression: inspectPageBlocksSource(), returnByValue: true },
  session.sessionId,
)
console.log(JSON.stringify({ logs: [...new Set(logs)], nets: [...new Set(nets)], page: snap.result?.value }, null, 2))
session.close()
