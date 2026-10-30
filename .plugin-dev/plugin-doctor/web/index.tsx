import { Button, ReUI } from '@biu/reui'

const React = globalThis.React
const { useState } = React

export const name = 'plugin-doctor'
export const inject = ['pageEditor']

type Level = 'ok' | 'warn' | 'error'

type PluginReport = {
  id: string
  name: string
  headless: boolean
  hasHost: boolean
  hasWeb: boolean
  bytes: number
  files: number
  enabled: boolean
  lastRunAt: number | null
  readme: boolean
  readmeExample: boolean
  conclusion: string
  level?: Level
  problems: string[]
}

type Issue = {
  id: string
  pluginId: string
  name: string
  level: Level
  title: string
  detail: string
}

type ScanResult = {
  scannedAt: number
  root: string
  total: number
  summary: { ok: number; warn: number; broken: number; bytes: number }
  plugins: PluginReport[]
  issues?: Issue[]
}

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

function kb(bytes: number) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function when(ts: number | null) {
  if (!ts) return '从没跑过'
  const diff = Date.now() - ts
  const day = 24 * 60 * 60 * 1000
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return Math.round(diff / 60000) + ' 分钟前'
  if (diff < day) return Math.round(diff / 3600000) + ' 小时前'
  return Math.round(diff / day) + ' 天前'
}

function clock(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function levelOf(item: PluginReport): Level {
  if (item.level === 'ok' || item.level === 'warn' || item.level === 'error') return item.level
  if (item.conclusion === '合规') return 'ok'
  if (item.conclusion === '空插件' || item.conclusion === '缺引擎') return 'error'
  return 'warn'
}

const LEVEL_COLOR: Record<Level, string> = {
  ok: '#2ecd72',
  warn: '#f5b000',
  error: '#f55459',
}

const LEVEL_LABEL: Record<Level, string> = {
  ok: '合规',
  warn: '待修',
  error: '问题',
}

function DoctorBlock(props: BlockProps) {
  const report = (props.data && props.data.report ? props.data.report : null) as ScanResult | null
  const filter = (props.data.filter === 'ok' || props.data.filter === 'warn' || props.data.filter === 'error' ? props.data.filter : 'all') as 'all' | Level
  const focus = typeof props.data.focus === 'string' ? props.data.focus : ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/plugin-doctor/scan')
      const body = (await res.json()) as ScanResult & { error?: string }
      if (!res.ok || body.error) throw new Error(body.error || 'HTTP ' + res.status)
      if (props.writable) props.update({ report: body })
      else setError('只读态：这里只展示上次体检结果')
    } catch (e) {
      setError(String((e && (e as Error).message) || e))
    } finally {
      setBusy(false)
    }
  }

  const plugins = report?.plugins ?? []
  const ok = report?.summary.ok ?? 0
  const warn = report?.summary.warn ?? 0
  const broken = report?.summary.broken ?? 0
  const total = Math.max(0, report?.total ?? 0)
  const issueCount = report?.issues?.length ?? plugins.reduce((n, item) => n + (item.problems?.length || 0), 0)
  const visible = filter === 'all' ? plugins : plugins.filter((item) => levelOf(item) === filter)
  const rank: Record<Level, number> = { error: 0, warn: 1, ok: 2 }
  const rows = [...visible].sort((a, b) => rank[levelOf(a)] - rank[levelOf(b)] || a.id.localeCompare(b.id))

  const setFilter = (next: 'all' | Level) => {
    if (props.writable) props.update({ filter: next })
  }
  const toggle = (id: string) => {
    if (props.writable) props.update({ focus: focus === id ? '' : id })
  }

  const barTotal = Math.max(1, ok + warn + broken)

  return (
    <ReUI>
      <div data-testid="plugin-doctor-block" className="doc-shell">
        <div className="doc-head">
          <div>
            <h2>Issues</h2>
            <p>
              {report
                ? `${clock(report.scannedAt)} · ${total} 个插件 · ${kb(report.summary.bytes)} · ${report.root}`
                : '扫描已安装插件，按 Sentry / Linear 的 issue 流呈现'}
            </p>
          </div>
          {props.writable ? (
            <Button data-testid="plugin-doctor-run" onClick={run} disabled={busy}>
              {busy ? '扫描中…' : '重新扫描'}
            </Button>
          ) : (
            <span className="rui-muted">只读</span>
          )}
        </div>
        {error ? (
          <div className="rui-sub" style={{ color: '#f55459' }}>
            {error}
          </div>
        ) : null}
        {!report ? (
          <div className="rui-sub">还没有体检结果{props.writable ? '，点「重新扫描」。' : '。'}</div>
        ) : (
          <>
            <div className="doc-stats">
              <div className="doc-stat">
                <b style={{ color: LEVEL_COLOR.error }}>{broken}</b>
                <em>Unresolved</em>
              </div>
              <div className="doc-stat">
                <b style={{ color: LEVEL_COLOR.warn }}>{warn}</b>
                <em>Warnings</em>
              </div>
              <div className="doc-stat">
                <b style={{ color: LEVEL_COLOR.ok }}>{ok}</b>
                <em>Resolved</em>
              </div>
            </div>
            <div className="doc-bar" aria-label={`${issueCount} issues`}>
              <i style={{ width: `${(broken / barTotal) * 100}%`, background: LEVEL_COLOR.error }} />
              <i style={{ width: `${(warn / barTotal) * 100}%`, background: LEVEL_COLOR.warn }} />
              <i style={{ width: `${(ok / barTotal) * 100}%`, background: LEVEL_COLOR.ok }} />
            </div>
            <div className="doc-filters">
              {([
                ['all', `All ${plugins.length}`],
                ['error', `Unresolved ${broken}`],
                ['warn', `Warnings ${warn}`],
                ['ok', `Resolved ${ok}`],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className="doc-filter" data-on={filter === id} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="doc-list" data-testid="plugin-doctor-table">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th style={{ width: 92 }}>Level</th>
                    <th>Issue</th>
                    <th style={{ width: 88 }}>Events</th>
                    <th style={{ width: 120 }}>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const level = levelOf(item)
                    const open = focus === item.id
                    const events = Math.max(item.problems?.length || 0, level === 'ok' ? 0 : 1)
                    return (
                      <React.Fragment key={item.id}>
                        <tr className="doc-row" data-open={open} onClick={() => toggle(item.id)}>
                          <td>
                            <span className="doc-lvl" style={{ color: LEVEL_COLOR[level] }}>{LEVEL_LABEL[level]}</span>
                          </td>
                          <td>
                            <div className="doc-title">{item.problems?.[0] || item.conclusion}</div>
                            <div className="doc-culprit">{item.name} · {item.id}</div>
                          </td>
                          <td>{events}</td>
                          <td>{when(item.lastRunAt)}</td>
                        </tr>
                        {open ? (
                          <tr>
                            <td colSpan={4}>
                              <div className="doc-detail">
                                {item.hasHost ? 'host' : '无 host'} · {item.hasWeb ? 'web' : '无 web'}
                                {item.headless ? ' · 无头' : ''} · {kb(item.bytes)} · {item.files} 文件
                                {(item.problems || []).length ? (
                                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                                    {item.problems.map((p) => (
                                      <li key={p}>{p}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div style={{ marginTop: 6 }}>没有未解决问题。</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </ReUI>
  )
}

export function apply(ctx: { pageEditor: { registerBlock: (spec: Record<string, unknown>) => void } }) {
  ctx.pageEditor.registerBlock({
    kind: 'plugin-doctor',
    plugin: name,
    label: '插件体检',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: '扫描已安装插件：issue 计数、严重度条、按问题分组',
    aliases: ['doctor', '体检', '插件体检', 'scan'],
    defaults: () => ({ report: null, filter: 'all', focus: '' }),
    View: DoctorBlock,
  })
}
