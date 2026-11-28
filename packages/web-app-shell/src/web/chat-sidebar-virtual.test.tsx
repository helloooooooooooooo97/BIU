import { afterEach, beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SessionListItem, SessionViewService } from '@biu/web-session-view'
import { ChatSidebar, resolveSidebarGroupProjectPath } from './chat-sidebar.tsx'

function makeSessions(count: number): SessionListItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sess-${i}`,
    title: `会话 ${i}`,
    eventCount: 1,
    updatedAt: count - i,
  }))
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
      }
      observe(el: Element) {
        const rect = el.getBoundingClientRect()
        this.cb(
          [{ target: el, contentRect: rect } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }
      unobserve() {}
      disconnect() {}
    },
  )
  const size = {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('data-chat-scroll') != null ? 400 : 29
    },
  }
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', size)
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', size)
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return 240
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('1000 sessions only paint a window of rows', async () => {
  const sessions = makeSessions(1000)
  const state = { sessions, sessionId: 'sess-0', busySessions: {} as Record<string, true> }
  const useSessionView = ((select: (s: typeof state) => unknown) => select(state)) as never
  const sessionView = {
    get: () => state,
    newSession: async () => 'x',
    load: async () => undefined,
    deleteSession: async () => undefined,
    setSessionPinned: async () => undefined,
  } as unknown as SessionViewService

  const result = render(
    <MemoryRouter>
      <ChatSidebar routeSessionId="sess-0" useSessionView={useSessionView} sessionView={sessionView} />
    </MemoryRouter>,
  )

  const windowEl = result.container.querySelector('[data-session-window]')
  assert.ok(windowEl)
  assert.equal(windowEl.getAttribute('data-session-window-count'), '1000')
  const painted = windowEl.querySelectorAll('.chat-session-row').length
  assert.ok(painted > 0, 'at least the viewport rows paint')
  assert.ok(painted < 80, `virtualizer must not paint 1000 rows, painted ${painted}`)

  const scroller = result.container.querySelector('[data-chat-scroll]') as HTMLElement
  assert.ok(scroller)
  await act(async () => {
    scroller.scrollTop = 29 * 400
    fireEvent.scroll(scroller)
  })
  const afterScroll = windowEl.querySelectorAll('.chat-session-row').length
  assert.ok(afterScroll > 0)
  assert.ok(afterScroll < 80, `scroll must stay windowed, painted ${afterScroll}`)
  const start = Number(windowEl.getAttribute('data-session-window-start'))
  assert.ok(start > 0, 'scrolling down must move the virtual window')
})

test('iconRail flattens pinned and regular sessions into one deduplicated window without section gaps', () => {
  const sessions: SessionListItem[] = [
    { id: 'pin-1', title: '收藏一', eventCount: 1, updatedAt: 10, pinned: true },
    { id: 'reg-1', title: '普通一', eventCount: 1, updatedAt: 9 },
    { id: 'pin-2', title: '收藏二', eventCount: 1, updatedAt: 8, pinned: true },
    { id: 'reg-2', title: '普通二', eventCount: 1, updatedAt: 7 },
  ]
  const state = { sessions, sessionId: 'pin-1', busySessions: {} as Record<string, true> }
  const useSessionView = ((select: (s: typeof state) => unknown) => select(state)) as never
  const sessionView = {
    get: () => state,
    newSession: async () => 'x',
    load: async () => undefined,
    deleteSession: async () => undefined,
    setSessionPinned: async () => undefined,
  } as unknown as SessionViewService

  const result = render(
    <MemoryRouter>
      <ChatSidebar routeSessionId="pin-1" useSessionView={useSessionView} sessionView={sessionView} iconRail />
    </MemoryRouter>,
  )

  const windows = result.container.querySelectorAll('[data-session-window]')
  assert.equal(windows.length, 1)
  assert.equal(windows[0]!.getAttribute('data-session-window-count'), '4')
  assert.equal(result.container.querySelectorAll('section').length, 0)
  const rows = result.container.querySelectorAll('.chat-session-row')
  assert.equal(rows.length, 4)
})

test('resolveSidebarGroupProjectPath maps legacy host paths into /workspace in cloud spaces', () => {
  assert.equal(
    resolveSidebarGroupProjectPath({ kind: 'project', label: 'hello', path: '/workspace/hello' }, true),
    '/workspace/hello',
  )
  assert.equal(
    resolveSidebarGroupProjectPath({ kind: 'project', label: 'hello', path: '/Users/a97/hello' }, true),
    '/workspace/hello',
  )
  assert.equal(
    resolveSidebarGroupProjectPath({ kind: 'project', label: 'hello', path: '/Users/a97/hello' }, false),
    '/Users/a97/hello',
  )
  assert.equal(
    resolveSidebarGroupProjectPath({ kind: 'ungrouped', label: '未分组' }, true),
    undefined,
  )
})
