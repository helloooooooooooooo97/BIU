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
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  return Array.from(nav.children) as HTMLElement[]
}

test('导航项高度一致：各项都是裸链接，没有包装层', () => {
  renderHome()
  const items = navItems()
  assert.deepEqual(
    items.map((item) => item.textContent),
    ['Product', 'Use Cases', 'Compare', 'Security', 'Blog', 'Brand', 'Pricing', 'Invest'],
    '是什么 → 用在哪 → 和别人有什么不同 → 放心吗 → 延伸阅读 → 认识品牌 → 多少钱',
  )

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
  assert.equal(screen.queryByRole('menu', { name: 'Product' }), null, '产品二级菜单应已移除')
  for (const label of ['File System', 'Agent Workspace', 'Task Board', 'Pages and Databases', 'Plugin System', 'Local and Cloud']) {
    assert.equal(screen.queryByText(label), null, `导航不应再出现 ${label}`)
  }
})

test('所有导航项指向真实路由', () => {
  renderHome()
  const hrefs = Array.from(
    screen.getByRole('navigation', { name: 'Main navigation' }).querySelectorAll('a'),
  ).map((a) => a.getAttribute('href'))
  for (const expected of ['/product', '/use-cases', '/pricing', '/security', '/compare', '/blog', '/brand']) {
    assert.ok(hrefs.includes(expected), `导航缺 ${expected}`)
  }
})
