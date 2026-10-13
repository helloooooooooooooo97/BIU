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

test('导航项高度一致：「产品」与其他项不能错位', () => {
  renderHome()
  const items = navItems()
  assert.equal(items.length, 5, '产品 / 用例 / 定价 / 安全 / 对比')

  // 每一项的直接子节点都必须是「产品」那种 wrapper 或裸链接，
  // 共同要求：在同一套 flex 容器里、行高一致。
  const product = items[0]!
  assert.equal(product.className, 'site-nav-group', '第一项是产品包装层')

  // 所有 item 的文本高度来源必须一致：都通过同一 class 规则控制。
  // 断言每一项都存在一个可见 label（防止某层被压成 0 高）。
  for (const item of items) {
    const label = (item.textContent ?? '').replace(/[▾\s]/g, '')
    assert.ok(label.length > 0, `导航项 "${item.className}" 应有文字`)
  }

  // 关键：产品不带下拉图标，和其他项保持一致的纯文字外观
  assert.equal((product.textContent ?? '').includes('▾'), false, '产品不应有下拉图标')
})

test('产品仍有二级菜单，但触发方式不靠图标', () => {
  renderHome()
  // 二级菜单仍然存在（hover / focus 触发）
  const menu = screen.getByRole('menu', { name: '产品' })
  assert.ok(menu, '产品二级菜单还在')
  for (const label of ['File System', 'Agent 工作台', '任务看板', '页面与数据库', '插件系统', '本机与云端']) {
    assert.ok(menu.textContent?.includes(label), `二级菜单含 ${label}`)
  }
})

test('所有导航项指向真实路由', () => {
  renderHome()
  const hrefs = Array.from(
    screen.getByRole('navigation', { name: '官网' }).querySelectorAll('a'),
  ).map((a) => a.getAttribute('href'))
  for (const expected of ['/product', '/use-cases', '/pricing', '/security', '/compare']) {
    assert.ok(hrefs.includes(expected), `导航缺 ${expected}`)
  }
})
