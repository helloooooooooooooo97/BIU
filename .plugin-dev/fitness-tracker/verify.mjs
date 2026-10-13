import { createRequire } from 'node:module'
const require = createRequire('/Users/apple1/Desktop/biu/')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
globalThis.React = React

const mod = await import('/Users/apple1/Desktop/biu/.plugin/fitness-tracker/web.js?' + Date.now())
const name = mod.name
let specs = []
mod.apply({ pageEditor: { registerBlock: (s) => specs.push(s) } })

console.log('export const name =', name)
console.log('registered kinds:', specs.map(s => `${s.kind}(type=${s.blockType},plugin=${s.plugin})`).join(', '))

let pass = 0, fail = 0
const check = (label, cond) => { cond ? (pass++, console.log('  ✓', label)) : (fail++, console.log('  ✗', label)) }

for (const spec of specs) {
  console.log(`\n== ${spec.kind} ==`)
  check('plugin id 与 export name 一致', spec.plugin === name)
  check('有 defaults()', typeof spec.defaults === 'function')

  // 只读态渲染（已保存的块：writable=false）
  const saved = spec.kind === 'fitness-day'
    ? { fastStart:'20:00', fastEnd:'12:00', water:{'07:00':500,'18:50':400}, meals:{'15:00 第二餐（练前2h）':true}, sodium:false, note:'' }
    : { day:'周一', focus:'上肢A（推为主）', exercises:[{name:'杠铃卧推',scheme:'4×6–8',sets:[{weight:60,reps:8,done:true},{weight:60,reps:8,done:false}]}] }
  let html = ''
  try {
    html = renderToStaticMarkup(React.createElement(spec.View, { data: saved, update: () => {}, writable: false }))
    check('只读态渲染无异常', html.length > 100)
  } catch (e) { check('只读态渲染无异常 — ' + e.message, false) }

  // 可写态渲染
  try {
    const html2 = renderToStaticMarkup(React.createElement(spec.View, { data: spec.defaults(), update: () => {}, writable: true }))
    check('可写态渲染无异常', html2.length > 100)
  } catch (e) { check('可写态渲染无异常 — ' + e.message, false) }

  if (spec.kind === 'fitness-day') {
    check('显示饮水合计 900 ml', html.includes('900'))
    check('显示目标 2850(休息日)', html.includes('2850'))
    check('显示进食窗口 12:00–20:00', html.includes('12:00–20:00'))
    check('有导出 markdown 按钮', html.includes('导出 markdown'))
    check('含时间表打点 07:00', html.includes('07:00'))
  } else {
    check('显示动作名 杠铃卧推', html.includes('杠铃卧推'))
    check('只统计已完成组 → 容量 480', html.includes('480'))
    check('显示完成组数 1/2', html.includes('1/2'))
    check('有导出 markdown 按钮', html.includes('导出 markdown'))
  }
}

// 默认值校验：训练日志默认就是页面上那套周一上肢A
const log = specs.find(s => s.kind === 'fitness-log')
const d = log.defaults()
check('\n训练日志默认 6 个动作', d.exercises.length === 6)
check('默认第一个动作为杠铃卧推', d.exercises[0].name === '杠铃卧推')
check('默认组数总和 = 21', d.exercises.reduce((a, r) => a + r.sets.length, 0) === 21)

const day = specs.find(s => s.kind === 'fitness-day')
const dd = day.defaults()
check('打卡默认窗口 20:00–12:00', dd.fastStart === '20:00' && dd.fastEnd === '12:00')

console.log(`\n${fail === 0 ? 'ALL PASS ✅' : 'FAILURES: ' + fail} (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
