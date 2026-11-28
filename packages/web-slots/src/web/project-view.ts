import { apiFetch } from '@biu/biu-ui/api-client'
import { getWorkspaceEndpoint } from '@biu/biu-ui/workspace-transport'
import { useSyncExternalStore } from 'react'
import { Service, type Context } from 'cordis'

export interface SessionProjectMeta {
  name: string
  path: string
  boundAt: number
}

export interface ProjectViewState {
  sessionId: string | null
  project?: SessionProjectMeta
  busy: boolean
  pickerOpen: boolean
  error?: string
}

const empty: ProjectViewState = {
  sessionId: null,
  busy: false,
  pickerOpen: false,
}

function projectMetaEqual(
  a?: { name: string; path?: string; boundAt: number },
  b?: { name: string; path?: string; boundAt: number },
) {
  if (a === b) return true
  if (!a || !b) return !a && !b
  return a.name === b.name && a.path === b.path && a.boundAt === b.boundAt
}

export class ProjectViewService extends Service {
  private value: ProjectViewState = empty
  private listeners = new Set<() => void>()

  constructor(ctx: Context) {
    super(ctx, 'projectView')
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get = () => this.value

  /** 跟随当前 chat session。 */
  async attachSession(sessionId: string | null, project?: { name: string; path?: string; boundAt: number }) {
    const bound =
      project?.path
        ? { name: project.name, path: project.path, boundAt: project.boundAt }
        : undefined
    const sameSession = this.value.sessionId === sessionId
    if (
      sameSession &&
      projectMetaEqual(this.value.project, bound) &&
      this.value.busy === false &&
      this.value.error === undefined
    ) {
      return
    }
    this.replace({
      sessionId,
      project: bound,
      busy: false,
      pickerOpen: sameSession ? this.value.pickerOpen : false,
      error: undefined,
    })
  }

  openCloudPicker(sessionId: string) {
    this.replace({ sessionId, pickerOpen: true, busy: false, error: undefined })
  }

  closeCloudPicker() {
    if (!this.value.pickerOpen) return
    this.replace({ pickerOpen: false })
  }

  /**
   * 绑定项目文件夹：
   * - 云端空间打开个人云端文件夹选择/新建弹窗；
   * - 桌面端调用 host 弹出系统目录选择框，若服务端返回 CLOUD_FOLDER_PICKER_REQUIRED（浏览器直连云端）则自动切换云端弹窗。
   */
  async openFolderForSession(sessionId: string) {
    if (getWorkspaceEndpoint().mode === 'cloud') {
      this.openCloudPicker(sessionId)
      return undefined
    }
    this.replace({ busy: true, error: undefined })
    try {
      const res = await apiFetch(`/api/agents/${sessionId}/project/pick`, { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        cancelled?: boolean
        code?: string
        project?: SessionProjectMeta
        error?: string
      }
      if (body.code === 'CLOUD_FOLDER_PICKER_REQUIRED') {
        this.replace({ sessionId, busy: false, pickerOpen: true, error: undefined })
        return undefined
      }
      if (body.cancelled) {
        this.replace({ busy: false, error: undefined })
        return undefined
      }
      if (!res.ok || !body.project) throw new Error(body.error || `打开文件夹失败：${res.status}`)
      this.replace({
        sessionId,
        project: body.project,
        busy: false,
        pickerOpen: false,
        error: undefined,
      })
      return this.value.project
    } catch (error) {
      this.replace({ busy: false, error: String(error) })
      throw error
    }
  }

  /** 直接绑定指定路径（云端个人目录或本机路径）。 */
  async bindFolderForSession(sessionId: string, path: string, opts?: { create?: boolean }) {
    this.replace({ busy: true, error: undefined })
    try {
      const res = await apiFetch(`/api/agents/${sessionId}/project`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, ...(opts?.create ? { create: true } : {}) }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        project?: SessionProjectMeta
        error?: string
      }
      if (!res.ok || !body.project) throw new Error(body.error || `绑定文件夹失败：${res.status}`)
      this.replace({
        sessionId,
        project: body.project,
        busy: false,
        pickerOpen: false,
        error: undefined,
      })
      return this.value.project
    } catch (error) {
      this.replace({ busy: false, error: String(error) })
      throw error
    }
  }

  async unbindFolder() {
    const sessionId = this.value.sessionId
    if (!sessionId) return
    this.replace({ busy: true, error: undefined })
    try {
      const res = await apiFetch(`/api/agents/${sessionId}/project`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: null }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || `解绑文件夹失败：${res.status}`)
      }
      this.replace({ sessionId, project: undefined, busy: false, pickerOpen: false, error: undefined })
    } catch (error) {
      this.replace({ busy: false, error: String(error) })
    }
  }

  private replace(patch: Partial<ProjectViewState>) {
    this.value = { ...this.value, ...patch }
    for (const listener of this.listeners) listener()
  }
}

export function bindProjectView(service: ProjectViewService) {
  return function useProjectView<T>(selector: (state: ProjectViewState) => T): T {
    return useSyncExternalStore(
      service.subscribe,
      () => selector(service.get()),
      () => selector(service.get()),
    )
  }
}

export const name = 'project-view'
export const inject = []

export function apply(ctx: Context) {
  new ProjectViewService(ctx)
}
