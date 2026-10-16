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
      source: `localStorage.setItem('biu.account.token', ${JSON.stringify(token)}); localStorage.setItem('biu.workspaceId', ${JSON.stringify(workspaceId)}); sessionStorage.setItem('biu.workspaceId', ${JSON.stringify(workspaceId)});`,
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
