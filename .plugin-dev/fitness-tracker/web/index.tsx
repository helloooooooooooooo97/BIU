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
}
type SetRow = { weight?: number; reps?: number; done?: boolean }
type ExRow = { name: string; scheme: string; sets: SetRow[] }
type LogData = { day?: string; focus?: string; exercises?: ExRow[] }

const STYLE_ID = 'fitness-tracker-style-v1'
const CSS = `
.ft-root{border:1px solid var(--biu-color-border);border-radius:8px;padding:10px 12px;background:var(--biu-color-bg);color:var(--biu-color-text);font-family:var(--font-sans);font-size:14px;line-height:1.5}
.ft-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.ft-title{font-weight:650;font-size:14px}
.ft-meta{color:var(--biu-color-text-subtle);font-size:12px;font-weight:500}
.ft-grow{flex:1}
.ft-btn{height:26px;font:inherit;font-size:13px;font-weight:650;padding:0 8px;border-radius:6px;border:1px solid var(--biu-color-border);background:transparent;color:var(--biu-color-text);cursor:pointer}
.ft-btn:hover{background:var(--biu-color-bg-hover)}
.ft-btn.on{background:color-mix(in srgb,var(--biu-color-ok,#3fb950) 18%,transparent);border-color:var(--biu-color-ok,#3fb950)}
.ft-field{height:26px;font:inherit;font-size:13px;padding:0 6px;border:1px solid var(--biu-color-border);border-radius:6px;background:var(--biu-color-bg-input);color:var(--biu-color-text)}
.ft-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin:8px 0}
.ft-card{border:1px solid var(--biu-color-border);border-radius:8px;padding:8px}
.ft-k{color:var(--biu-color-text-subtle);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.ft-v{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:2px}
.ft-sub{color:var(--biu-color-text-subtle);font-size:11px;margin-top:2px;font-weight:500}
.ft-bar{height:8px;border-radius:99px;background:var(--biu-color-bg-hover);overflow:hidden;margin-top:6px}
.ft-bar>i{display:block;height:100%;background:var(--biu-accent,var(--biu-color-emphasis));transition:width .25s}
.ft-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0}
.ft-chip{height:26px;font:inherit;font-size:12px;font-weight:600;padding:0 8px;border-radius:99px;border:1px solid var(--biu-color-border);background:transparent;color:var(--biu-color-text);cursor:pointer}
.ft-chip:hover{background:var(--biu-color-bg-hover)}
.ft-table{border-collapse:collapse;width:100%;font-size:13px}
.ft-cell{border:1px solid var(--biu-color-border);padding:5px 7px;vertical-align:middle}
.ft-num{width:58px;height:24px;text-align:center;font:inherit;font-variant-numeric:tabular-nums;border:1px solid var(--biu-color-border);border-radius:6px;background:var(--biu-color-bg-input);color:var(--biu-color-text)}
.ft-exname{width:100%;height:24px;font:inherit;font-size:13px;border:1px solid transparent;background:transparent;color:var(--biu-color-text)}
.ft-done{text-decoration:line-through;opacity:.55}
.ft-md{width:100%;box-sizing:border-box;min-height:120px;margin-top:6px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid var(--biu-color-border);border-radius:6px;background:var(--biu-color-bg-input);color:var(--biu-color-text);padding:6px}
.ft-alt{color:var(--biu-color-text-subtle);font-size:12px;margin-top:6px}
`

function useStyle() {
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById(STYLE_ID)) return
    const s = document.createElement('style')
    s.id = STYLE_ID
    s.textContent = CSS
    document.head.appendChild(s)
  }, [])
}

const h = React.createElement

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
function pad(n: number) { return String(n).padStart(2, '0') }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function hhmm(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
function mins(t: string) { const [a, b] = t.split(':').map(Number); return (a || 0) * 60 + (b || 0) }

const WATER_TARGET = { rest: 2850, train: 3750 }
const WATER_SLOTS: Array<[string, number]> = [
  ['07:00', 500], ['09:00', 400], ['11:00', 400], ['12:00', 300], ['14:30', 400],
  ['16:00', 500], ['17:00', 600], ['18:45', 500], ['20:00', 300], ['睡前', 200],
]
const MEALS = ['12:00 第一餐（开窗）', '15:00 第二餐（练前2h）', '16:00 练前（香蕉+黑咖）', '18:45 第三餐（练后30min）', '20:00 关窗（酸奶/坚果）']

function dayProgress(d: DayData) {
  const train = !!d.workoutDone
  const target = train ? WATER_TARGET.train : WATER_TARGET.rest
  const water = Object.values(d.water ?? {}).reduce((a, b) => a + num(b), 0)
  const mealsDone = MEALS.filter((m) => d.meals?.[m]).length
  return { target, water, waterPct: water / target, mealsDone }
}

// ---------------- 今日打卡 ----------------
function DayBlock({ data, update, writable }: { data: DayData; update: (p: Partial<DayData>) => void; writable: boolean }) {
  useStyle()
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
  const endMin = mins(fastEnd), startMin = mins(fastStart)
  const cur = mins(now)
  let fastingLeft = 0
  if (startMin > endMin) {
    fastingLeft = cur >= startMin ? 24 * 60 - cur + endMin : Math.max(0, endMin - cur)
  } else {
    fastingLeft = cur >= startMin ? 0 : Math.max(0, endMin - cur)
  }
  const inWindow = fastingLeft === 0
  const lastCoffee = cur >= mins('15:00')

  const addWater = (ml: number) => update({ water: { ...water, [now]: num(water[now]) + ml } })
  const setSlot = (slot: string, ml: number) => update({ water: { ...water, [slot]: ml } })

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

  const cards = [
    h('div', { className: 'ft-card', key: 'w' },
      h('div', { className: 'ft-k' }, '饮水'),
      h('div', { className: 'ft-v' }, `${p.water}`, h('span', { className: 'ft-sub' }, ` / ${p.target} ml`)),
      h('div', { className: 'ft-bar' }, h('i', { style: { width: `${Math.min(100, p.waterPct * 100)}%` } })),
      h('div', { className: 'ft-alt' }, p.waterPct >= 1 ? '达标 ✅' : `还差 ${p.target - p.water} ml`),
    ),
    h('div', { className: 'ft-card', key: 'f' },
      h('div', { className: 'ft-k' }, '进食窗口'),
      h('div', { className: 'ft-v' }, `${fastEnd}–${fastStart}`),
      h('div', { className: 'ft-alt', style: { color: inWindow ? 'var(--biu-color-ok,#3fb950)' : undefined } },
        inWindow ? '窗口内，可以吃' : `空腹中，还剩 ${Math.floor(fastingLeft / 60)}h ${pad(fastingLeft % 60)}m`),
    ),
    h('div', { className: 'ft-card', key: 'm' },
      h('div', { className: 'ft-k' }, '餐次'),
      h('div', { className: 'ft-v' }, `${p.mealsDone} / ${MEALS.length}`),
      h('div', { className: 'ft-alt' }, '每餐 35–45g 蛋白'),
    ),
    h('div', { className: 'ft-card', key: 'c' },
      h('div', { className: 'ft-k' }, '咖啡因'),
      h('div', { className: 'ft-v' }, now),
      h('div', { className: 'ft-alt', style: { color: lastCoffee ? 'var(--biu-warn,#d29922)' : undefined } },
        lastCoffee ? '已过 15:00，别再喝' : '最后一杯不晚于 15:00'),
    ),
  ]

  return h('div', { 'data-testid': 'fitness-day', className: 'ft-root' },
    h('div', { className: 'ft-head' },
      h('strong', { className: 'ft-title' }, '今日打卡'),
      writable
        ? h('input', { className: 'ft-field', type: 'date', value: d.date ?? today(), onChange: (e: any) => update({ date: e.target.value }) })
        : h('span', { className: 'ft-meta' }, d.date ?? today()),
      h('span', { className: 'ft-meta' }, p.target === WATER_TARGET.train ? '训练日' : '休息日'),
      h('button', { className: `ft-btn${d.workoutDone ? ' on' : ''}`, type: 'button', onClick: () => writable && update({ workoutDone: !d.workoutDone }) }, d.workoutDone ? '训练已完成' : '标记训练完成'),
      h('span', { className: 'ft-grow' }),
      h('button', { className: 'ft-btn', type: 'button', onClick: () => setShowMd((v) => !v) }, showMd ? '隐藏' : '导出 markdown'),
    ),
    h('div', { className: 'ft-grid' }, ...cards),
    h('div', { className: 'ft-row' },
      h('span', { className: 'ft-meta' }, '快捷加水'),
      ...[250, 300, 400, 500].map((ml) => h('button', { key: ml, className: 'ft-btn', type: 'button', onClick: () => writable && addWater(ml) }, `+${ml}`)),
      h('button', { className: 'ft-btn', type: 'button', onClick: () => writable && update({ water: {} }) }, '清零'),
      h('button', { className: `ft-chip${d.sodium ? ' on' : ''}`, type: 'button', onClick: () => writable && update({ sodium: !d.sodium }) }, '电解质 ✓'),
    ),
    h('div', null,
      h('div', { className: 'ft-meta', style: { marginTop: 4 } }, '按时间表打点（ml）'),
      h('div', { className: 'ft-row' },
        ...WATER_SLOTS.map(([slot, ml]) =>
          h('label', { key: slot, className: 'ft-chip', style: { display: 'inline-flex', alignItems: 'center', gap: 4, cursor: writable ? 'pointer' : 'default' } },
            h('span', { style: { opacity: water[slot] ? 1 : 0.6 } }, slot),
            writable
              ? h('input', { className: 'ft-num', style: { width: 52, height: 20 }, type: 'number', value: water[slot] ?? '', placeholder: String(ml), onChange: (e: any) => setSlot(slot, e.target.value === '' ? 0 : num(e.target.value)) })
              : h('span', null, `${water[slot] ?? 0}`),
          ),
        ),
      ),
    ),
    h('div', null,
      h('div', { className: 'ft-meta', style: { marginTop: 4 } }, '餐次'),
      ...MEALS.map((m) =>
        h('label', { key: m, className: 'ft-row', style: { cursor: writable ? 'pointer' : 'default', margin: '2px 0' } },
          h('input', { type: 'checkbox', checked: !!meals[m], onChange: () => writable && update({ meals: { ...meals, [m]: !meals[m] } }) }),
          h('span', { className: meals[m] ? 'ft-done' : undefined }, m),
        ),
      ),
    ),
    h('div', { className: 'ft-row' },
      h('label', null, h('span', { className: 'ft-meta' }, '体重 kg '), writable
        ? h('input', { className: 'ft-num', type: 'number', step: '0.1', value: d.weight ?? '', onChange: (e: any) => update({ weight: e.target.value === '' ? undefined : num(e.target.value) }) })
        : h('strong', null, d.weight ?? '—')),
      h('label', null, h('span', { className: 'ft-meta' }, '步数 '), writable
        ? h('input', { className: 'ft-num', type: 'number', value: d.steps ?? '', onChange: (e: any) => update({ steps: e.target.value === '' ? undefined : num(e.target.value) }) })
        : h('strong', null, d.steps ?? '—')),
      h('label', null, h('span', { className: 'ft-meta' }, '睡眠 h '), writable
        ? h('input', { className: 'ft-num', type: 'number', step: '0.1', value: d.sleep ?? '', onChange: (e: any) => update({ sleep: e.target.value === '' ? undefined : num(e.target.value) }) })
        : h('strong', null, d.sleep ?? '—')),
      h('label', null, h('span', { className: 'ft-meta' }, '关窗 '), writable
        ? h('input', { className: 'ft-field', style: { width: 70 }, value: fastStart, onChange: (e: any) => update({ fastStart: e.target.value }) })
        : h('span', null, fastStart)),
      h('label', null, h('span', { className: 'ft-meta' }, '开窗 '), writable
        ? h('input', { className: 'ft-field', style: { width: 70 }, value: fastEnd, onChange: (e: any) => update({ fastEnd: e.target.value }) })
        : h('span', null, fastEnd)),
    ),
    writable
      ? h('input', { className: 'ft-field', style: { width: '100%', marginTop: 4 }, placeholder: '备注（饿感 / 状态 / 训练感受）', value: d.note ?? '', onChange: (e: any) => update({ note: e.target.value }) })
      : (d.note ? h('div', { className: 'ft-alt' }, `备注：${d.note}`) : null),
    h('div', { className: 'ft-alt' }, '判定：尿色淡黄为准；一次别灌超 500ml；训练日必补钠 1–2g。'),
    showMd ? h('div', null,
      h('textarea', { className: 'ft-md', readOnly: true, value: md }),
      h('button', { className: 'ft-btn', style: { marginTop: 4 }, type: 'button', onClick: () => { const nav = globalThis.navigator; if (nav && nav.clipboard) void nav.clipboard.writeText(md); setCopied(true) } }, copied ? '已复制' : '复制'),
    ) : null,
  )
}

// ---------------- 训练日志 ----------------
function LogBlock({ data, update, writable }: { data: LogData; update: (p: Partial<LogData>) => void; writable: boolean }) {
  useStyle()
  const [showMd, setShowMd] = useState(false)
  const [copied, setCopied] = useState(false)
  const ex = data.exercises ?? []

  const volOf = (r: ExRow) => r.sets.reduce((a, s) => a + (s.done ? num(s.weight) * num(s.reps) : 0), 0)
  const doneSets = ex.reduce((a, r) => a + r.sets.filter((s) => s.done).length, 0)
  const totalSets = ex.reduce((a, r) => a + r.sets.length, 0)
  const volume = ex.reduce((a, r) => a + volOf(r), 0)

  const setSet = (ei: number, si: number, patch: Partial<SetRow>) => {
    update({ exercises: ex.map((r, i) => i === ei ? { ...r, sets: r.sets.map((s, j) => j === si ? { ...s, ...patch } : s) } : r) })
  }
  const addSet = (ei: number) => {
    update({ exercises: ex.map((r, i) => {
      if (i !== ei) return r
      const last = r.sets[r.sets.length - 1] ?? {}
      return { ...r, sets: [...r.sets, { weight: last.weight, reps: last.reps, done: false }] }
    }) })
  }
  const delSet = (ei: number) => update({ exercises: ex.map((r, i) => i === ei ? { ...r, sets: r.sets.slice(0, -1) } : r) })
  const addEx = () => update({ exercises: [...ex, { name: '新动作', scheme: '3×10', sets: Array.from({ length: 3 }, () => ({ done: false })) }] })

  const md = useMemo(() => {
    const lines = [`### ${data.day || ''} ${data.focus || ''} 训练日志`, '',
      '| 动作 | 计划 | 组（重量×次数） | 完成 | 容量 |', '| --- | --- | --- | --- | --- |']
    ex.forEach((r) => {
      const sets = r.sets.map((s) => `${s.weight ?? '-'}×${s.reps ?? '-'}${s.done ? '✓' : ''}`).join(' / ')
      lines.push(`| ${r.name} | ${r.scheme} | ${sets} | ${r.sets.filter((s) => s.done).length}/${r.sets.length} | ${volOf(r)} |`)
    })
    lines.push('', `总容量 ${volume} kg · 完成组数 ${doneSets}/${totalSets}`, '',
      '> 每个动作留 RIR 2–3；每 2 周同次数 +2.5kg 或同重量 +1 次。')
    return lines.join('\n')
  }, [JSON.stringify(data)])

  return h('div', { 'data-testid': 'fitness-log', className: 'ft-root' },
    h('div', { className: 'ft-head' },
      h('strong', { className: 'ft-title' }, '训练日志'),
      writable ? h('input', { className: 'ft-field', placeholder: '周一', value: data.day ?? '', onChange: (e: any) => update({ day: e.target.value }) })
        : h('span', { className: 'ft-meta' }, data.day ?? ''),
      writable ? h('input', { className: 'ft-field', placeholder: '上肢A（推为主）', value: data.focus ?? '', onChange: (e: any) => update({ focus: e.target.value }) })
        : h('span', { className: 'ft-meta' }, data.focus ?? ''),
      h('span', { className: 'ft-meta' }, `${doneSets}/${totalSets} 组 · 容量 ${volume} kg`),
      h('span', { className: 'ft-grow' }),
      writable ? h('button', { className: 'ft-btn', type: 'button', onClick: addEx }, '加动作') : null,
      h('button', { className: 'ft-btn', type: 'button', onClick: () => setShowMd((v) => !v) }, showMd ? '隐藏' : '导出 markdown'),
    ),
    h('table', { className: 'ft-table' },
      h('thead', null, h('tr', null,
        h('th', { className: 'ft-cell', style: { textAlign: 'left' } }, '动作'),
        h('th', { className: 'ft-cell' }, '计划'),
        h('th', { className: 'ft-cell', style: { textAlign: 'left' } }, '组（重量×次数，勾选=完成）'),
        h('th', { className: 'ft-cell' }, '容量'),
        writable ? h('th', { className: 'ft-cell' }, '') : null,
      )),
      h('tbody', null, ...ex.map((r, ei) =>
        h('tr', { key: ei },
          h('td', { className: 'ft-cell' }, writable
            ? h('input', { className: 'ft-exname', value: r.name, onChange: (e: any) => update({ exercises: ex.map((x, i) => i === ei ? { ...x, name: e.target.value } : x) }) })
            : h('span', { style: { fontWeight: 600 } }, r.name)),
          h('td', { className: 'ft-cell', style: { textAlign: 'center' } }, writable
            ? h('input', { className: 'ft-num', style: { width: 66 }, value: r.scheme, onChange: (e: any) => update({ exercises: ex.map((x, i) => i === ei ? { ...x, scheme: e.target.value } : x) }) })
            : r.scheme),
          h('td', { className: 'ft-cell' },
            h('div', { className: 'ft-row', style: { margin: 0 } },
              ...r.sets.map((s, si) =>
                h('span', { key: si, style: { display: 'inline-flex', alignItems: 'center', gap: 2, opacity: s.done ? 1 : .75 } },
                  writable
                    ? h('input', { type: 'checkbox', checked: !!s.done, onChange: () => setSet(ei, si, { done: !s.done }) })
                    : h('span', null, s.done ? '✓' : '·'),
                  writable
                    ? h(React.Fragment, null,
                        h('input', { className: 'ft-num', style: { width: 46 }, type: 'number', placeholder: 'kg', value: s.weight ?? '', onChange: (e: any) => setSet(ei, si, { weight: e.target.value === '' ? undefined : num(e.target.value) }) }),
                        h('span', { className: 'ft-meta' }, '×'),
                        h('input', { className: 'ft-num', style: { width: 40 }, type: 'number', placeholder: '次', value: s.reps ?? '', onChange: (e: any) => setSet(ei, si, { reps: e.target.value === '' ? undefined : num(e.target.value) }) }),
                      )
                    : h('span', { className: s.done ? undefined : 'ft-done' }, `${s.weight ?? '-'}×${s.reps ?? '-'}`),
                ),
              ),
              writable ? h('button', { className: 'ft-btn', type: 'button', onClick: () => addSet(ei) }, '+组') : null,
              writable ? h('button', { className: 'ft-btn', type: 'button', onClick: () => delSet(ei) }, '−组') : null,
            ),
          ),
          h('td', { className: 'ft-cell', style: { textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }, String(volOf(r))),
          writable ? h('td', { className: 'ft-cell' }, h('button', { className: 'ft-btn', type: 'button', onClick: () => update({ exercises: ex.filter((_, i) => i !== ei) }) }, '×')) : null,
        ),
      )),
    ),
    h('div', { className: 'ft-alt' }, 'RIR 2–3；每 8 周 deload 一周（组数砍 40%，重量不变）。'),
    showMd ? h('div', null,
      h('textarea', { className: 'ft-md', readOnly: true, value: md }),
      h('button', { className: 'ft-btn', style: { marginTop: 4 }, type: 'button', onClick: () => { const nav = globalThis.navigator; if (nav && nav.clipboard) void nav.clipboard.writeText(md); setCopied(true) } }, copied ? '已复制' : '复制'),
    ) : null,
  )
}

const DAY_DEFAULTS: DayData = { fastStart: '20:00', fastEnd: '12:00', water: {}, meals: {}, sodium: false, note: '' }

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
    kind: 'fitness-day', plugin: name, label: '今日打卡',
    blockType: 'fitness', blockTypeLabel: '健身',
    hint: '饮水累加 + 8+16 进食窗口倒计时 + 餐次/训练/体重打卡，可导出 markdown',
    aliases: ['fitness', 'day', 'water', '打卡', '饮水', '健身打卡', 'fitness-day'],
    defaults: () => DAY_DEFAULTS,
    View: ({ data, update, writable }: any) => React.createElement(DayBlock, { data, update, writable }),
  })
  ctx.pageEditor.registerBlock({
    kind: 'fitness-log', plugin: name, label: '训练日志',
    blockType: 'fitness', blockTypeLabel: '健身',
    hint: '周分化动作表：勾选组、填重量次数，自动算容量，可导出 markdown',
    aliases: ['fitness-log', 'workout', 'training', '训练', '训练日志', '举铁'],
    defaults: () => LOG_DEFAULTS,
    View: ({ data, update, writable }: any) => React.createElement(LogBlock, { data, update, writable }),
  })
}
