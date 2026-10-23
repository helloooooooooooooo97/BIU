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

test('table person cells stamp a precomposed mascot symbol, not GrokCharacter', () => {
  const src = readFileSync(resolve(import.meta.dirname, './person-cell.tsx'), 'utf8')
  const personFace = src.slice(src.indexOf('export function PersonFace'), src.indexOf('export function PersonPickPanel'))
  assert.doesNotMatch(personFace, /GrokCharacter|GrokBotAvatar|loadGrokBot|loadGrokGeo/)
  assert.doesNotMatch(personFace, /SidebarMascot/)
  assert.doesNotMatch(personFace, /fsdb-person-dot|busy/)
  assert.match(personFace, /TableMascotMark/)
  const symbols = readFileSync(resolve(import.meta.dirname, '../../../public-mascot/src/web/mascot-symbols.tsx'), 'utf8')
  assert.match(symbols, /GROK_SHAPES.flatMap/)
  assert.match(symbols, /ensureMascotSymbols/)
  assert.match(symbols, /<use href=/)
})
