import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  UNGROUPED_PROJECT_KEY,
  buildSidebarSections,
  folderNameFromPath,
  groupSessionsByProject,
  mostRecentSessionId,
} from './session-groups.ts'
import type { SessionListItem } from './index.ts'

function item(partial: Partial<SessionListItem> & { id: string }): SessionListItem {
  return {
    title: partial.title ?? partial.id,
    eventCount: partial.eventCount ?? 1,
    updatedAt: partial.updatedAt ?? 0,
    ...partial,
  }
}

test('groupSessionsByProject groups by path and puts bare chats in Ungrouped', () => {
  const groups = groupSessionsByProject([
    item({ id: 'a', updatedAt: 10, project: { name: 'alpha', path: '/tmp/alpha', boundAt: 1 } }),
    item({ id: 'b', updatedAt: 20, project: { name: 'beta', path: '/tmp/beta', boundAt: 1 } }),
    item({ id: 'c', updatedAt: 30 }),
  ])
  assert.deepEqual(
    groups.map((group) => group.key),
    ['/tmp/beta', '/tmp/alpha', UNGROUPED_PROJECT_KEY],
  )
  assert.deepEqual(
    groups.at(-1)?.sessions.map((row) => row.id),
    ['c'],
  )
  assert.equal(groups.at(-1)?.kind, 'ungrouped')
})

test('project sidebar keeps an empty ungrouped row so a chat can be added without a project', () => {
  const onlyProjects = groupSessionsByProject([
    item({ id: 'a', updatedAt: 2, project: { name: 'alpha', path: '/tmp/alpha', boundAt: 1 } }),
  ])
  assert.equal(onlyProjects.at(-1)?.key, UNGROUPED_PROJECT_KEY)
  assert.equal(onlyProjects.at(-1)?.label, '未分组')
  assert.deepEqual(onlyProjects.at(-1)?.sessions, [])

  const none = groupSessionsByProject([])
  assert.equal(none.length, 1)
  assert.equal(none[0]?.key, UNGROUPED_PROJECT_KEY)
  assert.deepEqual(none[0]?.sessions, [])
})

test('sidebar order follows the latest user or assistant message, not later tool saves', () => {
  const groups = groupSessionsByProject([
    item({ id: 'tooling', title: '工具中', updatedAt: 90, lastMessageAt: 10 }),
    item({ id: 'just-sent', title: '刚发', updatedAt: 20, lastMessageAt: 40 }),
    item({ id: 'empty', title: '还没说话', updatedAt: 30 }),
  ])
  assert.deepEqual(
    groups[0]?.sessions.map((row) => row.id),
    ['just-sent', 'empty', 'tooling'],
  )
})

test('pinned rows sort first inside a project group', () => {
  const groups = groupSessionsByProject([
    item({ id: 'old', updatedAt: 10, project: { name: 'a', path: '/a', boundAt: 1 } }),
    item({ id: 'pin', updatedAt: 5, pinned: true, project: { name: 'a', path: '/a', boundAt: 1 } }),
    item({ id: 'new', updatedAt: 20, project: { name: 'a', path: '/a', boundAt: 1 } }),
  ])
  assert.deepEqual(
    groups[0]?.sessions.map((row) => row.id),
    ['pin', 'new', 'old'],
  )
})

test('folderNameFromPath takes the last segment', () => {
  assert.equal(folderNameFromPath('/Users/me/work/cordis-web/'), 'cordis-web')
  assert.equal(folderNameFromPath('C:\\repos\\demo'), 'demo')
})

test('mostRecentSessionId ignores pins and breaks ties by id', () => {
  assert.equal(
    mostRecentSessionId([
      item({ id: 'b', updatedAt: 5, pinned: true }),
      item({ id: 'a', updatedAt: 5 }),
      item({ id: 'c', updatedAt: 1 }),
    ]),
    'a',
  )
  assert.equal(mostRecentSessionId([]), undefined)
})

test('buildSidebarSections puts pinned rows in their own section above projects', () => {
  const sections = buildSidebarSections([
    item({ id: 'a', updatedAt: 2, pinned: true, project: { name: 'x', path: '/x', boundAt: 1 } }),
    item({ id: 'b', updatedAt: 9, project: { name: 'x', path: '/x', boundAt: 1 } }),
  ])
  assert.deepEqual(
    sections.map((section) => section.kind),
    ['pinned', 'project'],
  )
  assert.deepEqual(
    sections[0]?.sessions?.map((row) => row.id),
    ['a'],
  )
  assert.equal(sections[0]?.label, '收藏')
  // 收藏行仍然留在项目分组里，分组自己不重复出现「收藏」
  assert.deepEqual(
    sections[1]?.groups?.map((group) => group.key),
    ['/x', UNGROUPED_PROJECT_KEY],
  )
})

test('buildSidebarSections has no pinned section when nothing is pinned', () => {
  const sections = buildSidebarSections([item({ id: 'a', updatedAt: 2 })])
  assert.deepEqual(
    sections.map((section) => section.kind),
    ['project'],
  )
})
