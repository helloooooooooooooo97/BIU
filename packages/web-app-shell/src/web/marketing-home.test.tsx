import { test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarketingHome } from './marketing-home.tsx'
import { MarketingSite } from './marketing-site/index.tsx'

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

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /让知识留下.*让工作继续/)

  // P0-13：演示区用静态截图，不再嵌 iframe（iframe 会完整加载 web 应用三次）
  assert.equal(screen.queryByTitle('BIU 页面界面预览'), null, '不应再有 iframe 预览')

  fireEvent.click(screen.getByRole('tab', { name: '组件' }))
  const shot = screen.getByRole('img', { name: /BIU 组件/ }) as HTMLImageElement
  assert.equal(shot.getAttribute('src'), '/site/demo-component.png')
  assert.equal(shot.getAttribute('loading'), 'lazy')

  fireEvent.click(screen.getByTestId('site-login'))
  fireEvent.click(screen.getByTestId('site-start'))
  assert.equal(login, 1)
  assert.equal(start, 1)
  cleanup()
})

test('home 收窄后：深度内容下沉，导航指向独立页', () => {
  renderSite('/')
  // 原首页的 6 张解决方案卡已移到 /use-cases
  assert.equal(screen.queryByText('研究与分析'), null)
  // 导航里有独立页面入口
  const nav = screen.getByRole('navigation', { name: '官网' })
  assert.match(nav.textContent ?? '', /产品/)
  assert.match(nav.textContent ?? '', /定价/)
  assert.match(nav.textContent ?? '', /对比/)
  // 首页仍保留核心能力三条 + 数据控制
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /让知识留下/)
  cleanup()
})

test('每个官网路径都能渲染，且各页有独立 h1', () => {
  const cases: Array<[string, RegExp]> = [
    ['/product', /一套内核/],
    ['/pricing', /更少工具/],
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

test('对比页：操作系统 + 三类别 8 个对手都在，且 BIU 列如实标注弱点', () => {
  renderSite('/compare')
  for (const name of ['BIU vs Linux', 'BIU vs Office', 'BIU vs Notion', 'BIU vs 飞书', 'BIU vs Cursor', 'BIU vs ChatGPT', 'BIU vs Claude', 'BIU vs Obsidian']) {
    assert.ok(screen.getAllByText(name).length > 0, `缺少 ${name}`)
  }
  cleanup()

  // 详情页照表渲染，且承认对手强项（BIU 列有 ❌ 或 ⚠️）
  renderSite('/compare/vs-feishu')
  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs 飞书/)
  assert.ok(screen.getAllByText(/❌/).length > 0, 'BIU 列必须如实标注没有的能力')
  assert.ok(screen.getAllByText(/用 飞书 当你需要/).length > 0, '必须承认对手适用场景')
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

test('对比页：Linux 对比归入操作系统，且 BIU 列不回避弱项', () => {
  renderSite('/compare/vs-linux')
  const body = document.body.textContent ?? ''

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /BIU vs Linux/)
  assert.match(body, /操作系统/, '应归入「操作系统」')
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
