import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { assertHttpUrl, assertSafeHttpUrl, httpFetchProvider, isPrivateIp, webImageDir } from './http-fetch.ts'
import { WebError } from './types.ts'

const originalOnline = process.env.BIU_ONLINE

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
})

test('isPrivateIp and assertHttpUrl block IPv6, IPv4-mapped IPv6, CGNAT, and internal hostnames', () => {
  const blockedIps = [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456:789a::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::127.0.0.1',
  ]
  for (const ip of blockedIps) {
    assert.equal(isPrivateIp(ip), true, `expected ${ip} to be private`)
  }

  const publicIps = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']
  for (const ip of publicIps) {
    assert.equal(isPrivateIp(ip), false, `expected ${ip} to be public`)
  }

  const blockedUrls = [
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/admin',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://100.64.0.1/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://sub.localhost/',
  ]
  for (const url of blockedUrls) {
    assert.throws(() => assertHttpUrl(url), (err: unknown) => {
      assert.ok(err instanceof WebError)
      assert.equal(err.code, 'WEB_BLOCKED_URL')
      return true
    })
  }
})

test('assertSafeHttpUrl blocks DNS rebinding to private IPv4 and IPv6 addresses', async () => {
  await assert.rejects(
    () =>
      assertSafeHttpUrl('https://rebind.example.com/secret', async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]),
    (err: unknown) => err instanceof WebError && err.code === 'WEB_BLOCKED_URL',
  )

  await assert.rejects(
    () =>
      assertSafeHttpUrl('https://v6rebind.example.com/secret', async () => [
        { address: 'fc00::1', family: 6 },
      ]),
    (err: unknown) => err instanceof WebError && err.code === 'WEB_BLOCKED_URL',
  )

  const ok = await assertSafeHttpUrl('https://public.example.com/', async () => [
    { address: '93.184.216.34', family: 4 },
  ])
  assert.equal(ok.hostname, 'public.example.com')
})

test('httpFetchProvider re-validates 3xx redirect targets and blocks redirects to private hosts', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === 'https://public.example.com/redir-local') {
      return new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      })
    }
    if (url === 'https://public.example.com/redir-v6') {
      return new Response(null, {
        status: 301,
        headers: { location: 'http://[::ffff:127.0.0.1]/secret' },
      })
    }
    if (url === 'https://public.example.com/redir-ok') {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://safe.example.com/final' },
      })
    }
    if (url === 'https://safe.example.com/final') {
      return new Response('<html><p>Safe target</p></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  try {
    const provider = httpFetchProvider({
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    })

    await assert.rejects(
      () => provider.fetch({ url: 'https://public.example.com/redir-local' }),
      (err: unknown) => err instanceof WebError && err.code === 'WEB_BLOCKED_URL',
    )

    await assert.rejects(
      () => provider.fetch({ url: 'https://public.example.com/redir-v6' }),
      (err: unknown) => err instanceof WebError && err.code === 'WEB_BLOCKED_URL',
    )

    const ok = await provider.fetch({ url: 'https://public.example.com/redir-ok' })
    assert.equal(ok.statusCode, 200)
    assert.match(ok.body.content, /Safe target/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webImageDir isolates fetched images per workspace in cloud mode and fails closed without workspace', () => {
  process.env.BIU_ONLINE = '1'

  assert.throws(() => webImageDir(), /缺少工作区上下文/)

  const dirA = runWithRequestWorkspace('ws-tenant-a', () => webImageDir())
  const dirB = runWithRequestWorkspace('ws-tenant-b', () => webImageDir())
  assert.notEqual(dirA, dirB)
  assert.match(dirA, /workspaces\/ws-tenant-a$/)
  assert.match(dirB, /workspaces\/ws-tenant-b$/)
})
