import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import {
  AuthGate,
  ShellSettingsAccount,
  ShellSettingsConnections,
  ShellSettingsMembers,
  ShellSettingsMcp,
  ShellSettingsSecurity,
  ShellSettingsWorkspace,
  ShellSidebarAccount,
  ShellWorkspaceSwitcher,
  defaultSessionPath,
  readAccountToken,
  resetAccountMeGet,
} from './shell-chrome.tsx'

afterEach(() => {
  window.history.replaceState({}, '', '/')
  resetAccountMeGet()
  cleanup()
})

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
}

test('opening /register shows the register page', async () => {
  localStorage.clear()
  window.history.replaceState({}, '', '/register')
  render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthGate>
        <div data-testid="inside">in</div>
      </AuthGate>
    </MemoryRouter>,
  )
  assert.equal((await screen.findByRole('heading', { name: '创建账号' })).textContent, '创建账号')
  assert.equal(screen.queryByTestId('inside'), null)
})

test('opening /login shows the login page', async () => {
  localStorage.clear()
  window.history.replaceState({}, '', '/login')
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthGate>
        <div data-testid="inside">in</div>
      </AuthGate>
    </MemoryRouter>,
  )
  assert.ok(await screen.findByTestId('site-login'), '登录页使用官网顶栏')
  assert.equal(screen.getByRole('heading', { name: '登录' }).textContent, '登录')
  assert.equal(screen.queryByText('返回官网'), null, '顶栏已能回官网，表单不再重复放返回入口')
  assert.equal(screen.queryByTestId('inside'), null)
})

test('the app shows the marketing site until a token exists', async () => {
  localStorage.clear()
  const calls: string[] = []
  globalThis.fetch = (async (path: string) => {
    calls.push(String(path))
    return json(String(path).endsWith('/me') ? { id: 'acc_1' } : { token: 'tok' })
  }) as typeof fetch
  window.history.replaceState({}, '', '/login')
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthGate>
        <div data-testid="inside">in</div>
      </AuthGate>
    </MemoryRouter>,
  )
  assert.equal(screen.queryByTestId('inside'), null)
  assert.ok(await screen.findByTestId('auth-name'), '登录页有邮箱')
  fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret1' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('auth-submit'))
  })
  await waitFor(() => assert.equal(screen.getByTestId('inside').textContent, 'in'))
  assert.equal(calls.includes('/api/account/me'), true)
  cleanup()
})

test('landing preview renders the real app shell without reading account data', () => {
  localStorage.setItem('biu.account.token', 'private-token')
  window.history.replaceState({}, '', '/?landingPreview=1')
  assert.equal(readAccountToken(), '')
  render(
    <AuthGate>
      <div data-testid="preview-shell">real shell</div>
    </AuthGate>,
  )
  assert.equal(screen.getByTestId('preview-shell').textContent, 'real shell')
  window.history.replaceState({}, '', '/')
  localStorage.clear()
})

test('a stale workspace does not send the user back to login after they sign in', async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('biu.workspaceId', 'ws_old')
  sessionStorage.setItem('biu.workspaceId', 'ws_old')
  let meCalls = 0
  globalThis.fetch = (async (path: string) => {
    const url = String(path)
    if (url.endsWith('/login')) return json({ id: 'acc_1', token: 'tok', workspaceId: 'ws_new' })
    if (url.endsWith('/me')) {
      meCalls += 1
      if (meCalls === 1) return json({ error: '不在这个空间' }, 403)
      return json({ id: 'acc_1' })
    }
    return json({})
  }) as typeof fetch
  window.history.replaceState({}, '', '/login')
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthGate>
        <div data-testid="inside">in</div>
      </AuthGate>
    </MemoryRouter>,
  )
  assert.equal(window.location.pathname, '/login')
  await screen.findByTestId('auth-name')
  fireEvent.change(screen.getByTestId('auth-name'), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret1' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('auth-submit'))
  })
  await waitFor(() => assert.equal(screen.getByTestId('inside').textContent, 'in'))
  assert.equal(meCalls, 2)
  assert.equal(screen.queryByTestId('auth-gate'), null)
  cleanup()
})

test('switching spaces opens that space default session url', () => {
  assert.equal(defaultSessionPath([]), '/')
  assert.equal(
    defaultSessionPath([
      { id: 'older', updatedAt: 1 },
      { id: 'newer', updatedAt: 5 },
    ]),
    '/agents/newer',
  )
  assert.equal(defaultSessionPath([{ id: 'a b', updatedAt: 1 }]), '/agents/a%20b')
})

test('primary navigation does not call the removed chat overlay setter', () => {
  const source = readFileSync(resolve(import.meta.dirname, './shell-chrome.tsx'), 'utf8')
  assert.doesNotMatch(source, /setChatOverlay/)
  assert.doesNotMatch(source, /window\.confirm/)
  assert.match(source, /settings-member-remove-dialog/)
  assert.match(source, /settings-mcp-rotate-dialog/)
})

test('workspace and member settings are separate and workspace switching stays out of settings', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'tok')
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.settings-account-action\s*\{[^}]*font:\s*inherit/)
  assert.match(css, /\.settings-account-action\s*\{[^}]*border:\s*var\(--biu-stroke-width\) solid var\(--biu-color-border\)/)
  assert.match(css, /\.settings-account-action\s*\{[^}]*height:\s*32px/)
  assert.match(css, /\.settings-members-section\s*\{[^}]*flex-direction:\s*column/s)
  assert.match(css, /\.settings-member-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s)
  assert.match(css, /\.settings-member-identity strong,[\s\S]*?text-overflow:\s*ellipsis/)
  const calls: string[] = []
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/login')) return json({ id: 'acc_1', name: 'Ada', token: 'tok' })
    if (url.endsWith('/me')) return json({ id: 'acc_1', name: 'Ada' })
    if (url.endsWith('/workspaces') && (init?.method ?? 'GET') === 'GET') {
      return json({ workspaces: [{ id: 'ws_1', name: 'Main', role: 'owner' }] })
    }
    if (url.endsWith('/active')) return json({ workspaceId: 'ws_1' })
    if (url.endsWith('/workspaces/ws_1') && init?.method === 'PATCH') {
      return json({ id: 'ws_1', name: 'Notes', role: 'owner' })
    }
    if (url.includes('/members')) {
      return json({
        members: [
          { id: 'acc_1', name: 'Ada', role: 'owner' },
          { id: 'acc_2', name: '名称很长但不应该挤坏布局的成员', email: 'member@example.com', role: 'viewer' },
        ],
      })
    }
    if (url.endsWith('/presence')) return json({ presence: [{ accountId: 'acc_1', name: 'Ada', collection: '', recordId: '' }] })
    return json({})
  }) as typeof fetch

  render(<ShellSettingsWorkspace />)
  assert.equal(screen.getByTestId('settings-collab').querySelector('.settings-account-title')?.textContent, '空间设置')
  await act(async () => {
    await Promise.resolve()
  })
  assert.equal(screen.queryByTestId('settings-collab-id'), null)
  assert.equal(screen.queryByTestId('settings-collab-workspaces'), null)
  fireEvent.change(screen.getByTestId('settings-collab-workspace'), { target: { value: 'Notes' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('settings-collab-save'))
  })
  await waitFor(() => assert.equal(calls.includes('PATCH /api/account/workspaces/ws_1'), true))
  assert.equal((screen.getByTestId('settings-collab-workspace') as HTMLInputElement).value, 'Notes')
  assert.equal(screen.queryByText('新建'), null)
  cleanup()
  render(<ShellSettingsMembers />)
  await waitFor(() => assert.match(screen.getByTestId('settings-collab-members').textContent ?? '', /所有者/))
  assert.equal(screen.getByTestId('settings-collab').querySelector('.settings-account-title')?.textContent, '成员设置')
  assert.match(screen.getByTestId('settings-collab-members').textContent ?? '', /所有者/)
  assert.equal(screen.getByTestId('settings-collab-members').querySelectorAll('.settings-member-row').length, 2)
  assert.equal(screen.getByTestId('settings-collab').querySelectorAll('select').length, 0, '成员设置不得使用原生 select 下拉框')
  assert.ok(screen.getByTestId('settings-member-role-acc_2'), '成员角色使用自定义下拉按钮')
  assert.ok(screen.getByTestId('settings-invite-role'), '邀请链接角色使用自定义下拉按钮')
  assert.match(screen.getByTestId('settings-collab-members').textContent ?? '', /member@example.com/)
  fireEvent.click(screen.getByText('移除'))
  assert.match(screen.getByTestId('settings-member-remove-dialog').textContent ?? '', /移除空间成员/)
  fireEvent.click(screen.getByText('取消'))
  assert.equal(screen.queryByTestId('settings-member-remove-dialog'), null)
  assert.match(screen.getByTestId('settings-collab-presence').textContent ?? '', /Ada/)
  assert.equal(screen.queryByText('我的成员资料'), null)
  assert.equal(screen.queryByText('成员组'), null)
  assert.equal(screen.queryByText('添加组成员'), null)
  assert.equal(calls.some((line) => line.includes('/login')), false)
})

test('account settings are global and workspace switcher lives in the sidebar header', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  const source = readFileSync(resolve(import.meta.dirname, './shell-chrome.tsx'), 'utf8')
  const switcherSource = source.slice(source.indexOf('export function ShellWorkspaceSwitcher'), source.indexOf('export function ShellSettingsCollab'))
  assert.doesNotMatch(switcherSource, /ChevronDownIcon|ChevronUpDownIcon/)
  globalThis.fetch = (async (path: string) => {
    const url = String(path)
    if (url.endsWith('/me')) return json({ id: 'acc_1', name: 'ada@example.com', email: 'ada@example.com' })
    if (url.endsWith('/agents')) {
      return json({
        sessions: [
          {
            id: 'ses_1',
            device_name: 'Test Browser',
            expires_at: Date.now() + 60_000,
            last_seen_at: Date.now(),
            revoked_at: null,
          },
        ],
      })
    }
    if (url.endsWith('/active')) return json({ workspaceId: 'ws_1' })
    if (url.endsWith('/workspaces')) {
      return json({
        workspaces: [
          { id: 'ws_1', name: 'Main', role: 'owner' },
          { id: 'ws_2', name: 'Notes', role: 'viewer' },
        ],
      })
    }
    return json({})
  }) as typeof fetch
  render(
    <>
      <ShellSettingsAccount />
      <ShellSettingsSecurity />
    </>,
  )
  await waitFor(() => assert.equal((screen.getByTestId('settings-account-global-name') as HTMLInputElement).value, 'ada@example.com'))
  assert.ok(screen.getByTestId('settings-account-default-avatar'), '未上传头像时默认显示多色混合 AI 头像')
  assert.match(screen.getByTestId('settings-account-sessions').textContent ?? '', /Test Browser/)
  assert.match(screen.getByTestId('settings-account-sessions').textContent ?? '', /到期/)
  assert.ok(screen.getByLabelText('空间昵称'))
  assert.equal(screen.queryByTestId('settings-account-logout'), null)
  cleanup()
  let settingsOpened = false
  render(<ShellWorkspaceSwitcher onWorkspaceSettings={() => { settingsOpened = true }} />)
  const switcher = await screen.findByTestId('shell-workspace-switcher')
  assert.match(switcher.textContent ?? '', /Main/)
  assert.doesNotMatch(switcher.textContent ?? '', /所有者/)
  fireEvent.click(switcher)
  await waitFor(() => assert.equal(screen.getByTestId('shell-workspace-menu').getAttribute('role'), 'menu'))
  const menuText = screen.getByTestId('shell-workspace-menu').textContent ?? ''
  assert.match(menuText, /所有者/)
  assert.match(menuText, /Notes/)
  assert.match(menuText, /查看者/)
  assert.doesNotMatch(menuText, /切换空间|本机空间|云端空间|仅保存在这台设备/)
  assert.equal(screen.getByRole('menuitemradio', { checked: true }).querySelectorAll('svg').length, 1)
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.shell-workspace-menu-item\s*\{[^}]*align-items:\s*center/s)
  assert.match(css, /\.shell-workspace-menu-role\s*\{[^}]*font-size:\s*var\(--biu-font-size-3\)/s)
  assert.match(css, /\.shell-workspace-menu\s*\{[^}]*display:\s*flex/s)
  assert.match(css, /\.shell-workspace-menu-list\s*\{[^}]*overflow:\s*auto/s)
  assert.match(css, /\.shell-workspace-menu-action\s*\{[^}]*font-family:\s*var\(--font-sans\)/s)
  assert.doesNotMatch(css, /\.shell-workspace-menu-action\.is-logout/)
  assert.match(css, /\.shell-workspace-menu-actions\s*\{[^}]*gap:\s*1px/s)
  // 行高统一由 .shell-workspace-menu-item/-action/-account 这组选择器给出，
  // 单独查 `.shell-workspace-menu-account {` 会落空 —— 按组规则断言。
  assert.match(
    css,
    /\.shell-workspace-menu-item,[\s\S]*?\.shell-workspace-menu-action,[\s\S]*?\.shell-workspace-menu-account\s*\{[^}]*min-height:\s*36px;/s,
  )
  assert.match(screen.getByTestId('shell-workspace-menu').textContent ?? '', /创建空间/)
  assert.equal(screen.queryByText('退出登录'), null)
  assert.equal(screen.getByTestId('shell-workspace-local-account').textContent, 'ada@example.com')
  assert.equal(screen.getByTestId('shell-workspace-local-logout').getAttribute('aria-label'), '退出')
  assert.equal(screen.getByTestId('shell-workspace-local-logout').querySelectorAll('svg').length, 1)
  assert.equal(screen.getByTestId('shell-workspace-cloud-account').textContent, '暂时无账号')
  fireEvent.click(screen.getByTestId('shell-workspace-cloud-expand'))
  assert.equal(screen.getByTestId('shell-workspace-cloud-accounts').textContent, '暂无在线账号')
  fireEvent.click(screen.getByText('空间设置'))
  assert.equal(settingsOpened, true)
  cleanup()

  globalThis.fetch = (async (path: string) => {
    const url = String(path)
    if (url.endsWith('/me')) return json({ id: 'acc_1', email: 'ada@example.com', online: true })
    if (url.endsWith('/active')) return json({ workspaceId: 'ws_1' })
    if (url.endsWith('/workspaces')) return json({ workspaces: [{ id: 'ws_1', name: 'Main', role: 'owner', location: 'cloud' }] })
    if (url.endsWith('/cloud')) return json({ available: false, connected: false })
    return json({})
  }) as typeof fetch
  render(<ShellWorkspaceSwitcher />)
  fireEvent.click(await screen.findByTestId('shell-workspace-switcher'))
  const onlineMenu = await screen.findByTestId('shell-workspace-menu')
  assert.equal(screen.queryByTestId('shell-workspace-local-account'), null)
  assert.equal(screen.getByTestId('shell-workspace-cloud-account').textContent, 'ada@example.com')
  assert.equal(screen.queryByTestId('shell-workspace-cloud-expand'), null)
  assert.equal(onlineMenu.querySelectorAll('.shell-workspace-cloud-accounts').length, 0)
})

test('account settings can create and link a cloud account from the local identity', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  let syncBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    if (url.endsWith('/me')) return json({ id: 'acc_1', name: 'Ada', email: 'ada@example.com' })
    if (url.endsWith('/agents')) return json({ sessions: [] })
    if (url.endsWith('/cloud/sync-create') && init?.method === 'POST') {
      syncBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return json({ created: true }, 201)
    }
    if (url.endsWith('/cloud')) return json({ available: true, connected: false })
    return json({})
  }) as typeof fetch

  render(<ShellSettingsConnections />)
  fireEvent.click(await screen.findByTestId('settings-cloud-add'))
  const sync = await screen.findByTestId('settings-cloud-sync-create')
  await waitFor(() => assert.match(screen.getByText(/使用本地邮箱/).textContent ?? '', /ada@example\.com/))
  assert.equal(sync.hasAttribute('disabled'), false)
  assert.equal(screen.queryByLabelText('当前本地密码'), null)
  fireEvent.click(sync)
  await waitFor(() => assert.deepEqual(syncBody, {}))
  await waitFor(() => assert.match(screen.getByText('云端账号已创建并绑定。').textContent ?? '', /已创建并绑定/))
})

test('account settings can edit account name, reset avatar, configure remote host url, and register an independent cloud account', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  let profileBody: Record<string, unknown> | null = null
  let configBody: Record<string, unknown> | null = null
  let registerBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    if (url.endsWith('/me')) return json({ id: 'acc_1', name: 'ada@example.com', email: 'ada@example.com', avatar: '' })
    if (url.endsWith('/workspace-profile') && (!init?.method || init.method === 'GET')) {
      return json({ workspaceId: 'ws_1', email: 'ada@example.com', name: String(profileBody?.name ?? ''), avatar: String(profileBody?.avatar ?? '') })
    }
    if (url.endsWith('/workspace-profile') && init?.method === 'POST') {
      profileBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return json({
        workspaceId: 'ws_1',
        name: profileBody.name ?? 'ada@example.com',
        email: 'ada@example.com',
        avatar: profileBody.avatar ?? '',
      })
    }
    if (url.endsWith('/agents')) return json({ sessions: [] })
    if (url.endsWith('/cloud/config') && init?.method === 'POST') {
      configBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return json({ origin: configBody.origin, available: true })
    }
    if (url.endsWith('/cloud/register') && init?.method === 'POST') {
      registerBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return json({
        account: { id: 'cloud_1', name: registerBody.name || registerBody.email, email: registerBody.email },
        origin: registerBody.origin,
      }, 201)
    }
    if (url.endsWith('/cloud')) return json({ available: true, configuredOrigin: '', connected: false, accounts: [] })
    return json({})
  }) as typeof fetch

  render(
    <>
      <ShellSettingsAccount />
      <ShellSettingsConnections />
    </>,
  )
  const nameInput = (await screen.findByTestId('settings-account-global-name')) as HTMLInputElement
  await waitFor(() => assert.equal(nameInput.value, 'ada@example.com'))
  assert.equal(screen.getByTestId('settings-account-default-avatar').getAttribute('data-ai-avatar'), 'mesh')

  fireEvent.change(nameInput, { target: { value: 'Ada Lovelace' } })
  fireEvent.click(screen.getByTestId('settings-account-save-name'))
  await waitFor(() => assert.deepEqual(profileBody, { name: 'Ada Lovelace' }))
  await waitFor(() => assert.ok(screen.getByText('空间昵称已保存。')))

  fireEvent.click(await screen.findByTestId('settings-cloud-add'))
  fireEvent.change(screen.getByTestId('settings-cloud-origin'), { target: { value: 'https://cloud.example.com' } })
  fireEvent.click(screen.getByTestId('settings-cloud-save-origin'))
  await waitFor(() => assert.deepEqual(configBody, { origin: 'https://cloud.example.com' }))

  fireEvent.click(screen.getByTestId('settings-cloud-mode-register'))
  fireEvent.change(screen.getByTestId('settings-cloud-name'), { target: { value: 'Cloud Ada' } })
  fireEvent.change(screen.getByTestId('settings-cloud-email'), { target: { value: 'cloud-ada@example.com' } })
  fireEvent.change(screen.getByTestId('settings-cloud-password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByTestId('settings-cloud-submit'))
  await waitFor(() =>
    assert.deepEqual(registerBody, {
      name: 'Cloud Ada',
      email: 'cloud-ada@example.com',
      password: 'secret123',
      origin: 'https://cloud.example.com',
    }),
  )
  await waitFor(() => assert.ok(screen.getByText('独立云端账号已创建并绑定。')))
})

test('workspace switcher displays active cloud account avatar and custom name', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  globalThis.fetch = (async (path: string) => {
    const url = String(path)
    if (url.endsWith('/me')) return json({ id: 'acc_local', name: '97', email: 'local@example.com', avatar: '' })
    if (url.endsWith('/active')) return json({ workspaceId: 'ws_1' })
    if (url.endsWith('/workspaces')) return json({ workspaces: [{ id: 'ws_1', name: 'Main', role: 'owner', location: 'device' }] })
    if (url.endsWith('/cloud')) {
      return json({
        available: true,
        connected: true,
        accounts: [
          {
            id: 'acc_cloud',
            name: 'Cloud 97',
            email: '348876414@qq.com',
            avatar: 'data:image/png;base64,iVBORw0KGgo=',
            origin: 'http://127.0.0.1:3141',
            active: true,
          },
        ],
      })
    }
    return json({})
  }) as typeof fetch

  render(<ShellWorkspaceSwitcher />)
  fireEvent.click(await screen.findByTestId('shell-workspace-switcher'))
  const cloudRow = await screen.findByTestId('shell-workspace-cloud-account')
  assert.equal(cloudRow.textContent, 'Cloud 97')
  assert.equal(cloudRow.querySelector('.shell-workspace-account-avatar img')?.getAttribute('src'), 'data:image/png;base64,iVBORw0KGgo=')
})

test('workspace creation uses centered local and online cards with default names', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  const createBodies: Array<Record<string, unknown>> = []
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    if (url.endsWith('/active') && init?.method === 'POST') return json({ error: 'stop reload' }, 500)
    if (url.endsWith('/active')) return json({ workspaceId: 'ws_local' })
    if (url.endsWith('/workspaces') && init?.method === 'POST') {
      createBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return json({ id: `ws_${createBodies.length}`, name: 'created', role: 'owner' }, 201)
    }
    if (url.endsWith('/workspaces')) {
      return json({
        workspaces: [
          { id: 'ws_local', name: '本机项目', role: 'owner', location: 'device' },
          { id: 'ws_cloud', name: '云端项目', role: 'owner', location: 'cloud' },
        ],
      })
    }
    return json({})
  }) as typeof fetch

  render(<ShellWorkspaceSwitcher />)
  const switcher = await screen.findByTestId('shell-workspace-switcher')
  assert.equal(switcher.querySelectorAll('.shell-workspace-switch-icon').length, 1)
  fireEvent.click(switcher)
  const menu = await screen.findByTestId('shell-workspace-menu')
  assert.equal(menu.querySelectorAll('.shell-workspace-menu-icon').length, 2)
  fireEvent.click(screen.getByText('创建空间'))

  const dialog = await screen.findByRole('dialog', { name: '创建新空间' })
  assert.equal(dialog.querySelectorAll('.shell-workspace-create-card').length, 2)
  assert.equal(dialog.querySelectorAll('.shell-workspace-create-card-icon svg').length, 2)
  assert.equal(screen.queryByLabelText('新空间名称'), null)

  fireEvent.click(screen.getByRole('button', { name: /创建本机空间/ }))
  await waitFor(() => assert.deepEqual(createBodies[0], { name: '本机空间', location: 'device' }))
  await waitFor(() => assert.match(screen.getByRole('alert').textContent ?? '', /stop reload/))
  fireEvent.click(screen.getByRole('button', { name: /创建云端空间/ }))
  await waitFor(() => assert.deepEqual(createBodies[1], { name: '云端空间', location: 'cloud' }))

  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.shell-workspace-switcher\s*\{[^}]*font-size:\s*var\(--biu-font-size-4\);[^}]*font-weight:\s*500;/s)
  assert.match(css, /\.shell-workspace-create-overlay\s*\{[^}]*position:\s*fixed;[^}]*place-items:\s*center;/s)
  assert.match(css, /\.shell-workspace-switch-icon,\s*\n\.shell-workspace-menu-icon\s*\{[^}]*color:\s*var\(--biu-color-icon-fixed\)/s)
  assert.match(css, /\.shell-workspace-menu-action svg\s*\{[^}]*color:\s*var\(--biu-color-icon\)/s)
  assert.match(css, /\.shell-workspace-menu-account > svg\s*\{[^}]*color:\s*var\(--biu-color-icon-fixed\)/s)
  assert.match(css, /\.shell-workspace-menu-account button svg,\s*\n\.shell-workspace-menu-account-actions button svg\s*\{[^}]*color:\s*var\(--biu-color-icon-fixed\)/s)
  assert.match(css, /\.shell-workspace-create-card-icon svg\s*\{[^}]*color:\s*var\(--biu-color-icon-fixed\)/s)
  cleanup()

  const onlineBodies: Array<Record<string, unknown>> = []
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    if (url.endsWith('/me')) return json({ email: 'ada@example.com', online: true })
    if (url.endsWith('/active') && init?.method === 'POST') return json({ error: 'stop reload' }, 500)
    if (url.endsWith('/active')) return json({ workspaceId: 'ws_cloud' })
    if (url.endsWith('/workspaces') && init?.method === 'POST') {
      onlineBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return json({ id: 'ws_new', name: '云端空间', role: 'owner', location: 'cloud' }, 201)
    }
    if (url.endsWith('/workspaces')) return json({ workspaces: [{ id: 'ws_cloud', name: '云端项目', role: 'owner', location: 'cloud' }] })
    return json({})
  }) as typeof fetch
  render(<ShellWorkspaceSwitcher />)
  fireEvent.click(await screen.findByTestId('shell-workspace-switcher'))
  fireEvent.click(screen.getByText('创建空间'))
  assert.equal(screen.queryByRole('dialog', { name: '创建新空间' }), null)
  await waitFor(() => assert.deepEqual(onlineBodies[0], { name: '云端空间', location: 'cloud' }))
  await waitFor(() => assert.match(screen.getByRole('alert').textContent ?? '', /stop reload/))
})

test('online MCP settings choose tools and manage scoped credentials', async () => {
  localStorage.setItem('biu.account.token', 'tok')
  sessionStorage.setItem('biu.workspaceId', 'ws_1')
  let createBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    if (url.endsWith('/api/mcp/info')) {
      return json({ online: true, workspaceId: 'ws_1', url: 'http://localhost/api/mcp', token: '', tools: ['db_list', 'db_update'] })
    }
    if (url.includes('/api/account/mcp/credentials?')) return json({ credentials: [] })
    if (url.includes('/api/account/mcp/audit?')) return json({ events: [] })
    if (url.endsWith('/api/account/mcp/credentials') && init?.method === 'POST') {
      createBody = JSON.parse(String(init.body))
      return json({ id: 'mcp_1', token: 'secret' }, 201)
    }
    return json({})
  }) as typeof fetch
  render(<MemoryRouter><ShellSettingsMcp /></MemoryRouter>)
  await screen.findByTestId('settings-mcp-allowed-tools')
  assert.equal((screen.getByLabelText('db_list') as HTMLInputElement).checked, true)
  assert.equal((screen.getByLabelText('db_update') as HTMLInputElement).checked, true)
  fireEvent.click(screen.getByTestId('settings-mcp-rotate'))
  fireEvent.click(await screen.findByText('生成'))
  await waitFor(() => assert.deepEqual(createBody?.allowedTools, ['db_list', 'db_update']))
  assert.equal((screen.getByTestId('settings-mcp-token') as HTMLInputElement).value, 'secret')
})

test('网络错误不清 token —— 一次抖动不应把用户登出', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'keep-me')
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch')
  }) as typeof fetch

  render(
    <AuthGate>
      <div data-testid="inside">in</div>
    </AuthGate>,
  )

  // 退避重试全部失败后，token 必须还在 —— 否则刷新也回不来。
  await waitFor(() => assert.equal(localStorage.getItem('biu.account.token'), 'keep-me'))
  assert.equal(readAccountToken(), 'keep-me')
  cleanup()
  localStorage.clear()
})

test('5xx 不清 token，401 才清', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'keep-me')
  globalThis.fetch = (async () => json({ error: '服务端炸了' }, 500)) as unknown as typeof fetch

  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthGate>
        <div data-testid="inside">in</div>
      </AuthGate>
    </MemoryRouter>,
  )
  await waitFor(() => assert.equal(localStorage.getItem('biu.account.token'), 'keep-me'))
  cleanup()

  // 401 是凭证真的失效 —— 此时才清。
  localStorage.setItem('biu.account.token', 'stale')
  globalThis.fetch = (async () => json({ error: '凭证已过期' }, 401)) as unknown as typeof fetch
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthGate>
        <div data-testid="inside">in</div>
      </AuthGate>
    </MemoryRouter>,
  )
  await waitFor(() => assert.equal(localStorage.getItem('biu.account.token'), null))
  cleanup()
  localStorage.clear()
})

test('refresh with a saved token opens the app without a verifying splash', () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'tok')
  globalThis.fetch = (async () => new Promise(() => undefined)) as typeof fetch
  render(
    <AuthGate>
      <div data-testid="inside">in</div>
    </AuthGate>,
  )
  assert.equal(screen.getByTestId('inside').textContent, 'in')
  assert.equal(screen.queryByTestId('auth-verifying'), null)
  cleanup()
  localStorage.clear()
})

test('网络抖动恢复后自动进入应用，不用手动刷新', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'tok')
  let calls = 0
  globalThis.fetch = (async (path: string) => {
    if (!String(path).endsWith('/me')) return json({})
    calls += 1
    // 前两次模拟 dev server 重启期间的失败，之后恢复。
    if (calls <= 2) throw new TypeError('Failed to fetch')
    return json({ id: 'acc_1' })
  }) as typeof fetch

  render(
    <AuthGate>
      <div data-testid="inside">in</div>
    </AuthGate>,
  )

  assert.equal(screen.getByTestId('inside').textContent, 'in')
  assert.equal(screen.queryByTestId('auth-verifying'), null)
  await waitFor(() => assert.ok(calls >= 3, '应当重试到成功为止'), { timeout: 5000 })
  cleanup()
  localStorage.clear()
})

test('sidebar account footer displays current account avatar and name and opens account settings', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'tok')
  globalThis.fetch = (async (path: string) => {
    if (String(path).endsWith('/me')) {
      return json({ id: 'acc_97', name: '97', email: '97@example.com', avatar: '' })
    }
    return json({})
  }) as typeof fetch

  let opened = 0
  render(<ShellSidebarAccount onOpenAccount={() => { opened += 1 }} />)
  const btn = await screen.findByTestId('shell-sidebar-account')
  assert.match(btn.textContent ?? '', /97/)
  assert.match(btn.textContent ?? '', /97@example\.com/)
  assert.ok(btn.querySelector('[data-ai-avatar="mesh"]'))
  fireEvent.click(btn)
  assert.equal(opened, 1)
  cleanup()
  localStorage.clear()
})

test('account settings can generate primary-color AI avatar and pick built-in avatar presets', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'tok')
  const savedAvatars: string[] = []
  let currentAvatar = ''
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    if (url.endsWith('/me')) {
      return json({ id: 'acc_97', name: '97', email: '97@example.com', avatar: currentAvatar })
    }
    if (url.endsWith('/api/account/workspace-profile') && (!init?.method || init.method === 'GET')) {
      return json({ workspaceId: 'ws_1', name: '97', email: '97@example.com', avatar: currentAvatar })
    }
    if (url.endsWith('/api/account/workspace-profile') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { avatar?: string }
      if (typeof body.avatar === 'string') {
        currentAvatar = body.avatar
        savedAvatars.push(body.avatar)
      }
      return json({ workspaceId: 'ws_1', name: '97', email: '97@example.com', avatar: currentAvatar })
    }
    return json({})
  }) as typeof fetch

  render(<ShellSettingsAccount />)
  await screen.findByTestId('settings-avatar-studio')

  const emeraldBtn = screen.getByTestId('settings-avatar-theme-emerald')
  assert.ok(emeraldBtn.querySelector('img[src^="data:image/svg+xml"]'))
  fireEvent.click(emeraldBtn)
  await waitFor(() => assert.equal(savedAvatars.length, 1))
  assert.match(decodeURIComponent(savedAvatars[0]!), /data-biu-theme="emerald"/)

  fireEvent.click(screen.getByTestId('settings-avatar-ai-shuffle'))
  await waitFor(() => assert.equal(savedAvatars.length, 2))
  assert.match(decodeURIComponent(savedAvatars[1]!), /data-biu-theme="emerald"/)
  assert.notEqual(savedAvatars[1], savedAvatars[0])

  cleanup()
  localStorage.clear()
})

test('workspace settings defaults avatar to circular BIU icon and supports brand presets', async () => {
  localStorage.clear()
  localStorage.setItem('biu.account.token', 'tok_ws_avatar')
  localStorage.setItem('biu.account.workspace', 'ws_1')
  let currentAvatar = ''
  const savedAvatars: string[] = []
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const url = String(path)
    if (url.endsWith('/api/account/workspaces')) {
      return json({
        workspaces: [{ id: 'ws_1', name: '我的空间', role: 'owner', location: 'cloud', avatar: currentAvatar }],
      })
    }
    if (url.endsWith('/api/account/active')) {
      return json({ workspaceId: 'ws_1' })
    }
    if (url.endsWith('/api/account/workspaces/ws_1') && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { avatar?: string }
      if (typeof body.avatar === 'string') {
        currentAvatar = body.avatar
        savedAvatars.push(body.avatar)
      }
      return json({ id: 'ws_1', name: '我的空间', role: 'owner', location: 'cloud', avatar: currentAvatar })
    }
    return json({})
  }) as typeof fetch

  const accountTokenEvents: Event[] = []
  const workspaceMetaEvents: Array<{ workspaceId?: string; name?: string; avatar?: string } | undefined> = []
  const onAccountToken = (event: Event) => accountTokenEvents.push(event)
  const onWorkspaceMeta = (event: Event) =>
    workspaceMetaEvents.push((event as CustomEvent<{ workspaceId?: string; name?: string; avatar?: string }>).detail)
  window.addEventListener('biu:account-token', onAccountToken)
  window.addEventListener('biu:workspace-meta', onWorkspaceMeta)

  try {
    render(<ShellSettingsWorkspace />)
    const defaultIcon = await screen.findByTestId('settings-workspace-default-avatar')
    assert.equal(defaultIcon.getAttribute('data-workspace-avatar'), 'brand-circle')
    assert.equal(defaultIcon.getAttribute('data-workspace-preset'), 'deep-sea')

    const studio = screen.getByTestId('settings-workspace-avatar-studio')
    assert.ok(studio)
    const deepSeaBtn = screen.getByTestId('settings-workspace-avatar-preset-deep-sea')
    assert.equal(deepSeaBtn.getAttribute('aria-pressed'), 'true')

    const vividBtn = screen.getByTestId('settings-workspace-avatar-preset-vivid')
    assert.ok(vividBtn.querySelector('img[src^="data:image/svg+xml"]'))
    fireEvent.click(vividBtn)
    await waitFor(() => assert.equal(savedAvatars.length, 1))
    assert.match(decodeURIComponent(savedAvatars[0]!), /data-biu-workspace-avatar="vivid"/)
    await waitFor(() => assert.equal(vividBtn.getAttribute('aria-pressed'), 'true'))
    assert.ok(screen.getByTestId('settings-workspace-reset-avatar'))

    fireEvent.click(deepSeaBtn)
    await waitFor(() => assert.equal(savedAvatars.length, 2))
    assert.equal(savedAvatars[1], '')
    await screen.findByTestId('settings-workspace-default-avatar')
    assert.equal(deepSeaBtn.getAttribute('aria-pressed'), 'true')

    assert.equal(accountTokenEvents.length, 0, 'switching workspace avatar must not emit biu:account-token')
    assert.equal(workspaceMetaEvents.length, 2)
    assert.equal(workspaceMetaEvents[0]?.workspaceId, 'ws_1')
    assert.equal(workspaceMetaEvents[1]?.avatar, '')
  } finally {
    window.removeEventListener('biu:account-token', onAccountToken)
    window.removeEventListener('biu:workspace-meta', onWorkspaceMeta)
  }

  cleanup()
  localStorage.clear()
})
