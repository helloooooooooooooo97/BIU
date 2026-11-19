/**
 * 右侧检查器性能探针（纯静态分析 + 逻辑验证，不发真实请求）。
 * 验证：
 *  1) InspectorStagePane 是否在非激活时仍渲染内容（paintRef 不看 active）
 *  2) refreshTrajectoryIndex 在流式事件下的调用频率（无去重）
 */
import { readFileSync } from 'node:fs'

const inspector = readFileSync('packages/web-app-shell/src/web/session-inspector.tsx', 'utf8')
const panels = readFileSync('packages/web-app-shell/src/web/inspector-panels.ts', 'utf8')
const sessionView = readFileSync('packages/web-session-view/src/web/index.ts', 'utf8')

const checks = []

// 1) paintRef 是否检查 active
const paintFn = inspector.match(/paintPaneRef\.current = \(paneId\) => \{[\s\S]*?\n  \}/)
const paintBody = paintFn ? paintFn[0] : ''
checks.push({
  name: 'InspectorStagePane 非激活时跳过渲染',
  pass: /if\s*\(!?active/.test(paintBody) || /active\s*\?/.test(inspector.slice(inspector.indexOf('InspectorStagePane'), inspector.indexOf('InspectorStagePane') + 1200)),
  evidence: paintBody.includes('active') ? 'paintPaneRef 中出现 active' : 'paintPaneRef 完全不引用 active，所有已打开 pane 都会渲染',
})

// 2) inspectorViewProps 是否稳定引用
const viewPropsFn = panels.match(/export function inspectorViewProps[\s\S]*?\n\}/)
checks.push({
  name: 'inspectorViewProps 返回稳定引用',
  pass: /useMemo|WeakMap|cache/i.test(viewPropsFn ? viewPropsFn[0] : ''),
  evidence: (viewPropsFn ? viewPropsFn[0] : '').includes('const next: Record<string, unknown> = {}')
    ? '每次调用都新建对象，Pane 的 memo 必然失效'
    : '未知',
})

// 3) refreshTrajectoryIndex 是否有去重/节流
const refreshIdx = sessionView.indexOf('async refreshTrajectoryIndex()')
const refreshBody = sessionView.slice(refreshIdx, refreshIdx + 900)
const hasGuard = /trajFetchSeq|inflight|if\s*\(.*refreshing|debounce|schedule/i.test(refreshBody)
checks.push({
  name: 'refreshTrajectoryIndex 有并发/频率保护',
  pass: hasGuard,
  evidence: hasGuard ? '存在保护' : '无去重、无节流：每次事件都 fetch 一次',
})

// 4) 事件处理里是否每个事件都触发
const pushIdx = sessionView.indexOf('refreshTrajectoryIndex()')
const around = sessionView.slice(Math.max(0, pushIdx - 600), pushIdx + 60)
checks.push({
  name: '流式事件是否逐条触发 trajectory 刷新',
  pass: !/unless|throttle|debounce/i.test(around),
  evidence: 'pushEvent 末尾无条件 `if (this.wantsTrajectory()) void this.refreshTrajectoryIndex()`',
})

// 5) 对比：chunk notify 有 rAF 合并
checks.push({
  name: '（对照）chunk 通知有 rAF 合并',
  pass: /scheduleChunkNotify[\s\S]{0,300}requestAnimationFrame/.test(sessionView),
  evidence: 'invalidateChunk 用 rAF 合并，trajectory 没有同等处理',
})

for (const c of checks) console.log(`${c.pass ? '✅' : '❌'} ${c.name}\n   ${c.evidence}`)

// 统计 inspector 里未 memo 的 map 渲染数量
const maps = (inspector.match(/\.map\(/g) || []).length
console.log(`\nSessionInspector 内 .map() 次数: ${maps}`)
console.log(`headerTabs 数量来源: extraTabs(useMemo) + 内置 tab`)
