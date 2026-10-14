import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarketingSite } from './marketing-site/index.tsx'

afterEach(() => cleanup())

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <MarketingSite onLogin={() => {}} onStart={() => {}} />
    </MemoryRouter>,
  )
}

/** 拿到 .site-nav-links 的直接子节点（这才是 flex item，决定视觉高度）。 */
function navItems(): HTMLElement[] {
  const nav = screen.getByRole('navigation', { name: '官网' })
  return Array.from(nav.children) as HTMLElement[]
}

test('导航项高度一致：各项都是裸链接，没有包装层', () => {
  renderHome()
  const items = navItems()
  assert.equal(items.length, 7, '产品 / 场景 / 定价 / 安全 / 对比 / 博客 / 品牌')

  // 「产品」不再有二级菜单，所以也不需要 wrapper —— 五项是同一种节点。
  for (const item of items) {
    assert.equal(item.tagName, 'A', `导航项应为裸链接，实际是 ${item.tagName}`)
    const label = (item.textContent ?? '').replace(/[▾\s]/g, '')
    assert.ok(label.length > 0, '导航项应有文字')
    assert.equal((item.textContent ?? '').includes('▾'), false, '导航项不应有下拉图标')
  }
})

test('导航不再有产品二级浮窗', () => {
  renderHome()
  assert.equal(screen.queryByRole('menu', { name: '产品' }), null, '产品二级菜单应已移除')
  for (const label of ['File System', 'Agent 工作台', '任务看板', '页面与数据库', '插件系统', '本机与云端']) {
    assert.equal(screen.queryByText(label), null, `导航不应再出现 ${label}`)
  }
})

test('所有导航项指向真实路由', () => {
  renderHome()
  const hrefs = Array.from(
    screen.getByRole('navigation', { name: '官网' }).querySelectorAll('a'),
  ).map((a) => a.getAttribute('href'))
  for (const expected of ['/product', '/use-cases', '/pricing', '/security', '/compare', '/blog', '/brand']) {
    assert.ok(hrefs.includes(expected), `导航缺 ${expected}`)
  }
})
