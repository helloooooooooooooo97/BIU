import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarketingHome } from './marketing-home.tsx'
import { MarketingSite } from './marketing-site/index.tsx'
import { BrandMark, resetBrandConfigCache } from './marketing-site/brand-mark.tsx'

// 品牌调节器会把配置写进 localStorage。测试之间必须隔离，
// 否则前一个用例存的颜色会污染后一个的「默认值」断言。
afterEach(() => {
  cleanup()
  localStorage.clear()
  // store 的模块级缓存不会随 localStorage 一起清，必须显式丢，
  // 否则上一条用例调过的颜色会污染下一条的「默认值」断言。
  resetBrandConfigCache()
})

function renderSite(initialPath = '/') {
  let login = 0
  let start = 0
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MarketingSite
        onLogin={() => { login += 1 }}
        onStart={() => { start += 1 }}
      />
    </MemoryRouter>,
  )
  return { login: () => login, start: () => start }
}

test('landing page embeds real empty product surfaces and opens account actions', () => {
  let login = 0
  let start = 0
  render(
    <MemoryRouter>
      <MarketingHome onLogin={() => { login += 1 }} onStart={() => { start += 1 }} />
    </MemoryRouter>,
  )

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /一个页面.*组合所有软件/)

  // P0-13：演示区用静态截图，不再嵌 iframe（iframe 会完整加载 web 应用三次）
  assert.equal(screen.queryByTitle('BIU 页面界面预览'), null, '不应再有 iframe 预览')

  fireEvent.click(screen.getByRole('tab', { name: '组件' }))
  const shot = screen.getByRole('img', { name: /BIU 组件/ }) as HTMLImageElement
  assert.equal(shot.getAttribute('src'), '/site/demo-component.png')
  assert.equal(shot.getAttribute('loading'), 'lazy')

  fireEvent.click(screen.getByTestId('site-login'))
  assert.equal(screen.getByTestId('site-start').getAttribute('href'), '/download')
  assert.equal(login, 1)
  assert.equal(start, 0)
  cleanup()
})

test('home 收窄后：深度内容下沉，导航指向独立页', () => {
  renderSite('/')
  // 原首页的 6 张解决方案卡已移到 /use-cases
  assert.equal(screen.queryByText('研究与分析'), null)
  // 导航里有独立页面入口
  const print = screen.getByTestId('site-print')
  const tile = print.querySelector('pattern')
  assert.ok(tile, '官网背景用重复图案铺满')
  assert.equal(tile?.getAttribute('width'), '42')
  assert.equal(tile?.getAttribute('height'), '42')
  assert.equal(tile?.querySelector('rect'), null, '印花只要圆，不要圆角方底')
  const base = print.querySelector('[data-print-layer="base"]') as SVGSVGElement
  const columns = [...base.querySelectorAll('rect[data-print-column]')]
  const alphas = columns.map((rect) => Number(rect.getAttribute('opacity')))
  assert.ok(alphas.length > 10, '印花按列切条，每列一个透明度')
  const middle = Math.min(...alphas)
  assert.ok(middle >= 0.15 && middle < 0.3, '中线那列最淡，但仍然看得见')
  assert.equal(Math.max(alphas[0], alphas[alphas.length - 1]), 1, '最外侧一列不打折')
  const left = alphas.slice(0, alphas.indexOf(middle) + 1)
  assert.ok(left.every((alpha, i) => i === 0 || alpha <= left[i - 1]), '从左缘到中线逐列变淡')
  const levels = columns.map((rect) => Number(rect.getAttribute('data-print-level')))
  assert.equal(levels[alphas.indexOf(middle)], 0, '中线那列标记最小')
  assert.equal(Math.max(levels[0], levels[levels.length - 1]), 4, '最外侧一列是原尺寸')
  const fills = [...base.querySelectorAll('path[fill]')].map((path) => path.getAttribute('fill') ?? '')
  assert.ok(fills.length > 0 && fills.every((fill) => /^#([0-9a-f]{2})\1\1$/i.test(fill) || fill === 'none'), '底层印花是同色系的灰')
  const nav = screen.getByRole('navigation', { name: '官网' })
  assert.match(nav.textContent ?? '', /产品/)
  assert.match(nav.textContent ?? '', /定价/)
  assert.match(nav.textContent ?? '', /对比/)
  // 首页主张：All in One —— 页面组合软件
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /组合所有软件/)
  cleanup()
})

test('印花随滚动向上走，速度慢于正文，并按格子循环', async () => {
  renderSite('/product')
  const print = screen.getByTestId('site-print')
  const root = print.closest('.site') as HTMLElement
  root.scrollTop = 100
  fireEvent.scroll(root)
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  assert.equal(print.style.getPropertyValue('--print-shift'), '-35px', '滚 100px，印花走 35px')
  root.scrollTop = 200
  fireEvent.scroll(root)
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  assert.equal(print.style.getPropertyValue('--print-shift'), '-28px', '走过一格后从头循环（70 mod 42）')
  cleanup()
})

test('鼠标聚光：彩色层只在鼠标附近露出，触屏不触发', async () => {
  renderSite('/product')
  const print = screen.getByTestId('site-print')
  const spot = screen.getByTestId('site-print-spot')
  const root = print.closest('.site') as HTMLElement
  const columns = [...spot.querySelectorAll('rect[data-print-column]')]
  assert.ok(columns.length > 0 && columns.every((rect) => rect.getAttribute('opacity') === '1'), '彩色层不再叠透明度渐变')
  fireEvent.pointerMove(root, { pointerType: 'touch', clientX: 10, clientY: 10 })
  assert.equal(print.dataset.spot, undefined, '触屏没有悬停，不点亮')
  fireEvent.pointerMove(root, { pointerType: 'mouse', clientX: 300, clientY: 200 })
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  assert.equal(print.dataset.spot, 'on')
  assert.equal(print.style.getPropertyValue('--spot-x'), '300px')
  assert.equal(print.style.getPropertyValue('--spot-y'), '200px')
  fireEvent.pointerLeave(root)
  assert.equal(print.dataset.spot, undefined, '鼠标离开后熄灭')
  cleanup()
})

test('每个官网路径都能渲染，且各页有独立 h1', () => {
  const cases: Array<[string, RegExp]> = [
    ['/product', /页面是容器，插件是软件/],
    ['/pricing', /免费，而且开源/],
    ['/download', /在你的设备上运行/],
    ['/security', /你的数据在哪里/],
    ['/compare', /和每个领域最好的产品比/],
  ]
  for (const [path, pattern] of cases) {
    renderSite(path)
    assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', pattern, `path=${path}`)
    cleanup()
  }
})

test('对比页：六个分类 13 个对手都在，且 BIU 列如实标注弱点', () => {
  renderSite('/compare')
  for (const name of ['BIU vs Linux', 'BIU vs Kubernetes', 'BIU vs Office', 'BIU vs Notion', 'BIU vs Airtable', 'BIU vs Retool', 'BIU vs Supabase', 'BIU vs Cursor', 'BIU vs DeepSeek Harness', 'BIU vs Pi', 'BIU vs ChatGPT', 'BIU vs Claude', 'BIU vs Obsidian']) {
    assert.ok(screen.getAllByText(name).length > 0, `缺少 ${name}`)
  }
  cleanup()

  // 详情页照表渲染，且承认对手强项（BIU 列有 ❌ 或 ⚠️）
  renderSite('/compare/vs-notion')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Notion/)
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')
  assert.ok(screen.getAllByText(/用 Notion 当你需要/).length > 0, '必须承认对手适用场景')
  cleanup()
})

test('对比页：Notion 页的落点是 facet —— 属性在记录之外，不用改表', () => {
  renderSite('/compare/vs-notion')
  const body = document.body.textContent ?? ''

  // facet 的语义：属性挂在记录外面，原表不动（合并后一句话讲完）
  assert.match(body, /facet/, '要出现 facet 这个概念')
  assert.match(body, /属性存在记录之外，原表不动/, '要点出「不改表」')
  assert.match(body, /任意记录都能挂/, '要点出「对任何数据都能加」')
  assert.match(body, /同时挂多个 facet/, '要点出一条记录可以挂多个')
  assert.match(body, /横跨不同的表/, '要点出跨表')

  // 对照：Notion 那边是改 schema
  assert.match(body, /改数据库 schema/, '要说清 Notion 的做法')

  // 纪律：协同编辑这条必须如实认输（已并入「成熟度」一行）
  assert.match(body, /协同编辑、权限打磨与插件生态都还没到 Notion 同级/, '要承认协同编辑未到 Notion 同级')
  cleanup()
})

test('对比页：Notion 页的权限差异 —— 授权对象可以是视图，不是名单', () => {
  renderSite('/compare/vs-notion')
  const body = document.body.textContent ?? ''

  // 核心差异：授权给谁 —— 名单 vs 成员视图
  assert.match(body, /成员视图/, '要出现「成员视图」这个授权对象')
  assert.match(body, /授权对象是 view_id，本身带筛选条件/, '要点出授权对象带着条件')

  // 授权范围是筛选条件而非实体（已并入「授权给谁、授到哪」一行）
  assert.match(body, /view_id/, '要出现 view_id')

  // 条件先写好，新记录自动落入范围
  assert.match(body, /自动落进授权范围/, '要点出「不用逐条补授权」')

  // 角色与继承
  assert.match(body, /多来源取最高/, '要出现多重来源取最高')
  assert.match(body, /inherit \/ private \/ members \/ restricted/, '要出现继承模式')
  assert.match(body, /继承自上一条/, '要出现授权来源可见性')

  // 纪律：权限模型再细也要认输打磨程度（成熟度已合并成一行）
  assert.match(body, /都还没到 Notion 同级/, '要承认权限与协同的打磨未到同级')
  cleanup()
})

test('定价页 ROI 计算器按选项实时重算', () => {
  renderSite('/pricing')
  // 默认勾选：知识库10 + 项目管理24 + AI助手20 = 54
  assert.match(screen.getByText('/人/月').parentElement?.textContent ?? '', /\$54/)
  // 再勾一个会议记录 18 => 72
  fireEvent.click(screen.getByText('会议记录'))
  assert.match(screen.getByText('/人/月').parentElement?.textContent ?? '', /\$72/)
  cleanup()
})

test('定位：All in One、开源免费，文案不夸大', () => {
  renderSite('/')
  let body = document.body.textContent ?? ''
  assert.match(body, /开源 · 免费 · All in One/)
  assert.equal(document.querySelector('.site-task-box'), null, '首页不再放会丢掉输入的任务框')
  assert.doesNotMatch(body, /BIU 团队/, '不放团队自述冒充用户证言')
  const github = Array.from(document.querySelectorAll('a')).filter((a) => a.getAttribute('href') === 'https://github.com/helloooooooooooooo97/biu')
  assert.ok(github.length >= 2, '首屏和收尾都要有 GitHub 入口')
  cleanup()

  renderSite('/pricing')
  body = document.body.textContent ?? ''
  assert.match(body, /Apache 2\.0/)
  assert.doesNotMatch(body, /联系销售|退款|按需/, '开源免费，不再有销售与计费话术')
  cleanup()

  renderSite('/compare')
  body = document.body.textContent ?? ''
  assert.doesNotMatch(body, /问问 BIU 不能做什么/)
  assert.match(body, /信息截至 2026 年 10 月/)
  cleanup()

  renderSite('/compare/vs-notion')
  body = document.body.textContent ?? ''
  assert.match(body, /页面里能放什么/, 'Notion 对比要讲清页面内插件扩展')
  assert.doesNotMatch(body, /结果要手动搬进页面|基本全量可见/, '对手描述要准确')
  cleanup()

  renderSite('/security')
  body = document.body.textContent ?? ''
  assert.match(body, /模型调用/)
  assert.doesNotMatch(document.querySelector('.site-role-table')?.textContent ?? '', /Cursor/, '安全页不和没有内容权限的产品比权限')
  cleanup()
})

test('未知路径不 404 空白，给出诚实占位', () => {
  renderSite('/not-a-real-page')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /这一页还没建/)
  cleanup()
})

test('每页写入独立的 title / description / canonical（规划 §7.2）', () => {
  const cases: Array<[string, RegExp]> = [
    ['/pricing', /定价 · BIU/],
    ['/security', /安全 · BIU/],
    ['/product', /产品 · BIU/],
    ['/compare', /对比 · BIU/],
  ]
  for (const [path, pattern] of cases) {
    renderSite(path)
    assert.match(document.title, pattern, `path=${path} 的 title`)
    const desc = document.head.querySelector('meta[name="description"]')
    assert.ok(desc && (desc.getAttribute('content') ?? '').length > 10, `path=${path} 的 description`)
    const canonical = document.head.querySelector('link[rel="canonical"]')
    assert.ok(canonical, `path=${path} 的 canonical`)
    cleanup()
  }
  // 对比详情页 title 用页面标题
  renderSite('/compare/vs-obsidian')
  assert.match(document.title, /BIU vs Obsidian · BIU/)
  cleanup()
})

test('对比页不再和 Manus 对比（我们不是同一类东西）', () => {
  renderSite('/compare')
  assert.equal(/Manus/.test(document.body.textContent ?? ''), false, '对比总览不应出现 Manus')
  cleanup()

  // 旧路径直接访问 → 落到「没有这个对比页」，而不是残留一个半成品页面
  renderSite('/compare/vs-manus')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /没有这个对比页/)
  cleanup()
})

test('安全页：权限模型讲的是数据视图 × 成员视图，不是四个空间角色', () => {
  renderSite('/security')
  const body = document.body.textContent ?? ''

  // 正确的模型：两个维度做匹配
  assert.match(body, /数据视图/, '要讲数据视图')
  assert.match(body, /成员视图/, '要讲成员视图')
  assert.match(body, /谁能看到什么，是一次匹配的结果/, '要有模型主张')

  // 三个灵活点
  assert.match(body, /授权对象是条件，不是名单/, '要讲条件授权')
  assert.match(body, /可见性是算出来的/, '要讲可见性是派生值')
  assert.match(body, /继承/, '要讲继承')

  // 对比表要有 BIU 这一行，且明确指出两边都是条件
  assert.match(body, /两边都是条件/)

  // 回归防护：不能退回「四个空间角色 = 权限模型」的旧说法
  assert.equal(/权限角色/.test(body), false, '不应再出现「权限角色」小节')
  assert.equal(/按所有者、管理者、编辑者、查看者划分权限/.test(body), false, '不应再用空间角色描述权限模型')

  // 但空间角色仍是模型的一层输入 —— 不在这个页面上讲，避免混淆
  cleanup()
})

test('对比页：Linux 对比归入基础设施，且 BIU 列不回避弱项', () => {
  renderSite('/compare/vs-linux')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Linux/)
  assert.match(body, /基础设施/, '应归入「基础设施」')
  assert.match(body, /一切皆文件/, '要有 Linux 的核心主张')
  assert.match(body, /一切皆 \/<table>\/<id>/, '要有 BIU 的对应主张')
  assert.match(body, /VFS/, '要有抹平异构对应')
  assert.match(body, /插件注册表/, '要有驱动注册对应')

  // 纪律：不是通用 OS 这条必须如实写 ❌
  assert.match(body, /不是通用 OS/, '要承认 BIU 不是通用操作系统')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')

  // 承认对方适用场景
  assert.match(body, /用 Linux 当你需要/)
  cleanup()
})

test('对比页：Kubernetes 对比独立成页，归入基础设施，且 BIU 列不回避弱项', () => {
  renderSite('/compare/vs-k8s')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Kubernetes/)
  assert.match(body, /基础设施/, '应归入「基础设施」')
  assert.match(body, /一切皆声明式对象/, '要有 k8s 的核心主张')
  assert.match(body, /一切皆 \/<table>\/<id>/, '要有 BIU 的对应主张')
  assert.match(body, /API Server/, '要有入口对应')

  // 核心差异：声明写在页面里，一页可声明多个插件，组合成服务
  assert.match(body, /kubectl apply/, '要有 k8s 的声明方式')
  assert.match(body, /写在页面正文里/, '要讲清 BIU 的声明写在哪')
  assert.match(body, /<plugin kind=/, '要给出插件的声明写法')
  assert.match(body, /任意多个插件/, '要点明一页可以声明多个插件')
  assert.match(body, /页面本身就是组合结果/, '要讲清多个插件如何组合成服务')

  // 纪律：不做编排、没有多副本，这两条必须如实写 ❌
  assert.match(body, /不是编排系统/, '要承认 BIU 不是编排系统')
  assert.match(body, /未做多副本调度/, '要承认 BIU 没有多副本调度')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')

  // 承认对方适用场景
  assert.match(body, /用 k8s 当你需要/)
  cleanup()
})

test('对比页：Airtable 对比归入应用搭建，落点是「数据和界面同一种对象」', () => {
  renderSite('/compare/vs-airtable')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Airtable/)
  assert.match(body, /应用搭建/, '应归入「应用搭建」')
  assert.match(body, /填数据就得到应用/, '要有 Airtable 的核心主张')
  assert.match(body, /数据和界面是同一种对象/, '要给出 BIU 的对应主张')

  // 纪律：门槛高、无托管这两条必须如实写 ❌
  assert.match(body, /门槛明显更高/, '要承认插件门槛更高')
  assert.match(body, /无托管 SLA/, '要承认不做托管')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')

  // 承认对方适用场景
  assert.match(body, /用 Airtable 当你需要/)
  cleanup()
})

test('对比页：Retool 归入应用搭建，落点是「组件本身是数据」', () => {
  renderSite('/compare/vs-retool')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Retool/)
  assert.match(body, /应用搭建/, '应归入「应用搭建」')
  assert.match(body, /拖组件搭出内部工具/, '要有 Retool 的核心主张')
  assert.match(body, /组件本身就是数据/, '要给出 BIU 的对应主张')
  assert.match(body, /脱离这个平台就不成立/, '要点出「搭出来的东西归谁」')
  assert.match(body, /门槛明显更高/, '要承认插件门槛更高')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')
  assert.match(body, /用 Retool 当你需要/)
  cleanup()
})

test('对比页：Supabase 归入应用搭建，落点是「前后端归一层」', () => {
  renderSite('/compare/vs-supabase')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Supabase/)
  assert.match(body, /应用搭建/, '应归入「应用搭建」')
  assert.match(body, /后端即服务，前端自己写/, '要有 Supabase 的核心主张')
  assert.match(body, /数据、界面、智能体同一种对象/, '要给出 BIU 的对应主张')
  assert.match(body, /不需要在两侧各维护一套/, '要点出前后端归一层')
  assert.match(body, /无托管 SLA/, '要承认不做托管')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')
  assert.match(body, /用 Supabase 当你需要/)
  cleanup()
})

test('对比页：两个 harness 归入「编码 Harness」，且不谎称对方不能扩展', () => {
  renderSite('/compare/vs-dsh')
  let body = document.body.textContent ?? ''
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs DeepSeek Harness/)
  assert.match(body, /编码 Harness/, 'DSH 应归入「编码 Harness」')
  assert.match(body, /模型思考，Harness 执行/, '要有 DSH 的核心主张')
  assert.match(body, /数据即环境/, '要给出 BIU 的对应主张')
  assert.match(body, /db_read \/ db_update \/ db_action/, '要给出 BIU 的操作方式')
  // 纪律：DSH 确实支持插件与多 agent，不能写成 ❌
  assert.match(body, /支持，开放式插件生态/, '要如实承认 DSH 支持插件')
  assert.match(body, /非专精领域/, '要承认 BIU 编码非专精')
  assert.match(body, /用 DeepSeek Harness 当你需要/)
  cleanup()

  renderSite('/compare/vs-pi')
  body = document.body.textContent ?? ''
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Pi/)
  assert.match(body, /编码 Harness/, 'Pi 应归入「编码 Harness」')
  assert.match(body, /极简核心，可组装/, '要有 Pi 的核心主张')
  assert.match(body, /极简内核，数据即扩展点/, '要给出 BIU 的对应主张')
  assert.match(body, /设计目标就是可嵌入/, '要如实承认 Pi 可嵌入的优势')
  assert.match(body, /插件生态刚起步/, '要承认 BIU 生态刚起步')
  assert.match(body, /用 Pi 当你需要/)
  cleanup()
})

test('对比页：harness 这类对手的能力不比 BIU 弱，不应滥用 ❌', () => {
  // 纪律的另一面：对方同样支持插件与多 agent 时，不能把它写成 ❌ 来抬高自己。
  const src = readFileSync(resolve(import.meta.dirname, './marketing-site/compare.tsx'), 'utf8')
  for (const slug of ['vs-dsh', 'vs-pi']) {
    const start = src.indexOf(`slug: '${slug}'`)
    const end = src.indexOf('  },\n  {', start)
    const rows = src.slice(start, end)
    assert.equal(rows.includes('❌'), false, `${slug} 不该出现 ❌：对手能力强于或等于 BIU 时，硬标 ❌ 是撒谎`)
    // 但必须如实承认对方的长处
    assert.match(rows, /⚠️|✅/, `${slug} 应如实标注对方强项`)
  }
})

test('品牌页：三块颜色各自可调，滑块改的是对应扇区而不是摆设', () => {
  renderSite('/brand')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /一个圆、两条线、三个块/)

  // 页面里有两个标记（hero 展示 + 调节器预览），调节器是后一个。
  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  // svg 里三条带 fill 的 path 渲染顺序：左上块 / 右上块 / 下方大块，与滑块 0/1/2 一一对应。
  const fillOf = () => Array.from(svg.querySelectorAll('path[fill]')).map((w) => w.getAttribute('fill'))
  const before = fillOf()
  assert.equal(before.length, 3, '应有三块扇区')
  assert.equal(new Set(before).size, 3, '三块初始应是三个不同颜色')

  // 三个滑块各自的标签必须和画面上那块对得上，且互不串色。
  fireEvent.change(screen.getByTestId('brand-color-0'), { target: { value: '#123456' } })
  assert.equal(fillOf()[0], '#123456', '滑块 0「左上块」应改到左上那块')
  fireEvent.change(screen.getByTestId('brand-color-1'), { target: { value: '#654321' } })
  assert.equal(fillOf()[1], '#654321', '滑块 1「右上块」应改到右上那块')
  fireEvent.change(screen.getByTestId('brand-color-2'), { target: { value: '#0f0f0f' } })
  const after = fillOf()
  assert.equal(after[2], '#0f0f0f', '滑块 2「下方大块」应改到下方那块')
  assert.equal(after[0], '#123456', '左上不应被后续操作带着改')
  assert.equal(after[1], '#654321', '右上不应被后续操作带着改')

  // 三块必须都真正被填色，不留空 —— 曾经漏填过下方大块。
  for (const [i, fill] of after.entries()) {
    assert.ok(fill && fill !== 'none', `第 ${i} 块必须有填充色，实际是 ${fill}`)
  }
  cleanup()
})

test('品牌页：线宽滑块真的改到圆与线的描边', () => {
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  const strokedBefore = Array.from(svg.querySelectorAll('[stroke]')).map((n) => n.getAttribute('stroke-width'))
  assert.ok(strokedBefore.length >= 3, '圆 + 两条线都应带描边')

  fireEvent.change(screen.getByTestId('brand-stroke-width'), { target: { value: '9' } })
  const circle = svg.querySelector('circle')
  assert.equal(circle?.getAttribute('stroke-width'), '9', '圆环粗细应跟随滑块')
  cleanup()
})

test('品牌页：构成与标题对齐 —— 一个圆、两条线、三个块，再加一句主张', () => {
  renderSite('/brand')
  const body = document.body.textContent ?? ''

  // 前三条与 h1 逐字对齐（量词统一），第四条才是主张。
  for (const item of ['一个圆', '两条线', '三个块']) {
    assert.match(body, new RegExp(item), `构成应包含「${item}」`)
  }
  assert.match(body, /三生万物/, '第四条主张')

  // 「交点不在正中心」曾是编造出来的特征：
  // 实测圆心到两条线的距离是 0.5 和 1.9（R=290），等于过圆心，
  // 那点偏差只是目测端点的误差。不能再把它当设计特征讲。
  assert.doesNotMatch(body, /不相交于正中心/, '不能把测量误差说成设计特征')
  assert.doesNotMatch(body, /有方向的标记/, '这条说法建立在错误的几何上，应已删除')
  cleanup()
})

test('品牌页：说明这个标记刚好是 BIU 三个字母', () => {
  renderSite('/brand')
  const body = document.body.textContent ?? ''

  assert.match(body, /拼成 B、I、U 三个字母/, '要点出三块拼成 BIU')
  assert.match(body, /标记本身就是名字/, '要说清形状即名字')
  assert.doesNotMatch(body, /使用规则/, '品牌页不再单列使用规则')
  assert.doesNotMatch(body, /三块，三个字母，三层意思/, '不再单列三块寓意')
  cleanup()
})

test('品牌页：三生万物 —— 从三块讲到每个人的那一版 BIU', () => {
  renderSite('/brand')
  const body = document.body.textContent ?? ''

  // 构成里的第四条，用《道德经》的落点收尾：三块生出无穷变化。
  assert.match(body, /三生万物/, '构成应有「三生万物」一条')
  assert.match(body, /三块是固定的，颜色和线条不是/, '要说清「固定的是什么、可变的是什么」')
  assert.match(body, /长成每个人自己的样子/, '要说清「万物」指什么，不能只留一个文言词')

  // 同一句主张在页面上只出现一次 —— 重复说反而稀释。
  const hits = body.split('一千个人有一千个自己的 BIU').length - 1
  assert.equal(hits, 1, `这句应只出现一次，实际 ${hits} 次`)
  cleanup()
})

test('品牌页：调节器一改，页面顶部那枚标记同步变（同一份配置）', () => {
  localStorage.clear()
  renderSite('/brand')
  // 页面上有两枚标记：顶部 hero 一枚、调节器预览一枚。
  const marks = () => screen.getAllByRole('img', { name: 'BIU 品牌标记' })
  assert.equal(marks().length, 2, 'hero 与调节器各一枚')
  const fillsOf = (svg: HTMLElement) =>
    Array.from(svg.querySelectorAll('path[fill]')).map((n) => n.getAttribute('fill'))

  // 改调节器的颜色，顶部 hero 必须跟着变 —— 否则就是两套配置。
  fireEvent.change(screen.getByTestId('brand-color-0'), { target: { value: '#abcdef' } })
  assert.equal(fillsOf(marks()[0]!)[0], '#abcdef', 'hero 标记应跟随调节器变色')
  assert.equal(fillsOf(marks()[1]!)[0], '#abcdef', '调节器预览自身也要变')

  // 圆的大小同理。
  fireEvent.change(screen.getByTestId('brand-circle-ratio'), { target: { value: '0.35' } })
  const heroR = Number(marks()[0]!.querySelector('circle')!.getAttribute('r'))
  const previewR = Number(marks()[1]!.querySelector('circle')!.getAttribute('r'))
  assert.equal(heroR, previewR, '两枚标记的圆应同样大小')

  // 线条粗细也同步。
  fireEvent.change(screen.getByTestId('brand-stroke-width'), { target: { value: '20' } })
  assert.equal(
    marks()[0]!.querySelector('circle')!.getAttribute('stroke-width'),
    marks()[1]!.querySelector('circle')!.getAttribute('stroke-width'),
    '两枚标记的线宽应一致',
  )
  cleanup()
})

test('品牌标记：小尺寸下线条不缩成亚像素（毛边的来源）', () => {
  // 线条在 viewBox 单位里表达，缩到 24px 会变成 0.1~0.3 屏幕像素 ——
  // 浏览器画不了零点几像素的线，只能抗锯齿糊过去，就出现毛边。
  // displayWidth 用来兜住这件事：任何尺寸下线都不低于 1 屏幕像素。
  const cases: Array<[number, number]> = [
    [3, 24], [7.5, 24], [12, 24], [3, 240], [7.5, 240], [20, 240],
  ]
  for (const [width, display] of cases) {
    const { unmount } = render(<BrandMark strokeWidth={width} lineWidth={width} displayWidth={display} />)
    const svg = screen.getByRole('img')
    const vbSize = Number(svg.getAttribute('viewBox')!.split(/\s+/)[2])
    const onScreen = (el: Element) =>
      (Number(el.getAttribute('stroke-width')) / vbSize) * display
    for (const el of Array.from(svg.querySelectorAll('[stroke-width]'))) {
      assert.ok(
        onScreen(el) >= 0.999,
        `线宽 ${width} 在 ${display}px 下只有 ${onScreen(el).toFixed(2)} 屏幕像素，会糊`,
      )
    }
    unmount()
    cleanup()
  }
})

test('品牌页：粗细可以调到 0（等于隐藏线条），且不被可见性保底顶回去', () => {
  localStorage.clear()
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  const strokes = () => Array.from(svg.querySelectorAll('[stroke-width]')).map((n) => n.getAttribute('stroke-width'))

  fireEvent.change(screen.getByTestId('brand-stroke-width'), { target: { value: '0' } })
  fireEvent.change(screen.getByTestId('brand-line-width'), { target: { value: '0' } })
  for (const w of strokes()) {
    assert.equal(w, '0', `粗细为 0 时必须原样输出，实际 ${w}`)
  }
  cleanup()

  // 图标场景同样尊重 0：用户要隐藏，不该被最小可见宽度救回来。
  render(
    <BrandMark strokeWidth={0} lineWidth={0} scene="icon" />,
  )
  for (const w of Array.from(screen.getByRole('img').querySelectorAll('[stroke-width]')).map((n) => n.getAttribute('stroke-width'))) {
    assert.equal(w, '0', '图标场景下 0 也必须是 0')
  }
  cleanup()
})

test('品牌标记：三块分别是 B / I / U，方位与明度都不能改错', () => {
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  const paths = Array.from(svg.querySelectorAll('path[fill]'))
  assert.equal(paths.length, 3)

  // 每块的「结束边」角度决定它落在画面哪一侧，借此钉住 B/I/U 的方位。
  // 这是标记的全部意义所在 —— 位置错了就不是 BIU 了。
  const endAngle = (i: number) => {
    const m = paths[i]!.getAttribute('d')!.match(/A [\d.]+ [\d.]+ 0 \d 1 ([\d.]+) ([\d.]+)/)
    assert.ok(m, '扇区应有弧线')
    return Math.round(Math.atan2(Number(m![2]) - 615, Number(m![1]) - 450) * 180 / Math.PI)
  }
  assert.equal(endAngle(0), -39, 'colors[0] 应结束于 -39°（右上 = B）')
  assert.equal(endAngle(1), 52, 'colors[1] 应结束于 52°（右下 = I）')
  assert.equal(endAngle(2), -127, 'colors[2] 应结束于 -127°（左下 = U）')

  // 默认是「暖灰」这一组固定色，不是无彩度灰阶 —— 以前这条断言写的是
  // 「R=G=B」，那是旧默认（纯灰）留下的，换成暖灰后 R>G>B 成了固有特征，
  // 旧断言会把正确实现判成错的。现在钉两件真正重要的事：
  //   1) 三个值就是暖灰那三个，别被谁顺手换成别的色；
  //   2) 明度必须递降、B 最亮 —— 三块靠明度分层次，改错就糊成一块。
  const lum = (hex: string) => parseInt(hex.slice(1, 3), 16)
  const fills = paths.map((n) => n.getAttribute('fill')!)
  assert.deepEqual(
    fills.map((f) => f.toLowerCase()),
    ['#e8ddd3', '#b3a498', '#6b5f55'],
    `默认应为暖灰三色，实际：${fills.join(' / ')}`,
  )
  assert.ok(lum(fills[0]!) > lum(fills[1]!), `B 应比 I 亮：${fills[0]} vs ${fills[1]}`)
  assert.ok(lum(fills[1]!) > lum(fills[2]!), `I 应比 U 亮：${fills[1]} vs ${fills[2]}`)
  // 暖灰是暖调：红通道 > 绿 > 蓝。这条能挡住「换成冷灰/纯灰」这类误改。
  for (const fill of fills) {
    const [r, g, b] = [fill.slice(1, 3), fill.slice(3, 5), fill.slice(5, 7)]
    assert.ok(r! > g! && g! > b!, `暖灰应保持 R>G>B 的暖调：${fill}`)
  }
  cleanup()
})

test('品牌页：圆的大小可调，且不影响背景方块', () => {
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  const circle = () => svg.querySelector('circle')!
  const rect = () => svg.querySelector('rect')!

  const beforeR = Number(circle().getAttribute('r'))
  const beforeRect = rect().getAttribute('width')
  assert.ok(beforeR > 0, '圆应有半径')

  fireEvent.change(screen.getByTestId('brand-circle-ratio'), { target: { value: '0.4' } })
  const afterR = Number(circle().getAttribute('r'))
  assert.ok(afterR < beforeR, `圆应变小：${beforeR} → ${afterR}`)
  assert.equal(rect().getAttribute('width'), beforeRect, '背景方块不该跟着变')

  fireEvent.change(screen.getByTestId('brand-circle-ratio'), { target: { value: '1' } })
  assert.ok(Number(circle().getAttribute('r')) > afterR, '调大时圆应变大')

  // 扇区必须跟圆同步缩放，否则色块会溢出或缩在中间。
  const wedge = svg.querySelector('path[fill]')!
  assert.match(wedge.getAttribute('d') ?? '', /A [\d.]+ [\d.]+/, '扇区弧线半径应随圆变化')
  cleanup()
})

test('品牌页：调好的配置写进 localStorage，重新挂载后还在', () => {
  localStorage.clear()
  renderSite('/brand')
  fireEvent.change(screen.getByTestId('brand-color-0'), { target: { value: '#010203' } })
  fireEvent.change(screen.getByTestId('brand-circle-ratio'), { target: { value: '0.45' } })
  cleanup()

  const raw = localStorage.getItem('cordis.brand.studio')
  assert.ok(raw, '应写入 localStorage')
  const saved = JSON.parse(raw!)
  assert.equal(saved.c0, '#010203', '颜色应被保存')
  assert.equal(saved.circleRatio, 0.45, '圆的大小应被保存')

  // 重新挂载：上次的选择必须还在，而不是回到默认值。
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  const fills = Array.from(svg.querySelectorAll('path[fill]')).map((n) => n.getAttribute('fill'))
  assert.equal(fills[0], '#010203', '重开应沿用保存的颜色')
  assert.equal((screen.getByTestId('brand-color-0') as HTMLInputElement).value, '#010203')
  assert.equal((screen.getByTestId('brand-circle-ratio') as HTMLInputElement).value, '0.45')
  localStorage.clear()
  cleanup()
})

test('品牌页：localStorage 里的脏数据不会把图形弄坏', () => {
  // 旧版本、手改过的值都可能出现。渲染必须仍然成立，不能出 NaN。
  localStorage.setItem('cordis.brand.studio', JSON.stringify({
    c0: 'not-a-color',
    circleRatio: 999,
    strokeWidth: 'x',
    showBackground: 'yes',
  }))
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  const r = Number(svg.querySelector('circle')!.getAttribute('r'))
  assert.ok(Number.isFinite(r) && r > 0, `半径必须是有效正数，实际 ${r}`)
  const fills = Array.from(svg.querySelectorAll('path[fill]')).map((n) => n.getAttribute('fill'))
  for (const fill of fills) {
    assert.ok(fill && !fill.includes('NaN'), `填充色不能是 NaN，实际 ${fill}`)
  }
  localStorage.clear()
  cleanup()
})

test('品牌页：预设配色充足、格式合法、三色互不重复', () => {
  renderSite('/brand')
  const buttons = screen.getAllByRole('button').filter((b) => b.className === 'brand-preset')
  assert.ok(buttons.length >= 12, `预设应足够多，实际只有 ${buttons.length} 个`)

  const names = buttons.map((b) => b.textContent?.trim() ?? '')
  assert.equal(new Set(names).size, names.length, '预设名不能重复')
  for (const name of ['单色', '速度']) {
    assert.ok(names.includes(name), `应有「${name}」预设`)
  }

  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  const fills = () => Array.from(svg.querySelectorAll('path[fill]')).map((n) => n.getAttribute('fill')!)

  // 逐个点一遍：三块都必须变成有效色值，且三色互不相同。
  for (const button of buttons) {
    fireEvent.click(button)
    const colors = fills()
    assert.equal(colors.length, 3)
    for (const c of colors) {
      assert.match(c, /^#[0-9a-fA-F]{6}$/, `${button.textContent} 产出了非法色值 ${c}`)
    }
    assert.equal(new Set(colors).size, 3, `${button.textContent} 的三个颜色不应重复`)
  }
  cleanup()
})

test('品牌页：预设按钮一次改三块颜色', () => {
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU 品牌标记' }).at(-1)!
  fireEvent.click(screen.getByRole('button', { name: /深海/ }))
  const fills = Array.from(svg.querySelectorAll('path[fill]')).map((w) => w.getAttribute('fill'))
  // 渲染顺序即 colors[0] / colors[1] / colors[2]：左上 / 右上 / 下方大块
  assert.deepEqual(fills, ['#1e3a8a', '#0ea5e9', '#0f172a'], '深海预设应落到三块上')
  cleanup()
})

test('品牌页已接入路由与导航', () => {
  renderSite('/')
  const nav = screen.getAllByRole('navigation', { name: '官网' })[0]!
  const brandLink = Array.from(nav.querySelectorAll('a')).find((a) => a.getAttribute('href') === '/brand')
  assert.ok(brandLink, '导航应出现 /brand 入口')
  assert.equal(brandLink!.textContent, '品牌')
})
