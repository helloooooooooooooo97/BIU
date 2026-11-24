import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { getInspectorDbPath, resetInspectorDbPathMemory } from './inspector-db-route.ts'
import { PersonFace, personInspectTarget } from './person-cell.tsx'

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
  assert.match(src, /path: WORKSPACE_MEMBERS_COLLECTION_PATH/)
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


test('clicking a member opens its record in the right inspector before any external profile link', async () => {
  localStorage.clear()
  resetInspectorDbPathMemory()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let bubbled = 0, opened = 0
  const open = () => { opened++ }
  window.addEventListener('biu:inspector-open', open)
  try {
    await act(async () => {
      root.render(createElement('div', { onClick: () => { bubbled++ } }, createElement(PersonFace, { value: { kind: 'user', name: '成员', accountId: 'member-account', url: 'https://example.com/profile' } })))
    })
    const button = container.querySelector<HTMLButtonElement>('button.fsdb-person')
    assert.ok(button, 'known workspace members are inspector buttons')
    assert.equal(container.querySelector('a'), null)
    await act(async () => { button.click() })
    assert.match(getInspectorDbPath('database:/workspace-members'), /\/workspace-members\/(?:view\/[^/]+\/)?record\/member-account$/)
    assert.equal(opened, 1)
    assert.equal(bubbled, 0, 'member clicks do not open the surrounding cell editor')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    window.removeEventListener('biu:inspector-open', open)
    localStorage.clear()
    resetInspectorDbPathMemory()
  }
})

test('user person cells render AiAvatar mesh instead of silhouette icon when no custom photo is set', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(createElement(PersonFace, { value: { kind: 'user', name: '97', accountId: 'acc_97' } }))
    })
    const aiAvatar = container.querySelector('svg[data-ai-avatar="mesh"]')
    assert.ok(aiAvatar, 'user without custom photo renders multi-color AiAvatar')
    assert.equal(container.querySelector('.fsdb-person-avatar'), null)

    await act(async () => {
      root.render(createElement(PersonFace, { value: { kind: 'system', name: '系统' } }))
    })
    assert.ok(container.querySelector('.fsdb-person-avatar'), 'system keeps system chip avatar')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
