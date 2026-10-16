#!/usr/bin/env node
/** 看浏览器里 /api/snapshot 是否带上本机空间的商店插件。 */
import { openPageSession, readPerfEnv } from './cdp.mjs'

const { token, workspaceId, pageUrl, chrome } = readPerfEnv()
const session = await openPageSession({ token, workspaceId, chrome })
await session.send('Page.navigate', { url: pageUrl }, session.sessionId)
await new Promise((resolve) => setTimeout(resolve, 4000))
const snap = await session.send(
  'Runtime.evaluate',
  {
    expression: `(async () => {
      const stored = {
        session: sessionStorage.getItem('biu.workspaceId'),
        local: localStorage.getItem('biu.workspaceId'),
        token: Boolean(localStorage.getItem('biu.account.token')),
      }
      const res = await fetch('/api/snapshot')
      const body = await res.json()
      const store = (body.plugins || []).filter((plugin) => String(plugin.packageName || '').startsWith('store:'))
      return { stored, status: res.status, storeCount: store.length, store: store.map((plugin) => ({ id: plugin.id, enabled: plugin.enabled, state: plugin.state, web: plugin.web })) }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  },
  session.sessionId,
)
console.log(JSON.stringify(snap.result?.value, null, 2))
session.close()
