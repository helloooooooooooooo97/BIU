import { Badge, Button, Card, CardHeader, CardTitle, Input, Select } from '@biu/biu-ui'

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

/** 一条断言：真去读 DOM / 真去发请求，返回 通过|失败 + 实际值 + 耗时。 */
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

/** 和上一次跑的结果逐条对齐：上次失败这次通过 = fixed，反过来 = broken。 */
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

function Chip({ item }: { item?: ItemResult }) {
  if (!item) return <Badge>—</Badge>
  const pass = item.status === 'pass'
  return (
    <Badge variant={pass ? 'on' : 'destructive'} className="min-w-24 font-mono">
      {pass ? '通过' : '失败'} {item.ms}ms
      {item.delta ? <b className="ml-1.5">{item.delta}</b> : null}
    </Badge>
  )
}

export function RegressionBlock({ data, update, writable }: BlockProps) {
  const asserts = Array.isArray(data.asserts) ? (data.asserts as Assert[]) : []
  const runs = Array.isArray(data.runs) ? (data.runs as Run[]) : []
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const last = runs.length ? runs[runs.length - 1] : null
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
      update({ runs: [...runs, run].slice(-MAX_RUNS) })
    } finally {
      setBusy(false)
    }
  }, [busy, asserts, prev, runs, update])

  const fixed = last ? last.items.filter((item) => item.delta === 'fixed').length : 0
  const broken = last ? last.items.filter((item) => item.delta === 'broken').length : 0

  return (
    <Card data-testid="regression-block" className="select-text border-dsw-border text-dsw-label">
      <CardHeader>
        <CardTitle>页面回归检查</CardTitle>
        <span data-testid="regression-summary" className="font-mono text-[12px] text-dsw-label-3">
          {last
            ? `${last.passed}/${last.total} 通过 · ${last.failed} 失败 · ${last.ms}ms · ${fmtTime(last.at)}${
                fixed ? ` · fixed ${fixed}` : ''
              }${broken ? ` · broken ${broken}` : ''}`
            : `${asserts.length} 条断言 · 还没跑过`}
        </span>
        <span className="flex-1" />
        {writable ? (
          <Button type="button" data-testid="regression-add" onClick={() => update({ asserts: [...asserts, { id: newId(), type: 'exists', selector: '' }] })}>
            加断言
          </Button>
        ) : null}
        <Button type="button" data-testid="regression-run" disabled={busy} onClick={() => void runAll()}>
          {busy ? '跑…' : '跑一遍'}
        </Button>
        {runs.length ? (
          <Button type="button" data-testid="regression-history" onClick={() => setShowHistory(!showHistory)}>
            历史 {runs.length}
          </Button>
        ) : null}
      </CardHeader>

      <div className="mt-2 flex flex-col gap-1.5">
        {asserts.map((item, i) => {
          const result = resultOf(item.id)
          return (
            <div key={item.id} data-testid="regression-row" className="flex flex-wrap items-center gap-1.5">
              <span className="w-[18px] font-mono text-[12px] text-dsw-label-3">{i + 1}</span>
              <Select
                value={item.type}
                disabled={!writable}
                onChange={(event) => patchAssert(item.id, { type: event.target.value })}
                className="w-[88px] font-mono"
              >
                {TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </Select>
              {item.type === 'http' ? (
                <>
                  <Select
                    value={String(item.method || 'GET')}
                    disabled={!writable}
                    onChange={(event) => patchAssert(item.id, { method: event.target.value })}
                    className="w-[74px] font-mono"
                  >
                    {['GET', 'POST', 'PUT', 'DELETE'].map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={String(item.url ?? '')}
                    disabled={!writable}
                    placeholder="/api/… 或 http://…"
                    onChange={(event) => patchAssert(item.id, { url: event.target.value })}
                    className="min-w-0 flex-[1_1_200px] font-mono"
                  />
                  <Input
                    value={String(item.status ?? 200)}
                    disabled={!writable}
                    onChange={(event) => patchAssert(item.id, { status: event.target.value })}
                    className="w-[54px] font-mono"
                  />
                </>
              ) : (
                <>
                  <Input
                    value={String(item.selector ?? '')}
                    disabled={!writable}
                    placeholder="选择器，如 h1 / [data-testid=xxx]"
                    onChange={(event) => patchAssert(item.id, { selector: event.target.value })}
                    className="min-w-0 flex-[1_1_180px] font-mono"
                  />
                  {item.type === 'exists' ? null : (
                    <Input
                      value={String(item.expect ?? '')}
                      disabled={!writable}
                      placeholder={item.type === 'count' ? '期望个数' : '期望文案（子串）'}
                      onChange={(event) => patchAssert(item.id, { expect: event.target.value })}
                      className="w-[130px] font-mono"
                    />
                  )}
                </>
              )}
              <Input
                value={String(item.note ?? '')}
                disabled={!writable}
                placeholder="说明"
                onChange={(event) => patchAssert(item.id, { note: event.target.value })}
                className="w-24"
              />
              <Chip item={result} />
              {writable ? (
                <Button type="button" title="删掉这条断言" onClick={() => update({ asserts: asserts.filter((a) => a.id !== item.id) })}>
                  删除
                </Button>
              ) : null}
              {result ? <span className={`w-full pl-6 font-mono text-[11px] ${result.status === 'pass' ? 'text-dsw-label-3' : 'text-dsw-danger'}`}>{result.actual}</span> : null}
            </div>
          )
        })}
        {asserts.length ? null : <span className="text-[13px] text-dsw-label-3">还没有断言，点右上「加断言」加一条。</span>}
      </div>

      {showHistory && runs.length ? (
        <div data-testid="regression-history-list" className="mt-2 border-t border-dsw-border pt-1.5">
          {runs
            .slice()
            .reverse()
            .map((run) => (
              <div key={run.at} className="flex gap-2 font-mono text-[12px] text-dsw-label-3">
                <span>{fmtTime(run.at)}</span>
                <span>
                  {run.passed}/{run.total}
                </span>
                <span>{run.ms}ms</span>
                <span>
                  {run.items.filter((item) => item.delta === 'fixed').length ? 'fixed ' + run.items.filter((item) => item.delta === 'fixed').length : ''}
                  {run.items.filter((item) => item.delta === 'broken').length ? ' broken ' + run.items.filter((item) => item.delta === 'broken').length : ''}
                </span>
              </div>
            ))}
        </div>
      ) : null}
    </Card>
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
    kind: 'run',
    plugin: name,
    label: '页面回归检查块',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: '写一组断言（元素存在 / 文案匹配 / 数量相等 / 接口状态码），点「跑一遍」逐条出通过失败，结果存进块 data.runs 并能和上一次对比（fixed / broken）',
    aliases: ['run', 'regression', 'test', 'assert', '回归', '断言', '检查'],
    defaults: {
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
