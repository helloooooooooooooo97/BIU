/**
 * API 调试块（api-playground）
 *
 * 文档里长出来的 Mini-Postman：填 method / url / headers / body，点「发送」，
 * 由 host 侧的 /api/api-playground/send 真发 HTTP 请求（Node fetch），
 * 把状态码、耗时、响应头、响应体（JSON 自动美化）画回块里。
 *
 * 请求历史写进块 data.history（最近 20 条）——跟着文档走，不是跟着浏览器走。
 */
import { Button, Card, ConfirmDialog, Input, Label, ReUI, Select, Tabs, TabsTrigger, TagChip, Textarea } from './reui'

const React = globalThis.React
const { useEffect, useMemo, useRef, useState } = React

export const name = 'api-playground'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>, opts?: { replace?: boolean }) => void
  writable: boolean
}

type Result = {
  ok: boolean
  method?: string
  url?: string
  finalUrl?: string
  status?: number
  statusText?: string
  ms?: number
  bytes?: number
  truncated?: boolean
  headers?: Record<string, string>
  body?: string
  error?: string
  at?: number
}

type HistoryEntry = {
  at: number
  method: string
  url: string
  headers: string
  body: string
  status: number
  statusText: string
  ms: number
  bytes: number
  truncated: boolean
  error?: string
  /** 响应体前 4000 字，给历史一个可读的回放；完整响应在块里现发一次就有。 */
  preview: string
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
/** 存进文档的响应体上限（字符）：文档不是日志盘，别把 200KB 塞进 md。 */
const STORE_LIMIT = 20000
const HISTORY_LIMIT = 20
const PREVIEW_LIMIT = 4000

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function cap(text: string, limit: number) {
  return text.length > limit ? text.slice(0, limit) : text
}

function pretty(text: string) {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return { text: '', json: false }
  const first = trimmed[0]
  if (first !== '{' && first !== '[') return { text, json: false }
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), json: true }
  } catch {
    return { text, json: false }
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatClock(at: number) {
  if (!Number.isFinite(at)) return ''
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function statusChip(status: number | undefined, ok: boolean) {
  if (!ok || !status) return { id: 'err', label: '请求失败' }
  if (status < 300) return { id: 'ok', label: `${status}`.trim() }
  if (status < 500) return { id: 'warn', label: `${status}` }
  return { id: 'fail', label: `${status}` }
}

function readHistory(data: Record<string, unknown>): HistoryEntry[] {
  const raw = data.history
  if (!Array.isArray(raw)) return []
  return raw.filter((item) => item && typeof item === 'object') as HistoryEntry[]
}

function readResult(data: Record<string, unknown>): Result | null {
  const raw = data.last
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Result
}

function ApiPlaygroundBlock({ data, update, writable }: BlockProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stored = useMemo(() => readResult(data), [data.last])
  const history = useMemo(() => readHistory(data), [data.history])

  const [form, setForm] = useState({
    method: asText(data.method) || 'GET',
    url: asText(data.url),
    headers: asText(data.headers),
    body: asText(data.body),
  })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<Result | null>(() => stored)
  const [tab, setTab] = useState<'request' | 'response'>(stored ? 'response' : 'request')
  const [histOpen, setHistOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // 外部改了文档（别的 agent / 撤销 / 重开页面）时同步字段，但别抢正在输入的用户。
  useEffect(() => {
    const el = hostRef.current
    if (el && el.contains(document.activeElement)) return
    setForm({
      method: asText(data.method) || 'GET',
      url: asText(data.url),
      headers: asText(data.headers),
      body: asText(data.body),
    })
  }, [data.method, data.url, data.headers, data.body])

  const active = result ?? stored
  const activeHeaders = active?.headers ?? {}
  const bodyView = useMemo(() => pretty(asText(active?.body)), [active?.body])

  const commit = (patch: Record<string, unknown>) => {
    if (!writable) return
    update(patch)
  }

  const patchForm = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))

  const send = async () => {
    if (sending || !writable) return
    const url = form.url.trim()
    setTab('response')
    if (!url) {
      setResult({ ok: false, error: '先填 url', ms: 0, at: Date.now() })
      return
    }
    setSending(true)
    const started = Date.now()
    let next: Result
    try {
      const res = await fetch('/api/api-playground/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: form.method, url, headers: form.headers, body: form.body }),
      })
      const json = (await res.json()) as Result & { error?: string }
      next = { ...json, at: Date.now() }
      if (!res.ok) next = { ok: false, url, error: String(json?.error ?? `本机路由 HTTP ${res.status}`), ms: Date.now() - started, at: Date.now() }
    } catch (error) {
      next = { ok: false, url, error: String((error as Error)?.message ?? error), ms: Date.now() - started, at: Date.now() }
    }
    setSending(false)
    setResult(next)

    const entry: HistoryEntry = {
      at: next.at ?? Date.now(),
      method: form.method,
      url,
      headers: form.headers,
      body: form.body,
      status: next.status ?? 0,
      statusText: next.statusText ?? '',
      ms: next.ms ?? Date.now() - started,
      bytes: next.bytes ?? 0,
      truncated: Boolean(next.truncated),
      error: next.error,
      preview: cap(asText(next.body), PREVIEW_LIMIT),
    }
    // 写回文档：请求参数 + 最近 20 条历史 + 最后一次响应（有截断，别让文档变日志盘）。
    commit({
      method: form.method,
      url,
      headers: form.headers,
      body: form.body,
      history: [entry, ...history].slice(0, HISTORY_LIMIT),
      last: { ...next, body: cap(asText(next.body), STORE_LIMIT) },
    })
  }

  const onKeyDown = (event: { key: string; metaKey?: boolean; ctrlKey?: boolean; preventDefault: () => void; stopPropagation: () => void }) => {
    event.stopPropagation()
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void send()
    }
  }

  const loadHistory = (entry: HistoryEntry) => {
    patchForm({ method: entry.method, url: entry.url, headers: entry.headers, body: entry.body })
    commit({ method: entry.method, url: entry.url, headers: entry.headers, body: entry.body })
    setResult({
      ok: !entry.error,
      status: entry.status || undefined,
      statusText: entry.statusText,
      ms: entry.ms,
      bytes: entry.bytes,
      truncated: entry.truncated,
      error: entry.error,
      body: entry.preview,
      at: entry.at,
    })
    setTab('response')
  }

  const clearHistory = () => commit({ history: [] })

  const editable = writable

  return (
    <ReUI>
    <Card data-testid="api-playground-block" data-plugin={name} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div ref={hostRef} className="contents">
      <div className="rui-row">
        <Select
          style={{ width: 92, fontFamily: 'ui-monospace,monospace' }}
          data-testid="api-playground-method"
          value={form.method}
          disabled={!editable}
          onChange={(event: { target: { value: string } }) => patchForm({ method: event.target.value })}
          onBlur={() => commit({ method: form.method })}
          title="HTTP 方法"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Input
          className="rui-grow font-mono"
          data-testid="api-playground-url"
          value={form.url}
          spellCheck={false}
          placeholder="http://127.0.0.1:3141/api/page-terminal/shell"
          disabled={!editable}
          onChange={(event: { target: { value: string } }) => patchForm({ url: event.target.value })}
          onBlur={() => commit({ url: form.url })}
          onKeyDown={onKeyDown}
        />
        <Button
          data-testid="api-playground-send"
          disabled={!editable || sending}
          onClick={() => void send()}
          title="发送请求（⌘/Ctrl + ↵）"
        >
          {sending ? '发送中…' : '发送'}
        </Button>
      </div>

      <Tabs>
        <TabsTrigger
          active={tab === 'request'}
          data-testid="api-playground-tab-request"
          onClick={() => setTab('request')}
        >
          请求
        </TabsTrigger>
        <TabsTrigger
          active={tab === 'response'}
          data-testid="api-playground-tab-response"
          onClick={() => setTab('response')}
        >
          响应
        </TabsTrigger>
        {active && !sending ? (
          <span data-testid="api-playground-status">
            <TagChip
              id={statusChip(active.status, active.ok).id}
              label={active.ok ? `${active.status} ${active.statusText || ''}`.trim() : '请求失败'}
            />
          </span>
        ) : null}
        {sending ? <span className="rui-muted">请求中…</span> : null}
        <span style={{ flex: 1 }} />
        <span className="rui-muted">⌘/Ctrl + ↵ 发送</span>
      </Tabs>

      {tab === 'request' ? (
        <div className="flex flex-col gap-2" data-testid="api-playground-request-pane">
          <div className="flex flex-col gap-1">
            <Label>请求头 headers</Label>
            <Textarea
              className="min-h-[62px] font-mono"
              data-testid="api-playground-headers"
              spellCheck={false}
              value={form.headers}
              placeholder={'Content-Type: application/json\nAuthorization: Bearer ...'}
              disabled={!editable}
              onChange={(event: { target: { value: string } }) => patchForm({ headers: event.target.value })}
              onBlur={() => commit({ headers: form.headers })}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>请求体 body</Label>
            <Textarea
              className="min-h-[84px] font-mono"
              data-testid="api-playground-body"
              spellCheck={false}
              value={form.body}
              placeholder={'{\n  "name": "biu"\n}'}
              disabled={!editable}
              onChange={(event: { target: { value: string } }) => patchForm({ body: event.target.value })}
              onBlur={() => commit({ body: form.body })}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="api-playground-response-pane">
          {!active ? (
            <div className="rui-muted">还没发过请求。填好上面的 url，点「发送」。</div>
          ) : active.error ? (
            <div data-testid="api-playground-error" style={{ color: 'var(--rui-danger)' }}>
              {active.error}
            </div>
          ) : (
            <React.Fragment>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rui-muted">{active.ms ?? 0} ms</span>
                <span className="rui-muted">{formatBytes(active.bytes ?? 0)}</span>
                {active.truncated ? (
                  <span className="rui-muted" data-testid="api-playground-truncated">
                    已截断：只回传前 200 KB
                  </span>
                ) : null}
                {active.finalUrl && active.finalUrl !== active.url ? (
                  <span className="rui-muted">重定向到 {active.finalUrl}</span>
                ) : null}
              </div>
              {Object.keys(activeHeaders).length ? (
                <details className="rui-card" style={{ padding: 10 }} data-testid="api-playground-res-headers-wrap">
                  <summary className="rui-muted" style={{ cursor: 'pointer' }}>
                    响应头 · {Object.keys(activeHeaders).length} 条
                  </summary>
                  <div className="mt-2 flex max-h-[200px] flex-col gap-0.5 overflow-auto" data-testid="api-playground-res-headers">
                    {Object.entries(activeHeaders).map(([key, value]) => (
                      <div className="flex gap-2 font-mono text-[12px]" key={key}>
                        <span className="rui-muted" style={{ width: '34%', wordBreak: 'break-all' }}>{key}</span>
                        <span className="min-w-0 flex-1 break-all">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              <div className="flex flex-col gap-1">
                <Label>
                  响应体{bodyView.json ? ' · 已自动美化 JSON' : ''}
                </Label>
                <pre className="rui-textarea" style={{ margin: 0, maxHeight: 280, overflow: 'auto', fontFamily: 'ui-monospace,monospace' }} data-testid="api-playground-res-body">
                  {bodyView.text || '（空响应体）'}
                </pre>
              </div>
            </React.Fragment>
          )}
        </div>
      )}

      <div className="rui-sep" style={{ height: 'auto', background: 'transparent', borderTop: '1px solid var(--rui-border)', paddingTop: 12 }} data-testid="api-playground-history">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            data-testid="api-playground-history-toggle"
            onClick={() => setHistOpen((v: boolean) => !v)}
          >
            {histOpen ? '收起历史' : `历史（${history.length}）`}
          </Button>
          {history.length ? (
            <Button variant="ghost" disabled={!editable} onClick={() => setConfirmClear(true)}>
              清空
            </Button>
          ) : null}
          <span className="flex-1" />
          <span className="rui-muted">历史存在块数据里，跟文档一起版本化</span>
        </div>
        {histOpen && history.length ? (
          <div className="mt-1.5 flex max-h-[180px] flex-col gap-px overflow-auto">
            {history.map((entry: HistoryEntry, index: number) => (
              <button
                type="button"
                className="rui-btn rui-btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', height: 32, fontFamily: 'ui-monospace,monospace' }}
                key={`${entry.at}-${index}`}
                onClick={() => loadHistory(entry)}
                title="载回这次请求"
              >
                <span className="rui-muted" style={{ width: 52, fontWeight: 650 }}>{entry.method}</span>
                <span className="min-w-0 flex-1 truncate">{entry.url}</span>
                <TagChip
                  id={statusChip(entry.status, !entry.error).id}
                  label={entry.error ? 'ERR' : String(entry.status)}
                />
                <span className="rui-muted">{entry.ms}ms · {formatClock(entry.at)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {confirmClear ? (
        <ConfirmDialog
          title="清空历史"
          message="历史写在文档里。清空后只能靠撤销找回。"
          confirmLabel="清空"
          danger
          testId="api-playground-clear-confirm"
          onConfirm={() => {
            clearHistory()
            setConfirmClear(false)
          }}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}
      </div>
    </Card>
    </ReUI>
  )
}

export function apply(ctx: {
  pageEditor: { registerBlock: (spec: Record<string, unknown>) => void }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'api-play',
    plugin: name,
    label: 'API 调试块',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: '填 method / url / headers / body，点发送，host 侧真发 HTTP 请求，状态码 / 耗时 / 响应头 / 响应体都显示在块里；历史存进块数据',
    aliases: ['api', 'http', 'request', 'curl', 'postman', '接口', '调试'],
    assets: [],
    defaults: () => ({
      title: 'API 调试',
      method: 'GET',
      url: 'http://127.0.0.1:3141/api/page-terminal/shell',
      headers: 'Content-Type: application/json',
      body: '',
      history: [],
    }),
    View: ApiPlaygroundBlock,
  })
}
