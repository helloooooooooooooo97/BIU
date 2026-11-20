import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { LAN_MEMBER_KEY, readLanMemberId } from './lan-member.ts'

test('share visitors keep a stable random id in localStorage', () => {
  const store = new Map<string, string>()
  const memory = {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory })
  const first = readLanMemberId()
  const second = readLanMemberId()
  assert.equal(first, second)
  assert.ok(first.length >= 8)
  assert.equal(store.get(LAN_MEMBER_KEY), first)
})

test('share requests send the LAN member header', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  const host =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  assert.match(src, /x-lan-member/)
  assert.match(host, /rememberShareLan/)
  assert.match(host, /rememberLanMember/)
})
