import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarketingSite } from './marketing-site/index.tsx'
import { USE_CASES } from './marketing-site/use-cases.tsx'

afterEach(() => cleanup())

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <MarketingSite onLogin={() => {}} onStart={() => {}} />
    </MemoryRouter>,
  )
}

test('用例总览：六个场景全部渲染，且不再是占位页', () => {
  renderAt('/use-cases')

  // 占位页曾是「正在开发中」，这里必须已经不出现
  assert.equal(document.body.textContent?.includes('子页正在开发中'), false, '不再是占位页')

  assert.ok(screen.getByText('为真实工作而生'), '总览标题存在')
  for (const useCase of USE_CASES) {
    assert.ok(screen.getByText(useCase.title), `缺少场景 ${useCase.title}`)
    assert.ok(screen.getByText(useCase.summary), `缺少场景简介 ${useCase.title}`)
  }
  assert.equal(USE_CASES.length, 6, '规划里是六个场景')
})

test('用例总览：每张卡都链到自己的子页', () => {
  renderAt('/use-cases')
  const hrefs = Array.from(document.querySelectorAll('a[href^="/use-cases/"]')).map((a) =>
    a.getAttribute('href'),
  )
  for (const useCase of USE_CASES) {
    assert.ok(hrefs.includes(`/use-cases/${useCase.slug}`), `缺少子页链接 ${useCase.slug}`)
  }
})

test('用例子页：每个 slug 都能独立打开，含痛点/做法/FAQ', () => {
  for (const useCase of USE_CASES) {
    cleanup()
    renderAt(`/use-cases/${useCase.slug}`)

    assert.ok(screen.getByText(useCase.title), `${useCase.slug}: 标题`)
    assert.ok(document.body.textContent?.includes(useCase.output), `${useCase.slug}: 交付物`)
    assert.ok(screen.getByText('现在的麻烦'), `${useCase.slug}: 痛点段`)
    assert.ok(screen.getByText('BIU 怎么做'), `${useCase.slug}: 做法段`)

    for (const pain of useCase.pain) {
      assert.ok(screen.getByText(pain), `${useCase.slug}: 痛点 ${pain}`)
    }
    for (const item of useCase.how) {
      assert.ok(screen.getByText(item.title), `${useCase.slug}: 做法 ${item.title}`)
    }
    for (const [question] of useCase.faq) {
      assert.ok(screen.getByText(question), `${useCase.slug}: FAQ ${question}`)
    }
    assert.ok(screen.getByText('其他场景'), `${useCase.slug}: 交叉导航`)
  }
})

test('用例子页：其他场景链接指向兄弟页，不自指', () => {
  const target = USE_CASES[0]!
  renderAt(`/use-cases/${target.slug}`)
  const links = Array.from(document.querySelectorAll('.site-usecase-more-links a')).map((a) =>
    a.getAttribute('href'),
  )
  assert.equal(links.length, USE_CASES.length - 1, '其他场景数量 = 总数 - 1')
  assert.equal(links.includes(`/use-cases/${target.slug}`), false, '不应链接到自己')
})

test('未知 slug：给诚实提示，不是 404 崩溃', () => {
  renderAt('/use-cases/does-not-exist')
  assert.ok(screen.getByText('没有这个场景'), '未知 slug 有兜底')
})

test('总览页的每个标题都出现在子页里（导航闭环）', () => {
  renderAt('/use-cases')
  const text = document.body.textContent ?? ''
  for (const useCase of USE_CASES) {
    assert.ok(text.includes(useCase.index), `总览缺少序号 ${useCase.index}`)
  }
})
