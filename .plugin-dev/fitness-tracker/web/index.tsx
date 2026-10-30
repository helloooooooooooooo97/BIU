import { ActivityRings, Button, Cell, Checkbox, Group, Input, ReUI, Textarea } from '@biu/reui'

const React = globalThis.React
const { useState, useMemo, useEffect } = React

export const name = 'fitness-tracker'
export const inject = ['pageEditor']

type WaterLog = Record<string, number>
type DayData = {
  date?: string
  weight?: number
  fastStart?: string
  fastEnd?: string
  water?: WaterLog
  sodium?: boolean
  meals?: Record<string, boolean>
  steps?: number
  sleep?: number
  workoutDone?: boolean
  note?: string
  goals?: { steps?: number; sleep?: number }
}
type SetRow = { weight?: number; reps?: number; done?: boolean; rpe?: number }
type ExRow = { name: string; scheme: string; sets: SetRow[] }
type LogData = { day?: string; focus?: string; exercises?: ExRow[]; restSec?: number; startedAt?: number }

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
function pad(n: number) {
  return String(n).padStart(2, '0')
}
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function hhmm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function mins(t: string) {
  const [a, b] = t.split(':').map(Number)
  return (a || 0) * 60 + (b || 0)
}

const WATER_TARGET = { rest: 2850, train: 3750 }
const WATER_SLOTS: Array<[string, number]> = [
  ['07:00', 500],
  ['09:00', 400],
  ['11:00', 400],
  ['12:00', 300],
  ['14:30', 400],
  ['16:00', 500],
  ['17:00', 600],
  ['18:45', 500],
  ['20:00', 300],
  ['睡前', 200],
]
const MEALS = [
  '12:00 第一餐（开窗）',
  '15:00 第二餐（练前2h）',
  '16:00 练前（香蕉+黑咖）',
  '18:45 第三餐（练后30min）',
  '20:00 关窗（酸奶/坚果）',
]

const MOVE = '#fa114f'
const EXERCISE = '#92e82a'
const STAND = '#1ee0d4'

function dayProgress(d: DayData) {
  const train = !!d.workoutDone
  const target = train ? WATER_TARGET.train : WATER_TARGET.rest
  const water = Object.values(d.water ?? {}).reduce((a, b) => a + num(b), 0)
  const mealsDone = MEALS.filter((m) => d.meals?.[m]).length
  return { target, water, waterPct: water / target, mealsDone }
}

function DayBlock({ data, update, writable }: { data: DayData; update: (p: Partial<DayData>) => void; writable: boolean }) {
  const [now, setNow] = useState(() => hhmm(new Date()))
  useEffect(() => {
    const t = setInterval(() => setNow(hhmm(new Date())), 30000)
    return () => clearInterval(t)
  }, [])
  const [showMd, setShowMd] = useState(false)
  const [copied, setCopied] = useState(false)

  const d = data
  const water = d.water ?? {}
  const meals = d.meals ?? {}
  const p = dayProgress(d)
  const fastStart = d.fastStart ?? '20:00'
  const fastEnd = d.fastEnd ?? '12:00'
  const endMin = mins(fastEnd)
  const startMin = mins(fastStart)
  const cur = mins(now)
  let fastingLeft = 0
  if (startMin > endMin) {
    fastingLeft = cur >= startMin ? 24 * 60 - cur + endMin : Math.max(0, endMin - cur)
  } else {
    fastingLeft = cur >= startMin ? 0 : Math.max(0, endMin - cur)
  }
  const inWindow = fastingLeft === 0

  const addWater = (ml: number) => update({ water: { ...water, [now]: num(water[now]) + ml } })
  const toggleSlot = (slot: string, ml: number) => {
    if (!writable) return
    const curMl = num(water[slot])
    update({ water: { ...water, [slot]: curMl ? 0 : ml } })
  }

  const md = useMemo(() => {
    const lines = [
      `### 打卡 ${d.date || today()}`,
      '',
      `- 体重：${d.weight ? `${d.weight} kg` : '未记录'}`,
      `- 饮水：${p.water} / ${p.target} ml（${(p.waterPct * 100).toFixed(0)}%）${d.sodium ? '，已补电解质' : '，未补电解质'}`,
      `- 进食窗口：${fastEnd}–${fastStart}，餐次完成 ${p.mealsDone}/${MEALS.length}`,
      `- 训练：${d.workoutDone ? '已完成' : '未完成'}`,
      `- 步数：${d.steps ?? '未记录'}　睡眠：${d.sleep ?? '未记录'} h`,
      d.note ? `- 备注：${d.note}` : '',
    ].filter(Boolean)
    return lines.join('\n')
  }, [JSON.stringify(d)])

  return (
    <ReUI className="rui-ios">
      <div data-testid="fitness-day">
        <div className="rui-large">活动</div>
        <div className="rui-sub">
          {d.date ?? today()} · {p.target === WATER_TARGET.train ? '训练日' : '休息日'} · 进食窗口 {fastEnd}–{fastStart}
        </div>
        <div className="rui-activity">
          <ActivityRings
            rings={[
              { value: p.waterPct, color: MOVE },
              { value: p.mealsDone / MEALS.length, color: EXERCISE },
              { value: d.workoutDone ? 1 : 0, color: STAND },
            ]}
          />
          <div className="rui-legend">
            <div>
              <b>
                <i style={{ background: MOVE }} />
                {p.water}
                <span className="rui-muted" style={{ color: 'rgba(255,255,255,.45)', fontSize: 14 }}>
                  {' '}
                  / {p.target} ml
                </span>
              </b>
              <em>饮水 · {p.waterPct >= 1 ? '已闭环' : `还差 ${p.target - p.water} ml`}</em>
            </div>
            <div>
              <b>
                <i style={{ background: EXERCISE }} />
                {p.mealsDone}/{MEALS.length}
              </b>
              <em>餐次</em>
            </div>
            <div>
              <b>
                <i style={{ background: STAND }} />
                {d.workoutDone ? '完成' : '未练'}
              </b>
              <em>{inWindow ? '进食窗口内' : `空腹还剩 ${Math.floor(fastingLeft / 60)}h ${pad(fastingLeft % 60)}m`}</em>
            </div>
          </div>
        </div>
        <div className="fit-tiles">
          <div className="fit-tile">
            <b>{d.steps ?? '—'}</b>
            <em>步数 / {d.goals?.steps ?? 8000}</em>
            <div className="fit-meter">
              <i style={{ width: `${Math.min(100, (num(d.steps) / (d.goals?.steps ?? 8000)) * 100)}%`, background: MOVE }} />
            </div>
          </div>
          <div className="fit-tile">
            <b>{d.sleep ?? '—'}</b>
            <em>睡眠 h / {d.goals?.sleep ?? 7.5}</em>
            <div className="fit-meter">
              <i style={{ width: `${Math.min(100, (num(d.sleep) / (d.goals?.sleep ?? 7.5)) * 100)}%`, background: EXERCISE }} />
            </div>
          </div>
          <div className="fit-tile">
            <b>{d.weight ?? '—'}</b>
            <em>体重 kg</em>
          </div>
        </div>

        <div className="rui-section">饮水</div>
        <Group>
          <Cell>
            <span className="rui-cell-main">快捷</span>
            {[250, 300, 400, 500].map((ml) => (
              <Button key={ml} size="sm" variant="ghost" type="button" onClick={() => writable && addWater(ml)}>
                +{ml}
              </Button>
            ))}
          </Cell>
          {WATER_SLOTS.map(([slot, ml]) => (
            <Cell
              key={slot}
              onClick={() => toggleSlot(slot, ml)}
              style={{ cursor: writable ? 'pointer' : 'default', opacity: water[slot] ? 1 : 0.55 }}
            >
              <span className="rui-cell-main">{slot}</span>
              <span className="rui-cell-meta">{water[slot] ? `${water[slot]} ml` : `建议 ${ml}`}</span>
            </Cell>
          ))}
          <Cell>
            <span className="rui-cell-main">电解质</span>
            <Checkbox checked={!!d.sodium} onChange={() => writable && update({ sodium: !d.sodium })} />
          </Cell>
        </Group>

        <div className="rui-section">餐次</div>
        <Group>
          {MEALS.map((m) => (
            <Cell key={m} onClick={() => writable && update({ meals: { ...meals, [m]: !meals[m] } })} style={{ cursor: writable ? 'pointer' : 'default' }}>
              <Checkbox checked={!!meals[m]} onChange={() => writable && update({ meals: { ...meals, [m]: !meals[m] } })} />
              <span className="rui-cell-main" style={meals[m] ? { color: '#8e8e93' } : undefined}>
                {m}
              </span>
            </Cell>
          ))}
        </Group>

        <div className="rui-section">身体</div>
        <Group>
          <Cell>
            <span className="rui-cell-main">体重</span>
            {writable ? (
              <Input style={{ width: 72, textAlign: 'right', border: 0, background: 'transparent' }} type="number" step="0.1" value={d.weight ?? ''} onChange={(e: { target: { value: string } }) => update({ weight: e.target.value === '' ? undefined : num(e.target.value) })} />
            ) : (
              <span className="rui-cell-meta">{d.weight ?? '—'} kg</span>
            )}
          </Cell>
          <Cell>
            <span className="rui-cell-main">步数</span>
            {writable ? (
              <Input style={{ width: 88, textAlign: 'right', border: 0, background: 'transparent' }} type="number" value={d.steps ?? ''} onChange={(e: { target: { value: string } }) => update({ steps: e.target.value === '' ? undefined : num(e.target.value) })} />
            ) : (
              <span className="rui-cell-meta">{d.steps ?? '—'}</span>
            )}
          </Cell>
          <Cell>
            <span className="rui-cell-main">睡眠</span>
            {writable ? (
              <Input style={{ width: 64, textAlign: 'right', border: 0, background: 'transparent' }} type="number" step="0.1" value={d.sleep ?? ''} onChange={(e: { target: { value: string } }) => update({ sleep: e.target.value === '' ? undefined : num(e.target.value) })} />
            ) : (
              <span className="rui-cell-meta">{d.sleep ?? '—'} h</span>
            )}
          </Cell>
          <Cell>
            <span className="rui-cell-main">训练</span>
            <Button size="sm" variant={d.workoutDone ? 'secondary' : 'default'} type="button" onClick={() => writable && update({ workoutDone: !d.workoutDone })}>
              {d.workoutDone ? '已完成' : '标记完成'}
            </Button>
          </Cell>
          <Cell>
            <span className="rui-cell-main">日期</span>
            {writable ? <Input type="date" style={{ border: 0, background: 'transparent' }} value={d.date ?? today()} onChange={(e: { target: { value: string } }) => update({ date: e.target.value })} /> : <span className="rui-cell-meta">{d.date ?? today()}</span>}
          </Cell>
        </Group>

        {writable ? (
          <Group>
            <Cell>
              <Input className="rui-grow" style={{ border: 0, background: 'transparent', width: '100%' }} placeholder="备注" value={d.note ?? ''} onChange={(e: { target: { value: string } }) => update({ note: e.target.value })} />
            </Cell>
          </Group>
        ) : d.note ? (
          <div className="rui-sub">{d.note}</div>
        ) : null}

        <div style={{ margin: '0 16px' }}>
          <Button variant="ghost" type="button" onClick={() => setShowMd((v) => !v)}>
            {showMd ? '收起摘要' : '导出 markdown'}
          </Button>
        </div>
        {showMd ? (
          <Group>
            <Textarea readOnly value={md} style={{ border: 0, minHeight: 120, fontFamily: 'ui-monospace,monospace' }} />
            <Cell>
              <Button type="button" onClick={() => { const nav = globalThis.navigator; if (nav?.clipboard) void nav.clipboard.writeText(md); setCopied(true) }}>
                {copied ? '已复制' : '复制'}
              </Button>
            </Cell>
          </Group>
        ) : null}
      </div>
    </ReUI>
  )
}

function LogBlock({ data, update, writable }: { data: LogData; update: (p: Partial<LogData>) => void; writable: boolean }) {
  const [showMd, setShowMd] = useState(false)
  const [copied, setCopied] = useState(false)
  const ex = data.exercises ?? []
  const volOf = (r: ExRow) => r.sets.reduce((a, s) => a + (s.done ? num(s.weight) * num(s.reps) : 0), 0)
  const doneSets = ex.reduce((a, r) => a + r.sets.filter((s) => s.done).length, 0)
  const totalSets = ex.reduce((a, r) => a + r.sets.length, 0)
  const volume = ex.reduce((a, r) => a + volOf(r), 0)
  const setSet = (ei: number, si: number, patch: Partial<SetRow>) => {
    update({ exercises: ex.map((r, i) => (i === ei ? { ...r, sets: r.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : r)) })
  }
  const addSet = (ei: number) => {
    update({
      exercises: ex.map((r, i) => {
        if (i !== ei) return r
        const last = r.sets[r.sets.length - 1] ?? {}
        return { ...r, sets: [...r.sets, { weight: last.weight, reps: last.reps, done: false }] }
      }),
    })
  }
  const delSet = (ei: number) => update({ exercises: ex.map((r, i) => (i === ei ? { ...r, sets: r.sets.slice(0, -1) } : r)) })
  const addEx = () => update({ exercises: [...ex, { name: '新动作', scheme: '3×10', sets: Array.from({ length: 3 }, () => ({ done: false })) }] })

  const md = useMemo(() => {
    const lines = [`### ${data.day || ''} ${data.focus || ''} 训练日志`, '', '| 动作 | 计划 | 组（重量×次数） | 完成 | 容量 |', '| --- | --- | --- | --- | --- |']
    ex.forEach((r) => {
      const sets = r.sets.map((s) => `${s.weight ?? '-'}×${s.reps ?? '-'}${s.done ? '✓' : ''}`).join(' / ')
      lines.push(`| ${r.name} | ${r.scheme} | ${sets} | ${r.sets.filter((s) => s.done).length}/${r.sets.length} | ${volOf(r)} |`)
    })
    lines.push('', `总容量 ${volume} kg · 完成组数 ${doneSets}/${totalSets}`)
    return lines.join('\n')
  }, [JSON.stringify(data)])

  const prevOf = (r: ExRow, si: number) => {
    const prev = r.sets[si - 1]
    if (!prev) return '—'
    return `${prev.weight ?? '—'}×${prev.reps ?? '—'}`
  }

  return (
    <ReUI className="rui-ios">
      <div data-testid="fitness-log">
        <div className="rui-large">训练</div>
        <div className="rui-sub">
          {data.day || '训练'} · {data.focus || ''} · 完成组数 {doneSets}/{totalSets}
        </div>
        <div className="hv-stats">
          <div>
            <b>{volume}</b>
            <em>容量 kg</em>
          </div>
          <div>
            <b>
              {doneSets}/{totalSets}
            </b>
            <em>完成组</em>
          </div>
          <div>
            <b>{ex.length}</b>
            <em>动作</em>
          </div>
        </div>
        {writable ? (
          <Group>
            <Cell>
              <Input placeholder="周一" style={{ border: 0, width: 88, background: 'transparent' }} value={data.day ?? ''} onChange={(e: { target: { value: string } }) => update({ day: e.target.value })} />
              <Input className="rui-grow" placeholder="上肢A" style={{ border: 0, background: 'transparent' }} value={data.focus ?? ''} onChange={(e: { target: { value: string } }) => update({ focus: e.target.value })} />
              <Button size="sm" type="button" onClick={addEx}>
                加动作
              </Button>
            </Cell>
          </Group>
        ) : null}
        {ex.map((r, ei) => (
          <div className="hv-ex" key={ei}>
            <h3>
              {writable ? (
                <Input style={{ border: 0, background: 'transparent', fontWeight: 650, width: '100%' }} value={r.name} onChange={(e: { target: { value: string } }) => update({ exercises: ex.map((x, i) => (i === ei ? { ...x, name: e.target.value } : x)) })} />
              ) : (
                r.name
              )}
            </h3>
            <p>
              {r.scheme} · 容量 {volOf(r)} kg
            </p>
            <table className="hv-table">
              <thead>
                <tr>
                  <th>组</th>
                  <th>上次</th>
                  <th>kg</th>
                  <th>次</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.sets.map((s, si) => (
                  <tr key={si} style={s.done ? { background: '#f3fff4' } : undefined}>
                    <td>{si + 1}</td>
                    <td className="rui-muted">{prevOf(r, si)}</td>
                    <td>
                      {writable ? (
                        <input type="number" placeholder="kg" value={s.weight ?? ''} onChange={(e: { target: { value: string } }) => setSet(ei, si, { weight: e.target.value === '' ? undefined : num(e.target.value) })} />
                      ) : (
                        s.weight ?? '—'
                      )}
                    </td>
                    <td>
                      {writable ? (
                        <input type="number" placeholder="次" value={s.reps ?? ''} onChange={(e: { target: { value: string } }) => setSet(ei, si, { reps: e.target.value === '' ? undefined : num(e.target.value) })} />
                      ) : (
                        s.reps ?? '—'
                      )}
                    </td>
                    <td>
                      <Checkbox checked={!!s.done} onChange={() => writable && setSet(ei, si, { done: !s.done })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {writable ? (
              <div className="rui-row" style={{ padding: '8px 10px 10px' }}>
                <Button size="sm" variant="ghost" type="button" onClick={() => addSet(ei)}>
                  加一组
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => delSet(ei)}>
                  少一组
                </Button>
                <span className="rui-grow" />
                <Button size="sm" variant="ghost" type="button" onClick={() => update({ exercises: ex.filter((_, i) => i !== ei) })}>
                  删除动作
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        <div style={{ margin: '0 16px' }}>
          <Button variant="ghost" type="button" onClick={() => setShowMd((v) => !v)}>
            {showMd ? '收起' : '导出 markdown'}
          </Button>
        </div>
        {showMd ? (
          <Group>
            <Textarea readOnly value={md} style={{ border: 0, minHeight: 120, fontFamily: 'ui-monospace,monospace' }} />
            <Cell>
              <Button type="button" onClick={() => { const nav = globalThis.navigator; if (nav?.clipboard) void nav.clipboard.writeText(md); setCopied(true) }}>
                {copied ? '已复制' : '复制'}
              </Button>
            </Cell>
          </Group>
        ) : null}
      </div>
    </ReUI>
  )
}

const DAY_DEFAULTS: DayData = { fastStart: '20:00', fastEnd: '12:00', water: {}, meals: {}, sodium: false, note: '', goals: { steps: 8000, sleep: 7.5 } }

const UPPER_A: ExRow[] = [
  { name: '杠铃卧推', scheme: '4×6–8', sets: Array.from({ length: 4 }, () => ({ done: false })) },
  { name: '坐姿哑铃推举', scheme: '3×8–10', sets: Array.from({ length: 3 }, () => ({ done: false })) },
  { name: '引体向上 / 高位下拉', scheme: '4×8–10', sets: Array.from({ length: 4 }, () => ({ done: false })) },
  { name: '侧平举', scheme: '4×12–15', sets: Array.from({ length: 4 }, () => ({ done: false })) },
  { name: '绳索下压', scheme: '3×10–12', sets: Array.from({ length: 3 }, () => ({ done: false })) },
  { name: '面拉', scheme: '3×15', sets: Array.from({ length: 3 }, () => ({ done: false })) },
]

const LOG_DEFAULTS: LogData = { day: '周一', focus: '上肢A（推为主）', exercises: UPPER_A }

export function apply(ctx: { pageEditor: { registerBlock: (spec: Record<string, unknown>) => void } }) {
  ctx.pageEditor.registerBlock({
    kind: 'fitness-day',
    plugin: name,
    label: '今日打卡',
    blockType: 'fitness',
    blockTypeLabel: '健身',
    hint: 'Apple 健身环：饮水 / 餐次 / 训练 + 步数睡眠体重磁贴，可导出 markdown',
    aliases: ['fitness', 'day', 'water', '打卡', '饮水', '健身打卡', 'fitness-day'],
    defaults: () => DAY_DEFAULTS,
    View: ({ data, update, writable }: any) => React.createElement(DayBlock, { data, update, writable }),
  })
  ctx.pageEditor.registerBlock({
    kind: 'fitness-log',
    plugin: name,
    label: '训练日志',
    blockType: 'fitness',
    blockTypeLabel: '健身',
    hint: 'Hevy / Strong：组表 kg×次数、容量和完成组，可导出 markdown',
    aliases: ['fitness-log', 'workout', 'training', '训练', '训练日志', '举铁'],
    defaults: () => LOG_DEFAULTS,
    View: ({ data, update, writable }: any) => React.createElement(LogBlock, { data, update, writable }),
  })
}
