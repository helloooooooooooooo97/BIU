import { test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MarketingHome } from './marketing-home.tsx'

test('landing page embeds real empty product surfaces and opens account actions', () => {
  let login = 0
  let start = 0
  render(<MarketingHome onLogin={() => { login += 1 }} onStart={() => { start += 1 }} />)

  assert.match(screen.getByRole('heading', { level: 1 }).textContent ?? '', /让知识留下.*让工作继续/)
  assert.equal(screen.getAllByText('研究与分析').length > 0, true)
  assert.equal(screen.getByTitle('BIU 页面界面预览').getAttribute('src'), '/pages?landingPreview=1')

  fireEvent.click(screen.getByRole('tab', { name: '数据库' }))
  assert.equal(screen.getByTitle('BIU 数据库界面预览').getAttribute('src'), '/database?landingPreview=1')
  assert.equal(screen.queryByText('核心资料'), null)

  fireEvent.click(screen.getByTestId('site-login'))
  fireEvent.click(screen.getByTestId('site-start'))
  assert.equal(login, 1)
  assert.equal(start, 1)
  cleanup()
})

