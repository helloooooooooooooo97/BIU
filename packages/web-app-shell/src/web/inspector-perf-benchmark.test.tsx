import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { INSPECTOR_KEEP_ALIVE_LIMIT, touchInspectorMountedPanes } from './inspector-panels.ts'
import { InspectorStagePane } from './session-inspector.tsx'

/**
 * 100 个详情 Tab 的右侧检查器性能对比压测：
 * 对比优化前（全量 100 个详情常驻挂载 + 每 Tab 独立 window 监听 + 未 memo 头部 Tab）
 * 与优化后（懒挂载 + LRU=5 保活池 + 共享事件中枢 + memo 轻量化头部 Tab）。
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function makeDetailIds(count: number) {
  return Array.from({ length: count }, (_, i) => `database:/pages::detail-${i}`)
}

/** 模拟每个详情页的真实重量级子树（编辑器 + 属性栏 + 3 个全局 window 监听 + 首屏拉取） */
function DetailPaneBody({
  paneId,
  onFetch,
  onEventHit,
  useSharedHub,
  sharedListeners,
}: {
  paneId: string
  onFetch: () => void
  onEventHit: () => void
  useSharedHub: boolean
  sharedListeners?: Set<() => void>
}) {
  useEffect(() => {
    onFetch()
    if (useSharedHub && sharedListeners) {
      const hit = () => onEventHit()
      sharedListeners.add(hit)
      return () => {
        sharedListeners.delete(hit)
      }
    }
    const onFsdb = () => onEventHit()
    const onKey = () => onEventHit()
    const onStorage = () => onEventHit()
    window.addEventListener('fsdb:change', onFsdb)
    window.addEventListener('keydown', onKey)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('fsdb:change', onFsdb)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('storage', onStorage)
    }
  }, [onEventHit, onFetch, paneId, sharedListeners, useSharedHub])

  return (
    <article data-detail-pane={paneId}>
      <header>
        <h2>详情 {paneId}</h2>
      </header>
      <div className="props">
        {Array.from({ length: 8 }, (_, idx) => (
          <div key={idx} className="prop-row">
            <span>属性 {idx}</span>
            <span>值 {idx}</span>
          </div>
        ))}
      </div>
      <div className="editor">
        {Array.from({ length: 6 }, (_, idx) => (
          <p key={idx}>正文段落 {idx} — {paneId}</p>
        ))}
      </div>
    </article>
  )
}

function UnmemoTab({
  id,
  active,
  onSelect,
  onRender,
}: {
  id: string
  active: boolean
  onSelect: () => void
  onRender: () => void
}) {
  onRender()
  // 模拟优化前每次渲染调 2 次 crumbsForRoute 的列表构建开销
  const choices = Array.from({ length: 20 }, (_, i) => `${id}-opt-${i}`)
  return (
    <button type="button" data-tab={id} data-active={active ? '1' : '0'} data-choices={choices.length} onClick={onSelect}>
      {id}
    </button>
  )
}

const MemoLightTab = memo(function MemoLightTab({
  id,
  active,
  onSelect,
  onRender,
}: {
  id: string
  active: boolean
  onSelect: () => void
  onRender: () => void
}) {
  onRender()
  // 优化后：非激活 Tab 走 lightweight 模式，不构建下拉菜单选项列表
  const choicesLen = active ? 20 : 1
  return (
    <button type="button" data-tab={id} data-active={active ? '1' : '0'} data-choices={choicesLen} onClick={onSelect}>
      {id}
    </button>
  )
})

function runScenario(mode: 'before' | 'after', count = 100) {
  const ids = makeDetailIds(count)
  let windowAddCalls = 0
  let fetches = 0
  let eventHits = 0
  let tabRenders = 0

  const origAdd = window.addEventListener.bind(window)
  const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation((...args: Parameters<typeof window.addEventListener>) => {
    windowAddCalls += 1
    return origAdd(...args)
  })

  const sharedListeners = new Set<() => void>()
  let sharedUninstall: (() => void) | null = null
  if (mode === 'after') {
    const dispatch = () => {
      for (const fn of sharedListeners) fn()
    }
    window.addEventListener('fsdb:change', dispatch)
    window.addEventListener('keydown', dispatch)
    window.addEventListener('storage', dispatch)
    sharedUninstall = () => {
      window.removeEventListener('fsdb:change', dispatch)
      window.removeEventListener('keydown', dispatch)
      window.removeEventListener('storage', dispatch)
    }
  }

  let selectTabExtern: ((id: string) => void) | null = null

  function Harness() {
    const [active, setActive] = useState(ids[0]!)
    selectTabExtern = setActive
    const mountedRef = useRef<string[]>([])
    const mountedSet = useMemo(() => {
      if (mode === 'before') return new Set(ids)
      const next = touchInspectorMountedPanes(mountedRef.current, active, ids, INSPECTOR_KEEP_ALIVE_LIMIT)
      mountedRef.current = next
      return new Set(next)
    }, [active])

    const handlersRef = useRef(new Map<string, () => void>())
    const getSelect = (id: string) => {
      let fn = handlersRef.current.get(id)
      if (!fn) {
        fn = () => setActive(id)
        handlersRef.current.set(id, fn)
      }
      return fn
    }

    const onFetch = useMemo(() => () => { fetches += 1 }, [])
    const onEventHit = useMemo(() => () => { eventHits += 1 }, [])
    const onTabRender = useMemo(() => () => { tabRenders += 1 }, [])

    const paintRef = useRef<(paneId: string) => ReactNode>(() => null)
    paintRef.current = (paneId) => (
      <DetailPaneBody
        paneId={paneId}
        onFetch={onFetch}
        onEventHit={onEventHit}
        useSharedHub={mode === 'after'}
        sharedListeners={sharedListeners}
      />
    )

    return (
      <div>
        <div className="inspector-tabs">
          {ids.map((id) =>
            mode === 'before' ? (
              <UnmemoTab key={id} id={id} active={id === active} onSelect={() => setActive(id)} onRender={onTabRender} />
            ) : (
              <MemoLightTab key={id} id={id} active={id === active} onSelect={getSelect(id)} onRender={onTabRender} />
            ),
          )}
        </div>
        <div className="inspector-stage">
          {ids.map((id) =>
            mountedSet.has(id) ? (
              <InspectorStagePane key={id} paneId={id} active={id === active} paintRef={paintRef} />
            ) : null,
          )}
        </div>
      </div>
    )
  }

  const t0 = performance.now()
  const view = render(<Harness />)
  const initialMountMs = performance.now() - t0
  const initialMountedPanes = view.container.querySelectorAll('[data-detail-pane]').length
  const initialStageDomNodes = view.container.querySelector('.inspector-stage')!.querySelectorAll('*').length
  const initialFetches = fetches
  const initialWindowListeners = windowAddCalls

  // 连续切换 20 个不同详情 Tab
  tabRenders = 0
  let peakMountedPanes = initialMountedPanes
  const tSwitch0 = performance.now()
  for (let i = 1; i <= 20; i += 1) {
    act(() => {
      selectTabExtern?.(ids[i]!)
    })
    const live = view.container.querySelectorAll('[data-detail-pane]').length
    if (live > peakMountedPanes) peakMountedPanes = live
  }
  const switch20Ms = performance.now() - tSwitch0
  const switch20TabRenders = tabRenders

  // 触发 30 次 fsdb:change 数据变更广播
  eventHits = 0
  const tEvt0 = performance.now()
  for (let i = 0; i < 30; i += 1) {
    act(() => {
      window.dispatchEvent(new CustomEvent('fsdb:change', { detail: { scope: 'records' } }))
    })
  }
  const broadcast30Ms = performance.now() - tEvt0
  const broadcast30Hits = eventHits
  const finalStageDomNodes = view.container.querySelector('.inspector-stage')!.querySelectorAll('*').length

  view.unmount()
  sharedUninstall?.()
  addSpy.mockRestore()

  return {
    initialMountedPanes,
    peakMountedPanes,
    initialFetches,
    initialStageDomNodes,
    finalStageDomNodes,
    initialWindowListeners,
    initialMountMs: Number(initialMountMs.toFixed(2)),
    switch20TabRenders,
    switch20Ms: Number(switch20Ms.toFixed(2)),
    broadcast30Hits,
    broadcast30Ms: Number(broadcast30Ms.toFixed(2)),
  }
}

test('100-detail-tab inspector benchmark: before vs after optimization', () => {
  // Verify LRU helper semantics directly
  expect(touchInspectorMountedPanes([], 'a', ['a', 'b', 'c'], 5)).toEqual(['a'])
  expect(touchInspectorMountedPanes(['a', 'b', 'c', 'd', 'e'], 'f', ['a', 'b', 'c', 'd', 'e', 'f'], 5)).toEqual([
    'b', 'c', 'd', 'e', 'f',
  ])
  expect(touchInspectorMountedPanes(['a', 'b', 'c'], 'a', ['a', 'b', 'c'], 5)).toEqual(['b', 'c', 'a'])

  const before = runScenario('before', 100)
  const after = runScenario('after', 100)

  console.log('=== 100-TAB INSPECTOR BENCHMARK (BEFORE vs AFTER) ===\n' + JSON.stringify({ before, after }, null, 2))

  // Assertions verifying dramatic O(N) -> O(1) improvements
  expect(before.initialMountedPanes).toBe(100)
  expect(after.initialMountedPanes).toBe(1)

  expect(before.peakMountedPanes).toBe(100)
  expect(after.peakMountedPanes).toBe(INSPECTOR_KEEP_ALIVE_LIMIT)

  expect(before.initialFetches).toBe(100)
  expect(after.initialFetches).toBe(1)

  expect(after.finalStageDomNodes).toBeLessThan(before.finalStageDomNodes / 15)
  expect(after.initialWindowListeners).toBeLessThan(10)
  expect(before.initialWindowListeners).toBeGreaterThanOrEqual(300)

  expect(before.switch20TabRenders).toBe(2000)
  expect(after.switch20TabRenders).toBe(40)

  expect(before.broadcast30Hits).toBe(3000)
  expect(after.broadcast30Hits).toBe(30 * INSPECTOR_KEEP_ALIVE_LIMIT)
})
