import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MarketingSite } from './marketing-site/index.tsx'

afterEach(() => cleanup())

type Creds = { email: string; password: string }

function renderSite(path: string, onSubmit: (c: Creds) => Promise<void>) {
  cleanup()
  let mode: 'login' | 'register' = path === '/signup' ? 'register' : 'login'
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <MarketingSite
        onLogin={() => {}}
        onStart={() => {}}
        auth={{ mode, onModeChange: (next) => { mode = next }, onSubmit }}
      />
    </MemoryRouter>,
  )
  return view
}

test('login submit label sits on the vertical center of the pill', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  const go = css.slice(css.indexOf('.site-auth .auth-go {'), css.indexOf('.site-auth .auth-go:disabled'))
  assert.match(go, /display: inline-flex/)
  assert.match(go, /align-items: center/)
  assert.match(go, /justify-content: center/)
  assert.match(go, /line-height: 1/)
  assert.match(go, /padding: 0 18px/)
  assert.doesNotMatch(go, /padding: 13px 18px/)
})

test('/login 与 /signup 是独立路由，表单之外不放品牌区和返回入口', () => {
  renderSite('/login', async () => {})
  const heading = screen.getByRole('heading', { level: 2 })
  assert.match(heading.textContent ?? '', /登录/)
  assert.ok(heading.classList.contains('sr-only'), '标题只给读屏用，不占视觉')
  const panel = screen.getByTestId('auth-login')
  assert.equal(panel.querySelector('svg'), null, '表单里不再放 logo')
  assert.doesNotMatch(panel.textContent ?? '', /智能工作空间|返回官网/)
  assert.match(document.title, /登录 · BIU/)
  cleanup()

  renderSite('/signup', async () => {})
  assert.match(screen.getByRole('heading', { level: 2 }).textContent ?? '', /创建账号/)
  assert.match(document.title, /注册 · BIU/)
  cleanup()
})

test('邮箱字段用 email 类型与正确的 autoComplete（P0-14 #3/#4）', () => {
  renderSite('/login', async () => {})
  const email = screen.getByTestId('auth-name') as HTMLInputElement
  assert.equal(email.getAttribute('type'), 'email')
  assert.equal(email.getAttribute('autocomplete'), 'email')
  const pwd = screen.getByTestId('auth-password') as HTMLInputElement
  assert.equal(pwd.getAttribute('autocomplete'), 'current-password')
  cleanup()
})

test('密码可显示/隐藏切换（P0-14 #2）', () => {
  renderSite('/login', async () => {})
  const pwd = screen.getByTestId('auth-password') as HTMLInputElement
  assert.equal(pwd.getAttribute('type'), 'password')
  fireEvent.click(screen.getByTestId('auth-reveal'))
  assert.equal(pwd.getAttribute('type'), 'text')
  fireEvent.click(screen.getByTestId('auth-reveal'))
  assert.equal(pwd.getAttribute('type'), 'password')
  cleanup()
})

test('注册时密码强度实时校验（P0-14 #12）', () => {
  renderSite('/signup', async () => {})
  const pwd = screen.getByTestId('auth-password')
  fireEvent.change(pwd, { target: { value: 'abc' } })
  assert.match(screen.getByTestId('auth-strength').textContent ?? '', /太短|还差/)
  fireEvent.change(pwd, { target: { value: 'abcd1234!X' } })
  assert.match(screen.getByTestId('auth-strength').textContent ?? '', /很强|可用/)
  cleanup()
})

test('邮箱格式不合法时拦住提交（P0-14 #3）', async () => {
  let called = 0
  renderSite('/login', async () => { called += 1 })
  fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'not-an-email' } })
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByTestId('auth-submit'))
  await waitFor(() => assert.match(screen.getByTestId('auth-error').textContent ?? '', /有效的邮箱/))
  assert.equal(called, 0, '不应发起请求')
  cleanup()
})

test('提交时按钮进入 loading 态，成功后不再复位（P0-14 #7）', async () => {
  let resolve: () => void = () => {}
  const pending = new Promise<void>((r) => { resolve = r })
  renderSite('/login', async () => pending)
  fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'a@b.com' } })
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByTestId('auth-submit'))
  await waitFor(() => assert.match(screen.getByTestId('auth-submit').textContent ?? '', /登录中/))
  assert.ok((screen.getByTestId('auth-submit') as HTMLButtonElement).disabled, 'loading 时应禁用')
  resolve()
  cleanup()
})

test('网络错误与后端错误区分提示（P0-14 #9）', async () => {
  renderSite('/login', async () => { throw new Error('Failed to fetch') })
  fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'a@b.com' } })
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByTestId('auth-submit'))
  await waitFor(() => assert.match(screen.getByTestId('auth-error').textContent ?? '', /网络连接不可用/))
  cleanup()

  renderSite('/login', async () => { throw new Error('密码不正确') })
  fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'a@b.com' } })
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByTestId('auth-submit'))
  await waitFor(() => assert.match(screen.getByTestId('auth-error').textContent ?? '', /密码不正确/))
  cleanup()

  renderSite('/login', async () => { throw new Error('账号不存在') })
  fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'missing@b.com' } })
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByTestId('auth-submit'))
  await waitFor(() => assert.match(screen.getByTestId('auth-error').textContent ?? '', /账号不存在/))
  cleanup()
})

test('移动端有汉堡菜单按钮且可展开（P0-12）', () => {
  renderSite('/', async () => {})
  const toggle = screen.getByTestId('site-menu-toggle')
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  fireEvent.click(toggle)
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.match(toggle.getAttribute('aria-label') ?? '', /Close menu/)
  const menu = toggle.closest('.site-nav')
  assert.equal(menu?.getAttribute('data-menu-open'), '1')
  assert.match(menu?.textContent ?? '', /Product/)
  assert.match(menu?.textContent ?? '', /Use Cases/)
  assert.match(menu?.textContent ?? '', /Pricing/)
  assert.match(menu?.textContent ?? '', /Log in/)
  assert.match(menu?.textContent ?? '', /Download/)
  cleanup()
})
