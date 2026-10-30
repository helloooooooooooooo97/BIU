import { Button, Input, ReUI, Textarea } from '@biu/reui'

const React = globalThis.React
const { useState, useMemo, useEffect, useRef } = React

export const name = 'option-matrix'
export const inject = ['pageEditor']

type Criterion = { name: string; weight: number; higherIsBetter: boolean }
type Scores = Record<string, Record<string, number>>
type Data = {
  title?: string
  scale?: number
  options?: string[]
  criteria?: Criterion[]
  scores?: Scores
  highlight?: string
  editing?: boolean
}

type Cell = { name: string; raw: number; norm: number; weighted: number }

const SCALE = 5

const DEFAULTS: Data = {
  title: '登录方案选型',
  scale: SCALE,
  options: ['手机号+验证码', '微信一键登录', '账号密码'],
  criteria: [
    { name: '开发成本', weight: 3, higherIsBetter: false },
    { name: '安全性', weight: 5, higherIsBetter: true },
    { name: '转化率', weight: 5, higherIsBetter: true },
  ],
  scores: {
    '手机号+验证码': { 开发成本: 4, 安全性: 4, 转化率: 4 },
    '微信一键登录': { 开发成本: 3, 安全性: 4, 转化率: 5 },
    '账号密码': { 开发成本: 5, 安全性: 2, 转化率: 2 },
  },
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function normScore(raw: number, higherIsBetter: boolean, scale: number): number {
  const v = Math.max(0, Math.min(scale, raw))
  // 关键：越低越好的维度反向计入 —— 高分代表成本高，这里换成 (scale+1-v)
  return higherIsBetter ? v : scale + 1 - v
}

type Row = { option: string; cells: (Cell & { best: boolean })[]; total: number; percent: number; rank: number }

function compute(data: Data) {
  const scale = Math.max(1, num(data.scale, SCALE))
  const options = data.options ?? []
  const criteria = data.criteria ?? []
  const scores = data.scores ?? {}
  const maxTotal = criteria.reduce((a, c) => a + Math.max(0, num(c.weight, 0)) * scale, 0)

  const rawRows: Row[] = options.map((option) => {
    const cells = criteria.map((c) => {
      const raw = Math.max(0, Math.min(scale, num(scores[option]?.[c.name], 0)))
      const higherIsBetter = c.higherIsBetter !== false
      const norm = normScore(raw, higherIsBetter, scale)
      const weighted = num(c.weight, 0) * norm
      return { name: c.name, raw, norm, weighted, best: false }
    })
    const total = cells.reduce((a, x) => a + x.weighted, 0)
    return { option, cells, total, percent: maxTotal ? total / maxTotal : 0, rank: 0 }
  })

  // 每个维度的最优格高亮（越高越好取最大，越低越好取最小 → 归一化后都是最大）
  criteria.forEach((_, ci) => {
    const bestNorm = Math.max(...rawRows.map((r) => (r.cells[ci] ? r.cells[ci].norm : -Infinity)), -Infinity)
    rawRows.forEach((r) => {
      if (r.cells[ci] && bestNorm > -Infinity && r.cells[ci].norm === bestNorm) r.cells[ci].best = true
    })
  })

  const ranked = [...rawRows].sort((a, b) => b.total - a.total || a.option.localeCompare(b.option))
  ranked.forEach((r, i) => {
    r.rank = i + 1
  })

  // 「为什么推荐它」：把各维度最优项拼起来
  const reasons = criteria.map((c) => {
    const higherIsBetter = c.higherIsBetter !== false
    const bestNorm = Math.max(...rawRows.map((r) => (r.cells.find((x) => x.name === c.name)?.norm ?? -Infinity)), -Infinity)
    const winners = rawRows.filter((r) => (r.cells.find((x) => x.name === c.name)?.norm ?? -Infinity) === bestNorm).map((r) => r.option)
    return { name: c.name, winners, higherIsBetter }
  })

  const winner = ranked[0] ?? null
  let rationale = ''
  if (winner) {
    const parts = reasons.map((r) => `「${r.name}」→ ${r.winners.join(' / ')}${r.higherIsBetter ? '' : '（越低越好）'}`)
    rationale = `推荐「${winner.option}」：加权总分 ${winner.total.toFixed(1)} / 满分 ${maxTotal.toFixed(1)}（${(winner.percent * 100).toFixed(1)}%）。各维度最优：${parts.join('；')}。`
  }

  return { scale, options, criteria, rows: rawRows, ranked, maxTotal, winner, rationale }
}

function toMarkdown(data: Data): string {
  const { scale, criteria, ranked } = compute(data)
  const arrow = (c: Criterion) => (c.higherIsBetter === false ? '↓越低越好' : '↑越高越好')
  const head = ['方案', ...criteria.map((c) => `${c.name} (权重${c.weight}, ${arrow(c)})`), '加权总分', '推荐']
  const sep = head.map(() => '---')
  const lines = [
    `### ${data.title || '方案对比'}（满分 ${criteria.reduce((a, c) => a + num(c.weight, 0) * scale, 0).toFixed(1)}）`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
  ]
  ranked.forEach((r) => {
    const cells = criteria.map((c) => {
      const cell = r.cells.find((x) => x.name === c.name)
      return cell ? (c.higherIsBetter === false ? `${cell.raw}（反向${cell.norm}）` : String(cell.raw)) : ''
    })
    lines.push(`| ${r.option} | ${cells.join(' | ')} | ${r.total.toFixed(1)} | ${r.rank === 1 ? '推荐' : `#${r.rank}`} |`)
  })
  lines.push('')
  lines.push('> 算法：总分 = Σ(权重 × 归一化分)；越低越好的维度归一化分 = scale+1 − 原分。')
  return lines.join('\n')
}


function ScoreDots({ value, max }: { value: number; max: number }) {
  const n = Math.max(0, Math.min(max, Math.round(value)))
  return (
    <span className="cmp-bar" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} data-on={i < n} />
      ))}
    </span>
  )
}


function badgeOf(rank: number) {
  if (rank === 1) return '首选'
  if (rank === 2) return '也值得考虑'
  return '备选'
}

function OptionMatrix({ data, update, writable }: { data: Data; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  const [showMd, setShowMd] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draftTitle, setDraftTitle] = useState(data.title ?? '')
  const titleTouched = useRef(false)
  const editing = data.editing === true

  useEffect(() => {
    if (!titleTouched.current) setDraftTitle(data.title ?? '')
  }, [data.title])

  const key = JSON.stringify(data)
  const m = useMemo(() => compute(data), [key])
  const scale = m.scale
  const options = m.options
  const criteria = m.criteria
  const scores = data.scores ?? {}
  const highlight = typeof data.highlight === 'string' && data.highlight ? data.highlight : m.winner?.option
  const setCriteria = (next: Criterion[]) => update({ criteria: next })
  const setCell = (opt: string, crit: string, v: number) => {
    update({ scores: { ...scores, [opt]: { ...(scores[opt] ?? {}), [crit]: v } } })
  }
  const renameCriterion = (ci: number, name: string) => {
    const old = criteria[ci]?.name
    const next = criteria.map((c, i) => (i === ci ? { ...c, name } : c))
    const ns: Scores = {}
    options.forEach((o) => {
      const row = { ...(scores[o] ?? {}) }
      if (old && old !== name) {
        row[name] = row[old] ?? 0
        delete row[old]
      }
      ns[o] = row
    })
    update({ criteria: next, scores: ns })
  }
  const renameOption = (oi: number, option: string) => {
    const old = options[oi]
    const next = options.map((o, i) => (i === oi ? option : o))
    const ns: Scores = { ...scores }
    if (old && old !== option) {
      ns[option] = ns[old] ?? {}
      delete ns[old]
    }
    update({ options: next, scores: ns })
  }

  const md = useMemo(() => toMarkdown(data), [key])
  const byOption = new Map(m.rows.map((row) => [row.option, row]))
  const picks = m.ranked

  return (
    <ReUI>
      <div className="cmp-shell" data-testid="option-matrix">
        <div className="cmp-head">
          <div>
            <h2>{data.title || '方案对比'}</h2>
            <p>{options.length} 个方案，按加权总分排序 · 满分 {m.maxTotal.toFixed(1)}</p>
          </div>
          <div className="rui-row">
            {writable ? (
              <Button type="button" variant={editing ? 'outline' : undefined} onClick={() => update({ editing: !editing })}>
                {editing ? '完成' : '编辑打分'}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setShowMd((v) => !v)}>
              {showMd ? '隐藏 Markdown' : '导出 Markdown'}
            </Button>
          </div>
        </div>
        <div className="cmp-picks">
          {picks.map((row) => (
            <div key={row.option} className="cmp-pick" data-rank={row.rank <= 3 ? String(row.rank) : 'n'}>
              <span className="cmp-badge">{badgeOf(row.rank)}</span>
              <h3>{row.option}</h3>
              <div className="cmp-score">{row.total.toFixed(1)}</div>
              <div className="rui-muted">{(row.percent * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
        <table className="cmp-table" data-testid="option-matrix-table">
          <thead>
            <tr>
              <th>对比项</th>
              {options.map((option) => (
                <th key={option} style={highlight === option ? { background: 'rgba(255,196,0,.22)' } : undefined}>
                  {highlight === option ? `推荐 · ${option}` : option}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, ci) => (
              <tr key={c.name + String(ci)}>
                <td>
                  {c.name}
                  <div className="rui-muted">{c.higherIsBetter === false ? '越低越好' : '越高越好'} · 权重 {c.weight}</div>
                </td>
                {options.map((option) => {
                  const cell = byOption.get(option)?.cells[ci]
                  return (
                    <td key={option} style={cell?.best ? { background: 'rgba(255,196,0,.22)', fontWeight: 650 } : undefined}>
                      <span className="tabular-nums">{cell?.raw ?? 0}</span>
                      <ScoreDots value={cell?.raw ?? 0} max={scale} />
                      {c.higherIsBetter === false ? <div className="rui-muted">→{cell?.norm ?? 0}</div> : null}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td>加权总分</td>
              {options.map((option) => {
                const row = byOption.get(option)
                return (
                  <td key={option} style={{ fontWeight: 650 }}>
                    {row ? row.total.toFixed(1) : '0.0'}
                    <div className="rui-muted">{row ? `${(row.percent * 100).toFixed(1)}%` : ''}</div>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
        {m.rationale ? <div data-testid="option-matrix-rationale" className="cmp-why">{m.rationale}</div> : null}
        {writable && editing ? (
          <div className="cmp-edit">
            <Input
              value={draftTitle}
              placeholder="对比标题"
              style={{ fontWeight: 650, width: 260, marginBottom: 10 }}
              onChange={(e: { target: { value: string } }) => {
                titleTouched.current = true
                setDraftTitle(e.target.value)
              }}
              onBlur={() => {
                titleTouched.current = false
                update({ title: draftTitle })
              }}
            />
            {options.map((option, oi) => (
              <div key={option} className="rui-row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                <Input value={option} onChange={(e: { target: { value: string } }) => renameOption(oi, e.target.value)} style={{ width: 140 }} />
                {criteria.map((c) => (
                  <span key={c.name} className="rui-row">
                    <span className="rui-muted">{c.name}</span>
                    <Input type="number" min={0} max={scale} value={byOption.get(option)?.cells.find((x) => x.name === c.name)?.raw ?? 0} style={{ width: 52 }} onChange={(e: { target: { value: string } }) => setCell(option, c.name, Math.max(0, Math.min(scale, num(e.target.value, 0))))} />
                  </span>
                ))}
                <Button type="button" size="sm" variant="ghost" onClick={() => {
                  const ns: Scores = { ...scores }
                  delete ns[option]
                  update({ options: options.filter((_, i) => i !== oi), scores: ns })
                }}>删除方案</Button>
              </div>
            ))}
            {criteria.map((c, ci) => (
              <div key={c.name + 'e'} className="rui-row" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
                <Input value={c.name} onChange={(e: { target: { value: string } }) => renameCriterion(ci, e.target.value)} style={{ width: 120 }} />
                <span className="rui-muted">权重</span>
                <Input type="number" min={0} max={9} value={c.weight} style={{ width: 44 }} onChange={(e: { target: { value: string } }) => setCriteria(criteria.map((x, i) => (i === ci ? { ...x, weight: num(e.target.value, 0) } : x)))} />
                <Button type="button" size="sm" variant="outline" onClick={() => setCriteria(criteria.map((x, i) => (i === ci ? { ...x, higherIsBetter: x.higherIsBetter === false } : x)))}>
                  {c.higherIsBetter === false ? '越低越好' : '越高越好'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => {
                  const ns: Scores = { ...scores }
                  options.forEach((o) => {
                    if (ns[o]) {
                      const row = { ...ns[o] }
                      delete row[c.name]
                      ns[o] = row
                    }
                  })
                  update({ criteria: criteria.filter((_, i) => i !== ci), scores: ns })
                }}>删除维度</Button>
              </div>
            ))}
            <div className="rui-row" style={{ marginTop: 8 }}>
              <Button type="button" variant="outline" onClick={() => {
                const nm = `方案 ${String.fromCharCode(65 + options.length)}`
                const ns: Scores = { ...scores, [nm]: {} }
                criteria.forEach((c) => { ns[nm][c.name] = 3 })
                update({ options: [...options, nm], scores: ns })
              }}>加方案</Button>
              <Button type="button" variant="outline" onClick={() => {
                const nm = `维度 ${criteria.length + 1}`
                const ns: Scores = { ...scores }
                options.forEach((o) => { ns[o] = { ...(ns[o] ?? {}), [nm]: 3 } })
                update({ criteria: [...criteria, { name: nm, weight: 1, higherIsBetter: true }], scores: ns })
              }}>加维度</Button>
              <Button type="button" variant="outline" onClick={() => update({ scale: scale >= 10 ? 5 : scale + 1 })}>满分制 {scale} → {scale >= 10 ? 5 : scale + 1}</Button>
            </div>
          </div>
        ) : null}
        {showMd ? (
          <div style={{ padding: '0 18px 16px' }}>
            <div className="rui-row" style={{ marginBottom: 8 }}>
              <span className="rui-muted">Markdown</span>
              <Button type="button" onClick={() => {
                const nav = globalThis.navigator
                if (nav && nav.clipboard && nav.clipboard.writeText) void nav.clipboard.writeText(md)
                setCopied(true)
              }}>{copied ? '已复制' : '复制'}</Button>
            </div>
            <Textarea readOnly value={md} className="mt-1 min-h-[130px] font-mono" />
          </div>
        ) : null}
      </div>
    </ReUI>
  )
}

export function apply(ctx: {
  pageEditor: { registerBlock: (spec: Record<string, unknown>) => void }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'option-matrix',
    plugin: name,
    label: '方案对比块',
    blockType: 'test',
    blockTypeLabel: '测试',
    hint: 'Wirecutter 首选卡片 + Apple/RTINGS 规格表；编辑打分与对比视图分开',
    aliases: ['matrix', 'option', 'compare', '对比', '矩阵', '选型', '方案对比'],
    assets: [],
    defaults: () => DEFAULTS,
    View: ({ data, update, writable }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) =>
      React.createElement(OptionMatrix, { data: data as Data, update, writable }),
  })
}
