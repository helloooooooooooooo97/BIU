import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'vitest'
import { apiFetch, registerApiRequestInterceptor } from './api-client.ts'
import {
  isHostControlPath,
  resetWorkspaceEndpoint,
  resolveApiRequest,
  resolveAssetUrl,
  resolveWsUrl,
  rewriteElementAssetUrls,
  setWorkspaceEndpoint,
  syncWorkspaceEndpoint,
  updateWorkspaceAssetTicket,
} from './workspace-transport.ts'

afterEach(() => {
  resetWorkspaceEndpoint()
})

describe('WorkspaceTransport direct cloud routing', () => {
  it('keeps host-shell control paths local while routing all workspace APIs directly to cloud origin', () => {
    setWorkspaceEndpoint({
      mode: 'cloud',
      origin: 'https://cloud.biu.example/',
      workspaceId: 'ws_cloud_1',
      token: 'tok_cloud_abc',
    })

    // Host-shell paths stay relative (local 3151)
    for (const hostPath of [
      '/api/runtime',
      '/api/update',
      '/api/account/me',
      '/api/account/active',
      '/api/account/cloud',
      '/api/account/cloud/endpoint',
      '/api/account/workspaces',
    ]) {
      assert.equal(isHostControlPath(hostPath), true)
      const res = resolveApiRequest(hostPath)
      assert.equal(res.url, hostPath)
    }

    // All workspace APIs — including plugins, snapshot, db, agents, chat, access, workspace sub-routes — go directly to cloud
    for (const wsPath of [
      '/api/db/list?path=/pages',
      '/api/snapshot',
      '/api/plugins/catalog',
      '/api/plugins/p1',
      '/api/agents',
      '/api/chat/config',
      '/api/account/access?collection=/pages',
      '/api/account/workspaces/ws_cloud_1/members',
      '/api/account/workspaces/ws_cloud_1/actor-scopes',
    ]) {
      assert.equal(isHostControlPath(wsPath), false)
      const res = resolveApiRequest(wsPath, { method: 'GET' })
      assert.equal(res.url, `https://cloud.biu.example${wsPath}`)
      const headers = new Headers(res.init.headers)
      assert.equal(headers.get('authorization'), 'Bearer tok_cloud_abc')
      assert.equal(headers.get('x-biu-workspace-id'), 'ws_cloud_1')
    }
  })

  it('routes /ws and custom WS paths directly to cloud wss origin with workspaceId & token', () => {
    setWorkspaceEndpoint({
      mode: 'cloud',
      origin: 'https://cloud.biu.example',
      workspaceId: 'ws_cloud_1',
      token: 'tok_cloud_abc',
    })
    assert.equal(
      resolveWsUrl('/ws'),
      'wss://cloud.biu.example/ws?workspaceId=ws_cloud_1&token=tok_cloud_abc',
    )
    assert.equal(
      resolveWsUrl('/ws/terminal?cols=80'),
      'wss://cloud.biu.example/ws/terminal?cols=80&workspaceId=ws_cloud_1&token=tok_cloud_abc',
    )
    // When a single-use wsTicket is provided, long-lived token must NOT appear in the URL
    assert.equal(
      resolveWsUrl('/ws', { wsTicket: 'biu_wst_once123' }),
      'wss://cloud.biu.example/ws?workspaceId=ws_cloud_1&wsTicket=biu_wst_once123',
    )
  })

  it('rewrites relative asset URLs to signed direct cloud URLs with HMAC ticket', () => {
    setWorkspaceEndpoint({
      mode: 'cloud',
      origin: 'https://cloud.biu.example',
      workspaceId: 'ws_cloud_1',
      token: 'tok_cloud_abc',
    })
    const futureExp = Date.now() + 60_000
    updateWorkspaceAssetTicket({
      uid: 'acc_1',
      ws: 'ws_cloud_1',
      exp: futureExp,
      sig: 'sig_xyz',
    })

    const resolved = resolveAssetUrl('/api/db/file/photo.png')
    assert.equal(
      resolved,
      `https://cloud.biu.example/api/db/file/photo.png?uid=acc_1&ws=ws_cloud_1&exp=${futureExp}&sig=sig_xyz`,
    )
    assert.equal(
      resolveAssetUrl('/api/page/file/doc.pdf?download=1'),
      `https://cloud.biu.example/api/page/file/doc.pdf?download=1&uid=acc_1&ws=ws_cloud_1&exp=${futureExp}&sig=sig_xyz`,
    )
    assert.equal(
      resolveAssetUrl('/api/channels/ch_1/uploads/shot.png'),
      `https://cloud.biu.example/api/channels/ch_1/uploads/shot.png?uid=acc_1&ws=ws_cloud_1&exp=${futureExp}&sig=sig_xyz`,
    )
    // Non-asset or already-absolute URLs are left untouched
    assert.equal(resolveAssetUrl('https://cdn.other.com/a.png'), 'https://cdn.other.com/a.png')
    assert.equal(resolveAssetUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA')
    assert.equal(resolveAssetUrl('/api/db/list'), '/api/db/list')
  })

  it('integrates apiFetch directly with active cloud endpoint', async () => {
    setWorkspaceEndpoint({
      mode: 'cloud',
      origin: 'http://192.168.1.8:3141',
      workspaceId: 'ws_lan_1',
      token: 'tok_lan',
    })
    const calls: Array<{ url: string; auth: string | null; ws: string | null }> = []
    const prevFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url: String(input),
        auth: headers.get('authorization'),
        ws: headers.get('x-biu-workspace-id'),
      })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof globalThis.fetch
    try {
      await apiFetch('/api/snapshot')
      await apiFetch('/api/account/me')
      assert.deepEqual(calls, [
        { url: 'http://192.168.1.8:3141/api/snapshot', auth: 'Bearer tok_lan', ws: 'ws_lan_1' },
        { url: '/api/account/me', auth: null, ws: null },
      ])
    } finally {
      globalThis.fetch = prevFetch
    }
  })

  it('rewrites DOM img/video/a asset attributes and re-signs on ticket rotation', () => {
    const makeEl = (tagName: string, attrs: Record<string, string>) => {
      const map = new Map(Object.entries(attrs))
      return {
        tagName,
        getAttribute: (k: string) => map.get(k) ?? null,
        setAttribute: (k: string, v: string) => map.set(k, v),
        hasAttribute: (k: string) => map.has(k),
      } as unknown as Element
    }
    const img = makeEl('IMG', { src: '/api/db/file/a.png' })
    const link = makeEl('A', { href: '/api/doc/file/report.pdf?download=1' })
    const ext = makeEl('IMG', { src: 'https://cdn.example.com/logo.png' })
    const root = { querySelectorAll: () => [img, link, ext] }

    const exp1 = Date.now() + 60_000
    setWorkspaceEndpoint({
      mode: 'cloud',
      origin: 'https://cloud.biu.example',
      workspaceId: 'ws_1',
      token: 'tok',
      assetTicket: { uid: 'acc_1', ws: 'ws_1', exp: exp1, sig: 'sig1' },
    })
    rewriteElementAssetUrls(root)
    assert.equal(img.getAttribute('src'), `https://cloud.biu.example/api/db/file/a.png?uid=acc_1&ws=ws_1&exp=${exp1}&sig=sig1`)
    assert.equal(link.getAttribute('href'), `https://cloud.biu.example/api/doc/file/report.pdf?download=1&uid=acc_1&ws=ws_1&exp=${exp1}&sig=sig1`)
    assert.equal(ext.getAttribute('src'), 'https://cdn.example.com/logo.png')

    // Rotate ticket and verify live DOM elements re-sign cleanly using tracked logical path
    const exp2 = Date.now() + 120_000
    updateWorkspaceAssetTicket({ uid: 'acc_1', ws: 'ws_1', exp: exp2, sig: 'sig2' })
    rewriteElementAssetUrls(root)
    assert.equal(img.getAttribute('src'), `https://cloud.biu.example/api/db/file/a.png?uid=acc_1&ws=ws_1&exp=${exp2}&sig=sig2`)
  })

  it('overwrites local Authorization and X-Biu-Workspace-Id from interceptors with cloud credentials', async () => {
    setWorkspaceEndpoint({
      mode: 'cloud',
      origin: 'http://localhost:3141',
      workspaceId: 'ws_cloud_9',
      token: 'tok_cloud_real',
    })
    const unregister = registerApiRequestInterceptor((_path, init) => {
      const headers = new Headers(init.headers)
      if (!headers.has('authorization')) headers.set('authorization', 'Bearer tok_local_3151')
      if (!headers.has('x-biu-workspace-id')) headers.set('x-biu-workspace-id', 'ws_stale_local')
      return { ...init, headers }
    })
    const calls: Array<{ url: string; auth: string | null; ws: string | null; credentials: RequestCredentials | undefined }> = []
    const prevFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url: String(input),
        auth: headers.get('authorization'),
        ws: headers.get('x-biu-workspace-id'),
        credentials: init?.credentials,
      })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof globalThis.fetch
    try {
      await apiFetch('/api/db/list?path=/pages')
      await apiFetch('/api/account/me')
      assert.deepEqual(calls, [
        {
          url: 'http://localhost:3141/api/db/list?path=/pages',
          auth: 'Bearer tok_cloud_real',
          ws: 'ws_cloud_9',
          credentials: 'omit',
        },
        {
          url: '/api/account/me',
          auth: 'Bearer tok_local_3151',
          ws: 'ws_stale_local',
          credentials: undefined,
        },
      ])
    } finally {
      unregister()
      globalThis.fetch = prevFetch
    }
  })

  it('waits for in-flight syncWorkspaceEndpoint before dispatching workspace API requests', async () => {
    const unregister = registerApiRequestInterceptor((_path, init) => {
      const headers = new Headers(init.headers)
      if (!headers.has('authorization')) headers.set('authorization', 'Bearer tok_local_3151')
      return { ...init, headers }
    })
    const calls: Array<{ url: string; auth: string | null; ws: string | null }> = []
    let releaseEndpoint!: () => void
    const endpointGate = new Promise<void>((resolve) => {
      releaseEndpoint = resolve
    })
    const prevFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      calls.push({
        url,
        auth: headers.get('authorization'),
        ws: headers.get('x-biu-workspace-id'),
      })
      if (url.startsWith('/api/account/cloud/endpoint')) {
        await endpointGate
        return new Response(
          JSON.stringify({
            mode: 'cloud',
            origin: 'http://localhost:3141',
            workspaceId: 'ws_cloud_boot',
            token: 'tok_cloud_boot',
          }),
          { status: 200 },
        )
      }
      if (url === 'http://localhost:3141/api/asset-ticket') {
        return new Response(
          JSON.stringify({ uid: 'u1', ws: 'ws_cloud_boot', exp: Date.now() + 60_000, sig: 's1' }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }) as typeof globalThis.fetch
    try {
      const syncing = syncWorkspaceEndpoint('ws_cloud_boot')
      const dbCall = apiFetch('/api/db/list?path=/pages')
      releaseEndpoint()
      await Promise.all([syncing, dbCall])

      assert.equal(calls[0]?.url, '/api/account/cloud/endpoint?workspaceId=ws_cloud_boot')
      assert.equal(calls[0]?.auth, 'Bearer tok_local_3151')
      const dbReq = calls.find((c) => c.url.includes('/api/db/list'))
      assert.deepEqual(dbReq, {
        url: 'http://localhost:3141/api/db/list?path=/pages',
        auth: 'Bearer tok_cloud_boot',
        ws: 'ws_cloud_boot',
      })
    } finally {
      unregister()
      globalThis.fetch = prevFetch
    }
  })
})
