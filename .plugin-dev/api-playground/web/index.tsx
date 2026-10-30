/**
 * API 调试块（api-playground）
 *
 * Insomnia / Paw / Postman / Bruno：左侧历史集合，顶栏 method+url+Send，
 * 请求 Params / Headers / Body 用键值表，响应 Body / Headers 分栏。
 * 发送走 host /api/api-playground/send。
 */
import { Button, ConfirmDialog, Input, ReUI, Select, Textarea } from '@biu/reui'

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

type KvRow = { id: string; enabled: boolean; key: string; value: string }

type HistoryEntry = {
  at: number
  method: string
  url: string
  headers: string
  headerRows?: KvRow[]
  queryRows?: KvRow[]
  body: string
  status: number
  statusText: string
  ms: number
  bytes: number
  truncated: boolean
  error?: string
  preview: string
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
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

function nid() {
  return Math.random().toString(36).slice(2, 10)
}

function emptyRow(): KvRow {
  return { id: nid(), enabled: true, key: '', value: '' }
}

function parseHeaderText(text: string): KvRow[] {
  const rows: KvRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    const at = trimmed.indexOf(':')
    if (at <= 0) rows.push({ id: nid(), enabled: true, key: trimmed, value: '' })
    else rows.push({ id: nid(), enabled: true, key: trimmed.slice(0, at).trim(), value: trimmed.slice(at + 1).trim() })
  }
  if (!rows.length) rows.push(emptyRow())
  return rows
}

function readRows(raw: unknown, fallbackText: string): KvRow[] {
  if (Array.isArray(raw)) {
    const rows = raw
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const row = item as Record<string, unknown>
        return {
          id: asText(row.id) || nid(),
          enabled: row.enabled !== false,
          key: asText(row.key ?? row.name),
          value: asText(row.value),
        }
      })
    return rows.length ? rows : [emptyRow()]
  }
  return parseHeaderText(fallbackText)
}

function serializeHeaders(rows: KvRow[]) {
  return rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => `${row.key.trim()}: ${row.value}`)
    .join('\n')
}

function queryObject(rows: KvRow[]) {
  const out: Record<string, string> = {}
  for (const row of rows) {
    if (!row.enabled || !row.key.trim()) continue
    out[row.key.trim()] = row.value
  }
  return out
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

function KvTable({
  rows,
  testId,
  disabled,
  onChange,
  onBlur,
}: {
  rows: KvRow[]
  testId: string
  disabled: boolean
  onChange: (rows: KvRow[]) => void
  onBlur: () => void
}) {
  const setRow = (id: string, patch: Partial<KvRow>) => {
    const next = rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    const last = next[next.length - 1]
    if (last && (last.key || last.value)) next.push(emptyRow())
    onChange(next)
  }
  const remove = (id: string) => {
    const next = rows.filter((row) => row.id !== id)
    onChange(next.length ? next : [emptyRow()])
  }
  return (
    <table className="kv" data-testid={testId}>
      <thead>
        <tr>
          <th style={{ width: 28 }} />
          <th>Key</th>
          <th>Value</th>
          <th style={{ width: 36 }} />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <input
                type="checkbox"
                checked={row.enabled}
                disabled={disabled}
                onChange={(event: { target: { checked: boolean } }) => setRow(row.id, { enabled: event.target.checked })}
                onBlur={onBlur}
              />
            </td>
            <td>
              <input
                type="text"
                value={row.key}
                disabled={disabled}
                placeholder="Name"
                onChange={(event: { target: { value: string } }) => setRow(row.id, { key: event.target.value })}
                onBlur={onBlur}
              />
            </td>
            <td>
              <input
                type="text"
                value={row.value}
                disabled={disabled}
                placeholder="Value"
                onChange={(event: { target: { value: string } }) => setRow(row.id, { value: event.target.value })}
                onBlur={onBlur}
              />
            </td>
            <td>
              <button type="button" className="rui-btn rui-btn-ghost" disabled={disabled} onClick={() => { remove(row.id); onBlur() }} style={{ height: 24, padding: '0 6px' }}>
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ApiPlaygroundBlock({ data, update, writable }: BlockProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stored = useMemo(() => readResult(data), [data.last])
  const history = useMemo(() => readHistory(data), [data.history])

  const [method, setMethod] = useState(asText(data.method) || 'GET')
  const [url, setUrl] = useState(asText(data.url))
  const [headerRows, setHeaderRows] = useState<KvRow[]>(() => readRows(data.headerRows, asText(data.headers)))
  const [queryRows, setQueryRows] = useState<KvRow[]>(() => readRows(data.queryRows, ''))
  const [body, setBody] = useState(asText(data.body))
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<Result | null>(() => stored)
  const [reqTab, setReqTab] = useState<'params' | 'headers' | 'body'>(data.reqTab === 'headers' || data.reqTab === 'body' ? data.reqTab : 'params')
  const [resTab, setResTab] = useState<'body' | 'headers'>(data.resTab === 'headers' ? 'headers' : 'body')
  const [activeAt, setActiveAt] = useState<number>(typeof data.activeHistory === 'number' ? data.activeHistory : 0)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    const el = hostRef.current
    if (el && el.contains(document.activeElement)) return
    setMethod(asText(data.method) || 'GET')
    setUrl(asText(data.url))
    setHeaderRows(readRows(data.headerRows, asText(data.headers)))
    setQueryRows(readRows(data.queryRows, ''))
    setBody(asText(data.body))
  }, [data.method, data.url, data.headers, data.headerRows, data.queryRows, data.body])

  const active = result ?? stored
  const activeHeaders = active?.headers ?? {}
  const bodyView = useMemo(() => pretty(asText(active?.body)), [active?.body])
  const editable = writable

  const commit = (patch: Record<string, unknown>) => {
    if (!writable) return
    update(patch)
  }

  const persistForm = (extra: Record<string, unknown> = {}) => {
    commit({
      method,
      url,
      headers: serializeHeaders(headerRows),
      headerRows,
      queryRows,
      body,
      reqTab,
      resTab,
      ...extra,
    })
  }

  const send = async () => {
    if (sending || !writable) return
    const nextUrl = url.trim()
    setResTab('body')
    if (!nextUrl) {
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
        body: JSON.stringify({
          method,
          url: nextUrl,
          headers: headerRows,
          query: queryRows,
          body,
        }),
      })
      const json = (await res.json()) as Result & { error?: string }
      next = { ...json, at: Date.now() }
      if (!res.ok) next = { ok: false, url: nextUrl, error: String(json?.error ?? `本机路由 HTTP ${res.status}`), ms: Date.now() - started, at: Date.now() }
    } catch (error) {
      next = { ok: false, url: nextUrl, error: String((error as Error)?.message ?? error), ms: Date.now() - started, at: Date.now() }
    }
    setSending(false)
    setResult(next)
    const at = next.at ?? Date.now()
    setActiveAt(at)
    const entry: HistoryEntry = {
      at,
      method,
      url: nextUrl,
      headers: serializeHeaders(headerRows),
      headerRows,
      queryRows,
      body,
      status: next.status ?? 0,
      statusText: next.statusText ?? '',
      ms: next.ms ?? Date.now() - started,
      bytes: next.bytes ?? 0,
      truncated: Boolean(next.truncated),
      error: next.error,
      preview: cap(asText(next.body), PREVIEW_LIMIT),
    }
    commit({
      method,
      url: nextUrl,
      headers: serializeHeaders(headerRows),
      headerRows,
      queryRows,
      body,
      history: [entry, ...history].slice(0, HISTORY_LIMIT),
      last: { ...next, body: cap(asText(next.body), STORE_LIMIT) },
      activeHistory: at,
      resTab: 'body',
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
    setMethod(entry.method)
    setUrl(entry.url)
    setHeaderRows(entry.headerRows?.length ? entry.headerRows : parseHeaderText(entry.headers || ''))
    setQueryRows(entry.queryRows?.length ? entry.queryRows : [emptyRow()])
    setBody(entry.body)
    setActiveAt(entry.at)
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
    commit({
      method: entry.method,
      url: entry.url,
      headers: entry.headers,
      headerRows: entry.headerRows,
      queryRows: entry.queryRows,
      body: entry.body,
      activeHistory: entry.at,
    })
    setResTab('body')
  }

  const statusLabel = !active ? '' : active.ok ? `${active.status ?? ''} ${active.statusText || ''}`.trim() : '请求失败'
  const statusColor = !active ? '#8e8e93' : !active.ok || (active.status ?? 0) >= 500 ? '#c53030' : (active.status ?? 0) >= 400 ? '#c47b17' : '#2d8a4e'

  return (
    <ReUI>
      <div data-testid="api-playground-block" data-plugin={name} className="rui-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="ins-shell" ref={hostRef}>
          <aside className="ins-side" data-testid="api-playground-history">
            <h4>Collection</h4>
            <div className="rui-row" style={{ padding: '0 10px 6px' }}>
              <span className="rui-muted" style={{ fontSize: 12 }}>{history.length} 条</span>
              <span className="rui-grow" />
              {history.length ? (
                <button type="button" className="rui-btn rui-btn-ghost" disabled={!editable} onClick={() => setConfirmClear(true)} style={{ height: 24, fontSize: 12 }}>
                  清空
                </button>
              ) : null}
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {history.length ? history.map((entry: HistoryEntry, index: number) => (
                <button
                  type="button"
                  className="ins-hit"
                  data-on={entry.at === activeAt}
                  key={`${entry.at}-${index}`}
                  onClick={() => loadHistory(entry)}
                >
                  <span className={`m-${entry.method}`}>{entry.method}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.url}</span>
                </button>
              )) : (
                <div className="ins-empty">还没有请求。发出去的会记在文档里。</div>
              )}
            </div>
            <button
              type="button"
              className="ins-hit"
              data-testid="api-playground-history-toggle"
              style={{ display: 'none' }}
              onClick={() => undefined}
            />
          </aside>
          <div className="ins-main">
            <div className="ins-urlbar">
              <Select
                style={{ width: 108, fontFamily: 'ui-monospace,monospace', fontWeight: 700 }}
                data-testid="api-playground-method"
                value={method}
                disabled={!editable}
                onChange={(event: { target: { value: string } }) => setMethod(event.target.value)}
                onBlur={() => persistForm()}
              >
                {METHODS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
              <Input
                className="rui-grow font-mono"
                data-testid="api-playground-url"
                value={url}
                spellCheck={false}
                placeholder="https://api.example.com/v1"
                disabled={!editable}
                onChange={(event: { target: { value: string } }) => setUrl(event.target.value)}
                onBlur={() => persistForm()}
                onKeyDown={onKeyDown}
              />
              <Button data-testid="api-playground-send" disabled={!editable || sending} onClick={() => void send()}>
                {sending ? '发送中…' : 'Send'}
              </Button>
            </div>
            <div className="ins-panes" data-testid="api-playground-tab-request">
              {([['params', 'Params'], ['headers', 'Headers'], ['body', 'Body']] as const).map(([id, label]) => (
                <button key={id} type="button" data-on={reqTab === id} onClick={() => { setReqTab(id); persistForm({ reqTab: id }) }}>
                  {label}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button type="button" data-testid="api-playground-tab-response" data-on={false} onClick={() => setResTab('body')} style={{ display: 'none' }} />
            </div>
            <div className="ins-body" data-testid="api-playground-request-pane">
              {reqTab === 'params' ? (
                <KvTable rows={queryRows} testId="api-playground-query" disabled={!editable} onChange={setQueryRows} onBlur={() => persistForm()} />
              ) : null}
              {reqTab === 'headers' ? (
                <KvTable rows={headerRows} testId="api-playground-headers" disabled={!editable} onChange={setHeaderRows} onBlur={() => persistForm()} />
              ) : (
                <textarea data-testid={reqTab === 'body' ? undefined : 'api-playground-headers'} readOnly value={serializeHeaders(headerRows)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0 }} />
              )}
              {reqTab === 'body' ? (
                <Textarea
                  style={{ minHeight: 160, fontFamily: 'ui-monospace,monospace' }}
                  data-testid="api-playground-body"
                  spellCheck={false}
                  value={body}
                  placeholder={'{\n  "name": "biu"\n}'}
                  disabled={!editable}
                  onChange={(event: { target: { value: string } }) => setBody(event.target.value)}
                  onBlur={() => persistForm()}
                  onKeyDown={onKeyDown}
                />
              ) : (
                <textarea data-testid="api-playground-body" readOnly value={body} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0 }} />
              )}
            </div>
            <div className="ins-status" data-testid="api-playground-status">
              {sending ? <span className="rui-muted">请求中…</span> : active ? (
                <>
                  <b style={{ color: statusColor }}>{statusLabel || '—'}</b>
                  <span className="rui-muted">{active.ms ?? 0} ms</span>
                  <span className="rui-muted">{formatBytes(active.bytes ?? 0)}</span>
                  {active.truncated ? <span className="rui-muted" data-testid="api-playground-truncated">截断 200 KB</span> : null}
                  {active.finalUrl && active.finalUrl !== active.url ? <span className="rui-muted truncate">→ {active.finalUrl}</span> : null}
                </>
              ) : <span className="rui-muted">⌘/Ctrl + ↵ Send</span>}
            </div>
            <div className="ins-panes">
              {([['body', 'Body'], ['headers', 'Headers']] as const).map(([id, label]) => (
                <button key={id} type="button" data-on={resTab === id} onClick={() => { setResTab(id); persistForm({ resTab: id }) }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="ins-body" data-testid="api-playground-response-pane" style={{ minHeight: 140 }}>
              {!active ? (
                <div className="ins-empty">还没发过请求。</div>
              ) : active.error ? (
                <div data-testid="api-playground-error" style={{ color: 'var(--biu-color-danger)' }}>{active.error}</div>
              ) : resTab === 'headers' ? (
                <div data-testid="api-playground-res-headers-wrap">
                  <div data-testid="api-playground-res-headers">
                    <table className="kv">
                      <thead>
                        <tr><th>Header</th><th>Value</th></tr>
                      </thead>
                      <tbody>
                        {Object.entries(activeHeaders).map(([key, value]) => (
                          <tr key={key}><td className="rui-muted">{key}</td><td>{String(value)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <pre className="rui-textarea" style={{ margin: 0, maxHeight: 260, overflow: 'auto', fontFamily: 'ui-monospace,monospace' }} data-testid="api-playground-res-body">
                  {bodyView.text || '（空响应体）'}
                </pre>
              )}
            </div>
          </div>
        </div>
        {confirmClear ? (
          <ConfirmDialog
            title="清空历史"
            message="历史写在文档里。清空后只能靠撤销找回。"
            confirmLabel="清空"
            danger
            testId="api-playground-clear-confirm"
            onConfirm={() => {
              commit({ history: [] })
              setConfirmClear(false)
            }}
            onCancel={() => setConfirmClear(false)}
          />
        ) : null}
      </div>
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
    hint: 'Insomnia 式：Params / Headers / Body + 左侧历史，host 真发 HTTP',
    aliases: ['api', 'http', 'request', 'curl', 'postman', 'insomnia', '接口', '调试'],
    assets: [],
    defaults: () => ({
      title: 'API 调试',
      method: 'GET',
      url: 'http://127.0.0.1:3141/api/page-terminal/shell',
      headers: 'Content-Type: application/json',
      headerRows: [{ id: 'ct', enabled: true, key: 'Content-Type', value: 'application/json' }],
      queryRows: [{ id: 'q0', enabled: true, key: '', value: '' }],
      body: '',
      reqTab: 'headers',
      resTab: 'body',
      history: [],
    }),
    View: ApiPlaygroundBlock,
  })
}
