import { test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarketingSite } from './marketing-site/index.tsx'

// 回归：官网必须有一个「自身可滚动」的根容器。
// 之前的 bug：.site 外层套了无高度的 div，height:100% 塌陷，overflow 永不触发 → 整页滚不动。
test('每一页都渲染出唯一的 .site 滚动容器，且不在额外 wrapper 里', () => {
  for (const path of ['/', '/product', '/pricing', '/download', '/security', '/compare']) {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <MarketingSite onLogin={() => {}} onStart={() => {}} />
      </MemoryRouter>,
    )
    const sites = container.querySelectorAll('.site')
    assert.equal(sites.length, 1, `${path} 应有且只有一个 .site`)
    const site = sites[0]!
    // .site 必须是根节点本身，不能有「吞掉高度」的父级
    assert.equal(site.parentElement?.tagName, 'DIV', `${path}: .site 的父级应是测试容器`)
    assert.equal((site.parentElement as HTMLElement).className, '', `${path}: .site 不应再有额外 wrapper 类`)
    // 内容必须在 .site 内部，才能被它滚动
    assert.ok(site.querySelector('main'), `${path}: main 应在 .site 内`)
    assert.ok(site.querySelector('.site-nav'), `${path}: 导航应在 .site 内`)
    assert.ok(site.querySelector('.site-footer'), `${path}: 页脚应在 .site 内`)
    cleanup()
  }
})
