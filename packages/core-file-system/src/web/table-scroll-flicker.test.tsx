// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { TABLE_ROW_PX, TABLE_VIEWPORT_OVERSCAN } from './table-window.ts'

afterEach(() => cleanup())

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    private cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }
    observe(target: Element) {
      this.cb([{ target } as ResizeObserverEntry], this)
    }
    unobserve() {}
    disconnect() {}
  }
}

type BenchNode = { key: string; kind: 'group-head' | 'row' | 'summary' | 'group-pager'; actualPx: number }

function buildGroupedNodes(groups = 8, rowsPerGroup = 20): BenchNode[] {
  const out: BenchNode[] = []
  for (let g = 0; g < groups; g += 1) {
    out.push({ key: `gh:${g}`, kind: 'group-head', actualPx: 33 })
    for (let r = 0; r < rowsPerGroup; r += 1) {
      out.push({ key: `r:${g}:${r}`, kind: 'row', actualPx: 32 })
    }
    out.push({ key: `gs:${g}`, kind: 'summary', actualPx: 32 })
    out.push({ key: `gp:${g}`, kind: 'group-pager', actualPx: 32 })
  }
  return out
}

type FlickerMetrics = {
  scrollSteps: number
  scrollTopHijacks: number
  totalScrollJumpPx: number
  maxSingleJumpPx: number
  totalEstimateDriftPx: number
  maxRowDriftPx: number
  elapsedMs: number
}

function runScrollFlickerScenario(mode: 'before' | 'after'): FlickerMetrics {
  const nodes = buildGroupedNodes(8, 20)
  const hijacks: number[] = []
  let settingByUser = false
  let scrollTopVal = 0

  function Harness() {
    const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
    const attach = (el: HTMLDivElement | null) => {
      if (!el || el === scroller) return
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: 560 })
      Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => scrollTopVal,
        set: (next: number) => {
          const n = Number(next) || 0
          if (!settingByUser && Math.abs(n - scrollTopVal) > 0.01) {
            hijacks.push(Math.abs(n - scrollTopVal))
          }
          scrollTopVal = n
        },
      })
      el.scrollTo = ((arg: ScrollToOptions | number, y?: number) => {
        const next = typeof arg === 'number' ? Number(y ?? arg) : Number(arg?.top ?? scrollTopVal)
        if (!settingByUser && Math.abs(next - scrollTopVal) > 0.01) {
          hijacks.push(Math.abs(next - scrollTopVal))
        }
        scrollTopVal = next
      }) as typeof el.scrollTo
      setScroller(el)
    }

    const virtualizer = useVirtualizer({
      count: nodes.length,
      getScrollElement: () => scroller,
      getItemKey: (i) => nodes[i]!.key,
      estimateSize: (i) => {
        const kind = nodes[i]!.kind
        if (mode === 'before') {
          return kind === 'group-head' ? 36 : kind === 'group-pager' ? 46 : 37
        }
        return kind === 'group-head' ? 33 : kind === 'group-pager' || kind === 'summary' ? 32 : TABLE_ROW_PX
      },
      overscan: TABLE_VIEWPORT_OVERSCAN,
      initialRect: { width: 800, height: 560 },
      measureElement: (el) => {
        const idx = Number((el as HTMLElement).dataset.index)
        return nodes[idx]?.actualPx ?? 32
      },
      scrollToFn: (offset, canSmooth) => {
        const prev = scrollTopVal
        if (!settingByUser && Math.abs(offset - prev) > 0.01) {
          hijacks.push(Math.abs(offset - prev))
        }
        scrollTopVal = offset
        void canSmooth
      },
    })

    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, delta, instance) => {
      if (mode === 'after') return false
      if (Math.abs(delta) < 2) return false
      const should = item.start < (instance.scrollOffset ?? 0) + instance.options.scrollMargin
      if (should) hijacks.push(Math.abs(delta))
      return should
    }

    const items = virtualizer.getVirtualItems()
    return (
      <div ref={attach} data-testid="scroller" style={{ height: 560, overflow: 'auto' }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {items.map((item) => (
            <div
              key={item.key}
              data-index={item.index}
              ref={(el) => {
                if (el) virtualizer.measureElement(el)
              }}
              style={{ height: nodes[item.index]!.actualPx }}
            />
          ))}
        </div>
      </div>
    )
  }

  const view = render(<Harness />)
  const scroller = view.getByTestId('scroller')

  // Compute estimate drift across all nodes
  let totalEstimateDriftPx = 0
  let maxRowDriftPx = 0
  for (const node of nodes) {
    const est =
      mode === 'before'
        ? node.kind === 'group-head'
          ? 36
          : node.kind === 'group-pager'
            ? 46
            : 37
        : node.kind === 'group-head'
          ? 33
          : node.kind === 'group-pager' || node.kind === 'summary'
            ? 32
            : TABLE_ROW_PX
    const drift = Math.abs(est - node.actualPx)
    totalEstimateDriftPx += drift
    if (drift > maxRowDriftPx) maxRowDriftPx = drift
  }

  // Jump near the bottom (without measuring intermediate rows, as happens on fast scrollbar drag / PageDown),
  // then scroll smoothly UP 30 steps.
  const startScroll = 4200
  act(() => {
    settingByUser = true
    scroller.scrollTop = startScroll
    settingByUser = false
    scroller.dispatchEvent(new Event('scroll'))
  })
  hijacks.length = 0

  const steps = 30
  const t0 = performance.now()
  for (let s = 1; s <= steps; s += 1) {
    const target = Math.max(0, startScroll - s * 120)
    act(() => {
      settingByUser = true
      scroller.scrollTop = target
      settingByUser = false
      scroller.dispatchEvent(new Event('scroll'))
    })
  }
  const elapsedMs = Number((performance.now() - t0).toFixed(2))
  view.unmount()

  return {
    scrollSteps: steps,
    scrollTopHijacks: hijacks.length,
    totalScrollJumpPx: Number(hijacks.reduce((a, b) => a + b, 0).toFixed(1)),
    maxSingleJumpPx: Number((hijacks.length ? Math.max(...hijacks) : 0).toFixed(1)),
    totalEstimateDriftPx,
    maxRowDriftPx,
    elapsedMs,
  }
}

describe('vertical scroll flicker before/after benchmark', () => {
  it('eliminates mid-scroll scrollTop hijacks and estimation drift in non-wrap mode', () => {
    const before = runScrollFlickerScenario('before')
    const after = runScrollFlickerScenario('after')
    console.log('=== VERTICAL SCROLL FLICKER BENCHMARK ===')
    console.log(JSON.stringify({ before, after }, null, 2))

    expect(before.scrollTopHijacks).toBeGreaterThan(0)
    expect(before.totalScrollJumpPx).toBeGreaterThan(100)
    expect(before.totalEstimateDriftPx).toBeGreaterThan(500)

    expect(after.scrollTopHijacks).toBe(0)
    expect(after.totalScrollJumpPx).toBe(0)
    expect(after.maxSingleJumpPx).toBe(0)
    expect(after.totalEstimateDriftPx).toBe(0)
    expect(after.maxRowDriftPx).toBe(0)
  })
})
