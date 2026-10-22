#!/usr/bin/env node
/** 刷新带多个页面插件的记录，量内容出现和块视图就绪时间。 */
import { inspectPageBlocksSource, openPageSession, readPerfEnv } from './cdp.mjs'

const { token, workspaceId, pageUrl, chrome } = readPerfEnv()
const runs = Math.max(1, Number(process.env.BIU_PERF_RUNS || 3))
const session = await openPageSession({ token, workspaceId, chrome })

async function measure(label) {
  const t0 = Date.now()
  const logs = []
  const fails = []
  session.take()
  await session.send('Page.navigate', { url: pageUrl }, session.sessionId)
  let contentAt = null
  let readyAt = null
  let views = null
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    for (const ev of session.take()) {
      if (ev.method === 'Runtime.consoleAPICalled') {
        const text = (ev.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ')
        if (ev.params.type === 'error' || ev.params.type === 'warning') logs.push(`${ev.params.type}: ${text.slice(0, 300)}`)
      }
      if (ev.method === 'Runtime.exceptionThrown') {
        logs.push(`exception: ${(ev.params.exceptionDetails.exception?.description || ev.params.exceptionDetails.text || '').slice(0, 400)}`)
      }
      if (ev.method === 'Network.responseReceived' && ev.params.response.status >= 400) {
        fails.push(`${ev.params.response.status} ${ev.params.response.url.slice(0, 220)}`)
      }
    }
    const snap = await session.send('Runtime.evaluate', { expression: inspectPageBlocksSource(), returnByValue: true }, session.sessionId)
    const value = snap.result?.value
    if (!value) continue
    views = value
    if (contentAt == null && (String(value.title).includes('十插件') || value.blocks > 0)) contentAt = Date.now() - t0
    if (readyAt == null && value.blocks >= 8 && value.loading.length === 0 && value.views.length >= 8) {
      readyAt = Date.now() - t0
      break
    }
  }
  return { label, contentAt, readyAt, views, logs: [...new Set(logs)], fails: [...new Set(fails)] }
}

const results = []
for (let i = 1; i <= runs; i += 1) results.push(await measure(`load${i}`))
console.log(JSON.stringify(results, null, 2))
session.close()
