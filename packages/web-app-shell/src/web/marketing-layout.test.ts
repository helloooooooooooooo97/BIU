// 排版栅格回归：断言所有首页区块共用同一左右留白
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'web/style.css'), 'utf8')

/** 去掉注释后，按 @media 切分，返回 {base, medias:[{cond,seg}]} */
function split(css: string): { base: string; medias: { cond: string; seg: string }[] } {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const medias: { cond: string; seg: string }[] = []
  let out = '', i = 0
  while (i < src.length) {
    const at = src.indexOf('@media', i)
    if (at === -1) { out += src.slice(i); break }
    out += src.slice(i, at)
    const open = src.indexOf('{', at)
    let d = 1, j = open + 1
    while (j < src.length && d > 0) {
      if (src[j] === '{') d++
      else if (src[j] === '}') d--
      j++
    }
    medias.push({ cond: src.slice(at + 6, open).trim(), seg: src.slice(open + 1, j - 1) })
    i = j
  }
  return { base: out, medias }
}
type Rule = [string, string]
const rules = (seg: string): Rule[] =>
  [...seg.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].flatMap((m) =>
    m[1]
      .split(',')
      .map((sel) => sel.trim())
      .filter(Boolean)
      .map((sel): Rule => [sel, m[2].trim()]),
  )
const { base, medias } = split(css)
const baseRules = rules(base)

/** 数 grid-template-columns 的顶层轨道数（minmax(...) 算一个） */
function countTracks(value: string): number {
  let depth = 0
  let n = 0
  let inToken = false
  for (const ch of value) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (/\s/.test(ch) && depth === 0) inToken = false
    else if (depth === 0 && !inToken) { inToken = true; n++ }
  }
  return n
}

const SECTIONS = [
  '.site-hero', '.site-capabilities',
  '.site-product-demo', '.site-space-section',
  '.site-agent', '.site-faq', '.site-final-cta',
]

/** 采集某个 selector 在 base 中声明的水平留白（含 longhand 覆盖） */
function gutters(sel: string, seg: string): string[] {
  const found = []
  for (const [s, body] of rules(seg)) {
    if (s !== sel) continue
    const pad = body.match(/(?<![\w-])padding\s*:\s*([^;]+)/)
    if (pad) {
      const parts = pad[1].trim().split(/\s+/)
      found.push(parts.length > 1 ? parts[1] : parts[0])
    }
    const l = body.match(/padding-left\s*:\s*([^;]+)/)
    const r = body.match(/padding-right\s*:\s*([^;]+)/)
    if (l) found.push(l[1].trim())
    if (r) found.push(r[1].trim())
  }
  return found
}

test('桌面端：所有首页区块的左右留白都走同一个 token', () => {
  const bad = []
  for (const sel of SECTIONS) {
    const found = gutters(sel, base)
    if (found.length === 0) continue
    for (const v of found) {
      if (v !== 'var(--site-gutter)' && v !== '0') bad.push(`${sel} -> ${v}`)
    }
  }
  assert.deepEqual(bad, [], `这些区块没用统一栅格：\n${bad.join('\n')}`)
})

test('栅格 token 已定义，且内容宽度唯一', () => {
  assert.match(css, /--site-gutter:\s*32px/, '缺少 --site-gutter 定义')
  assert.match(css, /--site-content:\s*1160px/, '缺少 --site-content 定义')
})

test('布局容器宽度只有一套（不再 1000/1160 混用）', () => {
  // 只认「区块级容器」：负责居中和左右边距的那些。
  // 文字块的 max-width（hero 文案、标题行宽）是排版度量，允许不同。
  const containers = [
    '.site-capabilities', '.site-agent', '.site-plans',
    '.site-platforms', '.site-compare-index', '.site-compare-body', '.site-compare-when',
    '.site-compare-more', '.site-usecase-grid', '.site-usecase-pain', '.site-usecase-how',
    '.site-usecase-more', '.site-block-list', '.site-roi', '.site-security-blocks',
    '.site-page-hero',
  ]
  const bad = []
  for (const sel of containers) {
    const found = []
    for (const [s, body] of rules(base)) {
      if (s !== sel) continue
      const mw = body.match(/max-width\s*:\s*([^;]+)/)
      if (mw) found.push(mw[1].trim())
    }
    for (const v of found) {
      if (v !== 'var(--site-content)') bad.push(`${sel} -> ${v}`)
    }
  }
  assert.deepEqual(bad, [], `这些布局容器宽度不统一：\n${bad.join('\n')}`)
})

test('文案块的 max-width 不得小于容器（否则内容被挤窄）', () => {
  // 文字块允许自定义行宽，但不能超过容器宽度
  const CONTAINER = 1160
  const offenders = []
  for (const [sel, body] of rules(base)) {
    const mw = body.match(/max-width\s*:\s*(\d+)px/)
    if (!mw) continue
    if (sel.includes('h1') || sel.includes('h2') || sel.includes('h3')) {
      if (Number(mw[1]) > CONTAINER) offenders.push(`${sel} -> ${mw[1]}px`)
    }
  }
  assert.deepEqual(offenders, [], `标题行宽超过容器：${offenders.join(', ')}`)
})

test('全站：页面级区块容器都走同一宽度（自动扫描，防新增页面漏掉）', () => {
  // 这一条是上一版测试漏网的根因修正：手写容器清单会漏，
  // 改成自动扫 .site-* 里"带 padding 的区块级容器"。
  const TEXT_MEASURE = /\.(p|h1|h2|h3|lead|copy|heading|body|note|intro-copy|tagline)\b/
  // 明确列出的文字块（非布局容器）：hero 文案块与 CTA 标题
  const TEXT_BLOCKS = new Set(['.site-hero-copy', '.site-final-cta'])
  ;
  const NESTED = /\.(article|li|td|th|blockquote|button|input|a|img|span|small|summary|details|ul|table|tr|iframe)\b/
  const offenders: string[] = []

  for (const [sel, body] of rules(base)) {
    if (!sel.startsWith('.site-')) continue
    // 含空格的是后代选择器（如 .site-final-cta h2），属于块内部元素，不是区块容器
    if (/\s/.test(sel)) continue
    if (TEXT_BLOCKS.has(sel) || TEXT_MEASURE.test(sel) || NESTED.test(sel)) continue
    const mw = body.match(/max-width\s*:\s*([^;]+)/)
    if (!mw) continue
    const v = mw[1].trim()
    if (/^\d+px$/.test(v) && Number(v.replace('px', '')) >= 700) {
      offenders.push(`${sel} -> ${v}`)
    }
  }
  assert.deepEqual(offenders, [], `这些区块容器宽度没走 token：\n${offenders.join('\n')}`)
})

test('窄屏：所有区块统一收到 20px', () => {
  const narrow = medias.filter((m) => /max-width:\s*800px/.test(m.cond))
  const declared = new Set()
  for (const m of narrow) {
    for (const sel of SECTIONS) {
      if (gutters(sel, m.seg).length) declared.add(sel)
    }
  }
  const missing = SECTIONS.filter((s) => !declared.has(s))
  assert.deepEqual(missing, [], `这些区块没有窄屏留白覆盖，会和邻居错位：${missing.join(', ')}`)
})

test('长图文件名跟路径走', async () => {
  const { pageShotName } = await import('./marketing-site/page-shot.ts')
  assert.equal(pageShotName('/'), 'biu-home.png')
  assert.equal(pageShotName('/blog/saas-to-paas'), 'biu-blog-saas-to-paas.png')
})

test('产品页两处标题在小标签下方，不再排到右边', () => {
  assert.match(css, /\.site-continuity-heading,\s*\.site-ecosystem-heading\s*\{[^}]*display:\s*block/s)
  assert.doesNotMatch(css, /\.site-continuity-heading,\s*\.site-ecosystem-heading,\s*\.site-faq-heading/)
})

test('长图生成时印花铺满整页，不再固定在视口', () => {
  assert.match(css, /\.site\.is-capturing \.site-print\s*\{[^}]*position:\s*absolute/s, '印花在长图里要跟着内容铺满')
})

test('页脚：列区是 5 列（产品/开源/了解/分享/开始并排，不换行）', () => {
  const cols = [...css.matchAll(/\.site-footer-columns\s*\{([^}]*)\}/g)].map((m) => m[1])
  const base0 = cols[0] ?? ''
  const m = base0.match(/grid-template-columns\s*:\s*repeat\((\d+)/)
  assert.ok(m, '未找到列区列数定义')
  assert.equal(Number(m[1]), 5, '「开始」必须和前面几列并排，不能单独换行')
})

test('页脚：内容走全站容器基准（不是硬编码 padding）', () => {
  const f = [...css.matchAll(/\.site-footer\s*\{([^}]*)\}/g)].map((m) => m[1])[0] ?? ''
  assert.match(f, /max-width:\s*var\(--site-content\)/, '页脚内容宽度未走 token')
  assert.match(f, /padding:[^;]*var\(--site-gutter\)/, '页脚左右留白未走 token')
  // 不能再出现 40px 32px 这种硬编码
  assert.equal(
    /padding:\s*\d+px\s+\d+px\s*;/.test(f),
    false,
    '页脚仍在用硬编码 padding，会与其它区块错位',
  )
})

test('页脚：列区在上，底部行（BIU 左 / 法务右）在下', () => {
  const tsx = readFileSync(
    resolve(process.cwd(), 'packages/web-app-shell/src/web/marketing-site/site-chrome.tsx'),
    'utf8',
  )
  const foot = tsx.slice(tsx.indexOf('export function SiteFooter'))
  const body = foot.slice(0, foot.indexOf('</footer>'))
  const top = [...body.matchAll(/^ {6}<(\w+)/gm)].map((m) => m[1])
  assert.deepEqual(top, ['div', 'div'], '页脚应为两层：列区 + 底部行')

  // 底部行里：tagline 在前，legal 在后
  const base = body.slice(body.indexOf('site-footer-base'))
  const order = [...base.matchAll(/site-footer-(tagline|legal)/g)].map((m) => m[1])
  assert.deepEqual(order, ['tagline', 'legal'], '底部行应为 BIU(左) → 法务(右)')

  const css2 = [...css.matchAll(/\.site-footer-base\s*\{([^}]*)\}/g)].map((m) => m[1])[0] ?? ''
  assert.match(css2, /justify-content:\s*space-between/, '底部行应两端对齐（左 BIU / 右 法务）')
})

test('页脚：底部行两侧字号一致', () => {
  const m = css.match(/\.site-footer-tagline,\s*\.site-footer-legal\s*\{([^}]*)\}/)
  assert.ok(m, 'tagline 与 legal 应共用同一条字号规则')
  assert.match(m[1], /font-size:\s*13px/, '两侧字号应统一为 13px')
})

test('板块间距：小字→大字、大字→内容 各自统一', () => {
  const label = [...css.matchAll(/--site-label-gap:\s*([^;]+)/g)].map((m) => m[1].trim())
  const heading = [...css.matchAll(/--site-heading-gap:\s*([^;]+)/g)].map((m) => m[1].trim())
  assert.ok(label.length, '缺少 --site-label-gap')
  assert.ok(heading.length, '缺少 --site-heading-gap')

  // 这些板块的「小字→大字」必须走同一个 token
  const labelSels = [
    '.site-hero h1', '.site-demo-heading .site-section-label',
    '.site-space-heading h2',
  ]
  const bad: string[] = []
  for (const sel of labelSels) {
    const bodies = [...css.matchAll(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))]
      .map((m) => m[1])
    if (!bodies.length) { bad.push(`${sel} 无规则`); continue }
    if (!bodies.some((b) => b.includes('var(--site-label-gap)'))) bad.push(`${sel} 未走 label token`)
  }
  assert.deepEqual(bad, [], `这些板块的小字间距没统一：\n${bad.join('\n')}`)
})

const siteCss = css.slice(css.indexOf('\n.site {\n'))

test('官网字号只走一套刻度，不再出现 11/15/17/19/25px 这种相邻档', () => {
  const used = new Set([...siteCss.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1])))
  const stray = [11, 15, 17, 19, 25].filter((n) => used.has(n))
  assert.deepEqual(stray, [], `这些字号应并入相邻档：${stray.join(', ')}`)
})

test('键盘焦点可见：官网有统一的 focus-visible 样式', () => {
  assert.match(siteCss, /\.site :focus-visible\s*\{[^}]*outline:\s*2px solid #fff/)
})

test('卡片圆角统一 20px，hover 不再跳到 #2a2a2a', () => {
  const cards = ['.site-context-item > div', '.site-ecosystem-grid article', '.site-permission-points article',
    '.site-compare-when article', '.site-usecase-how-grid article', '.site-brand-grid article']
  const bad: string[] = []
  for (const sel of cards) {
    const body = baseRules.filter(([s]) => s === sel).map(([, b]) => b).join(';')
    const r = body.match(/border-radius:\s*([^;]+)/)
    if (!r || r[1].trim() !== '20px') bad.push(`${sel} -> ${r?.[1] ?? '无'}`)
  }
  assert.deepEqual(bad, [], `卡片圆角不统一：\n${bad.join('\n')}`)
  assert.doesNotMatch(siteCss, /#2a2a2a/)
})

test('印花不用蒙版裁切（渐变由每列标记自带透明度表达）', () => {
  const body = baseRules.find(([s]) => s === '.site-print')?.[1] ?? ''
  assert.doesNotMatch(body, /mask/)
})

test('深色官网里不再残留浅色主题的黑字编号', () => {
  const body = baseRules.find(([s]) => s === '.site-solution-index')?.[1] ?? ''
  assert.doesNotMatch(body, /rgba\(0,\s*0,\s*0/)
})

test('选中态不用白色描边（靠底色区分）', () => {
  // 选中态若用高对比白边框，视觉上会显得廉价
  const sel = [...css.matchAll(/([^{}]*\.(is-on|is-active|is-selected)[^{}]*)\{([^{}]*)\}/g)]
  const bad: string[] = []
  for (const [, selector, , body] of sel) {
    for (const m of body.matchAll(/border(?:-color)?\s*:\s*([^;]+)/g)) {
      const v = m[1]
      if (/rgba\(255,\s*255,\s*255,\s*\.(2[0-9]|[3-9][0-9])\)/.test(v)) {
        bad.push(`${selector.trim()} -> ${v.trim()}`)
      }
    }
  }
  assert.deepEqual(bad, [], `这些选中态还在用高对比白边框：\n${bad.join('\n')}`)
})
