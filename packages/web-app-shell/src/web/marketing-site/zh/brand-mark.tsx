import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'

/**
 * BIU 品牌标记：B、I、U 三个字母刚好拼成这个形状 ——
 * 贯穿圆心的斜线是 I，它右上方被短线分开的两小块是 B 的两个弧，左下的半圆是 U。
 *
 * 几何取自设计稿（1080 视图框）：
 *   圆心 (450, 615)，半径 290
 *   分界角：232.7° / 320.6° / 52.5°
 * 两线的交点在圆心偏右下一点，不是过圆心的直径 —— 所以三块大小并不相等。
 *
 * 三块与字母、画面方位的对应（colors 下标即下方顺序）：
 *   colors[0]  232.7°→320.6°（88°） 右上偏上 → B 的上弧
 *   colors[1]  320.6°→52.5°（92°）  右上偏右 → B 的下弧
 *   colors[2]  52.5°→232.7°（180°） 左下半圆 → U
 *   232.7° ↔ 52.5° 那条贯穿圆心的斜线 → I
 * 默认深海配色（BRAND_DEFAULT），标签页图标 public/favicon.svg 由它生成。
 */

/** 画布中心与「背景方块」的半边长。背景是固定的，圆在其中按比例缩放。 */
const CX = 450
const CY = 615
const BOX = 290
/** 网格留白：圆最大不超过方块的一半减掉它，保证描边与圆角不打架。 */
const PAD = 16
/** 圆的半径占方块的比例上限 —— 1 表示顶满留白后的可用区。 */
const MAX_R = BOX - PAD

/**
 * viewBox 由背景方块决定，与圆的大小无关 —— 这样调圆不会带着背景一起变。
 */
const VIEW_BOX = `${CX - BOX} ${CY - BOX} ${BOX * 2} ${BOX * 2}`

/** 角度 → 圆上坐标（0° 指向右，顺时针为正，与屏幕坐标一致）。 */
function onCircle(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function p([x, y]: [number, number]) {
  return `${x.toFixed(1)} ${y.toFixed(1)}`
}

/**
 * 两条线都过圆心，把圆分成三块。分界角取自设计稿：
 *   线 1：232.7° ↔ 52.5°
 *   线 2：320.6° ↔ 140.6°（只画 320.6° 这一侧到圆心的一段）
 * 于是三块是：232.7→320.6、320.6→52.5（B 的两个弧）、52.5→232.7（U）；线 1 就是 I。
 */
const SPLIT = { a: 232.7, b: 320.6, c: 52.5 } as const

/** 从圆心出发的一块扇区（走顺时针方向由 from 到 to）。半径由调用方给。 */
function sector(from: number, to: number, r: number) {
  const [x1, y1] = onCircle(from, r)
  const [x2, y2] = onCircle(to, r)
  const sweep = (to - from + 360) % 360
  const largeArc = sweep > 180 ? 1 : 0
  return [
    `M ${CX} ${CY}`,
    `L ${p([x1, y1])}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${p([x2, y2])}`,
    'Z',
  ].join(' ')
}

/** viewBox 的边长（= BOX*2），用于把「屏幕像素」换算成 viewBox 单位。 */
const VB_SIZE = BOX * 2

/**
 * 线条宽度的最小值（屏幕像素）。
 * 低于 1px 时浏览器只能靠抗锯齿糊 —— 那是毛边和发虚的来源。
 * 小尺寸图标下宁可把线加粗到 1px，也不要一条糊的亚像素线。
 */
const MIN_STROKE_PX = 1

export type BrandMarkProps = {
  /** 三块扇区的填充色：B 上弧 / B 下弧 / U。 */
  colors?: [string, string, string]
  /** 圆的描边色。 */
  stroke?: string
  /** 圆的描边粗细。 */
  strokeWidth?: number
  /** 两条线的粗细。 */
  lineWidth?: number
  /** 圆的半径占背景方块的比例（0–1）。背景不变，只缩放圆。 */
  circleRatio?: number
  /** 圆角方底的填充色。 */
  background?: string
  /** 是否画圆角方底。 */
  showBackground?: boolean
  className?: string
  title?: string
  /**
   * 渲染尺寸档位。'icon' 用于导航栏等小尺寸场景：
   * 线条按比例加粗到可见下限，避免亚像素描边发虚。
   */
  scene?: 'default' | 'icon'
  /**
   * 实际显示宽度（像素）。SVG 里的线宽是 viewBox 单位，
   * 不知道真实尺寸就没法保证线条落在清晰的正像素上 —— 这正是毛边的来源。
   * 不传时按 viewBox 单位原样使用（适合尺寸已知且足够大的场合）。
   */
  displayWidth?: number
}

export function BrandMark({
  colors = ['#ff6b35', '#4ecdc4', '#ffe66d'],
  stroke = '#ffffff',
  strokeWidth = 7.5,
  lineWidth = 7.5,
  circleRatio = 0.7,
  background = '#0a0a0a',
  showBackground = true,
  className,
  title = 'BIU 品牌标记',
  scene = 'default',
  displayWidth,
}: BrandMarkProps) {
  // 圆的实际半径：只受 circleRatio 影响，背景方块保持 ViewBox 大小不变。
  const r = MAX_R * Math.min(1, Math.max(0.05, circleRatio))
  /**
   * 把线宽换算成 viewBox 单位，并保证在小尺寸下不会退化成亚像素。
   * 0 = 用户明确要隐藏这条线，原样传达，不做任何保底。
   */
  const resolveStroke = (width: number) => {
    if (width <= 0) return 0
    if (!displayWidth || displayWidth <= 0) return width
    // 当前设定折合多少屏幕像素？低于下限就抬到下限，再换回 viewBox 单位。
    const scale = displayWidth / VB_SIZE
    const onScreen = width * scale
    if (onScreen >= MIN_STROKE_PX) return width
    return MIN_STROKE_PX / scale
  }
  const strokePx = resolveStroke(strokeWidth)
  const linePx = resolveStroke(lineWidth)
  return (
    <svg
      className={className}
      viewBox={VIEW_BOX}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <BrandMarkShapes
        colors={colors}
        r={r}
        background={background}
        showBackground={showBackground}
        stroke={stroke}
        strokePx={strokePx}
        linePx={linePx}
      />
    </svg>
  )
}

function BrandMarkShapes({
  colors,
  r,
  background,
  showBackground,
  stroke,
  strokePx,
  linePx,
}: {
  colors: [string, string, string]
  r: number
  background: string
  showBackground: boolean
  stroke: string
  strokePx: number
  linePx: number
}) {
  return (
    <>
      {showBackground ? (
        <rect
          x={CX - BOX}
          y={CY - BOX}
          width={BOX * 2}
          height={BOX * 2}
          rx={96}
          fill={background}
        />
      ) : null}
      <path d={sector(SPLIT.a, SPLIT.b, r)} fill={colors[0]} />
      <path d={sector(SPLIT.b, SPLIT.c, r)} fill={colors[1]} />
      <path d={sector(SPLIT.c, SPLIT.a, r)} fill={colors[2]} />
      <circle cx={CX} cy={CY} r={r} fill="none" stroke={stroke} strokeWidth={strokePx} />
      <path
        d={`M ${p(onCircle(SPLIT.a, r))} L ${p(onCircle(SPLIT.c, r))}`}
        stroke={stroke}
        strokeWidth={linePx}
        strokeLinecap="round"
      />
      <path
        d={`M ${p(onCircle(SPLIT.b, r))} L ${CX} ${CY}`}
        stroke={stroke}
        strokeWidth={linePx}
        strokeLinecap="round"
      />
    </>
  )
}

/** 印花单元：小标记 + 紧间距，铺满视口。 */
export const BRAND_PRINT_TILE = 42
export const BRAND_PRINT_MARK = 24

/**
 * 预设配色。
 * 三色依次对应 B 上弧 / B 下弧 / U 三块。
 * 命名都按颜色本身的观感来，不借用他人商标名。
 */
const PRESETS: Array<{ name: string; colors: [string, string, string] }> = [
  // 单色阶：同一灰度的深浅，最克制
  { name: '单色', colors: ['#8a8a8a', '#5f5f5f', '#333333'] },
  { name: '墨阶', colors: ['#f5f5f5', '#a3a3a3', '#404040'] },
  { name: '暖灰', colors: ['#e8ddd3', '#b3a498', '#6b5f55'] },

  // 明亮系
  { name: '鲜亮', colors: ['#ff6b35', '#4ecdc4', '#ffe66d'] },
  { name: '糖果', colors: ['#ff9ecd', '#7de2d1', '#fdf0a8'] },
  { name: '青柠', colors: ['#c3f53c', '#4ade80', '#166534'] },

  // 冷色系
  { name: '深海', colors: ['#1e3a8a', '#0ea5e9', '#0f172a'] },
  { name: '极地', colors: ['#a5d8ff', '#4dabf7', '#1864ab'] },
  { name: '午夜', colors: ['#4c1d95', '#7c3aed', '#1e1b4b'] },

  // 暖色系
  { name: '暖阳', colors: ['#f59e0b', '#ef4444', '#7c2d12'] },
  { name: '落日', colors: ['#fb923c', '#e11d48', '#581c87'] },
  { name: '赤陶', colors: ['#e07a5f', '#d1495b', '#7d1a2b'] },

  // 速度：蓝 / 紫 / 红三段，赛车涂装的观感
  { name: '速度', colors: ['#0066b1', '#662d91', '#e4002b'] },
  { name: '赛道', colors: ['#1a1a1a', '#e4002b', '#f5f5f5'] },

  // 自然
  { name: '森林', colors: ['#86efac', '#16a34a', '#14532d'] },
  { name: '沙漠', colors: ['#fcd34d', '#d97706', '#78350f'] },
  { name: '樱花', colors: ['#fbcfe8', '#f472b6', '#9d174d'] },
  { name: '苔原', colors: ['#a7f3d0', '#5eead4', '#134e4a'] },
]

/** 可交互的品牌调节器：三块各一个颜色滑块 + 线条粗细。 */
/* ---------------- 持久化 ---------------- */

const STORAGE_KEY = 'cordis.brand.studio'

export type BrandConfig = {
  c0: string
  c1: string
  c2: string
  stroke: string
  background: string
  strokeWidth: number
  lineWidth: number
  showBackground: boolean
  circleRatio: number
}

/** 中线那一列印花的相对透明度；越往两侧越接近 1。 */
export const BRAND_PRINT_FLOOR = 0.15
/** 中线那一列印花的相对尺寸；越往两侧越接近 1。 */
export const BRAND_PRINT_MIN_SCALE = 0.6
/** 尺寸分几档。每档一个 pattern，档位少一点，DOM 也就少一点。 */
const PRINT_SIZE_LEVELS = 5

/** 列中心离视口中线的远近，0 = 中线，1 = 视口边缘，按 smoothstep 缓动。 */
function printEase(center: number, width: number): number {
  if (width <= 0) return 1
  const half = width / 2
  const t = Math.min(1, Math.abs(center - half) / half)
  return t * t * (3 - 2 * t)
}

/**
 * 某一列印花的相对透明度：中线最淡、两侧最实。每一枚标记各取一个透明度，
 * 渐变靠标记本身表达，不用蒙版去裁 —— 也就不会出现被切掉半个的标记和可见的分界线。
 */
export function brandPrintAlpha(center: number, width: number): number {
  const eased = printEase(center, width)
  return Math.round((BRAND_PRINT_FLOOR + (1 - BRAND_PRINT_FLOOR) * eased) * 100) / 100
}

/** 某一列印花落在第几档尺寸（0 最小，PRINT_SIZE_LEVELS - 1 为原尺寸）。 */
export function brandPrintLevel(center: number, width: number): number {
  return Math.round(printEase(center, width) * (PRINT_SIZE_LEVELS - 1))
}

/** 把颜色压成同明度的灰：同色系印花只留形状和明暗，不带色相。 */
export function toMonoGray(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const y = Math.round(0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255))
  const g = y.toString(16).padStart(2, '0')
  return `#${g}${g}${g}`
}

function useViewportWidth(ref: RefObject<SVGSVGElement | null>) {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth))
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const read = () => setWidth(node.getBoundingClientRect().width || window.innerWidth)
    read()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read)
      return () => window.removeEventListener('resize', read)
    }
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/**
 * 一整张重复印花。标记按尺寸档位各画一次（SVG pattern），再按列切成竖条，
 * 每条引用自己那一档、带自己的透明度 —— 几十个 rect，而不是逐枚挂上千个组件。
 * 尺寸和透明度只随列变化，竖向滚动视差按格子循环时画面不跳。
 *
 * tone="mono" 把三块和线条压成同明度的灰；fade={false} 关掉透明度渐变
 * （尺寸渐变保留，用来与底层逐枚对齐，比如鼠标聚光那一层）。
 */
export function BrandPrint({
  config,
  tile = BRAND_PRINT_TILE,
  mark = BRAND_PRINT_MARK,
  tone = 'color',
  fade = true,
  layer,
}: {
  config: BrandConfig
  tile?: number
  mark?: number
  tone?: 'color' | 'mono'
  fade?: boolean
  layer?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const width = useViewportWidth(ref)
  const idBase = `site-brand-print-${useId().replace(/:/g, '')}`
  const paint = tone === 'mono' ? toMonoGray : (color: string) => color
  const colors: [string, string, string] = [paint(config.c0), paint(config.c1), paint(config.c2)]
  const stroke = paint(config.stroke)
  const r = MAX_R * Math.min(1, Math.max(0.05, config.circleRatio))
  // 网格以视口中线对称：中线正好落在两列之间或一列正中，左右渐变一致。
  const offset = (((width / 2 - tile / 2) % tile) + tile) % tile
  const columns: Array<{ x: number; alpha: number; level: number }> = []
  for (let x = offset - tile; x < width; x += tile) {
    const center = x + tile / 2
    columns.push({ x, alpha: fade ? brandPrintAlpha(center, width) : 1, level: brandPrintLevel(center, width) })
  }
  const levels = [...new Set(columns.map((column) => column.level))].sort((a, b) => a - b)
  return (
    <svg className="site-print-sheet" width="100%" height="100%" ref={ref} data-print-layer={layer}>
      <defs>
        {levels.map((level) => {
          const size = mark * (BRAND_PRINT_MIN_SCALE + ((1 - BRAND_PRINT_MIN_SCALE) * level) / (PRINT_SIZE_LEVELS - 1))
          const scale = size / VB_SIZE
          const lift = (lineWidth: number) => {
            if (lineWidth <= 0) return 0
            return lineWidth * scale >= MIN_STROKE_PX ? lineWidth : MIN_STROKE_PX / scale
          }
          const inset = (tile - size) / 2
          return (
            <pattern
              key={level}
              id={`${idBase}-${level}`}
              data-print-level={level}
              x={offset}
              width={tile}
              height={tile}
              patternUnits="userSpaceOnUse"
            >
              <svg x={inset} y={inset} width={size} height={size} viewBox={VIEW_BOX}>
                <BrandMarkShapes
                  colors={colors}
                  r={r}
                  background={config.background}
                  showBackground={false}
                  stroke={stroke}
                  strokePx={lift(config.strokeWidth)}
                  linePx={lift(config.lineWidth)}
                />
              </svg>
            </pattern>
          )
        })}
      </defs>
      {columns.map((column) => (
        <rect
          key={column.x}
          data-print-column
          data-print-level={column.level}
          x={column.x}
          width={tile}
          height="100%"
          fill={`url(#${idBase}-${column.level})`}
          opacity={column.alpha}
        />
      ))}
    </svg>
  )
}

export const BRAND_DEFAULT: BrandConfig = {
  // 默认深海，不画描边和分割线，三块只靠颜色区分。
  // 与 public/favicon.svg 同源，改这里后跑 npx tsx scripts/build-brand-assets.tsx（同时更新 README 横条与分享卡片）。
  c0: '#1e3a8a',
  c1: '#0ea5e9',
  c2: '#0f172a',
  stroke: '#ffffff',
  background: '#ffffff',
  // 线宽以 viewBox 单位计（坐标系宽 596），不是屏幕像素 ——
  // 这样标记缩到 24px 或放到 420px，线条与圆的粗细比例都一致。
  strokeWidth: 0,
  lineWidth: 0,
  showBackground: true,
  circleRatio: 0.7,
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)
const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * 逐项校验后再采用 —— localStorage 里可能是旧版本或被人手改过的脏数据，
 * 直接展开会让图形渲染出 NaN。
 */
export function parseBrandConfig(raw: unknown): BrandConfig {
  if (!raw || typeof raw !== 'object') return BRAND_DEFAULT
  const o = raw as Record<string, unknown>
  return {
    c0: isHex(o.c0) ? o.c0 : BRAND_DEFAULT.c0,
    c1: isHex(o.c1) ? o.c1 : BRAND_DEFAULT.c1,
    c2: isHex(o.c2) ? o.c2 : BRAND_DEFAULT.c2,
    stroke: isHex(o.stroke) ? o.stroke : BRAND_DEFAULT.stroke,
    background: isHex(o.background) ? o.background : BRAND_DEFAULT.background,
    strokeWidth: clampNum(o.strokeWidth, 0, 40, BRAND_DEFAULT.strokeWidth),
    lineWidth: clampNum(o.lineWidth, 0, 40, BRAND_DEFAULT.lineWidth),
    showBackground: typeof o.showBackground === 'boolean' ? o.showBackground : BRAND_DEFAULT.showBackground,
    circleRatio: clampNum(o.circleRatio, 0.3, 1, BRAND_DEFAULT.circleRatio),
  }
}

/* ---------------- 共享状态 ---------------- */

/**
 * 品牌配置是全局的：调节器改一次，导航栏的标记要跟着变。
 * 这里用一个极小的订阅式 store —— 同页内即时通知，跨标签页靠 storage 事件。
 */
let current: BrandConfig | null = null
const listeners = new Set<(config: BrandConfig) => void>()

/** 隐私模式 / 无 localStorage 环境下静默退化，不打断渲染。 */
function readStored(): BrandConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return BRAND_DEFAULT
    return parseBrandConfig(JSON.parse(raw))
  } catch {
    return BRAND_DEFAULT
  }
}

export function getBrandConfig(): BrandConfig {
  if (!current) current = readStored()
  return current
}

/**
 * 丢弃内存缓存，下次读取回到 localStorage。
 * 主要给测试用 —— 模块级缓存会跨用例存活，导致上一条用例的配置污染下一条。
 */
export function resetBrandConfigCache() {
  current = null
}

function commit(next: BrandConfig) {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 存不进去也不该影响使用 */
  }
  for (const listener of listeners) listener(next)
}

export function setBrandConfig(next: BrandConfig) {
  commit(next)
}

/** 订阅配置变化，返回取消订阅函数。 */
export function subscribeBrandConfig(listener: (config: BrandConfig) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// 别的标签页改了配置，这边也要跟上。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    const next = readStored()
    current = next
    for (const listener of listeners) listener(next)
  })
}

/** 订阅全局品牌配置。调节器与导航栏标记共用同一个来源。 */
export function useBrandConfig(): BrandConfig {
  const [config, setConfig] = useState<BrandConfig>(getBrandConfig)
  useEffect(() => subscribeBrandConfig(setConfig), [])
  return config
}

export function BrandStudio() {
  // 直接读写全局 store：改动会立刻推给订阅者（导航栏标记）。
  const config = useBrandConfig()
  /** 局部改一项，其余保持不变。 */
  const patch = useCallback(
    <K extends keyof BrandConfig>(key: K, value: BrandConfig[K]) =>
      setBrandConfig({ ...getBrandConfig(), [key]: value }),
    [],
  )

  const { c0, c1, c2, stroke, background, strokeWidth, lineWidth, showBackground, circleRatio } = config
  const colors = useMemo<[string, string, string]>(() => [c0, c1, c2], [c0, c1, c2])

  return (
    <div className="brand-studio">
      <div className="brand-studio-preview">
        <BrandMark
          colors={colors}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineWidth={lineWidth}
          background={background}
          showBackground={showBackground}
          circleRatio={circleRatio}
        />
      </div>

      <div className="brand-studio-controls">
        <fieldset className="brand-field">
          <legend>三个块的颜色</legend>
          <ColorRow label="B 上弧" value={c0} onChange={(v) => patch('c0', v)} testId="brand-color-0" />
          <ColorRow label="B 下弧" value={c1} onChange={(v) => patch('c1', v)} testId="brand-color-1" />
          <ColorRow label="U" value={c2} onChange={(v) => patch('c2', v)} testId="brand-color-2" />
        </fieldset>

        <fieldset className="brand-field">
          <legend>线条</legend>
          <RangeRow
            label="圆环粗细"
            value={strokeWidth}
            min={0}
            max={40}
            step={0.5}
            onChange={(v) => patch('strokeWidth', v)}
            testId="brand-stroke-width"
          />
          <RangeRow
            label="I 线粗细"
            value={lineWidth}
            min={0}
            max={40}
            step={0.5}
            onChange={(v) => patch('lineWidth', v)}
            testId="brand-line-width"
          />
          <ColorRow label="线条颜色" value={stroke} onChange={(v) => patch('stroke', v)} testId="brand-stroke" />
        </fieldset>

        <fieldset className="brand-field">
          <legend>大小</legend>
          <RangeRow
            label="圆的大小"
            value={circleRatio}
            min={0.3}
            max={1}
            step={0.01}
            onChange={(v) => patch('circleRatio', v)}
            testId="brand-circle-ratio"
          />
        </fieldset>

        <fieldset className="brand-field">
          <legend>底色</legend>
          <ColorRow label="圆角方底" value={background} onChange={(v) => patch('background', v)} testId="brand-bg" />
          <label className="brand-check">
            <input
              type="checkbox"
              checked={showBackground}
              onChange={(event) => patch('showBackground', event.target.checked)}
              data-testid="brand-bg-toggle"
            />
            <span>显示圆角方底</span>
          </label>
        </fieldset>

        <fieldset className="brand-field">
          <legend>预设</legend>
          <div className="brand-presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="brand-preset"
                onClick={() => {
                  setBrandConfig({
                    ...getBrandConfig(),
                    c0: preset.colors[0],
                    c1: preset.colors[1],
                    c2: preset.colors[2],
                  })
                }}
              >
                <span
                  className="brand-preset-chip"
                  style={{
                    background: `linear-gradient(135deg, ${preset.colors[0]} 0 33%, ${preset.colors[1]} 33% 66%, ${preset.colors[2]} 66% 100%)`,
                  }}
                  aria-hidden
                />
                {preset.name}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  )
}

function ColorRow({
  label,
  value,
  onChange,
  testId,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  testId: string
}) {
  return (
    <label className="brand-row">
      <span className="brand-row-label">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        aria-label={label}
      />
      <input
        type="text"
        className="brand-hex"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} 色值`}
      />
    </label>
  )
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (next: number) => void
  testId: string
}) {
  return (
    <label className="brand-row">
      <span className="brand-row-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        data-testid={testId}
        aria-label={label}
      />
      <span className="brand-value">{value}</span>
    </label>
  )
}
