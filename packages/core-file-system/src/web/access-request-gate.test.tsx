import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { accessRequestRoleOptions, isAccessRequestableCollection } from './access-request-gate.tsx'

test('isAccessRequestableCollection allows permission-managed collections and excludes personal/system ones', () => {
  for (const path of ['/pages', '/agents', '/tags', '/plugins', '/skills', '/mcp']) {
    assert.equal(isAccessRequestableCollection(path), true)
  }
  for (const path of ['/notices', '/workspace-members', '/trash', '/views', '']) {
    assert.equal(isAccessRequestableCollection(path), false)
  }
})

test('accessRequestRoleOptions omits commenter for /agents and includes viewer/commenter/editor elsewhere', () => {
  assert.deepEqual(
    accessRequestRoleOptions('/agents').map((o) => o.value),
    ['viewer', 'editor'],
  )
  assert.deepEqual(
    accessRequestRoleOptions('/pages').map((o) => o.value),
    ['viewer', 'commenter', 'editor'],
  )
  assert.deepEqual(
    accessRequestRoleOptions('/plugins').map((o) => o.value),
    ['viewer', 'commenter', 'editor'],
  )
})

test('browser 404 on cloud requestable collections renders AccessRequestGate and viewer detail shows AccessUpgradeBar', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const stage = readFileSync(resolve(import.meta.dirname, './browser-record-stage.tsx'), 'utf8')
  const gate = readFileSync(resolve(import.meta.dirname, './access-request-gate.tsx'), 'utf8')
  assert.match(browser, /!localData && isAccessRequestableCollection\(collectionPath\)/)
  assert.match(browser, /setDetailAccessDenied\(true\)/)
  assert.match(stage, /<AccessRequestGate/)
  assert.match(stage, /<AccessUpgradeBar/)
  assert.match(gate, /暂无访问权限或内容不存在/)
  assert.match(gate, /data-testid="fsdb-access-request-gate"/)
  assert.match(gate, /data-testid="fsdb-access-upgrade-bar"/)
})
