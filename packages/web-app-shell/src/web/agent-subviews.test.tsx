/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SessionListItem, SessionViewService } from '@biu/web-session-view'
import { ChatSidebar } from './chat-sidebar.tsx'

function makeSession(id: string, title: string): SessionListItem {
  return { id, title, eventCount: 3, updatedAt: Date.now() }
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
        this.cb([{ target: el, contentRect: rect } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      unobserve() {}
      disconnect() {}
    },
  )
  const size = {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('data-chat-scroll') != null ? 480 : 33
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

describe('agent sidebar fold for trajectory & usage with in-place breadcrumb', () => {
  it('toggles trajectory and usage links under an agent row and links to ?view=trajectory / ?view=usage', () => {
    const sessions = [makeSession('s-1', '研发助手'), makeSession('s-2', '代码评审')]
    const state = { sessions, sessionId: 's-1', busySessions: {} as Record<string, true> }
    const useSessionView = ((select: (s: typeof state) => unknown) => select(state)) as never
    const sessionView = {
      get: () => state,
      newSession: async () => 'x',
      load: async () => undefined,
      deleteSession: async () => undefined,
      setSessionPinned: async () => undefined,
    } as unknown as SessionViewService

    const view = render(
      <MemoryRouter initialEntries={['/agents/s-1']}>
        <ChatSidebar routeSessionId="s-1" useSessionView={useSessionView} sessionView={sessionView} />
      </MemoryRouter>,
    )

    // Collapsed by default so unexpanded sessions do not render extra sub-rows
    assert.equal(view.queryByTestId('sidebar-session-subviews-s-1'), null)

    // Clicking the fold button expands 轨迹 and 用量 under that agent
    const foldBtn = view.getByTestId('sidebar-session-fold-s-1')
    assert.equal(foldBtn.getAttribute('aria-expanded'), 'false')
    fireEvent.click(foldBtn)
    assert.equal(foldBtn.getAttribute('aria-expanded'), 'true')

    const trajLink = view.getByTestId('sidebar-session-trajectory-s-1')
    const usageLink = view.getByTestId('sidebar-session-usage-s-1')
    assert.equal(trajLink.getAttribute('href'), '/agents/s-1?view=trajectory')
    assert.equal(usageLink.getAttribute('href'), '/agents/s-1?view=usage')

    // Clicking again collapses it cleanly
    fireEvent.click(foldBtn)
    assert.equal(view.queryByTestId('sidebar-session-subviews-s-1'), null)
  })

  it('auto-expands the active agent when ?view=usage is active and highlights only the sub-item', () => {
    const sessions = [makeSession('s-1', '研发助手')]
    const state = { sessions, sessionId: 's-1', busySessions: {} as Record<string, true> }
    const useSessionView = ((select: (s: typeof state) => unknown) => select(state)) as never
    const sessionView = {
      get: () => state,
      newSession: async () => 'x',
      load: async () => undefined,
      deleteSession: async () => undefined,
      setSessionPinned: async () => undefined,
    } as unknown as SessionViewService

    const view = render(
      <MemoryRouter initialEntries={['/agents/s-1?view=usage']}>
        <ChatSidebar routeSessionId="s-1" useSessionView={useSessionView} sessionView={sessionView} />
      </MemoryRouter>,
    )

    const usageLink = view.getByTestId('sidebar-session-usage-s-1')
    assert.ok(usageLink.closest('.chat-session-row')?.classList.contains('is-active'))
    const parentRow = view.container.querySelector('[data-biu-kind="session"][data-biu-id="s-1"]')
    assert.equal(parentRow?.classList.contains('is-active'), false)
  })

  it('wires in-place trajectory/usage stage, breadcrumb header, and retires right-inspector tabs', () => {
    const shell = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
    const inspector = readFileSync(resolve(import.meta.dirname, './session-inspector.tsx'), 'utf8')
    assert.match(shell, /usage:\s*\{\s*kind:\s*'list'\s*\}/)
    assert.match(shell, /data-testid="agent-view-breadcrumb"/)
    assert.match(shell, /data-testid="agent-breadcrumb-parent"/)
    assert.match(shell, /data-testid="agent-view-crumb"/)
    assert.match(shell, /data-testid="agent-stage-trajectory"/)
    assert.match(shell, /data-testid="agent-stage-usage"/)
    assert.match(inspector, /new Set\(\['traj', 'usage'\]\)/)
  })
})
