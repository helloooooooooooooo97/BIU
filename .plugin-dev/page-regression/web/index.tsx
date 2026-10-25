/**
 * 回归检查：Playwright HTML report / Vitest UI / Cypress / GitHub Checks
 * 断言是测试用例，runs 是 CI 记录，filter / selected 写进块数据。
 */
import { Button, Input, ReUI, Select } from '@biu/reui'

const React = globalThis.React
const { useState, useCallback } = React

export const name = 'page-regression'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

type Assert = {
  id: string
  type: string
  selector?: string
  expect?: string
  method?: string
  url?: string
  status?: number | string
  note?: string
}

type ItemResult = {
  id: string
  type: string
  status: 'pass' | 'fail'
  ms: number
  actual: string
  delta?: 'fixed' | 'broken'
}

type Run = {
  at: number
  ms: number
  total: number
  passed: number
  failed: number
  items: ItemResult[]
}

const TYPES = [
  { id: 'exists', label: '存在' },
  { id: 'text', label: '文案匹配' },
  { id: 'count', label: '数量相等' },
  { id: 'http', label: '接口状态' },
]

const MAX_RUNS = 10
const MAX_ACTUAL = 72

function newId() {
  return 'a' + Math.random().toString(36).slice(2, 7)
}

function clip(value: unknown, max = MAX_ACTUAL) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

async function runAssert(item: Assert): Promise<{ status: 'pass' | 'fail'; actual: string; ms: number }> {
  const started = nowMs()
  const done = (status: 'pass' | 'fail', actual: string) => ({
    status,
    actual: clip(actual),
    ms: Math.max(1, Math.round(nowMs() - started)),
  })
  const selector = String(item.selector ?? '').trim()
  try {
    if (item.type === 'exists') {
      if (!selector) return done('fail', '没写选择器')
      const el = document.querySelector(selector)
      return el ? done('pass', `<${el.tagName.toLowerCase()}> 命中`) : done('fail', `没找到 ${selector}`)
    }
    if (item.type === 'text') {
      if (!selector) return done('fail', '没写选择器')
      const el = document.querySelector(selector)
      if (!el) return done('fail', `没找到 ${selector}`)
      const got = clip(el.textContent, 200)
      const want = String(item.expect ?? '')
      return done(got.includes(want) ? 'pass' : 'fail', `实际：${got || '(空)'}`)
    }
    if (item.type === 'count') {
      const n = selector ? document.querySelectorAll(selector).length : -1
      const want = Number(item.expect)
      return done(n === want ? 'pass' : 'fail', `实际 ${n} 个，期望 ${Number.isFinite(want) ? want : '(没写)'} 个`)
    }
    if (item.type === 'http') {
      const method = String(item.method || 'GET').toUpperCase()
      const url = String(item.url ?? '').trim()
      if (!url) return done('fail', '没写 url')
      const res = await fetch('/api/page-regression/http', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, url }),
      })
      const payload = (await res.json()) as { status?: number; statusText?: string; body?: string; ms?: number }
      const want = Number(item.status ?? 200)
      const hit = payload.status === want
      return done(
        hit ? 'pass' : 'fail',
        `${method} ${url} → ${payload.status ?? 0} ${payload.statusText ?? ''}${hit ? '' : `（期望 ${want}）`}`,
      )
    }
    return done('fail', `不认识的断言类型：${item.type}`)
  } catch (error) {
    return done('fail', String(error))
  }
}

function markDeltas(prev: Run | null, items: ItemResult[]): ItemResult[] {
  if (!prev) return items
  const before = new Map(prev.items.map((item) => [item.id, item.status]))
  return items.map((item) => {
    const was = before.get(item.id)
    if (was === 'fail' && item.status === 'pass') return { ...item, delta: 'fixed' as const }
    if (was === 'pass' && item.status === 'fail') return { ...item, delta: 'broken' as const }
    return item
  })
}

function fmtTime(at: number) {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function specName(item: Assert) {
  if (item.type === 'http') return `${item.method || 'GET'} ${item.url || ''}`.trim()
  return [item.selector, item.expect].filter(Boolean).join(' · ') || item.type
}

export function RegressionBlock({ data, update, writable }: BlockProps) {
  const asserts = Array.isArray(data.asserts) ? (data.asserts as Assert[]) : []
  const runs = Array.isArray(data.runs) ? (data.runs as Run[]) : []
  const filter = data.filter === 'failed' || data.filter === 'passed' ? data.filter : 'all'
  const selected = typeof data.selected === 'string' ? data.selected : ''
  const [busy, setBusy] = useState(false)
  const runAt = typeof data.runAt === 'number' ? data.runAt : (runs.length ? runs[runs.length - 1].at : 0)
  const last = runs.find((run) => run.at === runAt) ?? (runs.length ? runs[runs.length - 1] : null)
  const prev = runs.length > 1 ? runs[runs.length - 2] : null
  const resultOf = (id: string) => last?.items.find((item) => item.id === id)

  const patchAssert = (id: string, patch: Record<string, unknown>) =>
    update({ asserts: asserts.map((item) => (item.id === id ? { ...item, ...patch } : item)) })

  const runAll = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const started = nowMs()
    try {
      const items: ItemResult[] = []
      for (const item of asserts) {
        const result = await runAssert(item)
        items.push({ id: item.id, type: item.type, ...result })
      }
      const marked = markDeltas(prev, items)
      const run: Run = {
        at: Date.now(),
        ms: Math.round(nowMs() - started),
        total: marked.length,
        passed: marked.filter((item) => item.status === 'pass').length,
        failed: marked.filter((item) => item.status === 'fail').length,
        items: marked,
      }
      update({ runs: [...runs, run].slice(-MAX_RUNS), runAt: run.at })
    } finally {
      setBusy(false)
    }
  }, [busy, asserts, prev, runs, update])

  const passed = last?.passed ?? 0
  const failed = last?.failed ?? 0
  const total = last?.total ?? asserts.length
  const visible = asserts.filter((item) => {
    const result = resultOf(item.id)
    if (filter === 'failed') return result?.status === 'fail'
    if (filter === 'passed') return result?.status === 'pass'
    return true
  })

  return (
    <ReUI>
      <div className="rg-shell" data-testid="regression-block">
        <div className="rg-head">
          <div>
            <h2>Test report</h2>
            <p data-testid="regression-summary">
              {last
                ? `${last.passed}/${last.total} passed · ${last.failed} failed · ${last.ms}ms · ${fmtTime(last.at)}`
                : `${asserts.length} tests · 还没跑过`}
            </p>
          </div>
          <div className="rui-row">
            {writable ? (
              <Button type="button" variant="outline" data-testid="regression-add" onClick={() => update({ asserts: [...asserts, { id: newId(), type: 'exists', selector: '' }] })}>
                加用例
              </Button>
            ) : null}
            <Button type="button" data-testid="regression-run" disabled={busy} onClick={() => void runAll()}>
              {busy ? '跑…' : 'Run'}
            </Button>
          </div>
        </div>
        <div className="rg-stats">
          <div>
            <b style={{ color: '#0f7a4a' }}>{passed}</b>
            <em>Passed</em>
          </div>
          <div>
            <b style={{ color: '#b42318' }}>{failed}</b>
            <em>Failed</em>
          </div>
          <div>
            <b>{total}</b>
            <em>Tests</em>
          </div>
          <div>
            <b>{last?.ms ?? 0}</b>
            <em>ms</em>
          </div>
        </div>
        {runs.length ? (
          <div className="rg-runs" data-testid="regression-history">
            <div data-testid="regression-history-list" className="rui-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {runs.slice().reverse().map((run) => (
              <button
                key={run.at}
                type="button"
                className="rg-run"
                data-on={last?.at === run.at}
                onClick={() => update({ runAt: run.at })}
              >
                {fmtTime(run.at)} · {run.passed}/{run.total}
              </button>
            ))}
            </div>
          </div>
        ) : null}
        <div className="rg-filters">
          {([['all', `All ${asserts.length}`], ['failed', `Failed ${failed}`], ['passed', `Passed ${passed}`]] as const).map(([id, label]) => (
            <button key={id} type="button" data-on={filter === id} onClick={() => update({ filter: id })}>
              {label}
            </button>
          ))}
        </div>
        {visible.map((item) => {
          const result = resultOf(item.id)
          const open = selected === item.id
          const color = !result ? '#c7c7cc' : result.status === 'pass' ? '#0f7a4a' : '#b42318'
          return (
            <div key={item.id}>
              <div
                className="rg-test"
                data-testid="regression-row"
                data-open={open}
                onClick={() => update({ selected: open ? '' : item.id })}
              >
                <i className="rg-dot" style={{ background: color }} />
                <div className="min-w-0">
                  <div className="rg-name">{item.note || TYPES.find((type) => type.id === item.type)?.label || item.type}</div>
                  <div className="rg-file">{specName(item)}</div>
                </div>
                <span className="rg-ms">{result ? `${result.ms}ms` : '—'}</span>
                <span className="rg-ms">{result ? (result.delta || result.status) : 'queued'}</span>
              </div>
              {open ? (
                <div className="rg-out">
                  {writable ? (
                    <div className="rui-row" style={{ flexWrap: 'wrap', marginBottom: 8 }} onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}>
                      <Select value={item.type} disabled={!writable} onChange={(event: { target: { value: string } }) => patchAssert(item.id, { type: event.target.value })} style={{ width: 108 }}>
                        {TYPES.map((type) => (
                          <option key={type.id} value={type.id}>{type.label}</option>
                        ))}
                      </Select>
                      {item.type === 'http' ? (
                        <>
                          <Select value={String(item.method || 'GET')} onChange={(event: { target: { value: string } }) => patchAssert(item.id, { method: event.target.value })} style={{ width: 78 }}>
                            {['GET', 'POST', 'PUT', 'DELETE'].map((method) => (
                              <option key={method} value={method}>{method}</option>
                            ))}
                          </Select>
                          <Input value={String(item.url ?? '')} placeholder="/api/…" onChange={(event: { target: { value: string } }) => patchAssert(item.id, { url: event.target.value })} className="rui-grow" />
                          <Input value={String(item.status ?? 200)} onChange={(event: { target: { value: string } }) => patchAssert(item.id, { status: event.target.value })} style={{ width: 56 }} />
                        </>
                      ) : (
                        <>
                          <Input value={String(item.selector ?? '')} placeholder="选择器" onChange={(event: { target: { value: string } }) => patchAssert(item.id, { selector: event.target.value })} className="rui-grow" />
                          {item.type === 'exists' ? null : (
                            <Input value={String(item.expect ?? '')} placeholder={item.type === 'count' ? '期望个数' : '期望文案'} onChange={(event: { target: { value: string } }) => patchAssert(item.id, { expect: event.target.value })} style={{ width: 130 }} />
                          )}
                        </>
                      )}
                      <Button type="button" size="sm" variant="ghost" onClick={() => update({ asserts: asserts.filter((row) => row.id !== item.id) })}>删除</Button>
                    </div>
                  ) : null}
                  <span className={result?.status === 'fail' ? 'rui-bad' : 'rui-ok'}>{result?.actual || item.note || '还没跑'}</span>
                </div>
              ) : null}
            </div>
          )
        })}
        {asserts.length ? null : <div className="rui-muted" style={{ padding: 16 }}>还没有用例，点「加用例」。</div>}
      </div>
    </ReUI>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: Record<string, unknown>) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'run',
    plugin: name,
    label: '页面回归检查块',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: 'Playwright 式测试报告：断言是用例，runs 是 CI 记录，可筛选 failed/passed',
    aliases: ['run', 'regression', 'test', 'assert', '回归', '断言', '检查', 'playwright'],
    defaults: {
      filter: 'all',
      selected: '',
      runAt: 0,
      asserts: [
        { id: 'a1', type: 'exists', selector: 'h1', note: '标题在' },
        { id: 'a2', type: 'text', selector: 'h1', expect: '举例说明', note: '标题文案' },
        { id: 'a3', type: 'count', selector: 'h1', expect: '1', note: '只有一个 h1' },
        { id: 'a4', type: 'http', method: 'GET', url: '/api/db/stat?path=/pages/p005', status: 200, note: '页面可读' },
      ],
      runs: [],
    },
    View: RegressionBlock,
  })
}
