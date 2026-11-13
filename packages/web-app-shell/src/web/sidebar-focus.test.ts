import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FOCUS_SHELL_SIDEBAR, FOCUS_SHELL_TABLE, focusShellSidebar, sidebarStops, stepSidebarStop } from './sidebar-focus.ts'

test('narrow session mascots stay arrow stops', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <aside class="app-side-bar is-narrow">
      <div class="shell-side-places">
        <button class="app-side-actions-item is-active" data-id="chat">会话</button>
      </div>
      <div class="chat-session-row is-active">
        <a class="chat-session-row-main" href="/agents/a" data-id="mascot-a">会话甲</a>
      </div>
      <div class="chat-session-row">
        <a class="chat-session-row-main" href="/agents/b" data-id="mascot-b">会话乙</a>
      </div>
    </aside>
  `
  document.body.append(root)
  assert.equal(focusShellSidebar(root), true)
  assert.equal(document.activeElement?.getAttribute('data-id'), 'mascot-a')
  const stops = sidebarStops(root)
  assert.equal(stops.map((el) => el.getAttribute('data-id')).join(','), 'chat,mascot-a,mascot-b')
  assert.equal(stepSidebarStop(stops, document.activeElement, 1)?.getAttribute('data-id'), 'mascot-b')
  root.remove()
})

test('narrow data rail is a stop so left from the table can land on collection icons', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <aside class="app-side-bar is-narrow">
      <div class="shell-side-places">
        <button class="app-side-actions-item is-active" data-id="data">数据</button>
      </div>
      <nav class="fsdb-icon-rail">
        <button class="fsdb-icon-rail-btn" data-id="pages">页面</button>
        <button class="fsdb-icon-rail-btn is-active" data-id="data-all">全部数据</button>
      </nav>
    </aside>
  `
  document.body.append(root)
  assert.equal(focusShellSidebar(root), true)
  assert.equal(document.activeElement?.getAttribute('data-id'), 'data-all')
  const stops = sidebarStops(root)
  assert.equal(stops.map((el) => el.getAttribute('data-id')).join(','), 'data,pages,data-all')
  root.remove()
})

test('focusShellSidebar lands on the active list row, not a random place', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <div class="shell-side-places">
      <button class="app-side-actions-item" data-id="search">搜索</button>
      <button class="app-side-actions-item is-active" data-id="data">数据</button>
    </div>
    <div class="chat-session-row">
      <button class="chat-session-row-main" data-id="other">其他</button>
    </div>
    <div class="chat-session-row is-active">
      <button class="min-w-0 flex-1" data-id="current">当前视图</button>
    </div>
  `
  document.body.append(root)
  assert.equal(FOCUS_SHELL_SIDEBAR, 'biu:focus-shell-sidebar')
  assert.equal(FOCUS_SHELL_TABLE, 'biu:focus-shell-table')
  assert.equal(focusShellSidebar(root), true)
  assert.equal(document.activeElement?.getAttribute('data-id'), 'current')
  const stops = sidebarStops(root)
  assert.equal(stops.length, 4)
  assert.equal(stepSidebarStop(stops, document.activeElement, -1)?.getAttribute('data-id'), 'other')
  root.remove()
})

test('sidebar frame listens for table leave and returns with ArrowRight', () => {
  const frame = readFileSync(resolve(import.meta.dirname, './shell-sidebar-frame.tsx'), 'utf8')
  const chrome = readFileSync(resolve(import.meta.dirname, './shell-chrome.tsx'), 'utf8')
  assert.match(frame, /FOCUS_SHELL_SIDEBAR/)
  assert.match(frame, /FOCUS_SHELL_TABLE/)
  assert.match(frame, /focusShellSidebar\(host\)/)
  assert.match(frame, /event\.preventDefault\(\)/)
  assert.match(chrome, /最左格进入侧栏/)
  assert.match(chrome, /侧栏切换入口/)
})
