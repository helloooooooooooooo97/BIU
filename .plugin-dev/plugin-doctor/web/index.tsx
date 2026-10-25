import { ActivityRings, Button, Cell, Group, ReUI } from './reui'

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
  ok: '#30d158',
  warn: '#ffd60a',
  error: '#ff453a',
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
  const total = Math.max(1, report?.total ?? 1)
  const visible = filter === 'all' ? plugins : plugins.filter((item) => levelOf(item) === filter)
  const grouped: Record<Level, PluginReport[]> = { error: [], warn: [], ok: [] }
  for (const item of visible) grouped[levelOf(item)].push(item)

  const setFilter = (next: 'all' | Level) => {
    if (props.writable) props.update({ filter: next })
  }
  const toggle = (id: string) => {
    if (props.writable) props.update({ focus: focus === id ? '' : id })
  }

  return (
    <ReUI className="rui-ios">
      <div data-testid="plugin-doctor-block">
        <div className="rui-large">插件</div>
        <div className="rui-sub">
          {report ? `${clock(report.scannedAt)} · ${kb(report.summary.bytes)} · ${(report.issues ?? []).length} 条 issue · ${report.root}` : '扫描已安装插件，按问题分组'}
        </div>
        <div style={{ margin: '0 16px 12px' }}>
          {props.writable ? (
            <Button data-testid="plugin-doctor-run" onClick={run} disabled={busy}>
              {busy ? '扫描中…' : '重新扫描'}
            </Button>
          ) : (
            <span className="rui-muted">只读</span>
          )}
        </div>
        {error ? (
          <div className="rui-sub" style={{ color: '#ff3b30' }}>
            {error}
          </div>
        ) : null}
        {!report ? (
          <div className="rui-sub">还没有体检结果{props.writable ? '，点「重新扫描」。' : '。'}</div>
        ) : (
          <>
            <div className="doc-rings">
              <ActivityRings
                rings={[
                  { value: ok / total, color: LEVEL_COLOR.ok },
                  { value: warn / total, color: LEVEL_COLOR.warn },
                  { value: broken / total, color: LEVEL_COLOR.error },
                ]}
              />
              <div className="rui-legend">
                <div>
                  <b>
                    <i style={{ background: LEVEL_COLOR.ok }} />
                    {ok}
                  </b>
                  <em>合规</em>
                </div>
                <div>
                  <b>
                    <i style={{ background: LEVEL_COLOR.warn }} />
                    {warn}
                  </b>
                  <em>待修</em>
                </div>
                <div>
                  <b>
                    <i style={{ background: LEVEL_COLOR.error }} />
                    {broken}
                  </b>
                  <em>问题</em>
                </div>
              </div>
            </div>
            <div className="doc-filters">
              {([
                ['all', `全部 ${plugins.length}`],
                ['error', `问题 ${broken}`],
                ['warn', `待修 ${warn}`],
                ['ok', `合规 ${ok}`],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className="doc-filter" data-on={filter === id} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div data-testid="plugin-doctor-table">
              {(['error', 'warn', 'ok'] as Level[]).map((level) =>
                grouped[level].length ? (
                  <div key={level}>
                    <div className="rui-section">{LEVEL_LABEL[level]} · {grouped[level].length}</div>
                    <Group>
                      {grouped[level].map((item) => {
                        const open = focus === item.id
                        return (
                          <div key={item.id}>
                            <Cell className="doc-issue" data-open={open} onClick={() => toggle(item.id)}>
                              <i className="doc-dot" style={{ background: LEVEL_COLOR[level] }} />
                              <span className="rui-cell-main">
                                <b style={{ fontWeight: 600 }}>{item.name}</b>
                                <div className="rui-muted">{item.id}</div>
                              </span>
                              <span className="rui-cell-meta">{item.conclusion}</span>
                            </Cell>
                            {open ? (
                              <div style={{ padding: '8px 16px 14px 38px', fontSize: 13, color: '#6d6d72' }}>
                                <div>
                                  {item.hasHost ? 'host' : '无 host'} · {item.hasWeb ? 'web' : '无 web'}
                                  {item.headless ? ' · 无头' : ''} · {kb(item.bytes)} · {item.files} 文件
                                </div>
                                <div>最近运行 {when(item.lastRunAt)}</div>
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
                            ) : null}
                          </div>
                        )
                      })}
                    </Group>
                  </div>
                ) : null,
              )}
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
    hint: '扫描已安装插件：环摘要 + 按问题分组，点开看详情',
    aliases: ['doctor', '体检', '插件体检', 'scan'],
    defaults: () => ({ report: null, filter: 'all', focus: '' }),
    View: DoctorBlock,
  })
}
