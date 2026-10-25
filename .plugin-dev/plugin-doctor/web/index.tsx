import { Badge, Button, Card, CardHeader, CardTitle, ReUI, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './reui'

const React = globalThis.React
const { useState } = React

export const name = 'plugin-doctor'
export const inject = ['pageEditor']

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
  problems: string[]
}

type ScanResult = {
  scannedAt: number
  root: string
  total: number
  summary: { ok: number; warn: number; broken: number; bytes: number }
  plugins: PluginReport[]
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
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

function Chip(props: { label: string; on?: boolean; title?: string }) {
  return (
    <Badge title={props.title} variant={props.on ? 'on' : 'default'} className="mr-1">
      {props.label}
    </Badge>
  )
}

function DoctorBlock(props: BlockProps) {
  const report = (props.data && props.data.report ? props.data.report : null) as ScanResult | null
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

  return (
    <ReUI>
    <Card data-testid="plugin-doctor-block">
      <CardHeader>
        <CardTitle>插件体检</CardTitle>
        {props.writable ? (
          <Button data-testid="plugin-doctor-run" onClick={run} disabled={busy}>
            {busy ? '扫描中…' : '体检'}
          </Button>
        ) : (
          <span className="rui-muted">只读态 · 展示上次结果</span>
        )}
        {report ? (
          <span className="rui-muted">
            共 {report.total} 个插件 · 合规 {report.summary.ok} · 待修 {report.summary.warn} · 坏 {report.summary.broken} · 合计 {kb(report.summary.bytes)} · 扫描于 {clock(report.scannedAt)}
          </span>
        ) : null}
      </CardHeader>
      {error ? <div className="rui-muted" style={{ color: 'var(--rui-danger)' }}>{error}</div> : null}
      {!report ? (
        <div className="rui-muted">
          还没有体检结果{props.writable ? '，点「体检」扫一遍 .plugin。' : '。'}
        </div>
      ) : (
        <>
          <Table data-testid="plugin-doctor-table">
            <TableHeader>
              <TableRow className="border-0">
                <TableHead>插件</TableHead>
                <TableHead>headless</TableHead>
                <TableHead>host / web</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>最近运行</TableHead>
                <TableHead>README 示例</TableHead>
                <TableHead>体检结论</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.plugins.map((item) => {
                const tone =
                  item.conclusion === '缺引擎' || item.conclusion === '空插件' ? 'destructive' : item.conclusion === '合规' ? 'on' : 'default'
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <code className="font-mono text-[12px]">{item.id}</code>
                      <div className="rui-muted">{item.name}</div>
                    </TableCell>
                    <TableCell>
                      <Chip label={item.headless ? '是' : '否'} on={item.headless} />
                    </TableCell>
                    <TableCell>
                      <Chip label="host" on={item.hasHost} />
                      <Chip label="web" on={item.hasWeb} />
                    </TableCell>
                    <TableCell>{kb(item.bytes)}</TableCell>
                    <TableCell title={item.lastRunAt ? clock(item.lastRunAt) : '没有运行记录'}>{when(item.lastRunAt)}</TableCell>
                    <TableCell>
                      {item.readmeExample ? <Chip label="有" on /> : <Chip label={item.readme ? '缺' : '无 README'} />}
                    </TableCell>
                    <TableCell>
                      <Badge title={(item.problems || []).join('；')} variant={tone}>
                        {item.conclusion}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="rui-muted" style={{ marginTop: 12 }}>扫描根目录：{report.root}</div>
        </>
      )}
    </Card>
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
    hint: '扫一遍已安装插件，给出合规结论',
    aliases: ['doctor', '体检', '插件体检', 'scan'],
    defaults: () => ({ report: null }),
    View: DoctorBlock,
  })
}
