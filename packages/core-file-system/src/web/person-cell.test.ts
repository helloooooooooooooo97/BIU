import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('person pick panel reuses the sessions list for a short ttl', () => {
  const src = readFileSync(resolve(import.meta.dirname, './person-cell.tsx'), 'utf8')
  const pick = src.slice(src.indexOf('export function PersonPickPanel'))
  assert.match(src, /AGENTS_TTL_MS = 8000/)
  assert.match(src, /if \(agentsListed && Date\.now\(\) - agentsListedAt < AGENTS_TTL_MS\) return agentsListed/)
  assert.match(pick, /loadAgents\(\)/)
})

test('table person cells render stamped name and mascot without fetching sessions', () => {
  const src = readFileSync(resolve(import.meta.dirname, './person-cell.tsx'), 'utf8')
  const personFace = src.slice(src.indexOf('export function PersonFace'), src.indexOf('export function PersonPickPanel'))
  assert.doesNotMatch(personFace, /loadAgents|listCollection|useEffect|useState/)
  assert.doesNotMatch(personFace, /GrokCharacter|GrokBotAvatar|loadGrokBot|loadGrokGeo/)
  assert.doesNotMatch(personFace, /SidebarMascot/)
  assert.doesNotMatch(personFace, /fsdb-person-dot|busy/)
  assert.match(personFace, /TableMascotMark/)
  assert.match(personFace, /person\.name/)
  assert.match(personFace, /person\.mascot/)
  const symbols = readFileSync(resolve(import.meta.dirname, '../../../public-mascot/src/web/mascot-symbols.tsx'), 'utf8')
  assert.match(symbols, /GROK_SHAPES.flatMap/)
  assert.match(symbols, /ensureMascotSymbols/)
  assert.match(symbols, /<use href=/)
})
