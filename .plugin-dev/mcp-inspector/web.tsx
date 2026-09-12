import { createPortal } from 'react-dom'
import {
  REPORT_SCOPE,
  buildReportFragment,
  itemTitle,
  reportCss,
} from './report.ts'
import {
  deriveCallPairs,
  itemSearchText,
  resolveReportItems,
  type EnrichmentResult,
} from './model.ts'
import { reportBlockKey, stampReportHtml } from './stamp-picks.ts'
import { suspendAncestorDrag } from './drag-guard.ts'

const React = globalThis.React
const { useCallback, useEffect, useMemo, useRef, useState } = React

export const name = 'mcp-inspector'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

interface SessionItem {
  id: string
  title: string
  updatedAt: number
}

interface QuestionInfo {
  turn: number
  text: string
  ts: number
  mcpCallCount: number
}

const STYLE_ID = 'mcp-inspector-style'

/** 作用域样式只需在 document.head 里存一份，别每个块各插一次。 */
function ensureStyle() {
  if (typeof document === 'undefined') return
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.append(el)
  }
  // pack 后插件可热重挂；已有 style 也必须更新，不能把旧主题留在页面里。
  el.textContent = reportCss()
}

function McpInspectorBlock({ data, update, writable }: BlockProps) {
  const ro = !writable
  const sessionId = String(data.sessionId ?? '')
  const selectedTurn = data.turn != null ? Number(data.turn) : null

  const shellRef = useRef<HTMLDivElement | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [allEvents, setAllEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  const [enrichments, setEnrichments] = useState<Map<string, EnrichmentResult>>(new Map())
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)
  const [enrichmentSettled, setEnrichmentSettled] = useState(false)
  const [enrichmentError, setEnrichmentError] = useState('')

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const body = await res.json()
      const items: SessionItem[] = (body.sessions || body || []).map((s: any) => ({
        id: s.id,
        title: s.title || s.id.slice(0, 8),
        updatedAt: s.updatedAt || 0,
      }))
      setSessions(items.sort((a, b) => b.updatedAt - a.updatedAt))
    } catch {
      /* 会话列表失败时仍可手填已有 sessionId */
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(ensureStyle, [])

  useEffect(() => {
    if (!sessionId) {
      setAllEvents([])
      return
    }
    setLoading(true)
    setError(null)
    fetch(`/api/sessions/${sessionId}/events?beforeSeq=999999&turns=9999`)
      .then((r) => r.json())
      .then((body) => {
        setAllEvents(body.events || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setLoading(false)
      })
  }, [sessionId])

  const allPairs = useMemo(() => deriveCallPairs(allEvents), [allEvents])
  const calls = useMemo(
    () => (selectedTurn == null ? allPairs : allPairs.filter((pair) => pair.turn === selectedTurn)),
    [allPairs, selectedTurn],
  )

  const questions = useMemo((): QuestionInfo[] => {
    const info = new Map<number, { text: string; ts: number }>()
    let turn = 0
    for (const ev of allEvents) {
      if (ev.type === 'turn/start') {
        turn = Number(ev.turn) || turn
        if (!info.has(turn)) info.set(turn, { text: '', ts: Number(ev.ts) || 0 })
      }
      if (ev.type === 'user/message') {
        const current = info.get(turn) ?? { text: '', ts: Number(ev.ts) || 0 }
        if (!current.text) current.text = String(ev.text || '')
        info.set(turn, current)
      }
    }
    const count = new Map<number, number>()
    for (const pair of allPairs) count.set(pair.turn, (count.get(pair.turn) ?? 0) + 1)
    return [...count.entries()]
      .map(([itemTurn, mcpCallCount]) => ({
        turn: itemTurn,
        text: info.get(itemTurn)?.text || '',
        ts: info.get(itemTurn)?.ts || 0,
        mcpCallCount,
      }))
      .sort((a, b) => a.turn - b.turn)
  }, [allEvents, allPairs])

  // 原始数据由 host 从 session 事件反查并补拉；浏览器不传 tool/arguments。
  useEffect(() => {
    setEnrichments(new Map())
    setEnrichmentSettled(false)
    setEnrichmentError('')
    if (!sessionId || !calls.length) {
      setEnrichmentLoading(false)
      setEnrichmentSettled(true)
      return
    }
    const controller = new AbortController()
    setEnrichmentLoading(true)
    fetch('/api/mcp-inspector/enrich', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, turn: selectedTurn }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
        const list = Array.isArray(body.results) ? (body.results as EnrichmentResult[]) : []
        setEnrichments(new Map(list.map((entry) => [entry.sourceCallId, entry])))
        setEnrichmentLoading(false)
        setEnrichmentSettled(true)
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return
        setEnrichmentError(String(fetchError))
        setEnrichmentLoading(false)
        setEnrichmentSettled(true)
      })
    return () => controller.abort()
  }, [sessionId, selectedTurn, calls])

  const items = useMemo(
    () => resolveReportItems(calls, enrichments, enrichmentLoading || !enrichmentSettled),
    [calls, enrichments, enrichmentLoading, enrichmentSettled],
  )
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) => itemSearchText(item).includes(query))
  }, [items, search])

  const selectedSession = sessions.find((session) => session.id === sessionId)

  // 盖过章的 HTML：选取扫的是这些 data-biu-*，所以盖章必须发生在注入之前。
  const html = useMemo(() => {
    if (!sessionId || loading || error || !visible.length) return ''
    const raw = buildReportFragment({ items: visible })
    return stampReportHtml(raw, reportBlockKey(sessionId, selectedTurn, raw))
  }, [sessionId, loading, error, visible, selectedTurn])

  useEffect(() => {
    if (zoomIndex == null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomIndex(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomIndex])

  const zoomed = zoomIndex != null ? visible[zoomIndex] : undefined

  const zoomHtml = useMemo(() => {
    if (!zoomed) return ''
    const raw = buildReportFragment({ items: [zoomed], zoomable: false })
    return stampReportHtml(raw, reportBlockKey(sessionId, selectedTurn, `zoom${raw}`))
  }, [zoomed, sessionId, selectedTurn])

  /** 放大按钮是注入的 HTML，接不上 React 的 onClick，用容器上的事件委托。 */
  const onReportClick = (event: any) => {
    const btn = (event.target as HTMLElement | null)?.closest?.('[data-zoom]')
    if (!btn) return
    event.preventDefault()
    event.stopPropagation()
    const idx = Number(btn.getAttribute('data-zoom'))
    if (Number.isInteger(idx)) setZoomIndex(idx)
  }

  useEffect(() => {
    setZoomIndex(null)
  }, [sessionId, selectedTurn, search])

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid var(--dsw-border)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--dsw-label)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  }
  const selectStyle: React.CSSProperties = {
    flex: 'none',
    maxWidth: 280,
    padding: '2px 6px',
    border: '1px solid var(--dsw-border)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--dsw-label)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    outline: 'none',
  }
  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '4px 8px',
    border: '1px solid var(--dsw-border)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--dsw-label)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
  }

  let body: React.ReactNode = null
  if (!sessionId) {
    body = <div style={{ padding: 24, textAlign: 'center', color: 'var(--dsw-label-3)', fontSize: 13 }}>请选择会话</div>
  } else if (loading) {
    body = <div style={{ padding: 24, textAlign: 'center', color: 'var(--dsw-label-3)', fontSize: 13 }}>加载中…</div>
  } else if (error) {
    body = <div style={{ padding: 24, textAlign: 'center', color: 'var(--dsw-danger)', fontSize: 13 }}>加载失败: {error}</div>
  } else if (calls.length === 0) {
    body = (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--dsw-label-3)', fontSize: 13 }}>
        {selectedTurn != null ? '该问题下无符合展示范围的数据' : '本会话暂无符合展示范围的数据'}
      </div>
    )
  } else if (!visible.length) {
    body = <div style={{ padding: 24, textAlign: 'center', color: 'var(--dsw-label-3)', fontSize: 13 }}>没有匹配的调用</div>
  } else {
    body = (
      <div
        className={REPORT_SCOPE}
        data-testid="mcp-inspector-report-host"
        // 页面块是 atom：mousedown 冒到 PageBlockView 会 setNodeSelection 把整块选中
        onMouseDown={(event: any) => {
          event.stopPropagation()
          suspendAncestorDrag(event.currentTarget as HTMLElement)
        }}
        draggable={false}
        onClick={onReportClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <div
      ref={shellRef}
      data-testid="mcp-inspector-block"
      onMouseDown={(event: any) => {
        if ((event.target as HTMLElement | null)?.closest?.('input, select, button, a')) {
          event.stopPropagation()
        }
      }}
      style={{
        margin: '12px 0',
        padding: 0,
        border: 'none',
        background: 'transparent',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', gap: 8, padding: '6px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 120 }}>
          {ro ? (
            <span style={{ fontSize: 12, color: 'var(--dsw-label)' }}>{selectedSession?.title ?? '未选择会话'}</span>
          ) : (
            <button type="button" onClick={() => setSessionPickerOpen(!sessionPickerOpen)} style={btnStyle}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {selectedSession?.title ?? '选择会话…'}
              </span>
              <span style={{ flex: 'none', color: 'var(--dsw-label-3)' }}>▾</span>
            </button>
          )}
          {sessionPickerOpen && !ro ? (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setSessionPickerOpen(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 51, maxHeight: 280, overflow: 'auto', border: '1px solid var(--dsw-border)', borderRadius: 6, background: 'var(--dsw-surface)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {sessions.length === 0 ? (
                  <div style={{ padding: '8px 12px', color: 'var(--dsw-label-3)', fontSize: 12 }}>暂无会话</div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        update({ sessionId: s.id, turn: null })
                        setSessionPickerOpen(false)
                      }}
                      style={{
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: s.id === sessionId ? 'var(--dsw-pick, var(--dsw-label))' : 'var(--dsw-label)',
                        background: s.id === sessionId ? 'var(--dsw-pick-fill, transparent)' : 'transparent',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.title}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
        {!ro && sessionId && questions.length > 0 ? (
          <select value={selectedTurn ?? ''} onChange={(e: any) => update({ turn: e.target.value ? Number(e.target.value) : null })} style={selectStyle}>
            <option value="">全部对话</option>
            {questions.map((q) => (
              <option key={q.turn} value={q.turn}>
                {q.text.slice(0, 50)}
                {q.text.length > 50 ? '…' : ''} ({q.mcpCallCount}次)
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {!ro && calls.length > 0 ? (
        <div style={{ padding: '4px 0 6px' }}>
          <input type="text" value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="搜索工具名、参数、返回内容…" style={inputStyle} />
        </div>
      ) : null}
      {enrichmentError ? (
        <div style={{ margin: '0 0 8px', color: 'var(--dsw-danger)', fontSize: 11 }}>
          原始数据补拉接口失败：{enrichmentError}
        </div>
      ) : null}
      {body}
      {/* 必须 portal 到 body：页面块的祖先一有 transform/contain，position:fixed 就不再相对视口，标题栏会被裁掉 */}
      {zoomed && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="biu-float-overlay"
              data-testid="mcp-inspector-zoom"
              onClick={() => setZoomIndex(null)}
              onMouseDown={(event: any) => event.stopPropagation()}
              style={{ padding: 0 }}
            >
              <div
                className="biu-float"
                role="dialog"
                aria-modal="true"
                aria-label="MCP 调用全屏"
                onClick={(event: any) => event.stopPropagation()}
                // 用 100% 撑满 overlay，而不是 100vw/100vh——后者含滚动条宽度，会把内容顶出去
                style={{ width: '100%', height: '100%', border: 0, borderRadius: 0 }}
              >
                <div className="biu-float-head">
                  <h2 className="biu-float-title">{itemTitle(zoomed)}</h2>
                  <button
                    type="button"
                    className="biu-float-close"
                    title="关闭（Esc）"
                    aria-label="关闭"
                    onClick={() => setZoomIndex(null)}
                  >
                    ✕
                  </button>
                </div>
                <div
                  className={`${REPORT_SCOPE} is-zoom`}
                  data-testid="mcp-inspector-zoom-report"
                  onMouseDown={(event: any) => event.stopPropagation()}
                  dangerouslySetInnerHTML={{ __html: zoomHtml }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown> | (() => Record<string, unknown>)
      View: (props: BlockProps) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'mcp-log',
    plugin: name,
    label: 'MCP 调用记录',
    blockType: 'mcp',
    blockTypeLabel: 'MCP',
    hint: '选择会话后查看 CDB 诊断数据：元数据、processlist、slow log、InnoDB trx 与指标图',
    aliases: ['mcp', 'mcplog', 'mcp调用', '工具调用', 'mcp记录'],
    defaults: { sessionId: '', turn: null },
    View: McpInspectorBlock,
  })
}
