import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { Context } from 'cordis'
import { resetWorkspaceEndpoint, setWorkspaceEndpoint } from '@biu/biu-ui/workspace-transport'
import { bindProjectView, ProjectViewService } from '@biu/web-slots/project-view'
import { SessionProjectPanel } from './project-panel.tsx'

afterEach(() => {
  cleanup()
  resetWorkspaceEndpoint()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('cloud workspace opens personal folder picker, creates a folder, and binds it to the session', async () => {
  setWorkspaceEndpoint({ mode: 'cloud', origin: 'https://cloud.example.com', workspaceId: 'ws-1', token: 'tok' })

  const folders = [{ name: 'existing-app', path: '/workspace/existing-app', hasGit: true, updatedAt: 100 }]
  const calls: Array<{ method: string; url: string; body?: unknown }> = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ method, url, body })

      if (method === 'GET' && url.includes('/api/workspace/folders')) {
        return jsonResponse({ current: '/workspace', parent: null, folders: [...folders] })
      }
      if (method === 'POST' && url.includes('/api/workspace/folders')) {
        const created = { name: String(body.name), path: `/workspace/${body.name}`, hasGit: false, updatedAt: 200 }
        folders.push(created)
        return jsonResponse({ ok: true, folder: created }, 201)
      }
      if (method === 'PUT' && url.includes('/api/agents/sess-1/project')) {
        if (body.path == null) return jsonResponse({ ok: true, project: null })
        const name = String(body.path).split('/').filter(Boolean).at(-1) ?? 'workspace'
        return jsonResponse({ ok: true, project: { name, path: body.path, boundAt: 300 } })
      }
      return jsonResponse({ error: 'unexpected' }, 404)
    }),
  )

  const ctx = new Context()
  const projectView = new ProjectViewService(ctx)
  await projectView.attachSession('sess-1')
  const useProjectView = bindProjectView(projectView)

  const ui = render(
    <SessionProjectPanel projectView={projectView} useProjectView={useProjectView} renderSlot={() => null} />,
  )

  // Clicking the folder icon opens the cloud folder picker without calling /project/pick
  fireEvent.click(ui.getByRole('button', { name: '绑定项目文件夹' }))
  await waitFor(() => {
    assert.equal(Boolean(ui.queryByTestId('cloud-folder-picker')), true)
    assert.equal(Boolean(ui.queryByTestId('cloud-folder-item-existing-app')), true)
  })
  assert.equal(calls.some((c) => c.url.includes('/project/pick')), false)

  // Create a new folder and bind it
  fireEvent.change(ui.getByTestId('cloud-folder-new-input'), { target: { value: 'demo-proj' } })
  fireEvent.click(ui.getByTestId('cloud-folder-create-btn'))
  await waitFor(() => {
    assert.equal(Boolean(ui.queryByTestId('cloud-folder-item-demo-proj')), true)
    assert.match(ui.queryByTestId('cloud-folder-bind-btn')?.textContent ?? '', /绑定「demo-proj」/)
  })

  fireEvent.click(ui.getByTestId('cloud-folder-bind-btn'))
  await waitFor(() => {
    assert.equal(Boolean(ui.queryByTestId('cloud-folder-picker')), false)
    assert.equal(projectView.get().project?.path, '/workspace/demo-proj')
    assert.equal(projectView.get().project?.name, 'demo-proj')
  })

  // Reopen picker and unbind
  fireEvent.click(ui.getByRole('button', { name: '项目文件夹：demo-proj' }))
  await waitFor(() => {
    assert.equal(Boolean(ui.queryByTestId('cloud-folder-unbind-btn')), true)
  })
  fireEvent.click(ui.getByTestId('cloud-folder-unbind-btn'))
  await waitFor(() => {
    assert.equal(projectView.get().project, undefined)
    assert.equal(Boolean(ui.queryByTestId('cloud-folder-picker')), false)
  })
})

test('same-origin online host falls back to cloud picker when /project/pick returns CLOUD_FOLDER_PICKER_REQUIRED', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST' && url.includes('/api/agents/sess-2/project/pick')) {
        return jsonResponse({ error: '请使用云端选择器', code: 'CLOUD_FOLDER_PICKER_REQUIRED' }, 403)
      }
      if (method === 'GET' && url.includes('/api/workspace/folders')) {
        return jsonResponse({ current: '/workspace', parent: null, folders: [] })
      }
      return jsonResponse({ error: 'unexpected' }, 404)
    }),
  )

  const ctx = new Context()
  const projectView = new ProjectViewService(ctx)
  await projectView.attachSession('sess-2')
  const useProjectView = bindProjectView(projectView)

  const ui = render(
    <SessionProjectPanel projectView={projectView} useProjectView={useProjectView} renderSlot={() => null} />,
  )
  fireEvent.click(ui.getByRole('button', { name: '绑定项目文件夹' }))

  await waitFor(() => {
    assert.equal(Boolean(ui.queryByTestId('cloud-folder-picker')), true)
  })
  assert.equal(projectView.get().error, undefined)
})
