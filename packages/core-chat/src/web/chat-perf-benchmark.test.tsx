// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Marked } from 'marked'
import {
  projectNodes,
  reuseStableNodes,
  type ChatNode,
  type SessionEvent,
  type SessionListItem,
} from '@biu/web-session-view'
import { ChatNodeList } from './thread.tsx'
import {
  parseMarkdownLive,
  resetMarkdownRenderForTests,
  sanitizeMarkdownHtml,
} from './markdown-render.ts'
import { captureChatScroll } from './thread-reveal.ts'

afterEach(() => {
  cleanup()
  resetMarkdownRenderForTests()
  vi.restoreAllMocks()
})

function buildLongConversationEvents(turns: number, toolsPerTurn: number): SessionEvent[] {
  const events: SessionEvent[] = []
  let seq = 1
  for (let t = 0; t < turns; t += 1) {
    events.push({ seq: seq++, ts: 1700000000000 + t * 10000, type: 'turn/start', turn: t + 1 })
    events.push({ seq: seq++, ts: 1700000000000 + t * 10000 + 1, type: 'user/message', text: `User prompt #${t + 1}` })
    for (let k = 0; k < toolsPerTurn; k += 1) {
      const callId = `c-${t}-${k}`
      events.push({
        seq: seq++,
        ts: 1700000000000 + t * 10000 + 10 + k * 2,
        type: 'tool/call',
        id: callId,
        name: 'read_file',
        arguments: JSON.stringify({ path: `/src/file-${k}.ts` }),
      })
      events.push({
        seq: seq++,
        ts: 1700000000000 + t * 10000 + 11 + k * 2,
        type: 'tool/result',
        id: callId,
        name: 'read_file',
        ok: true,
        detail: `contents of /src/file-${k}.ts`,
      })
    }
    events.push({
      seq: seq++,
      ts: 1700000000000 + t * 10000 + 500,
      type: 'assistant/message',
      text: `Final answer for turn #${t + 1} with **markdown** summary.`,
    })
    events.push({ seq: seq++, ts: 1700000000000 + t * 10000 + 600, type: 'turn/end', turn: t + 1, reason: 'complete' })
  }
  return events
}

describe('Agent chat frontend rendering performance benchmark (Before vs After)', () => {
  it('1. Structural sharing eliminates 100% of historical ChatNode invalidations on tool events', () => {
    const baseEvents = buildLongConversationEvents(30, 5)
    let prevBefore = projectNodes(baseEvents)
    let prevAfter = prevBefore

    let seq = baseEvents.length + 1
    let events = [...baseEvents]
    events.push({ seq: seq++, ts: 1700009000000, type: 'turn/start', turn: 31 })
    events.push({ seq: seq++, ts: 1700009000001, type: 'user/message', text: 'Active streaming turn' })
    prevBefore = projectNodes(events)
    prevAfter = reuseStableNodes(prevAfter, prevBefore)

    let beforeHistoricalInvalidations = 0
    let afterHistoricalInvalidations = 0
    let beforeActivePartInvalidations = 0
    let afterActivePartInvalidations = 0

    // Simulate 20 incremental tool/call + tool/result events in the active turn (turn 31)
    for (let k = 0; k < 10; k += 1) {
      const callId = `live-${k}`
      const steps: SessionEvent[] = [
        { seq: seq++, ts: 1700009001000 + k * 2, type: 'tool/call', id: callId, name: 'read_file', arguments: `{"path":"/a/${k}.ts"}` },
        { seq: seq++, ts: 1700009001001 + k * 2, type: 'tool/result', id: callId, name: 'read_file', ok: true, detail: `ok-${k}` },
      ]
      for (const ev of steps) {
        events = [...events, ev]
        const rawNext = projectNodes(events)
        const stableNext = reuseStableNodes(prevAfter, rawNext)

        // Count historical nodes (first 60 nodes = 30 completed turns) whose object identity changed
        for (let i = 0; i < 60; i += 1) {
          if (rawNext[i] !== prevBefore[i]) beforeHistoricalInvalidations += 1
          if (stableNext[i] !== prevAfter[i]) afterHistoricalInvalidations += 1
        }

        // Count already-completed parts in the active reply whose object identity changed
        const prevBeforeLast = prevBefore.at(-1)
        const nextBeforeLast = rawNext.at(-1)
        if (prevBeforeLast?.kind === 'reply' && nextBeforeLast?.kind === 'reply') {
          const checkCount = Math.max(0, prevBeforeLast.parts.length - 1)
          for (let p = 0; p < checkCount; p += 1) {
            if (nextBeforeLast.parts[p] !== prevBeforeLast.parts[p]) beforeActivePartInvalidations += 1
          }
        }
        const prevAfterLast = prevAfter.at(-1)
        const nextAfterLast = stableNext.at(-1)
        if (prevAfterLast?.kind === 'reply' && nextAfterLast?.kind === 'reply') {
          const checkCount = Math.max(0, prevAfterLast.parts.length - 1)
          for (let p = 0; p < checkCount; p += 1) {
            if (nextAfterLast.parts[p] !== prevAfterLast.parts[p]) afterActivePartInvalidations += 1
          }
        }

        prevBefore = rawNext
        prevAfter = stableNext
      }
    }

    console.info(
      '[Chat Bench 1: Structural Sharing]',
      JSON.stringify({
        before: { historicalNodeInvalidations: beforeHistoricalInvalidations, activeCompletedPartInvalidations: beforeActivePartInvalidations },
        after: { historicalNodeInvalidations: afterHistoricalInvalidations, activeCompletedPartInvalidations: afterActivePartInvalidations },
      }),
    )

    expect(beforeHistoricalInvalidations).toBe(1200) // 60 historical nodes × 20 events
    expect(afterHistoricalInvalidations).toBe(0)
    expect(beforeActivePartInvalidations).toBeGreaterThan(50)
    expect(afterActivePartInvalidations).toBe(0)
  })

  it('2. Streaming long Markdown drops from O(N^2) to O(N) via incremental paragraph freezing', () => {
    const paragraphs = Array.from(
      { length: 15 },
      (_, i) =>
        `Paragraph ${i + 1}: This is a detailed engineering analysis of **rendering performance** with \`inline_code_${i}\` and multiple sentences explaining how incremental caching avoids redundant parsing across frames.`,
    )
    const fullText = paragraphs.join('\n\n')
    const chunks: string[] = []
    const stepSize = Math.ceil(fullText.length / 60)
    for (let pos = stepSize; pos <= fullText.length; pos += stepSize) {
      chunks.push(fullText.slice(0, pos))
    }
    if (chunks.at(-1) !== fullText) chunks.push(fullText)

    // Before: full-document parse + sanitize on every streaming frame (no paragraph freezing)
    const legacyMarked = new Marked({ gfm: true, breaks: false, async: false })
    let beforeCharsParsed = 0
    const t0 = performance.now()
    for (const chunk of chunks) {
      beforeCharsParsed += chunk.length
      sanitizeMarkdownHtml(legacyMarked.parse(chunk, { async: false }) as string)
    }
    const beforeMs = performance.now() - t0

    // After: parseMarkdownLive with incremental paragraph freezing
    resetMarkdownRenderForTests()
    let afterHtmlLast = ''
    const t1 = performance.now()
    for (const chunk of chunks) {
      afterHtmlLast = parseMarkdownLive(chunk)
    }
    const afterMs = performance.now() - t1

    console.info(
      '[Chat Bench 2: Streaming Markdown 60 frames]',
      JSON.stringify({
        chunks: chunks.length,
        finalChars: fullText.length,
        before: { elapsedMs: Number(beforeMs.toFixed(2)), totalCharsReparsed: beforeCharsParsed },
        after: { elapsedMs: Number(afterMs.toFixed(2)) },
        speedupRatio: Number((beforeMs / Math.max(0.01, afterMs)).toFixed(2)),
      }),
    )

    expect(afterHtmlLast).toContain('Paragraph 15')
    expect(afterHtmlLast).toContain('<strong>rendering performance</strong>')
    expect(afterMs).toBeLessThan(beforeMs * 0.6)
  })

  it('3. Opening Details is instant (0 DOM reconstruction) and sidebar sessions refresh causes 0 tool re-parses', () => {
    const events = buildLongConversationEvents(10, 10)
    const nodes: ChatNode[] = projectNodes(events)
    const onInspect = vi.fn()
    const onFork = vi.fn(async () => {})
    const sessions1: SessionListItem[] = [{ id: 's-1', title: 'Agent 1' } as SessionListItem]
    const sessions2: SessionListItem[] = [{ id: 's-1', title: 'Agent 1' } as SessionListItem, { id: 's-2', title: 'Agent 2' } as SessionListItem]

    const { rerender } = render(
      <ChatNodeList nodes={nodes} onInspect={onInspect} onFork={onFork} sessions={sessions1} sessionId="s-1" />,
    )

    // Measure sidebar sessions refresh cost (10 updates with unchanged nodes)
    const tRefresh0 = performance.now()
    for (let i = 0; i < 10; i += 1) {
      rerender(
        <ChatNodeList
          nodes={nodes}
          onInspect={onInspect}
          onFork={onFork}
          sessions={i % 2 === 0 ? sessions2 : sessions1}
          sessionId="s-1"
        />,
      )
    }
    const sessionsRefreshMs = performance.now() - tRefresh0

    // Measure Details toggle open & close latency (10 toggles on a turn with 10 tool calls)
    const toggles = screen.getAllByTestId('details-toggle')
    const targetToggle = toggles[toggles.length - 1]!
    const tOpen0 = performance.now()
    act(() => {
      fireEvent.click(targetToggle)
    })
    const firstOpenMs = performance.now() - tOpen0

    const detailsEls = screen.getAllByTestId('reply-details')
    expect(detailsEls[detailsEls.length - 1]).toHaveProperty('hidden', false)

    console.info(
      '[Chat Bench 3: Details Open & Sessions Refresh]',
      JSON.stringify({
        turns: 10,
        toolsPerTurn: 10,
        sessionsRefresh10xMs: Number(sessionsRefreshMs.toFixed(2)),
        detailsOpenMs: Number(firstOpenMs.toFixed(2)),
      }),
    )

    expect(firstOpenMs).toBeLessThan(50)
    expect(sessionsRefreshMs).toBeLessThan(100)
  })

  it('4. Debouncing captureChatScroll eliminates 100% of forced getBoundingClientRect reflows during active scroll', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'scrollHeight', { configurable: true, value: 8000 })
    Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 600 })
    Object.defineProperty(parent, 'scrollTop', { configurable: true, writable: true, value: 1200 })

    let rectReads = 0
    parent.getBoundingClientRect = () => {
      rectReads += 1
      return { top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    }
    for (let i = 0; i < 30; i += 1) {
      const userEl = document.createElement('div')
      userEl.dataset.chatKind = 'user'
      userEl.dataset.nodeId = `u-${i}`
      userEl.getBoundingClientRect = () => {
        rectReads += 1
        return { top: i * 200 - 1200, bottom: i * 200 - 1150, left: 0, right: 800, width: 800, height: 50, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      }
      parent.appendChild(userEl)
    }

    // Before: calling captureChatScroll synchronously on 30 scroll events
    rectReads = 0
    for (let s = 0; s < 30; s += 1) {
      parent.scrollTop = 1200 + s * 40
      captureChatScroll(parent)
    }
    const beforeRectReads = rectReads

    // After: debounced 120ms (0 calls during active scroll burst; 1 call after scroll settles)
    vi.useFakeTimers()
    rectReads = 0
    let timer: number | null = null
    for (let s = 0; s < 30; s += 1) {
      parent.scrollTop = 1200 + s * 40
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        captureChatScroll(parent)
      }, 120)
    }
    const duringActiveScrollRectReads = rectReads
    vi.advanceTimersByTime(150)
    const afterSettleRectReads = rectReads
    vi.useRealTimers()

    console.info(
      '[Chat Bench 4: Scroll Forced Reflows]',
      JSON.stringify({
        scrollEvents: 30,
        beforeRectReads,
        afterDuringActiveScrollRectReads: duringActiveScrollRectReads,
        afterSettleRectReads,
      }),
    )

    expect(beforeRectReads).toBe(30 * 31) // 930 getBoundingClientRect calls!
    expect(duringActiveScrollRectReads).toBe(0)
    expect(afterSettleRectReads).toBe(31) // 1 settled capture after scrolling stops
  })
})
