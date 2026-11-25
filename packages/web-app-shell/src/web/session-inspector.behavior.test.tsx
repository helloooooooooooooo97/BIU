import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { bindSessionView, type SessionViewService } from '@biu/web-session-view'
import type { SlotsService } from '@biu/web-slots'
import type { SlotEntry, SlotProps } from '@biu/types/slots'
import { SessionInspector } from './session-inspector.tsx'

const hits = new Map<string, number>()

function Pane({ paneId }: SlotProps) {
  const id = String(paneId ?? '')
  hits.set(id, (hits.get(id) ?? 0) + 1)
  return <article data-pane={id}>页面 {id}</article>
}

function entry(id: string, label: string, repeatable = false): SlotEntry {
  return {
    id,
    name: 'inspector-panels',
    order: 0,
    Component: Pane,
    props: () => ({
      tabId: id,
      tabLabel: label,
      requiresSession: true,
      centerKinds: ['session'],
      repeatable,
    }),
    children: [],
  }
}

function harness() {
  const pages = 'database:/pages::one'
  const tags = 'database:/tags'
  let state = {
    sessionId: 's1',
    sessions: [{ id: 's1', title: '会话', mascot: null, inspector: { tab: pages, opened: [pages, tags], dbPaths: {} } }],
    busySessions: {},
    focusCallId: null,
    inspectorReady: true,
    sessionInspector: { tab: pages, opened: [pages, tags], dbPaths: {} },
  }
  const listeners = new Set<() => void>()
  const publish = () => listeners.forEach((fn) => fn())
  const source = {
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    get: () => state,
    async patchInspector(_id: string, bind: { tab?: string; opened?: string[] }) {
      state = { ...state, sessionInspector: { ...state.sessionInspector, ...bind } }
      publish()
    },
    clearInspectCall() {},
    ensureTrajectory() {},
    releaseTrajectory() {},
  }
  const slots = {
    subscribe(_name: string, _event: string, fn: () => void) {
      return () => fn()
    },
    getVersion: () => 1,
    list: () => [entry('database:/pages', '页面', true), entry('database:/tags', '标签')],
  }
  const widths: number[] = []
  const view = render(
    <div data-testid="app-shell">
      <SessionInspector
        open
        width={360}
        onWidthChange={(next) => widths.push(next)}
        useSessionView={bindSessionView(source as unknown as SessionViewService)}
        sessionView={source as unknown as SessionViewService}
        slots={slots as unknown as SlotsService}
        renderSlot={() => null}
      />
    </div>,
  )
  return { view, widths, pages, tags }
}

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = () => {}
})

afterEach(() => {
  cleanup()
  hits.clear()
  vi.restoreAllMocks()
})

test('opened inspector pages lazy-mount on activation and keep recently visited panes mounted', () => {
  const { view, pages, tags } = harness()
  // Initially only the active pane is mounted (lazy mount avoids 100-tab request storms)
  expect(view.getByTestId(`inspector-${pages}`).querySelector('[data-pane]')?.getAttribute('data-pane')).toBe(pages)
  expect(view.queryByTestId(`inspector-${tags}`)).toBeNull()
  expect(view.getByTestId(`inspector-${pages}`).className).toContain('is-active')
  expect(view.getByTestId('inspector-catalog').getAttribute('aria-hidden')).toBe('true')

  // Switching to tags mounts tags and keeps pages mounted in the LRU pool (hidden)
  fireEvent.click(view.getByTestId(`inspector-tab-${tags}`).querySelector('button')!)
  expect(view.getByTestId(`inspector-${tags}`).querySelector('[data-pane]')?.getAttribute('data-pane')).toBe(tags)
  expect(view.getByTestId(`inspector-${tags}`).className).toContain('is-active')
  expect(view.getByTestId(`inspector-${pages}`).getAttribute('aria-hidden')).toBe('true')
})

test('switching, closing, and resizing the inspector', () => {
  const { view, widths, pages, tags } = harness()
  hits.clear()
  fireEvent.click(view.getByTestId(`inspector-tab-${tags}`).querySelector('button')!)
  expect(view.getByTestId(`inspector-${tags}`).className).toContain('is-active')
  expect(view.getByTestId(`inspector-${pages}`).getAttribute('aria-hidden')).toBe('true')
  expect((hits.get(pages) ?? 0) + (hits.get(tags) ?? 0)).toBe(2)

  hits.clear()
  fireEvent.click(view.getByTestId(`inspector-tab-close-${pages}`))
  expect(view.container.querySelector(`[data-pane="${pages}"]`)).toBeNull()
  expect(view.getByTestId(`inspector-${tags}`).className).toContain('is-active')
  expect(hits.get(tags) ?? 0).toBe(0)
  expect(hits.has(pages)).toBe(false)

  fireEvent.pointerDown(view.getByTestId('inspector-resize'), { clientX: 400, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 460 })
  fireEvent.pointerUp(window)
  expect(widths.at(-1)).toBe(300)
})

test('the add menu reuses a page that is already open', () => {
  const { view, pages } = harness()
  fireEvent.click(view.getByTestId('inspector-add'))
  expect(view.getByTestId('inspector-add-menu')).toBeTruthy()
  fireEvent.click(view.getByTestId('inspector-offer-add-database:/pages'))
  expect(view.container.querySelectorAll('[role="tab"]').length).toBe(2)
  expect(view.container.querySelectorAll('[data-pane]').length).toBe(1)
  expect(view.getByTestId(`inspector-${pages}`).className).toContain('is-active')
})

test('a closed inspector is hidden', () => {
  const state = {
    sessionId: 's1',
    sessions: [{ id: 's1', title: '会话', mascot: null }],
    busySessions: {},
    focusCallId: null,
    inspectorReady: true,
    sessionInspector: { tab: '', opened: [] as string[], dbPaths: {} },
  }
  const source = {
    subscribe: () => () => {},
    get: () => state,
    patchInspector: async () => {},
    clearInspectCall() {},
    ensureTrajectory() {},
    releaseTrajectory() {},
  }
  const view = render(
    <SessionInspector
      open={false}
      width={360}
      onWidthChange={() => {}}
      useSessionView={bindSessionView(source as unknown as SessionViewService)}
      sessionView={source as unknown as SessionViewService}
      slots={{
        subscribe: () => () => {},
        getVersion: () => 1,
        list: () => [entry('database:/pages', '页面', true)],
      } as unknown as SlotsService}
      renderSlot={() => null}
    />,
  )
  expect(view.getByTestId('session-inspector').getAttribute('aria-hidden')).toBe('true')
  expect(view.getByTestId('session-inspector').className).toContain('is-closed')
})

test('persists and restores inspector tabs locally when session inspector is not ready (e.g. database route refresh)', () => {
  window.localStorage.removeItem('biu.inspector.bind')
  const state = {
    sessionId: 's1',
    sessions: [{ id: 's1', title: '会话', mascot: null }],
    busySessions: {},
    focusCallId: null,
    inspectorReady: false,
    sessionInspector: undefined,
  }
  const source = {
    subscribe: () => () => {},
    get: () => state,
    patchInspector: async () => {},
    clearInspectCall() {},
    ensureTrajectory() {},
    releaseTrajectory() {},
  }
  const slots = {
    subscribe: () => () => {},
    getVersion: () => 1,
    list: () => [
      {
        id: 'database:/pages',
        name: 'inspector-panels',
        order: 0,
        Component: Pane,
        props: () => ({ tabId: 'database:/pages', tabLabel: '页面', requiresSession: false, centerKinds: ['session', 'database'], repeatable: true }),
        children: [],
      },
    ],
  }

  const first = render(
    <SessionInspector
      open
      width={360}
      onWidthChange={() => {}}
      useSessionView={bindSessionView(source as unknown as SessionViewService)}
      sessionView={source as unknown as SessionViewService}
      slots={slots as unknown as SlotsService}
      renderSlot={() => null}
    />,
  )

  fireEvent(window, new CustomEvent('biu:inspector-tab', { detail: 'database:/pages::rec1' }))
  expect(first.getByTestId('inspector-database:/pages::rec1').className).toContain('is-active')
  const saved = JSON.parse(window.localStorage.getItem('biu.inspector.bind') || '{}')
  expect(saved.tab).toBe('database:/pages::rec1')
  expect(saved.opened).toEqual(['database:/pages::rec1'])

  first.unmount()

  const second = render(
    <SessionInspector
      open
      width={360}
      onWidthChange={() => {}}
      useSessionView={bindSessionView(source as unknown as SessionViewService)}
      sessionView={source as unknown as SessionViewService}
      slots={slots as unknown as SlotsService}
      renderSlot={() => null}
    />,
  )
  expect(second.getByTestId('inspector-database:/pages::rec1').className).toContain('is-active')
  window.localStorage.removeItem('biu.inspector.bind')
})
