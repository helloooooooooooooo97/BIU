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

test('对比页：四类别 9 个对手都在，且 BIU 列如实标注弱点', () => {
  renderSite('/compare')
  for (const name of ['BIU vs Office', 'BIU vs Notion', 'BIU vs 飞书', 'BIU vs Cursor', 'BIU vs ChatGPT', 'BIU vs Claude', 'BIU vs Manus', 'BIU vs Obsidian']) {
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
  renderSite('/compare/vs-manus')
  assert.match(document.title, /BIU vs Manus · BIU/)
  cleanup()
})
