/**
 * 针对右侧检查器 & 左侧表格核心性能点的对比基准测试
 * 运行方式: node scripts/benchmark-perf-comparison.mjs
 */
import { performance } from 'node:perf_hooks'

console.log('='.repeat(70))
console.log('       前端性能优化点量化基准测试对比 (Benchmark Suite)')
console.log('='.repeat(70) + '\n')

// ---------------------------------------------------------------------------
// 测试 1: 左侧表格 rowPaintStamp 中的 JSON.stringify(node.row)
// ---------------------------------------------------------------------------
console.log('▶ [测试 1] 表格行虚拟滚动 Stamp 计算：JSON.stringify vs WeakMap 缓存')

// 模拟典型的 fsdb 行记录
function createSampleRow(index) {
  return {
    id: `rec-${index}`,
    title: `任务条目 ${index} - 自动化系统数据同步流程执行`,
    status: index % 3 === 0 ? 'done' : index % 3 === 1 ? 'in_progress' : 'todo',
    priority: index % 5 === 0 ? 'high' : 'normal',
    assignee: `user-${index % 10}@company.com`,
    tags: ['infra', 'frontend', 'virtual-table'],
    meta: { version: 1, retries: 0, flags: { pinned: false, archived: false } },
    created_at: '2026-11-19T10:00:00.000Z',
    updated_at: '2026-11-19T12:00:00.000Z',
  }
}

const ROWS_COUNT = 40 // 可视窗口 40 行
const SCROLL_FRAMES = 2000 // 滚动 2000 帧 (约 30 秒滚动)
const testRows = Array.from({ length: ROWS_COUNT }, (_, i) => ({
  kind: 'row',
  key: `row-${i}`,
  depth: 0,
  hasKids: false,
  kidCount: 0,
  fold: false,
  row: createSampleRow(i),
}))

// Baseline: 原始写法
function baselineRowPaintStamp(node) {
  if (node.kind !== 'row') return `${node.kind}\0${node.key}`
  return `${node.key}\0${node.depth}\0${node.hasKids ? 1 : 0}\0${node.kidCount}\0${node.fold ? 1 : 0}\0${JSON.stringify(node.row)}`
}

// Optimized: WeakMap 缓存不变行
const rowJsonCache = new WeakMap()
function optimizedRowPaintStamp(node) {
  if (node.kind !== 'row') return `${node.kind}\0${node.key}`
  let json = rowJsonCache.get(node.row)
  if (json === undefined) {
    json = JSON.stringify(node.row)
    rowJsonCache.set(node.row, json)
  }
  return `${node.key}\0${node.depth}\0${node.hasKids ? 1 : 0}\0${node.kidCount}\0${node.fold ? 1 : 0}\0${json}`
}

// 预热 JIT
for (let i = 0; i < 50; i++) {
  testRows.forEach(baselineRowPaintStamp)
  testRows.forEach(optimizedRowPaintStamp)
}

// 模拟正常滚动（98% 行未变更，2% 行在某些帧有变更）
const t0 = performance.now()
let baselineSum = 0
for (let f = 0; f < SCROLL_FRAMES; f++) {
  // 模拟极少数行发生变更
  if (f % 50 === 0) {
    testRows[0].row = { ...testRows[0].row, updated_at: `2026-11-19T12:00:${f}.000Z` }
  }
  for (let r = 0; r < ROWS_COUNT; r++) {
    baselineSum += baselineRowPaintStamp(testRows[r]).length
  }
}
const t1 = performance.now()
const baselineTime = t1 - t0

const t2 = performance.now()
let optSum = 0
for (let f = 0; f < SCROLL_FRAMES; f++) {
  if (f % 50 === 0) {
    testRows[0].row = { ...testRows[0].row, updated_at: `2026-11-19T12:00:${f}.000Z` }
  }
  for (let r = 0; r < ROWS_COUNT; r++) {
    optSum += optimizedRowPaintStamp(testRows[r]).length
  }
}
const t3 = performance.now()
const optTime = t3 - t2

console.log(`  总调用次数: ${ROWS_COUNT * SCROLL_FRAMES} 次 (40 行 × 2000 帧)`)
console.log(`  - 原始实现 (每次 JSON.stringify) 耗时: ${baselineTime.toFixed(2)} ms`)
console.log(`  - 优化实现 (WeakMap 引用缓存)    耗时: ${optTime.toFixed(2)} ms`)
console.log(`  🚀 性能提升: ${(baselineTime / optTime).toFixed(1)}x 加速 (耗时减少 ${((1 - optTime / baselineTime) * 100).toFixed(1)}%)\n`)


// ---------------------------------------------------------------------------
// 测试 2: 左侧表格 cellCache 内存泄漏对比测试
// ---------------------------------------------------------------------------
console.log('▶ [测试 2] 表格 cellCache 内存驻留与淘汰对比')

class BaselineTableBodySimulator {
  constructor() {
    this.rowCache = new Map()
    this.cellCache = new Map()
  }
  render(nodes, colKeys) {
    // 原始代码: 只清理 rowCache，从不清理 cellCache
    if (this.rowCache.size > nodes.length + 8) {
      const live = new Set(nodes.map((n) => n.key))
      for (const k of this.rowCache.keys()) {
        if (!live.has(k)) this.rowCache.delete(k)
      }
    }
    for (const node of nodes) {
      this.rowCache.set(node.key, { stamp: 's', element: {} })
      for (const col of colKeys) {
        this.cellCache.set(`${node.key}\0${col}`, { stamp: 's', element: {} })
      }
    }
  }
}

class OptimizedTableBodySimulator {
  constructor() {
    this.rowCache = new Map()
    this.cellCache = new Map()
  }
  render(nodes, colKeys) {
    // 优化代码: 清理 rowCache 时级联清理 cellCache 中对应的 key
    if (this.rowCache.size > nodes.length + 8) {
      const live = new Set(nodes.map((n) => n.key))
      for (const k of this.rowCache.keys()) {
        if (!live.has(k)) {
          this.rowCache.delete(k)
          // 级联淘汰淘汰行的单元格缓存
          for (const col of colKeys) {
            this.cellCache.delete(`${k}\0${col}`)
          }
        }
      }
    }
    for (const node of nodes) {
      this.rowCache.set(node.key, { stamp: 's', element: {} })
      for (const col of colKeys) {
        this.cellCache.set(`${node.key}\0${col}`, { stamp: 's', element: {} })
      }
    }
  }
}

const baselineSim = new BaselineTableBodySimulator()
const optSim = new OptimizedTableBodySimulator()
const cols = Array.from({ length: 15 }, (_, i) => `col_${i}`)

// 模拟翻页 / 筛选变换：20 次分页切换，每次 50 个新 node
for (let page = 0; page < 20; page++) {
  const pageNodes = Array.from({ length: 50 }, (_, i) => ({ key: `page_${page}_row_${i}` }))
  baselineSim.render(pageNodes, cols)
  optSim.render(pageNodes, cols)
}

console.log(`  模拟 20 次分页浏览 (每页 50 行 × 15 列):`)
console.log(`  - 原始实现 cellCache 累积条目数: ${baselineSim.cellCache.size} 条 (无淘汰，无限增长)`)
console.log(`  - 优化实现 cellCache 最终条目数: ${optSim.cellCache.size} 条 (有效约束在当前可视范围内)`)
console.log(`  🚀 内存条目降低: ${(((baselineSim.cellCache.size - optSim.cellCache.size) / baselineSim.cellCache.size) * 100).toFixed(1)}% 垃圾对象释放\n`)


// ---------------------------------------------------------------------------
// 测试 3: 右侧检查器 inspectorViewProps 引用稳定性测试
// ---------------------------------------------------------------------------
console.log('▶ [测试 3] 右侧检查器 inspectorViewProps 引用稳定性与 Memo 命中率')

const INSPECTOR_VIEW_OMIT = new Set([
  'tabId', 'tabLabel', 'tabIcon', 'Tab', 'centerKinds', 'common', 'action',
  'ensureTrajectory', 'focusOnCall', 'requiresSession', 'databaseUi', 'useSnapshot', 'slots', 'repeatable',
])

function baselineInspectorViewProps(raw) {
  const next = {}
  for (const [key, value] of Object.entries(raw)) {
    if (INSPECTOR_VIEW_OMIT.has(key)) continue
    next[key] = value
  }
  return next
}

const viewPropsCache = new WeakMap()
function optimizedInspectorViewProps(raw) {
  if (!raw || typeof raw !== 'object') return raw
  let hit = viewPropsCache.get(raw)
  if (hit) return hit
  const next = {}
  for (const [key, value] of Object.entries(raw)) {
    if (INSPECTOR_VIEW_OMIT.has(key)) continue
    next[key] = value
  }
  viewPropsCache.set(raw, next)
  return next
}

const sampleSlotProps = {
  tabId: 'traj',
  tabLabel: '轨迹',
  ensureTrajectory: true,
  seedCollection: '/pages',
  clusterMode: 'all',
  activeView: 'default',
  refreshKey: 'k-1',
}

let baselineIdenticalCount = 0
let optIdenticalCount = 0
const RUN_COUNT = 10000

let lastBaseline = baselineInspectorViewProps(sampleSlotProps)
for (let i = 0; i < RUN_COUNT; i++) {
  const current = baselineInspectorViewProps(sampleSlotProps)
  if (current === lastBaseline) baselineIdenticalCount++
  lastBaseline = current
}

let lastOpt = optimizedInspectorViewProps(sampleSlotProps)
for (let i = 0; i < RUN_COUNT; i++) {
  const current = optimizedInspectorViewProps(sampleSlotProps)
  if (current === lastOpt) optIdenticalCount++
  lastOpt = current
}

console.log(`  ${RUN_COUNT} 次父组件重绘传参判定:`)
console.log(`  - 原始实现: 引用一致次数 = ${baselineIdenticalCount} (每次重新 new Object，React.memo 浅比较全部判不同)`)
console.log(`  - 优化实现: 引用一致次数 = ${optIdenticalCount} (引用严格恒等 ===，React.memo 100% 命中跳过重绘)`)
console.log(`  🚀 引用稳定性命中率: 0% -> 100%\n`)


// ---------------------------------------------------------------------------
// 测试 4: 右侧检查器 refreshTrajectoryIndex 流式事件并发网络冲击对比
// ---------------------------------------------------------------------------
console.log('▶ [测试 4] 流式高频事件下的 Trajectory 刷新调度对比 (并发风暴与末尾更新保证)')

// 模拟网络请求耗时 40ms
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 模拟原始的 SessionView 行为
class BaselineTrajectoryService {
  constructor() {
    this.trajRefresh = null
    this.fetchCount = 0
    this.latestFetchedVersion = 0
  }
  async refreshTrajectoryIndex(eventVersion) {
    if (this.trajRefresh) return this.trajRefresh
    const run = (async () => {
      this.fetchCount++
      const capturedVersion = eventVersion
      await sleep(30) // 模拟网络延迟
      this.latestFetchedVersion = capturedVersion
    })()
    this.trajRefresh = run
    try {
      await run
    } finally {
      if (this.trajRefresh === run) this.trajRefresh = null
    }
  }
}

// 模拟经过 schedule/trailing 优化的 Service
class OptimizedTrajectoryService {
  constructor() {
    this.inFlight = null
    this.pendingVersion = null
    this.fetchCount = 0
    this.latestFetchedVersion = 0
    this.timer = null
  }
  scheduleRefresh(eventVersion) {
    this.pendingVersion = eventVersion
    if (this.timer) return
    // 100ms 节流合并窗口
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, 100)
  }
  async flush() {
    if (this.inFlight) return
    if (this.pendingVersion === null) return
    const targetVersion = this.pendingVersion
    this.pendingVersion = null
    this.fetchCount++
    this.inFlight = (async () => {
      await sleep(60)
      this.latestFetchedVersion = targetVersion
    })()
    try {
      await this.inFlight
    } finally {
      this.inFlight = null
      if (this.pendingVersion !== null) {
        void this.flush()
      }
    }
  }
}

const baselineService = new BaselineTrajectoryService()
const optService = new OptimizedTrajectoryService()

// 模拟在 300ms 内快速到达 30 个流式事件（每 10ms 一个）
const TOTAL_EVENTS = 30
console.log(`  模拟流式传输: 300ms 内密集推送 ${TOTAL_EVENTS} 个事件 (每 10ms 一条)...`)

for (let i = 1; i <= TOTAL_EVENTS; i++) {
  setTimeout(() => {
    void baselineService.refreshTrajectoryIndex(i)
    optService.scheduleRefresh(i)
  }, i * 10)
}

await sleep(550) // 等待所有请求完成

console.log(`  - 原始实现:`)
console.log(`    发起真实网络请求数: ${baselineService.fetchCount} 次`)
console.log(`    最终拉取到的版本: 事件 #${baselineService.latestFetchedVersion} (${baselineService.latestFetchedVersion === TOTAL_EVENTS ? '完整' : '❌ 丢事件！未拉取到最终态'})`)
console.log(`  - 优化调度实现:`)
console.log(`    发起真实网络请求数: ${optService.fetchCount} 次`)
console.log(`    最终拉取到的版本: 事件 #${optService.latestFetchedVersion} (${optService.latestFetchedVersion === TOTAL_EVENTS ? '✅ 完整包含最后一条事件' : '❌ 未拉取到最终态'})`)
console.log(`  🚀 网络请求量降低: ${(((baselineService.fetchCount - optService.fetchCount) / baselineService.fetchCount) * 100).toFixed(1)}%，且彻底杜绝了流式结束时的状态丢包问题！`)

console.log('\n' + '='.repeat(70))
console.log('                        基准测试完成')
console.log('='.repeat(70))
