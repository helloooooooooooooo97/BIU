import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  channelNeedsCollectionSync,
  databaseChannelPayload,
  fsdbChangeDetail,
  parseDatabaseChannel,
  parseFsdbChange,
} from './database-channel.ts'

test('unlabeled broadcast is records and needs collection sync', () => {
  const parsed = parseDatabaseChannel({ ts: 1 })
  assert.equal(parsed?.scope, 'records')
  assert.equal(channelNeedsCollectionSync(parsed!), true)
  assert.deepEqual(fsdbChangeDetail(parsed!), { scope: 'records' })
})

test('legacy boolean flags map to scoped payloads', () => {
  assert.equal(parseDatabaseChannel({ ts: 1, tags: true })?.scope, 'tags')
  assert.equal(parseDatabaseChannel({ ts: 1, views: true })?.scope, 'views')
  assert.equal(parseDatabaseChannel({ ts: 1, content: true, path: '/pages/p1' })?.scope, 'content')
  assert.equal(parseDatabaseChannel({ ts: 1, notices: true })?.scope, 'notices')
  assert.equal(parseDatabaseChannel({ ts: 1, asset: { name: 'a.jsx' } })?.scope, 'asset')
})

test('asset-only and notices do not emit fsdb:change', () => {
  assert.equal(fsdbChangeDetail(parseDatabaseChannel({ ts: 1, asset: { name: 'a.jsx' } })!), null)
  assert.equal(fsdbChangeDetail(parseDatabaseChannel(databaseChannelPayload('notices'))!), null)
  assert.equal(channelNeedsCollectionSync(parseDatabaseChannel(databaseChannelPayload('views'))!), false)
  assert.equal(channelNeedsCollectionSync(parseDatabaseChannel(databaseChannelPayload('content', { path: '/pages/p' }))!), false)
})

test('savedView / view reveal count as views', () => {
  assert.equal(parseDatabaseChannel({ ts: 1, savedView: { id: 'v' } })?.scope, 'views')
  assert.equal(parseDatabaseChannel({ ts: 1, reveal: { viewId: 'v' } })?.scope, 'views')
  assert.equal(parseDatabaseChannel({ ts: 1, reveal: { collection: '/views' } })?.scope, 'views')
})

test('parseFsdbChange reads scope or legacy flags', () => {
  const event = (detail: unknown) => ({ detail } as unknown as Event)
  assert.deepEqual(parseFsdbChange(event({ views: true })), { scope: 'views' })
  assert.deepEqual(parseFsdbChange(event({ scope: 'views', path: '/pages/p1' })), { scope: 'views', path: '/pages/p1' })
  assert.deepEqual(parseFsdbChange(event({ tags: true })), { scope: 'tags' })
  assert.deepEqual(parseFsdbChange(event({ content: true, path: '/pages/p1' })), { scope: 'content', path: '/pages/p1' })
  assert.deepEqual(parseFsdbChange(event(undefined)), { scope: 'records' })
})
