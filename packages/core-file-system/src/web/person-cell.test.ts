import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { agentNameLooksLikeId, resolveAgentName } from './person-cell.tsx'

test('agent display name comes from the sessions query, not the stored id', () => {
  const person = { kind: 'agent' as const, name: 'sess-age', sessionId: 'sess-agent-1' }
  assert.equal(agentNameLooksLikeId(person.name, person.sessionId), true)
  assert.equal(resolveAgentName(person, new Map()), '')
  assert.equal(resolveAgentName(person, new Map([['sess-agent-1', '蓝团爱']])), '蓝团爱')
  assert.equal(resolveAgentName({ kind: 'user', name: '用户' }, new Map()), '用户')
})

test('person cells reuse the sessions list for a short ttl', () => {
  const src = readFileSync(resolve(import.meta.dirname, './person-cell.tsx'), 'utf8')
  assert.match(src, /AGENTS_TTL_MS = 8000/)
  assert.match(src, /if \(agentsListed && Date\.now\(\) - agentsListedAt < AGENTS_TTL_MS\) return agentsListed/)
})

test('deferred table person faces skip mascots and session list until live', () => {
  const src = readFileSync(resolve(import.meta.dirname, './person-cell.tsx'), 'utf8')
  const idle = src.slice(src.indexOf('function PersonFaceIdle'), src.indexOf('export function PersonFace'))
  const live = src.slice(src.indexOf('function PersonFaceLive'))
  assert.match(src, /defer = false/)
  assert.match(src, /if \(defer\) return <PersonFaceIdle/)
  assert.doesNotMatch(idle, /SidebarMascot/)
  assert.doesNotMatch(idle, /loadAgents/)
  assert.doesNotMatch(idle, /useWorkspaceProfile/)
  assert.match(idle, /fsdb-person-list/)
  assert.match(idle, /fsdb-person-avatar/)
  assert.match(live, /SidebarMascot/)
  assert.match(live, /loadAgents/)
})
