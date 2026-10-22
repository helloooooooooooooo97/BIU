import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('data sidebar chrome mounts without waiting for the main list', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const idle = browser.slice(browser.indexOf('function IdleDataSidebar'), browser.indexOf('function ShareButton'))
  assert.doesNotMatch(idle, /isPaintedListReady/)
  assert.doesNotMatch(idle, /fsdb:list-ready/)
  assert.doesNotMatch(idle, /requestIdleCallback/)
  assert.doesNotMatch(idle, /return null/)
  assert.match(browser, /fallback=\{<DataSidebarShell/)
  const shell = readFileSync(resolve(import.meta.dirname, './data-sidebar-shell.tsx'), 'utf8')
  assert.match(shell, /用户数据/)
  assert.match(shell, /索引数据/)
  assert.match(shell, /系统数据/)
  assert.match(shell, /收藏/)
  assert.match(shell, /sortDataCollections/)
})
