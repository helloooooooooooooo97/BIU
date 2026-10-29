import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { personInspectTarget } from './person-cell.tsx'

test('person inspect target opens agents on sessions and users on members', () => {
  assert.deepEqual(personInspectTarget({ kind: 'agent', name: '甲', sessionId: 'sess-a' }), {
    collection: '/agents',
    recordId: 'sess-a',
  })
  assert.deepEqual(personInspectTarget({ kind: 'user', name: 'Ada', accountId: 'acc-1' }), {
    collection: '/workspace-members',
    recordId: 'acc-1',
  })
  assert.equal(personInspectTarget({ kind: 'user', name: '用户' }), null)
  assert.equal(personInspectTarget({ kind: 'system', name: '系统' }), null)
  assert.equal(personInspectTarget({ kind: 'agent', name: '无名' }), null)
})

test('person pick list caps at ten visible rows', () => {
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(css, /\.fsdb-person-options\{[^}]*max-height:calc\(10 \* 28px \+ 9 \* 2px\)/)
  assert.match(css, /\.fsdb-person-options\{[^}]*overflow:auto/)
  assert.match(css, /\.fsdb-person-option\{[^}]*min-height:28px/)
  assert.match(css, /\.fsdb-person-avatar\{[^}]*color:var\(--biu-color-icon-fixed\)/)
})

test('person pick panel searches members and sessions', () => {
  const src = readFileSync(resolve(import.meta.dirname, './person-cell.tsx'), 'utf8')
  const pick = src.slice(src.indexOf('export function PersonPickPanel'))
  assert.match(src, /AGENTS_TTL_MS = 8000/)
  assert.match(src, /MEMBERS_TTL_MS = 8000/)
  assert.match(src, /path: '\/workspace-members'/)
  assert.match(src, /if \(agentsListed && Date\.now\(\) - agentsListedAt < AGENTS_TTL_MS\) return agentsListed/)
  assert.match(pick, /loadMembers\(\)/)
  assert.match(pick, /loadAgents\(\)/)
  assert.match(pick, /搜索成员或代理/)
  assert.doesNotMatch(pick, /name: '系统'/)
  assert.doesNotMatch(pick, /name: '用户'/)
})

test('table person cells render stamped name and mascot without fetching sessions', () => {
  const src = readFileSync(resolve(import.meta.dirname, './person-cell.tsx'), 'utf8')
  const personFace = src.slice(src.indexOf('export function PersonFace'), src.indexOf('export function PersonPickPanel'))
  assert.doesNotMatch(personFace, /loadAgents|listCollection|useEffect|useState/)
  // 表格格子里的吉祥物走 SidebarMascot：空闲静态、busy/入场窗口才有动画。
  assert.match(personFace, /SidebarMascot/)
  assert.doesNotMatch(personFace, /GrokCharacter|loadGrokBot|loadGrokGeo/)
  assert.doesNotMatch(personFace, /fsdb-person-dot|busy/)
  assert.match(personFace, /person\.name/)
  assert.match(personFace, /person\.mascot/)
  assert.match(personFace, /personInspectTarget/)
  assert.match(personFace, /openPersonInInspector/)
  assert.match(personFace, /在右侧打开/)
  assert.match(src, /showRecordInInspector/)
})
