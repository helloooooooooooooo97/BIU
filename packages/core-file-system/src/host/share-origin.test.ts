import { test } from 'vitest'
import assert from 'node:assert/strict'
import { publicShareUrl } from './share-origin.ts'

test('local UI port is used instead of a separate share port', () => {
  const prevUi = process.env.SHARE_PROXY_UI
  const prevPort = process.env.SHARE_PORT
  const prevUrl = process.env.SHARE_PUBLIC_URL
  process.env.SHARE_PROXY_UI = 'http://127.0.0.1:5174'
  process.env.SHARE_PORT = '3151'
  delete process.env.SHARE_PUBLIC_URL
  try {
    const url = publicShareUrl({ headers: { origin: 'http://127.0.0.1:3151' } } as never, 'tok')
    assert.match(url, /:5174\/share\/tok$/)
    assert.doesNotMatch(url, /:3151/)
  } finally {
    if (prevUi === undefined) delete process.env.SHARE_PROXY_UI
    else process.env.SHARE_PROXY_UI = prevUi
    if (prevPort === undefined) delete process.env.SHARE_PORT
    else process.env.SHARE_PORT = prevPort
    if (prevUrl === undefined) delete process.env.SHARE_PUBLIC_URL
    else process.env.SHARE_PUBLIC_URL = prevUrl
  }
})

test('share links keep the port the browser is using', () => {
  const prevPort = process.env.SHARE_PORT
  const prevUrl = process.env.SHARE_PUBLIC_URL
  process.env.SHARE_PORT = '3151'
  delete process.env.SHARE_PUBLIC_URL
  try {
    const url = publicShareUrl({ headers: { origin: 'http://127.0.0.1:5174' } } as never, 'tok')
    assert.match(url, /:5174\/share\/tok$/)
    assert.doesNotMatch(url, /:3151/)
  } finally {
    if (prevPort === undefined) delete process.env.SHARE_PORT
    else process.env.SHARE_PORT = prevPort
    if (prevUrl === undefined) delete process.env.SHARE_PUBLIC_URL
    else process.env.SHARE_PUBLIC_URL = prevUrl
  }
})

test('request Host is used when Origin is absent', () => {
  const prevPort = process.env.SHARE_PORT
  const prevUrl = process.env.SHARE_PUBLIC_URL
  process.env.SHARE_PORT = '3151'
  delete process.env.SHARE_PUBLIC_URL
  try {
    const url = publicShareUrl({ headers: { host: '192.168.1.20:5174' } } as never, 'tok')
    assert.equal(url, 'http://192.168.1.20:5174/share/tok')
  } finally {
    if (prevPort === undefined) delete process.env.SHARE_PORT
    else process.env.SHARE_PORT = prevPort
    if (prevUrl === undefined) delete process.env.SHARE_PUBLIC_URL
    else process.env.SHARE_PUBLIC_URL = prevUrl
  }
})

test('SHARE_PUBLIC_URL overrides detected origin', () => {
  const prev = process.env.SHARE_PUBLIC_URL
  process.env.SHARE_PUBLIC_URL = 'http://192.168.1.8:3142/'
  try {
    assert.equal(
      publicShareUrl({ headers: { host: '127.0.0.1:3141' } } as never, 'tok'),
      'http://192.168.1.8:3142/share/tok',
    )
  } finally {
    if (prev === undefined) delete process.env.SHARE_PUBLIC_URL
    else process.env.SHARE_PUBLIC_URL = prev
  }
})
