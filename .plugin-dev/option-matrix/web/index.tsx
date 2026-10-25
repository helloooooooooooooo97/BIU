import { Button, Input, ReUI, Textarea } from './reui'

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

function OptionMatrix({ data, update, writable }: { data: Data; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  const [showMd, setShowMd] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draftTitle, setDraftTitle] = useState(data.title ?? '')
  const titleTouched = useRef(false)

  useEffect(() => {
    if (!titleTouched.current) setDraftTitle(data.title ?? '')
  }, [data.title])

  const key = JSON.stringify(data)
  const m = useMemo(() => compute(data), [key])
  const scale = m.scale
  const options = m.options
  const criteria = m.criteria
  const scores = data.scores ?? {}
  const readOnly = !writable
  const highlight = typeof (data as Data & { highlight?: string }).highlight === 'string' && (data as Data & { highlight?: string }).highlight
    ? (data as Data & { highlight?: string }).highlight
    : m.winner?.option

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

  return (
    <ReUI>
      <div className="cmp-shell" data-testid="option-matrix">
        <div className="cmp-head">
          <div>
            {readOnly ? (
              <h2>{data.title || '方案对比'}</h2>
            ) : (
              <Input
                value={draftTitle}
                placeholder="对比标题"
                style={{ fontWeight: 650, fontSize: 16, width: 260, height: 34 }}
                onChange={(e: { target: { value: string } }) => {
                  titleTouched.current = true
                  setDraftTitle(e.target.value)
                }}
                onBlur={() => {
                  titleTouched.current = false
                  update({ title: draftTitle })
                }}
              />
            )}
            <p>
              Compare · {options.length} 方案 × {criteria.length} 维度 · 满分 {m.maxTotal.toFixed(1)}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setShowMd((v) => !v)}>
            {showMd ? '隐藏 Markdown' : '导出 Markdown'}
          </Button>
        </div>
        <table className="cmp-table" data-testid="option-matrix-table">
          <thead>
            <tr>
              <th>规格</th>
              {options.map((option, oi) => {
                const row = byOption.get(option)
                const isWin = highlight === option
                return (
                  <th key={option} style={isWin ? { background: 'rgba(255,196,0,.22)' } : undefined}>
                    {readOnly ? (
                      <div className="cmp-opt">{isWin ? `推荐 · ${option}` : option}</div>
                    ) : (
                      <div className="rui-row" style={{ justifyContent: 'center' }}>
                        <Input value={option} onChange={(e: { target: { value: string } }) => renameOption(oi, e.target.value)} style={{ width: 120, fontWeight: 650 }} />
                        <Button type="button" size="icon" variant="ghost" onClick={() => {
                          const ns: Scores = { ...scores }
                          delete ns[option]
                          update({ options: options.filter((_, i) => i !== oi), scores: ns })
                        }}>×</Button>
                      </div>
                    )}
                    <div className="cmp-score">{row ? row.total.toFixed(1) : '0.0'}</div>
                    <div className="rui-muted">{row ? `${(row.percent * 100).toFixed(1)}%` : ''}</div>
                    {isWin ? <div className="cmp-rank">Recommended</div> : row ? <div className="rui-muted">#{row.rank}</div> : null}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, ci) => (
              <tr key={c.name + String(ci)}>
                <td>
                  {readOnly ? (
                    <>
                      <div style={{ fontWeight: 650 }}>{c.name}</div>
                      <div className="rui-muted">权重 {c.weight} · {c.higherIsBetter === false ? '越低越好' : '越高越好'}</div>
                    </>
                  ) : (
                    <div className="rui-stack" style={{ gap: 4 }}>
                      <Input value={c.name} onChange={(e: { target: { value: string } }) => renameCriterion(ci, e.target.value)} style={{ fontWeight: 650 }} />
                      <div className="rui-row">
                        <span className="rui-muted">权重</span>
                        <Input type="number" min={0} max={9} value={c.weight} onChange={(e: { target: { value: string } }) => setCriteria(criteria.map((x, i) => (i === ci ? { ...x, weight: num(e.target.value, 0) } : x)))} style={{ width: 44 }} />
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
                        }}>删除</Button>
                      </div>
                    </div>
                  )}
                </td>
                {options.map((option) => {
                  const cell = byOption.get(option)?.cells[ci]
                  return (
                    <td key={option} style={cell?.best ? { background: 'rgba(255,196,0,.22)', fontWeight: 650 } : undefined}>
                      {readOnly ? <span className="tabular-nums">{cell?.raw ?? 0}</span> : (
                        <Input type="number" min={0} max={scale} value={cell?.raw ?? 0} className="w-12 text-center tabular-nums" onChange={(e: { target: { value: string } }) => setCell(option, c.name, Math.max(0, Math.min(scale, num(e.target.value, 0))))} />
                      )}
                      <ScoreDots value={cell?.raw ?? 0} max={scale} />
                      {c.higherIsBetter === false ? <div className="rui-muted">→{cell?.norm ?? 0}</div> : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {readOnly ? null : (
          <div className="rui-row" style={{ padding: '10px 16px', flexWrap: 'wrap' }}>
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
        )}
        {m.rationale ? <div data-testid="option-matrix-rationale" className="cmp-why">{m.rationale}</div> : null}
        {showMd ? (
          <div style={{ padding: '0 16px 16px' }}>
            <div className="rui-row" style={{ marginBottom: 8 }}>
              <span className="rui-muted">Markdown（agent 可直接读）</span>
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
    hint: 'Apple Compare / Wirecutter：方案作列、规格作行，加权推荐',
    aliases: ['matrix', 'option', 'compare', '对比', '矩阵', '选型', '方案对比'],
    assets: [],
    defaults: () => DEFAULTS,
    View: ({ data, update, writable }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) =>
      React.createElement(OptionMatrix, { data: data as Data, update, writable }),
  })
}
