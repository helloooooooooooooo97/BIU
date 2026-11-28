import type { SessionListItem } from './index.ts'

export const UNGROUPED_PROJECT_KEY = '__ungrouped__'

export type SidebarGroupKind = 'project' | 'ungrouped'

export interface SessionSidebarGroup {
  key: string
  label: string
  path?: string
  sessions: SessionListItem[]
  updatedAt: number
  kind: SidebarGroupKind
}

/** 有用户消息用那条消息的时间；还没发过消息的会话用 updatedAt。 */
export function sessionActivityAt(item: SessionListItem) {
  return item.lastMessageAt && item.lastMessageAt > 0 ? item.lastMessageAt : item.updatedAt
}

export function compareSessionRows(a: SessionListItem, b: SessionListItem) {
  const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
  if (pin) return pin
  return sessionActivityAt(b) - sessionActivityAt(a) || a.id.localeCompare(b.id)
}

/** 悬浮聊天用：按更新时间取最近一条对话（忽略置顶）。 */
export function mostRecentSessionId(sessions: Array<{ id?: unknown; updatedAt?: unknown }>): string | undefined {
  let best: { id: string; updatedAt: number } | undefined
  for (const item of sessions) {
    const id = typeof item.id === 'string' ? item.id : ''
    if (!id) continue
    const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : 0
    if (
      !best ||
      updatedAt > best.updatedAt ||
      (updatedAt === best.updatedAt && id.localeCompare(best.id) < 0)
    ) {
      best = { id, updatedAt }
    }
  }
  return best?.id
}

function sortGroupSessions(group: SessionSidebarGroup) {
  group.sessions.sort(compareSessionRows)
  group.updatedAt = group.sessions.reduce((max, item) => Math.max(max, sessionActivityAt(item)), 0)
}

/** 按绑定文件夹 path 分组；无 path 归入未分组，未分组下没有会话时不展示该组。 */
export function groupSessionsByProject(sessions: SessionListItem[]): SessionSidebarGroup[] {
  const map = new Map<string, SessionSidebarGroup>()
  for (const item of sessions) {
    const path = item.project?.path?.trim()
    const key = path || UNGROUPED_PROJECT_KEY
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        label: path ? item.project?.name?.trim() || folderNameFromPath(path) : '未分组',
        ...(path ? { path } : {}),
        sessions: [],
        updatedAt: 0,
        kind: path ? 'project' : 'ungrouped',
      }
      map.set(key, group)
    }
    group.sessions.push(item)
  }

  const groups = [...map.values()]
  for (const group of groups) sortGroupSessions(group)
  groups.sort((a, b) => {
    if (a.key === UNGROUPED_PROJECT_KEY) return 1
    if (b.key === UNGROUPED_PROJECT_KEY) return -1
    return b.updatedAt - a.updatedAt || a.label.localeCompare(b.label)
  })
  return groups
}

export type SidebarSectionKind = 'pinned' | 'project'

/** 置顶区直接携带会话行；项目区按文件夹分组。 */
export interface SidebarSection {
  kind: SidebarSectionKind
  label: string
  /** 置顶区专属：直接持有的 pinned 会话（不嵌套重复的分组头）。 */
  sessions?: SessionListItem[]
  /** 项目区：各自的分组列表。 */
  groups?: SessionSidebarGroup[]
}

/**
 * 代理区：按绑定 folder path 分组（未绑定归「未分组」，无未分组会话时不展示该组）；
 * 收藏的代理在各自组内置顶排序，不再重复拆出独立的「收藏」分区。
 */
export function buildSidebarSections(sessions: SessionListItem[]): SidebarSection[] {
  return [{ kind: 'project', label: '代理', groups: groupSessionsByProject(sessions) }]
}

export function folderNameFromPath(path: string) {
  const cleaned = path.replace(/[\\/]+$/, '')
  const parts = cleaned.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) || path
}
