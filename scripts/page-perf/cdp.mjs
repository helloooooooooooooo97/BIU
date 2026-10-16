/** Chrome DevTools 连接。页面插件刷新计时、控制台、快照脚本共用。 */

export function readPerfEnv() {
  const token = String(process.env.BIU_PERF_TOKEN ?? '').trim()
  const workspaceId = String(process.env.BIU_PERF_WORKSPACE ?? '').trim()
  const pageUrl = String(process.env.BIU_PERF_URL ?? 'http://127.0.0.1:5174/database/pages/record/p000').trim()
  const chrome = String(process.env.BIU_PERF_CHROME ?? 'http://127.0.0.1:9222').replace(/\/$/, '')
  if (!token || !workspaceId) {
    throw new Error('需要 BIU_PERF_TOKEN 和 BIU_PERF_WORKSPACE')
  }
  return { token, workspaceId, pageUrl, chrome }
}

export async function openPageSession({ token, workspaceId, chrome }) {
  const version = await (await fetch(`${chrome}/json/version`)).json()
  const browser = new WebSocket(version.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  const events = []
  function send(method, params = {}, sessionId) {
    const id = ++seq
    const msg = { id, method, params }
    if (sessionId) msg.sessionId = sessionId
    browser.send(JSON.stringify(msg))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }
  browser.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
      return
    }
    if (msg.method) events.push(msg)
  })
  await new Promise((resolve) => browser.addEventListener('open', resolve))
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Network.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Log.enable', {}, sessionId)
  await send(
    'Network.setCookie',
    { name: 'biu_account', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' },
    sessionId,
  )
  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `localStorage.setItem('biu.account.token', ${JSON.stringify(token)}); localStorage.setItem('biu.workspaceId', ${JSON.stringify(workspaceId)}); sessionStorage.setItem('biu.workspaceId', ${JSON.stringify(workspaceId)});
window.__biuPerf = { longTasks: [] };
try {
  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__biuPerf.longTasks.push({
        name: entry.name,
        duration: Math.round(entry.duration),
        start: Math.round(entry.startTime),
      })
    }
  })
  po.observe({ type: 'longtask', buffered: true })
} catch (error) {}`,
    },
    sessionId,
  )
  return {
    browser,
    sessionId,
    send,
    take() {
      return events.splice(0, events.length)
    },
    close() {
      browser.close()
    },
  }
}

export function inspectPageBlocksSource() {
  return `(() => {
    const blocks = [...document.querySelectorAll('[data-page-block]')]
    const missing = [...document.querySelectorAll('[data-testid="page-block-missing"]')]
    const loading = missing.filter((el) => el.getAttribute('data-plugin-phase') === 'loading').map((el) => el.querySelector('code')?.textContent || '')
    const other = missing.map((el) => el.getAttribute('data-plugin-phase') + ':' + (el.querySelector('code')?.textContent || ''))
    const views = blocks.filter((el) => !el.querySelector('[data-testid="page-block-missing"]')).map((el) => el.getAttribute('data-page-block-plugin'))
    const title = document.querySelector('h1')?.textContent || ''
    return { title, blocks: blocks.length, views, other, loading }
  })()`
}

/** 本机空间各页共用：壳、输入框、表、记录是否已经画出来。 */
export function inspectLocalShellSource() {
  return `(() => {
    const splash = Boolean(document.querySelector('[data-testid="auth-verifying"]'))
    const gate = Boolean(document.querySelector('[data-testid="auth-gate"]'))
    const shell = Boolean(document.querySelector('[data-testid="app-shell"]'))
    const workspace = Boolean(document.querySelector('[data-testid="shell-workspace-switcher"]'))
    const composer = Boolean(document.querySelector('.composer-pill, [data-testid="chat-empty"], [data-testid="chat-turn"]'))
    const table = Boolean(document.querySelector('.fsdb-page, [data-collection-kind], [data-page-block]'))
    const listReady = Boolean(document.querySelector('.fsdb-page[data-list-ready="1"], [data-page-block]'))
    const tableRows = document.querySelectorAll('.tasks-table tbody tr[data-record-id], .fsdb-page tbody tr[data-record-id]').length
    const chatTurns = document.querySelectorAll('[data-testid="chat-turn"], .chat-turn, [data-turn]').length
    const loadingBlocks = document.querySelectorAll('[data-plugin-phase="loading"]').length
    const title =
      document.querySelector('h1')?.textContent?.trim() ||
      document.querySelector('.chat-view-project-name')?.textContent?.trim() ||
      document.title
    const textLen = (document.body?.innerText || '').length
    const longTasks = Array.isArray(window.__biuPerf?.longTasks) ? window.__biuPerf.longTasks : []
    return { splash, gate, shell, workspace, composer, table, tableRows, listReady, chatTurns, loadingBlocks, title, textLen, longTasks }
  })()`
}

export function resourceKind(url) {
  const path = String(url || '')
  if (path.includes('/api/snapshot')) return 'snapshot'
  if (path.includes('/api/plugin-store/') && path.includes('/web.js')) return 'plugin-web'
  if (path.includes('/api/db/list')) return 'db-list'
  if (path.includes('/api/db/stat')) return 'db-stat'
  if (path.includes('/api/db/content') || path.includes('/api/db/read')) return 'db-record'
  if (path.includes('/api/db/')) return 'db'
  if (path.includes('/api/account/')) return 'account'
  if (path.includes('/api/')) return 'api'
  if (/\.(tsx?|jsx?|mjs|css)(\?|$)/.test(path) || path.includes('/@fs/') || path.includes('/node_modules/')) return 'module'
  return 'other'
}
