import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarketingHome } from './marketing-home.tsx'
import { MarketingSite } from './marketing-site/index.tsx'
import { BrandMark, resetBrandConfigCache } from './marketing-site/brand-mark.tsx'
import { SITE_LOCALE_KEY } from './marketing-site/locale.tsx'

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

test('language switch keeps the current page and remembers the selected locale', async () => {
  renderSite('/product')
  assert.ok(screen.getByRole('heading', { level: 1, name: 'Pages are containers. Plugins are software.' }))

  fireEvent.click(screen.getByRole('button', { name: 'Switch to Chinese' }))
  assert.ok(await screen.findByRole('heading', { level: 1, name: '页面是容器，插件是软件' }))
  assert.equal(localStorage.getItem(SITE_LOCALE_KEY), 'zh')
  assert.equal(document.documentElement.lang, 'zh-CN')

  cleanup()
  renderSite('/product')
  assert.ok(await screen.findByRole('heading', { level: 1, name: '页面是容器，插件是软件' }), '刷新后仍保持中文和当前页面')

  fireEvent.click(screen.getByRole('button', { name: '切换到英文' }))
  assert.ok(await screen.findByRole('heading', { level: 1, name: 'Pages are containers. Plugins are software.' }))
  assert.equal(localStorage.getItem(SITE_LOCALE_KEY), 'en')
  assert.equal(document.documentElement.lang, 'en')
})

test('投资页有商业模式、融资后的计划与资金用途，中英文同步', async () => {
  renderSite('/invest')
  for (const name of ['Business model', 'Plan after funding', 'Use of funds']) {
    assert.ok(screen.getByRole('region', { name }), `英文投资页有「${name}」`)
  }
  assert.equal(screen.getByRole('region', { name: 'Plan after funding' }).querySelectorAll('article').length, 3)
  cleanup()

  localStorage.setItem(SITE_LOCALE_KEY, 'zh')
  renderSite('/invest')
  assert.ok(await screen.findByRole('heading', { level: 1, name: '投资下一家万亿美元 AI 公司' }))
  for (const name of ['商业模式', '融资后的计划', '资金用途']) {
    assert.ok(screen.getByRole('region', { name }), `中文投资页有「${name}」`)
  }
  assert.match(screen.getByRole('region', { name: '资金用途' }).textContent ?? '', /商业计划书/)
})

test('landing page embeds real empty product surfaces and opens account actions', () => {
  let login = 0
  let start = 0
  render(
    <MemoryRouter>
      <MarketingHome onLogin={() => { login += 1 }} onStart={() => { start += 1 }} />
    </MemoryRouter>,
  )

  const h1 = screen.getByRole('heading', { level: 1 })
  assert.equal(h1.getAttribute('aria-label'), 'Transform how the world builds, stores, composes, distributes, and derives software')
  assert.deepEqual(
    Array.from(h1.children).map((node) => node.textContent),
    ['Transform how the world', 'build01store02compose03distribute04derive05', 'software'],
    'slogan 分三行，同一种字',
  )
  const verbLinks = Array.from(h1.querySelectorAll('.site-hero-verbs a'))
  assert.ok(verbLinks.every((link) => link.querySelector('sup')?.getAttribute('aria-hidden') === 'true'), '编号只作装饰')
  assert.deepEqual(
    verbLinks.map((link) => [link.firstChild?.textContent, link.getAttribute('href')]),
    [
      ['build', '/blog/build-software'],
      ['store', '/blog/store-software'],
      ['compose', '/blog/compose-software'],
      ['distribute', '/blog/distribute-software'],
      ['derive', '/blog/derive-software'],
    ],
    '五个词各自通向一篇文章',
  )
  const band = document.querySelector('.site-hero-band')!
  assert.ok(band.closest('.site-hero'), '产品句和下载入口在首屏底部')
  assert.equal(document.querySelector('.site-hero-epigraph span')?.textContent, 'The medium is the message')
  assert.match(document.querySelector('.site-hero-epigraph cite')?.textContent ?? '', /Marshall McLuhan/)
  assert.equal(document.querySelector('.site-hero-sub')?.textContent, 'The next medium for human–AI collaboration')
  const productLine = document.querySelector('.site-hero-band h2')
  assert.equal(productLine?.textContent, 'Compose all your software on one page')
  assert.equal(document.querySelector('.site-hero-band .site-eyebrow')?.textContent, 'Open Source · Free · All in One')
  assert.ok(h1.compareDocumentPosition(productLine!) & Node.DOCUMENT_POSITION_FOLLOWING, '产品句在主张下面')
  assert.equal(document.querySelector('.site-hero-lead'), null, '首屏不放长说明')
  assert.match(document.querySelector('.site-demo-lead')?.textContent ?? '', /^In BIU, every block is fully functional software.*technical interview coaching experience/, '说明并进真实界面「页面」的介绍')
  assert.equal(document.querySelector('.site-hero .site-section-label'), null)

  // P0-13：演示区用静态截图，不再嵌 iframe（iframe 会完整加载 web 应用三次）
  assert.equal(screen.queryByTitle('BIU page interface preview'), null, '不应再有 iframe 预览')

  const video = document.querySelector('video.site-demo-shot') as HTMLVideoElement
  assert.ok(video, '默认标签是「页面」录屏')
  assert.equal(video.getAttribute('poster'), '/site/demo-allinone.webp')
  assert.deepEqual(Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('src')), ['/site/demo-allinone.webm', '/site/demo-allinone.mp4'])
  assert.ok(video.muted && video.loop, '自动播放的录屏必须静音循环')

  fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }))
  const shot = screen.getByRole('img', { name: /BIU plugin table/ }) as HTMLImageElement
  assert.equal(shot.getAttribute('src'), '/site/shot-plugins.webp')
  assert.equal(shot.getAttribute('loading'), 'lazy')
  const tablist = screen.getByRole('tablist', { name: 'Product demo' })
  assert.deepEqual(
    Array.from(tablist.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent),
    ['Pages', 'Plugins', 'Share', 'Components', 'Data', 'References'],
  )
  const caption = document.querySelector('.site-demo-lead')!
  assert.ok(tablist.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING, '说明文字在切换按钮下面')
  assert.ok(caption.compareDocumentPosition(document.querySelector('.site-demo-shot')!) & Node.DOCUMENT_POSITION_FOLLOWING, '说明文字在画面上面')
  assert.equal(document.querySelector('.site-product-demo h3'), null, '说明文字不带标题')
  const lead = () => document.querySelector('.site-demo-lead')?.textContent ?? ''
  const leads = new Set<string>()
  for (const [tab, src] of [['Components', 'demo-component'], ['Data', 'demo-file-system'], ['References', 'demo-context']] as const) {
    fireEvent.click(screen.getByRole('tab', { name: tab }))
    assert.doesNotMatch(lead(), /technical interview coaching experience/, `切到「${tab}」后说明文字要跟着换`)
    leads.add(lead())
    const img = document.querySelector('img.site-demo-shot') as HTMLImageElement
    assert.equal(img.getAttribute('src'), `/site/${src}.webp`, `「${tab}」用回原来那张真实截图`)
    assert.equal(img.getAttribute('width'), '3840')
  }
  assert.equal(leads.size, 3, '每个标签有自己的说明')
  fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
  assert.match(lead(), /spread across.*bring them back together.*structured tables/, '组件说明讲的是把散在各页的插件收集成结构化的表')

  const finalGitHub = document.querySelector('.site-final-cta a[href*="github.com"]')!
  assert.match(finalGitHub.textContent ?? '', /^GitHub/, '底部按钮直接写 GitHub')
  assert.doesNotMatch(finalGitHub.textContent ?? '', /View source/)
  assert.match(readFileSync(resolve(process.cwd(), 'web/style.css'), 'utf8'), /\.site-gh-star\s*\{\s*color:\s*#e3b341/, '星标用 GitHub 的黄色')

  const wall = screen.getByRole('region', { name: 'Plugins' })
  assert.ok(wall.querySelectorAll('article').length >= 8, '首页插件墙列出现成的插件')
  assert.match(wall.textContent ?? '', /Excalidraw/)

  fireEvent.click(screen.getByTestId('site-login'))
  assert.equal(screen.getByTestId('site-start').getAttribute('href'), '/download')
  assert.equal(screen.getByTestId('site-start').textContent, 'Download')
  assert.doesNotMatch(document.body.textContent ?? '', /Free download/, '按钮只写「下载」')
  assert.ok(screen.getByTestId('site-start').querySelector('svg.site-icon'), '导航下载按钮带下载图标')
  assert.equal(login, 1)
  assert.equal(start, 0)
  cleanup()
})

test('home 收窄后：深度内容下沉，导航指向独立页', () => {
  renderSite('/')
  // 场景痛点、完整对照表留在内页，首页只开门
  assert.equal(screen.queryByText(/Sources are scattered across dozens of tabs/), null)
  assert.equal(screen.queryByText('BIU vs Linux'), null)
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
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  const brandMark = document.querySelector('.site-brand-mark')
  assert.match(brandMark?.querySelector('rect')?.getAttribute('fill') ?? '', /#ffffff/i, '左上角标记保留白色圆角底')
  assert.match(nav.textContent ?? '', /Product/)
  assert.match(nav.textContent ?? '', /Pricing/)
  assert.match(nav.textContent ?? '', /Compare/)
  // 首页主张：All in One —— 页面组合软件
  assert.match(screen.getByRole('heading', { level: 1 }).getAttribute('aria-label') ?? '', /builds, stores, composes, distributes, and derives/)
  assert.equal(document.querySelector('.site-hero-band h2')?.textContent, 'Compose all your software on one page')
  cleanup()
})

test('首页三扇门通向场景、对比和想法，深度留在内页', () => {
  renderSite('/')
  const faq = document.querySelector('.site-faq')!
  const scenes = screen.getByRole('region', { name: 'Use cases' })
  const compare = screen.getByRole('region', { name: 'Comparisons' })
  const ideas = screen.getByRole('region', { name: 'Ideas' })
  assert.ok(scenes.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING, '对比在场景后面')
  assert.ok(compare.compareDocumentPosition(ideas) & Node.DOCUMENT_POSITION_FOLLOWING, '想法在对比后面')
  assert.ok(ideas.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING, '三扇门在 FAQ 前面')

  const sceneLinks = within(scenes).getAllByRole('link')
  assert.deepEqual(
    sceneLinks.slice(0, 6).map((link) => link.getAttribute('href')),
    ['/use-cases/research', '/use-cases/product', '/use-cases/content', '/use-cases/team-knowledge', '/use-cases/personal', '/use-cases/collaboration'],
  )
  assert.match(sceneLinks[0]?.textContent ?? '', /Research & Analysis/)
  assert.match(sceneLinks[0]?.textContent ?? '', /Research report · Database · Comparison matrix/)
  assert.equal(sceneLinks[6]?.getAttribute('href'), '/use-cases')
  assert.equal(screen.queryByText(/Sources are scattered across dozens of tabs/), null, '痛点正文留在场景页')

  const compareLinks = within(compare).getAllByRole('link')
  assert.deepEqual(
    compareLinks.slice(0, 3).map((link) => link.getAttribute('href')),
    ['/compare/vs-notion', '/compare/vs-obsidian', '/compare/vs-chatgpt'],
  )
  assert.match(compareLinks[0]?.textContent ?? '', /Notion/)
  assert.match(compareLinks[0]?.textContent ?? '', /Plugins define your block types/)
  assert.doesNotMatch(compare.textContent ?? '', /combine software on one page for clients or teams/, '不把长对照贴进卡片')
  assert.equal(compareLinks[3]?.getAttribute('href'), '/compare')
  assert.equal(screen.queryByText('BIU vs Linux'), null)
  assert.equal(screen.queryByText('Everything is a file'), null)

  const ideaLinks = within(ideas).getAllByRole('link')
  assert.equal(ideaLinks[0]?.getAttribute('href'), '/blog/all-in-one')
  assert.equal(ideaLinks[1]?.getAttribute('href'), '/blog/saas-to-paas')
  assert.match(ideaLinks[0]?.textContent ?? '', /min read/)
  assert.equal(ideaLinks[2]?.getAttribute('href'), '/brand')
  assert.match(ideaLinks[2]?.textContent ?? '', /One circle, two lines, three blocks/)
  assert.match(ideaLinks[2]?.textContent ?? '', /mark spells the name.*B.*I.*U/, '首页品牌入口与品牌页同步讲 BIU 与标记的关系')
  assert.ok(ideaLinks[2]?.querySelector('svg.site-idea-mark'), '品牌入口画的是活的标记')
  assert.equal(ideaLinks[3]?.getAttribute('href'), '/blog')
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
    ['/product', /Pages are containers. Plugins are software./],
    ['/pricing', /Free and open source/],
    ['/download', /Run BIU on your device/],
    ['/security', /You decide where your data lives/],
    ['/compare', /Compare BIU with the best in every category/],
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
  assert.ok(screen.getAllByText(/Choose Notion when you need/).length > 0, '必须承认对手适用场景')
  cleanup()
})

test('对比页：Notion 页的落点是 facet —— 属性在记录之外，不用改表', () => {
  renderSite('/compare/vs-notion')
  const body = document.body.textContent ?? ''

  // facet 的语义：属性挂在记录外面，原表不动（合并后一句话讲完）
  assert.match(body, /facet/, '要出现 facet 这个概念')
  assert.match(body, /property lives outside the record, leaves the source table unchanged/, '要点出「不改表」')
  assert.match(body, /any record can use one/, '要点出「对任何数据都能加」')
  assert.match(body, /record can carry multiple facets/, '要点出一条记录可以挂多个')
  assert.match(body, /span different tables/, '要点出跨表')

  // 对照：Notion 那边是改 schema
  assert.match(body, /Changes the database schema/, '要说清 Notion 的做法')

  // 纪律：协同编辑这条必须如实认输（已并入「成熟度」一行）
  assert.match(body, /collaborative editing, permission polish, and plugin ecosystem are not yet at Notion’s level/, '要承认协同编辑未到 Notion 同级')
  cleanup()
})

test('对比页：Notion 页的权限差异 —— 授权对象可以是视图，不是名单', () => {
  renderSite('/compare/vs-notion')
  const body = document.body.textContent ?? ''

  // 核心差异：授权给谁 —— 名单 vs 成员视图
  assert.match(body, /member view/, '要出现「成员视图」这个授权对象')
  assert.match(body, /authorized view_id carries its own filter conditions/, '要点出授权对象带着条件')

  // 授权范围是筛选条件而非实体（已并入「授权给谁、授到哪」一行）
  assert.match(body, /view_id/, '要出现 view_id')

  // 条件先写好，新记录自动落入范围
  assert.match(body, /matching new record enters the authorized scope automatically/, '要点出「不用逐条补授权」')

  // 角色与继承
  assert.match(body, /highest viewer \/ editor \/ manager \/ owner grant wins/, '要出现多重来源取最高')
  assert.match(body, /inherit \/ private \/ members \/ restricted/, '要出现继承模式')
  assert.match(body, /inherited parent/, '要出现授权来源可见性')

  // 纪律：权限模型再细也要认输打磨程度（成熟度已合并成一行）
  assert.match(body, /not yet at Notion’s level/, '要承认权限与协同的打磨未到同级')
  cleanup()
})

test('定价页 ROI 计算器按选项实时重算', () => {
  renderSite('/pricing')
  // 默认勾选：知识库10 + 项目管理24 + AI助手20 = 54
  assert.match(screen.getByText('/user/month').parentElement?.textContent ?? '', /\$54/)
  // 再勾一个会议记录 18 => 72
  fireEvent.click(screen.getByText('Meeting notes'))
  assert.match(screen.getByText('/user/month').parentElement?.textContent ?? '', /\$72/)
  cleanup()
})

test('定位：All in One、开源免费，文案不夸大', () => {
  renderSite('/')
  let body = document.body.textContent ?? ''
  assert.match(body, /Open Source · Free · All in One/)
  assert.equal(document.querySelector('.site-task-box'), null, '首页不再放会丢掉输入的任务框')
  assert.doesNotMatch(body, /BIU Team/, '不放团队自述冒充用户证言')
  const github = Array.from(document.querySelectorAll('a')).filter((a) => a.getAttribute('href') === 'https://github.com/helloooooooooooooo97/biu')
  assert.ok(github.length >= 2, '首屏和收尾都要有 GitHub 入口')
  cleanup()

  renderSite('/pricing')
  body = document.body.textContent ?? ''
  assert.match(body, /Apache 2\.0/)
  assert.doesNotMatch(body, /Contact sales|refund|on demand/i, '开源免费，不再有销售与计费话术')
  cleanup()

  renderSite('/compare')
  body = document.body.textContent ?? ''
  assert.doesNotMatch(body, /Ask what BIU cannot do/)
  assert.match(body, /Information current as of October 2026/)
  cleanup()

  renderSite('/compare/vs-notion')
  body = document.body.textContent ?? ''
  assert.match(body, /What a page can contain/, 'Notion 对比要讲清页面内插件扩展')
  assert.doesNotMatch(body, /Results must be manually moved into pages|Nearly all content is visible/, '对手描述要准确')
  cleanup()

  renderSite('/security')
  body = document.body.textContent ?? ''
  assert.match(body, /Model calls/)
  assert.doesNotMatch(document.querySelector('.site-role-table')?.textContent ?? '', /Cursor/, '安全页不和没有内容权限的产品比权限')
  cleanup()
})

test('博客：总览列出每篇文章，文章页能打开并链到下一篇', () => {
  renderSite('/blog')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /How BIU thinks/)
  const links = Array.from(document.querySelectorAll('a.site-blog-item')).map((a) => a.getAttribute('href'))
  assert.ok(links.length >= 4, '至少四篇理念文章')
  assert.ok(links.includes('/blog/all-in-one'), '第一篇讲 All in One')
  cleanup()

  renderSite('/blog/all-in-one')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /All in One/)
  assert.match(document.body.textContent ?? '', /:::pageBlock/)
  assert.ok(screen.getByRole('navigation', { name: 'Next article' }).querySelector('a[href^="/blog/"]'))
  cleanup()

  renderSite('/blog/saas-to-paas')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /Software as a Service and Page as a Service: From SaaS to PaaS/)
  assert.deepEqual(
    Array.from(document.querySelectorAll('h2')).map((h) => h.textContent?.split(':')[0]).slice(0, 5),
    ['Create', 'Store', 'Distribute', 'Compose', 'Derive'],
    '五个角度依次讲',
  )
  cleanup()

  const series = ['build-software', 'store-software', 'compose-software', 'distribute-software', 'derive-software']
  series.forEach((slug, i) => {
    renderSite(`/blog/${slug}`)
    assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', new RegExp(`^${['Build', 'Store', 'Compose', 'Distribute', 'Derive'][i]}:`))
    const refs = screen.getByRole('region', { name: 'References' }).querySelectorAll('ol > li a[href^="https://"]')
    assert.ok(refs.length > 0, '每篇文章都列出参考资料')
    const cited = Math.max(...[...(document.querySelector('.site-article-body')?.textContent ?? '').matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))
    assert.ok(cited <= refs.length, '正文引用编号都有对应条目')
    if (i < series.length - 1) {
      assert.equal(screen.getByRole('navigation', { name: 'Next article' }).querySelector('a')?.getAttribute('href'), `/blog/${series[i + 1]}`, '五篇按顺序接着读')
    }
    cleanup()
  })

  renderSite('/')
  const vision = screen.getByRole('region', { name: 'Vision' })
  assert.deepEqual(
    [...vision.querySelectorAll('[role="rowheader"] a')].map((a) => a.getAttribute('href')),
    series.map((slug) => `/blog/${slug}`),
    '愿景表的五个动词链到对应文章',
  )
  assert.match(vision.querySelector('a.site-cta-primary')?.getAttribute('href') ?? '', /^mailto:348876414@qq\.com\?subject=/)
  assert.ok(vision.querySelector('a[href="/invest"]'), '愿景链到投资页')
  assert.equal(
    screen.getByRole('navigation', { name: 'Main navigation' }).querySelector('a[href="/invest"]')?.textContent,
    'Invest',
    '顶部导航有投资入口',
  )
  cleanup()

  renderSite('/invest')
  assert.equal(screen.getByRole('heading', { level: 1 }).textContent, 'Invest in the next trillion-dollar AI company')
  assert.equal(document.title, 'Invest · BIU')
  assert.deepEqual(
    [...screen.getByRole('region', { name: 'Five markets' }).querySelectorAll('[role="rowheader"] a')].map((a) => a.getAttribute('href')),
    series.map((slug) => `/blog/${slug}`),
    '投资页列出五个动词市场',
  )
  assert.ok(document.querySelectorAll('a[href^="mailto:348876414@qq.com?subject="]').length >= 2, '首屏和页尾都能联系我们')
  cleanup()

  renderSite('/blog/nope')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /Article not found/)
  cleanup()
})

test('按钮图标、联系邮箱、云端未上线都如实呈现', () => {
  renderSite('/')
  const actions = document.querySelector('.site-hero-band .site-cta-actions')!
  const [download, github] = Array.from(actions.querySelectorAll('a'))
  assert.ok(download!.querySelector('svg.site-icon'), '下载用图标，不用 ↗ 字符')
  assert.doesNotMatch(download!.textContent ?? '', /↗/)
  assert.ok(github!.firstElementChild?.matches('svg.site-icon'), 'GitHub 图标在文字左边')
  assert.ok(document.querySelector('a[href="mailto:348876414@qq.com"]'), '页脚有联系邮箱')
  const share = [...document.querySelectorAll('.site-footer-columns strong')].map((node) => node.textContent)
  assert.ok(share.includes('Share'), '页脚有分享列')
  assert.equal(screen.getByRole('button', { name: 'Download this page' }).textContent, 'Download this page')
  cleanup()

  renderSite('/pricing')
  const soon = screen.getByRole('button', { name: 'Coming soon' }) as HTMLButtonElement
  assert.ok(soon.disabled, '官方云端还没上线，按钮不可点')
  cleanup()

  renderSite('/compare/vs-notion')
  assert.ok(document.querySelector('.site-compare-legend'), '对比表有图例')
  assert.ok(document.querySelector('.site-mark[data-mark="no"]'), '❌ 渲染成同色系标记')
  cleanup()
})

test('未知路径不 404 空白，给出诚实占位', () => {
  renderSite('/not-a-real-page')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /Page not found/)
  cleanup()
})

test('每页写入独立的 title / description / canonical（规划 §7.2）', () => {
  const cases: Array<[string, RegExp]> = [
    ['/pricing', /Pricing · BIU/],
    ['/security', /Security · BIU/],
    ['/product', /Product · BIU/],
    ['/compare', /Compare · BIU/],
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
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /Comparison not found/)
  cleanup()
})

test('安全页：权限模型讲的是数据视图 × 成员视图，不是四个空间角色', () => {
  renderSite('/security')
  const body = document.body.textContent ?? ''

  // 正确的模型：两个维度做匹配
  assert.match(body, /Data view/, '要讲数据视图')
  assert.match(body, /Member view/, '要讲成员视图')
  assert.match(body, /Access is the result of a match/, '要有模型主张')

  // 三个灵活点
  assert.match(body, /Conditions, not access lists/, '要讲条件授权')
  assert.match(body, /Visibility is computed, not stored/, '要讲可见性是派生值')
  assert.match(body, /Inheritance/, '要讲继承')

  // 对比表要有 BIU 这一行，且明确指出两边都是条件
  assert.match(body, /Both recipients and data scopes are conditions/)

  // 回归防护：不能退回「四个空间角色 = 权限模型」的旧说法
  assert.equal(/Permission roles/.test(body), false, '不应再出现「权限角色」小节')
  assert.equal(/owner, manager, editor, and viewer roles define permissions/.test(body), false, '不应再用空间角色描述权限模型')

  // 但空间角色仍是模型的一层输入 —— 不在这个页面上讲，避免混淆
  cleanup()
})

test('对比页：Linux 对比归入基础设施，且 BIU 列不回避弱项', () => {
  renderSite('/compare/vs-linux')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Linux/)
  assert.match(body, /Infrastructure/, '应归入「基础设施」')
  assert.match(body, /Everything is a file/, '要有 Linux 的核心主张')
  assert.match(body, /Everything is \/<table>\/<id>/, '要有 BIU 的对应主张')
  assert.match(body, /VFS/, '要有抹平异构对应')
  assert.match(body, /Plugin registry/, '要有驱动注册对应')

  // 纪律：不是通用 OS 这条必须如实写 ❌
  assert.match(body, /Not a general-purpose OS/, '要承认 BIU 不是通用操作系统')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')

  // 承认对方适用场景
  assert.match(body, /Choose Linux when you need/)
  cleanup()
})

test('对比页：Kubernetes 对比独立成页，归入基础设施，且 BIU 列不回避弱项', () => {
  renderSite('/compare/vs-k8s')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Kubernetes/)
  assert.match(body, /Infrastructure/, '应归入「基础设施」')
  assert.match(body, /Everything is a declarative object/, '要有 k8s 的核心主张')
  assert.match(body, /Everything is \/<table>\/<id>/, '要有 BIU 的对应主张')
  assert.match(body, /API Server/, '要有入口对应')

  // 核心差异：声明写在页面里，一页可声明多个插件，组合成服务
  assert.match(body, /YAML files applied with kubectl/, '要有 k8s 的声明方式')
  assert.match(body, /Directly in page content/, '要讲清 BIU 的声明写在哪')
  assert.match(body, /:::pageBlock \{kind=… plugin=…\}/, '要给出块的真实声明写法')
  assert.match(body, /any number of plugins/, '要点明一页可以声明多个插件')
  assert.match(body, /page itself is the composition/, '要讲清多个插件如何组合成服务')

  // 纪律：不做编排、没有多副本，这两条必须如实写 ❌
  assert.match(body, /Not an orchestration system/, '要承认 BIU 不是编排系统')
  assert.match(body, /No multi-replica scheduling/, '要承认 BIU 没有多副本调度')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')

  // 承认对方适用场景
  assert.match(body, /Choose k8s when you need/)
  cleanup()
})

test('对比页：Airtable 对比归入应用搭建，落点是「数据和界面同一种对象」', () => {
  renderSite('/compare/vs-airtable')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Airtable/)
  assert.match(body, /App Building/, '应归入「应用搭建」')
  assert.match(body, /Enter data and get an application/, '要有 Airtable 的核心主张')
  assert.match(body, /Data and interfaces are the same kind of object/, '要给出 BIU 的对应主张')

  // 纪律：门槛高、无托管这两条必须如实写 ❌
  assert.match(body, /noticeably higher barrier/, '要承认插件门槛更高')
  assert.match(body, /no managed SLA/, '要承认不做托管')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')

  // 承认对方适用场景
  assert.match(body, /Choose Airtable when you need/)
  cleanup()
})

test('对比页：Retool 归入应用搭建，落点是「组件本身是数据」', () => {
  renderSite('/compare/vs-retool')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Retool/)
  assert.match(body, /App Building/, '应归入「应用搭建」')
  assert.match(body, /Build internal tools by dragging components/, '要有 Retool 的核心主张')
  assert.match(body, /Components themselves are data/, '要给出 BIU 的对应主张')
  assert.match(body, /does not function outside the platform/, '要点出「搭出来的东西归谁」')
  assert.match(body, /noticeably higher barrier/, '要承认插件门槛更高')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')
  assert.match(body, /Choose Retool when you need/)
  cleanup()
})

test('对比页：Supabase 归入应用搭建，落点是「前后端归一层」', () => {
  renderSite('/compare/vs-supabase')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Supabase/)
  assert.match(body, /App Building/, '应归入「应用搭建」')
  assert.match(body, /Backend as a service; build your own frontend/, '要有 Supabase 的核心主张')
  assert.match(body, /Data, interfaces, and agents are the same kind of object/, '要给出 BIU 的对应主张')
  assert.match(body, /no duplicate boundary to maintain/, '要点出前后端归一层')
  assert.match(body, /no managed SLA/, '要承认不做托管')
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')
  assert.match(body, /Choose Supabase when you need/)
  cleanup()
})

test('对比页：两个 harness 归入「编码 Harness」，且不谎称对方不能扩展', () => {
  renderSite('/compare/vs-dsh')
  let body = document.body.textContent ?? ''
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs DeepSeek Harness/)
  assert.match(body, /Coding Harness/, 'DSH 应归入「编码 Harness」')
  assert.match(body, /model thinks; the harness executes/i, '要有 DSH 的核心主张')
  assert.match(body, /data is the environment/, '要给出 BIU 的对应主张')
  assert.match(body, /db_read \/ db_update \/ db_action/, '要给出 BIU 的操作方式')
  // 纪律：DSH 确实支持插件与多 agent，不能写成 ❌
  assert.match(body, /Open plugin ecosystem/, '要如实承认 DSH 支持插件')
  assert.match(body, /Not a specialty/, '要承认 BIU 编码非专精')
  assert.match(body, /Choose DeepSeek Harness when you need/)
  cleanup()

  renderSite('/compare/vs-pi')
  body = document.body.textContent ?? ''
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Pi/)
  assert.match(body, /Coding Harness/, 'Pi 应归入「编码 Harness」')
  assert.match(body, /Minimal, composable core/, '要有 Pi 的核心主张')
  assert.match(body, /Minimal kernel, with data as the extension point/, '要给出 BIU 的对应主张')
  assert.match(body, /embeddability is a design goal/, '要如实承认 Pi 可嵌入的优势')
  assert.match(body, /Plugin ecosystem is still emerging/, '要承认 BIU 生态刚起步')
  assert.match(body, /Choose Pi when you need/)
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
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /One circle, two lines, three segments/)

  // 页面里有两个标记（hero 展示 + 调节器预览），调节器是后一个。
  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
  // svg 里三条带 fill 的 path 渲染顺序：B 上弧 / B 下弧 / U，与滑块 0/1/2 一一对应。
  const fillOf = () => Array.from(svg.querySelectorAll('path[fill]')).map((w) => w.getAttribute('fill'))
  const before = fillOf()
  assert.equal(before.length, 3, '应有三块扇区')
  assert.equal(new Set(before).size, 3, '三块初始应是三个不同颜色')

  // 三个滑块各自的标签必须和画面上那块对得上，且互不串色。
  fireEvent.change(screen.getByTestId('brand-color-0'), { target: { value: '#123456' } })
  assert.equal(fillOf()[0], '#123456', '滑块 0「B 上弧」应改到那一块')
  fireEvent.change(screen.getByTestId('brand-color-1'), { target: { value: '#654321' } })
  assert.equal(fillOf()[1], '#654321', '滑块 1「B 下弧」应改到那一块')
  fireEvent.change(screen.getByTestId('brand-color-2'), { target: { value: '#0f0f0f' } })
  const after = fillOf()
  assert.equal(after[2], '#0f0f0f', '滑块 2「U」应改到左下半圆')
  assert.equal(after[0], '#123456', 'B 上弧不应被后续操作带着改')
  assert.equal(after[1], '#654321', 'B 下弧不应被后续操作带着改')

  // 三块必须都真正被填色，不留空 —— 曾经漏填过 U 那块。
  for (const [i, fill] of after.entries()) {
    assert.ok(fill && fill !== 'none', `第 ${i} 块必须有填充色，实际是 ${fill}`)
  }
  cleanup()
})

test('品牌页：线宽滑块真的改到圆与线的描边', () => {
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
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
  for (const item of ['One circle', 'Two lines', 'Three segments']) {
    assert.match(body, new RegExp(item), `构成应包含「${item}」`)
  }
  assert.match(body, /Three give rise to everything/, '第四条主张')

  // 「交点不在正中心」曾是编造出来的特征：
  // 实测圆心到两条线的距离是 0.5 和 1.9（R=290），等于过圆心，
  // 那点偏差只是目测端点的误差。不能再把它当设计特征讲。
  assert.doesNotMatch(body, /do not intersect at the exact center/, '不能把测量误差说成设计特征')
  assert.doesNotMatch(body, /a mark with direction/, '这条说法建立在错误的几何上，应已删除')
  cleanup()
})

test('品牌页：说明这个标记刚好是 BIU 三个字母', () => {
  renderSite('/brand')
  const body = document.body.textContent ?? ''

  const lead = document.querySelector('.site-page-hero .site-page-lead')?.textContent ?? ''
  assert.match(lead, /B, I, and U make this shape/, '标题下方点出 BIU 三个字母拼成标记')
  assert.match(lead, /two upper-right segments form the two bowls of B.*diagonal.*is I.*lower-left semicircle is U/, '字母与部位要对得上：I 是线，不是块')
  assert.match(lead, /mark is the name itself/, '要说清形状即名字')
  const blocks = [...document.querySelectorAll('.site-brand-grid article')].find((a) => a.querySelector('h3')?.textContent === 'Three segments')
  assert.match(blocks?.textContent ?? '', /private space.*public space.*U below is the foundation/, '三个块讲私人空间、公共空间与底座')
  assert.doesNotMatch(blocks?.textContent ?? '', /make this shape/, '字母关系放在标题下方')
  assert.doesNotMatch(body, /Usage rules/, '品牌页不再单列使用规则')
  assert.doesNotMatch(body, /Three segments, three letters, three meanings/, '不再单列三块寓意')
  cleanup()
})

test('品牌页：三生万物 —— 从三块讲到每个人的那一版 BIU', () => {
  renderSite('/brand')
  const body = document.body.textContent ?? ''

  // 构成里的第四条，用《道德经》的落点收尾：三块生出无穷变化。
  assert.match(body, /Three give rise to everything/, '构成应有「三生万物」一条')
  assert.match(body, /three segments are fixed; their colors and lines are not/, '要说清「固定的是什么、可变的是什么」')
  assert.match(body, /become uniquely yours/, '要说清「万物」指什么，不能只留一个文言词')

  // 同一句主张在页面上只出现一次 —— 重复说反而稀释。
  const hits = body.split('a thousand people can have a thousand versions of BIU').length - 1
  assert.equal(hits, 1, `这句应只出现一次，实际 ${hits} 次`)
  cleanup()
})

test('品牌页：调节器一改，页面顶部那枚标记同步变（同一份配置）', () => {
  localStorage.clear()
  renderSite('/brand')
  // 页面上有两枚标记：顶部 hero 一枚、调节器预览一枚。
  const marks = () => screen.getAllByRole('img', { name: 'BIU brand mark' })
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
  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
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

test('品牌标记：两块是 B 的两弧、半圆是 U，方位与明度都不能改错', () => {
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
  const paths = Array.from(svg.querySelectorAll('path[fill]'))
  assert.equal(paths.length, 3)

  // 每块的「结束边」角度决定它落在画面哪一侧，借此钉住 B/I/U 的方位。
  // 这是标记的全部意义所在 —— 位置错了就不是 BIU 了。
  const endAngle = (i: number) => {
    const m = paths[i]!.getAttribute('d')!.match(/A [\d.]+ [\d.]+ 0 \d 1 ([\d.]+) ([\d.]+)/)
    assert.ok(m, '扇区应有弧线')
    return Math.round(Math.atan2(Number(m![2]) - 615, Number(m![1]) - 450) * 180 / Math.PI)
  }
  assert.equal(endAngle(0), -39, 'colors[0] 应结束于 -39°（B 的上弧）')
  assert.equal(endAngle(1), 52, 'colors[1] 应结束于 52°（B 的下弧）')
  assert.equal(endAngle(2), -127, 'colors[2] 应结束于 -127°（左下半圆 = U）')

  // 默认是「深海」三色，与标签页图标同一套
  const fills = paths.map((n) => n.getAttribute('fill')!)
  assert.deepEqual(
    fills.map((f) => f.toLowerCase()),
    ['#1e3a8a', '#0ea5e9', '#0f172a'],
    `默认应为深海三色，实际：${fills.join(' / ')}`,
  )
  cleanup()
})

test('标签页图标、README 横条、分享卡片都是当前品牌标记（深海配色），与默认配置同步', async () => {
  const { buildFaviconSvg, buildLockupSvg, buildOgImageSvg } = await import('./marketing-site/brand-assets.tsx')
  const { BRAND_DEFAULT } = await import('./marketing-site/brand-mark.tsx')
  assert.equal(BRAND_DEFAULT.strokeWidth, 0, '默认不画圆的描边')
  assert.equal(BRAND_DEFAULT.lineWidth, 0, '默认不画分割线')
  assert.equal(BRAND_DEFAULT.circleRatio, 0.7)
  const read = (name: string) => readFileSync(resolve(process.cwd(), 'public', name), 'utf8')
  const hint = '过期了：npx tsx scripts/build-brand-assets.tsx'
  assert.equal(read('favicon.svg'), buildFaviconSvg(), `favicon.svg ${hint}`)
  assert.equal(read('brand-lockup.svg'), buildLockupSvg(), `brand-lockup.svg ${hint}`)
  assert.equal(read('og-image.svg'), buildOgImageSvg(), `og-image.svg ${hint}`)
  for (const name of ['favicon.svg', 'brand-lockup.svg', 'og-image.svg']) {
    for (const color of ['#1e3a8a', '#0ea5e9', '#0f172a']) assert.match(read(name), new RegExp(`fill="${color}"`), `${name} 应为深海配色`)
  }
  const png = readFileSync(resolve(process.cwd(), 'public/og-image.png'))
  assert.equal(png.readUInt32BE(16), 1200, '分享卡片宽 1200')
  assert.equal(png.readUInt32BE(20), 630, '分享卡片高 630')

  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  assert.match(html, /<title>BIU<\/title>/, '浏览器标签页标题是 BIU')
  assert.match(read('favicon.svg'), /<rect [^>]*fill="#ffffff"/, 'README / 左上角图标保留白色圆角底')
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg/)
  assert.match(html, /<meta property="og:image" content="\/og-image\.png" \/>/, '爬虫不执行脚本，og:image 要写在静态 HTML 里')
  const meta = readFileSync(resolve(process.cwd(), 'packages/web-app-shell/src/web/marketing-site/use-page-meta.ts'), 'utf8')
  assert.match(meta, /DEFAULT_IMAGE = '\/og-image\.png'/)
})

test('品牌页：圆的大小可调，且不影响背景方块', () => {
  renderSite('/brand')
  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
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
  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
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
  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
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
  for (const name of ['Monochrome', 'Velocity']) {
    assert.ok(names.includes(name), `应有「${name}」预设`)
  }

  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
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
  const svg = screen.getAllByRole('img', { name: 'BIU brand mark' }).at(-1)!
  fireEvent.click(screen.getByRole('button', { name: /Deep Sea/ }))
  const fills = Array.from(svg.querySelectorAll('path[fill]')).map((w) => w.getAttribute('fill'))
  // 渲染顺序即 colors[0] / colors[1] / colors[2]：B 上弧 / B 下弧 / U
  assert.deepEqual(fills, ['#1e3a8a', '#0ea5e9', '#0f172a'], '深海预设应落到三块上')
  cleanup()
})

test('品牌页已接入路由与导航', () => {
  renderSite('/')
  const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0]!
  const brandLink = Array.from(nav.querySelectorAll('a')).find((a) => a.getAttribute('href') === '/brand')
  assert.ok(brandLink, '导航应出现 /brand 入口')
  assert.equal(brandLink!.textContent, 'Brand')
})

test('下载页：按系统给主按钮，命令一键复制', async () => {
  const { detectPlatform } = await import('./marketing-site/download.tsx')
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }), 'mac')
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'windows')
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), 'linux')
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), null)

  renderSite('/download')
  const grid = document.querySelector('.site-platform-grid')!
  assert.deepEqual(Array.from(grid.querySelectorAll('h2')).map((h) => h.textContent), ['macOS', 'Windows', 'Linux'], 'Mac 只有一张卡')
  const commands = Array.from(document.querySelectorAll('.site-copy-cmd code')).map((c) => c.textContent ?? '')
  assert.ok(commands.some((c) => c.startsWith('xattr -dr com.apple.quarantine')), 'xattr 命令要能直接复制')
  assert.ok(commands.some((c) => c.includes('linux-x64.AppImage')), 'Linux 卡给出 AppImage 运行命令')
  assert.ok(screen.getAllByRole('button', { name: 'Copy command' }).length >= 2)
  assert.ok(screen.getAllByRole('link', { name: 'Download for Linux' }).length >= 1)
  cleanup()

  const { GITHUB_CACHE_KEY } = await import('./marketing-site/github.ts')
  // 过期很久的缓存也照样显示：限流时星标数不能消失
  localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify({ at: 0, stats: { stars: 12, release: { tag: 'v1.0.0', publishedAt: '', url: '', body: '', assets: [] } } }))
  renderSite('/download')
  const meta = document.querySelector('.site-download-meta')!
  assert.equal(meta.textContent, 'Latest release v1.0.0 · GitHub ★ 12')
  assert.ok(meta.querySelector('.site-gh-star'), '下载页的星标也用黄色')
  localStorage.removeItem(GITHUB_CACHE_KEY)
  cleanup()
})

test('对比页：最常被问的三个排在最前', () => {
  renderSite('/compare')
  const featured = document.querySelector('.site-compare-featured')!
  assert.match(featured.querySelector('h2')?.textContent ?? '', /Most requested/)
  const links = Array.from(featured.querySelectorAll('a')).map((a) => a.getAttribute('href'))
  assert.deepEqual(links, ['/compare/vs-notion', '/compare/vs-obsidian', '/compare/vs-chatgpt'])
  assert.equal(document.querySelector('.site-compare-group'), featured, '「最常被问」是第一组')
  cleanup()
})

test('场景页：卡片写明组合了哪些块，团队协作说明云端现状', () => {
  renderSite('/use-cases')
  const chips = document.querySelectorAll('.site-usecase-card .site-block-chips')
  assert.ok(chips.length >= 6, '每张场景卡都列出组合的块')
  const cards = [...document.querySelectorAll('.site-usecase-card')]
  assert.ok(cards.every((card) => !card.querySelector('small, .site-usecase-note')), '卡片只留一组块清单，交付物和云端说明放进子页')
  assert.ok(cards.every((card) => !card.textContent?.includes('Blocks combined on this page')), '块清单不加小标题')
  const collaboration = cards.find((card) => card.querySelector('h2')?.textContent === 'Team Collaboration')!
  assert.ok(!/Page Regression Tests|HTML/.test(collaboration.textContent ?? ''), '团队协作只放协作相关的块')
  cleanup()
  renderSite('/use-cases/collaboration')
  assert.ok(screen.getByRole('heading', { name: 'Blocks combined on this page' }))
  assert.match(document.querySelector('.site-usecase-note')?.textContent ?? '', /official cloud service is coming soon/)
  cleanup()
})

test('产品页：每个板块配一张真实截图', () => {
  renderSite('/product')
  const images = Array.from(document.querySelectorAll('.site-block-media img'))
  assert.ok(images.length >= 6)
  assert.ok(images.every((img) => /^\/site\/shot-.+\.webp$/.test(img.getAttribute('src') ?? '')), '截图统一用 webp')

  const extend = document.querySelector('#ecosystem')!
  assert.equal(extend.querySelector('h2')?.textContent, 'Build whatever is missing')
  const cards = [...extend.querySelectorAll('article')]
  assert.deepEqual(cards.map((card) => card.querySelector('p')?.textContent), ['Plugins', 'Skills', 'MCP'])
  assert.ok(cards.every((card) => card.querySelector('.site-ecosystem-code code')?.textContent), '每张卡带一段真实写法')
  assert.ok(cards.every((card) => !/\.$/.test(card.querySelector('h3')?.textContent ?? '')), '卡片标题不带句号')
  assert.equal(document.querySelector('.site-final-cta h2')?.textContent, 'Build your first page')
  cleanup()
})

test('文档与更新日志不再是占位页', async () => {
  renderSite('/docs')
  const cards = Array.from(document.querySelectorAll('.site-doc-card'))
  assert.ok(cards.length >= 4)
  assert.ok(cards.every((a) => a.getAttribute('href')?.startsWith('https://github.com/helloooooooooooooo97/biu/')))
  cleanup()
  renderSite('/changelog')
  assert.equal(screen.getByRole('heading', { level: 1 }).textContent, 'What’s new in BIU')
  assert.ok(await screen.findByRole('link', { name: 'GitHub Releases' }), '读不到 GitHub 时给出兜底链接')
  cleanup()
})

test('博客：不提供 RSS，文章有作者署名', async () => {
  const { BLOG_POSTS } = await import('./marketing-site/blog.tsx')
  renderSite('/blog')
  assert.equal(screen.queryByRole('link', { name: /RSS/ }), null)
  cleanup()
  renderSite(`/blog/${BLOG_POSTS[0]!.slug}`)
  const byline = document.querySelector('.site-article-byline')!
  assert.match(byline.textContent ?? '', /The BIU Team/)
  assert.match(byline.textContent ?? '', /min read/)
  cleanup()
  assert.doesNotMatch(readFileSync(resolve(process.cwd(), 'index.html'), 'utf8'), /rss/i)
})

test('更新日志：Release 正文去掉 Markdown 记号', async () => {
  const { releaseLines } = await import('./marketing-site/resources.tsx')
  const body = "## macOS\n```bash\nxattr -dr x\n```\n## What's Changed\n* feat: 代理列表 by @someone in https://github.com/a/b/pull/3\n用 `make` 启动"
  assert.deepEqual(releaseLines(body), ['macOS', 'xattr -dr x', 'feat: 代理列表（#3）', '用 make 启动'])
})

test('常见问题：首页、产品、场景子页、对比、安全、定价、下载各有一组，博客与品牌不放', () => {
  const expected: [string, string][] = [
    ['/', 'About BIU'],
    ['/product', 'About the product'],
    ['/use-cases/research', 'About this use case'],
    ['/compare', 'About these comparisons'],
    ['/security', 'About your data'],
    ['/pricing', 'Pricing FAQ'],
    ['/download', 'Installation FAQ'],
  ]
  for (const [path, title] of expected) {
    renderSite(path)
    const faq = document.querySelector('.site-faq')
    assert.ok(faq, `${path} 有常见问题`)
    assert.equal(faq!.querySelector('h2')?.textContent, title)
    assert.ok(faq!.querySelectorAll('details').length >= 2, `${path} 至少两问`)
    if (path === '/') assert.equal(faq!.textContent?.includes('difference from Notion'), false)
    cleanup()
  }
  for (const path of ['/blog', '/brand']) {
    renderSite(path)
    assert.equal(document.querySelector('.site-faq'), null, `${path} 不放常见问题`)
    cleanup()
  }
})

test('独立部署的官网：导航和页脚都没有登录，/login 落到 404', () => {
  const standalone = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <MarketingSite login={false} onLogin={() => {}} onStart={() => {}} />
    </MemoryRouter>,
  )
  standalone('/')
  assert.equal(screen.queryByTestId('site-login'), null)
  assert.equal(screen.queryAllByRole('button', { name: 'Log in' }).length, 0, '页脚也不放登录')
  assert.ok(screen.getByTestId('site-start'), '下载按钮还在')
  cleanup()
  standalone('/login')
  assert.equal(screen.getByRole('heading', { level: 1 }).textContent, 'Page not found')
  cleanup()
})
