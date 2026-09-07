import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isSidebarFlyoutIgnoreTarget, isSidebarFlyoutKeepTarget, shouldKeepSidebarFlyout } from './sidebar-flyout.ts'

test('only the upper-middle left edge wakes the flyout', () => {
  const vh = 1000
  assert.equal(shouldKeepSidebarFlyout(8, 300, false, 240, 1200, vh), true)
  assert.equal(shouldKeepSidebarFlyout(20, 400, false, 240, 1200, vh), true)
  assert.equal(shouldKeepSidebarFlyout(8, 500, false, 240, 1200, vh), false)
  assert.equal(shouldKeepSidebarFlyout(8, 80, false, 240, 1200, vh), false)
  assert.equal(shouldKeepSidebarFlyout(21, 300, false, 240, 1200, vh), false)
})

test('once peeking, the full panel width keeps the flyout', () => {
  assert.equal(shouldKeepSidebarFlyout(180, 500, true, 240, 1200, 1000), true)
  assert.equal(shouldKeepSidebarFlyout(248, 80, true, 240, 1200, 1000), true)
  assert.equal(shouldKeepSidebarFlyout(260, 300, true, 240, 1200, 1000), false)
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

test('composer mascot popover does not count as the sidebar flyout', () => {
  const host = document.createElement('div')
  const cluster = document.createElement('div')
  cluster.className = 'brand-corner-cluster'
  const menu = document.createElement('div')
  menu.className = 'chat-sidebar-popover brand-agent-menu'
  cluster.append(menu)
  document.body.append(host, cluster)
  assert.equal(isSidebarFlyoutIgnoreTarget(menu), true)
  assert.equal(isSidebarFlyoutKeepTarget(menu, host), false)
  host.remove()
  cluster.remove()
})
