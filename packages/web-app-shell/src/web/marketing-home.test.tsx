import { test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MarketingHome } from './marketing-home.tsx'

test('landing page demonstrates workflows and opens account actions', () => {
  let login = 0
  let start = 0
  render(<MarketingHome onLogin={() => { login += 1 }} onStart={() => { start += 1 }} />)

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /让知识留下.*让工作继续/)
  assert.equal(screen.getAllByText('研究与分析').length > 0, true)
  assert.equal(screen.getByText('新能源汽车出海研究').textContent, '新能源汽车出海研究')

  fireEvent.click(screen.getByRole('tab', { name: '产品规划' }))
  assert.equal(screen.getByText('移动端产品迭代').textContent, '移动端产品迭代')
  assert.match(screen.getByText(/版本计划已创建/).textContent ?? '', /12 项任务/)

  fireEvent.click(screen.getByTestId('site-login'))
  fireEvent.click(screen.getByTestId('site-start'))
  assert.equal(login, 1)
  assert.equal(start, 1)
  cleanup()
})

