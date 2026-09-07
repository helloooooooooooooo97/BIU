import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isSidebarFlyoutKeepTarget, shouldKeepSidebarFlyout } from './sidebar-flyout.ts'

test('left edge keeps flyout even before it is open', () => {
  assert.equal(shouldKeepSidebarFlyout(8, false, 240), true)
  assert.equal(shouldKeepSidebarFlyout(20, false, 240), true)
  assert.equal(shouldKeepSidebarFlyout(21, false, 240), false)
})

test('once peeking, the full panel width keeps the flyout', () => {
  assert.equal(shouldKeepSidebarFlyout(180, true, 240), true)
  assert.equal(shouldKeepSidebarFlyout(248, true, 240), true)
  assert.equal(shouldKeepSidebarFlyout(260, true, 240), false)
})

test('portaled sidebar menus still count as inside', () => {
  const host = document.createElement('div')
  const menu = document.createElement('div')
  menu.className = 'brand-agent-menu'
  document.body.append(host, menu)
  assert.equal(isSidebarFlyoutKeepTarget(menu, host), true)
  assert.equal(isSidebarFlyoutKeepTarget(document.body, host), false)
  host.remove()
  menu.remove()
})
